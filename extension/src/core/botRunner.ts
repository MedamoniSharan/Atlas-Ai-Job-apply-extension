import type { JobPayload, JobPreferences } from '@atlas/shared';
import {
  SearchResultJob,
  buildNaukriSearchUrl,
  matchesPreferences,
} from '../adapters/naukriAdapter';
import { fetchPreferences, lookupAppliedJobs } from './apiClient';
import { getCachedPreferences } from './storageManager';
import { logger } from './logger';
import {
  appendCopilotLog,
  broadcastCopilotToNaukriTabs,
  clearCopilotAlert,
  getCopilotState,
  jobKey,
  raiseCopilotAlert,
  raiseCopilotToast,
  setCopilotState,
  updateScannedJob,
  upsertScannedJobs,
} from './copilotState';
import { mergeJobFields } from './jobFields';
import {
  getApplyQuotaBlock,
  getApplyQuotaSnapshot,
  noteLocalApply,
  quotaBlockMessage,
} from './planApplyQuota';
import {
  handleBlockedPage,
  noteStealthApply,
  paceModeFromStealth,
  pacedWait,
  runReadPauseIfNeeded,
  runSessionBreakIfNeeded,
  wait,
} from './humanPace';
import { isBlocked } from './safetyStorage';

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url.split('?')[0]?.replace(/\/$/, '') || url;
  }
}

async function waitForTabComplete(tabId: number, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return tab;
    await wait(400);
  }
  return chrome.tabs.get(tabId);
}

async function sendToTab<T>(
  tabId: number,
  message: unknown,
  attempts = 12
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as T;
    } catch (error) {
      lastError = error;
      await wait(500);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to message content script');
}

async function waitWhilePaused() {
  while (true) {
    const state = await getCopilotState();
    if (!state.running) return false;
    if (!state.paused) return true;
    await wait(500);
  }
}

/**
 * While paused for Naukri questions, also poll the tab for apply-success.
 * If the user finishes the form, auto-resume without requiring Resume click.
 */
async function waitWhilePausedForQuestions(
  tabId: number
): Promise<'resumed' | 'applied' | 'stopped'> {
  while (true) {
    const state = await getCopilotState();
    if (!state.running) return 'stopped';
    if (!state.paused) return 'resumed';

    try {
      const status = await sendToTab<{
        applied?: boolean;
        needsQuestions?: boolean;
      }>(tabId, { type: 'CHECK_APPLY_STATUS' }, 2);
      if (status.applied) {
        await setCopilotState({ paused: false, needsLogin: false, loginPauseReason: null });
        await clearCopilotAlert();
        await appendCopilotLog(
          'Apply success detected after your answers — continuing',
          'success'
        );
        return 'applied';
      }
      if (status.needsQuestions === false) {
        await setCopilotState({ paused: false, needsLogin: false, loginPauseReason: null });
        await clearCopilotAlert();
        await appendCopilotLog(
          'Questions cleared — retrying apply',
          'success'
        );
        return 'resumed';
      }
    } catch {
      /* tab may be navigating */
    }

    await wait(1200);
  }
}

/**
 * Before each apply: require positive Naukri login.
 * loggedOut → pause with login CTA; uncertain → pause with confirm CTA (don't guess).
 */
async function ensureNaukriLoggedIn(tabId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!(await waitWhilePaused())) return false;

    // Give the React header time to swap Login → profile drawer.
    await wait(attempt === 0 ? 1500 : 700);

    const login = await sendToTab<{
      loggedIn: boolean;
      status?: 'loggedIn' | 'loggedOut' | 'uncertain';
      cookieHint?: boolean;
    }>(tabId, {
      type: 'CHECK_LOGIN',
    });
    if (login.loggedIn) {
      await setCopilotState({ needsLogin: false, loginPauseReason: null });
      if (attempt > 0) {
        await appendCopilotLog('Naukri login detected — continuing', 'success');
      }
      return true;
    }

    const reason: 'loggedOut' | 'uncertain' =
      login.status === 'loggedOut' ? 'loggedOut' : 'uncertain';

    await setCopilotState({
      paused: true,
      needsLogin: true,
      loginPauseReason: reason,
    });
    await appendCopilotLog(
      reason === 'uncertain'
        ? 'Paused — confirm you’re logged into Naukri, then press Continue.'
        : 'Paused — please log into Naukri to continue. Open login in a new tab, then press Continue.',
      'warn'
    );
    await sendToTab(tabId, {
      type: 'SHOW_LOGIN_PROMPT',
      reason,
    }).catch(() => undefined);

    if (!(await waitWhilePaused())) return false;

    await appendCopilotLog('Resumed — checking Naukri login again…');
    await wait(2000);
  }

  await appendCopilotLog(
    'Still not logged into Naukri. Stopping co-pilot.',
    'error'
  );
  await setCopilotState({
    running: false,
    paused: false,
    needsLogin: false,
    loginPauseReason: null,
  });
  return false;
}

async function checkBlockOnTab(tabId: number): Promise<boolean> {
  try {
    const res = await sendToTab<{ blocked?: boolean; reason?: string }>(
      tabId,
      { type: 'CHECK_BLOCK_PAGE' },
      3
    );
    if (res.blocked) {
      await handleBlockedPage(res.reason || 'verification page');
      return true;
    }
  } catch {
    /* tab may be navigating */
  }
  return false;
}

async function goBackToList(
  tabId: number,
  searchUrl: string,
  stealth: boolean
): Promise<void> {
  const mode = paceModeFromStealth(stealth);
  await chrome.tabs.update(tabId, {
    url: searchUrl,
    active: !stealth,
  });
  await waitForTabComplete(tabId);
  await pacedWait(mode, 'nav', { jobTitle: 'search list' });
}

type EasyApplyResult = {
  ok: boolean;
  skipped?: boolean;
  alreadyApplied?: boolean;
  needsUserInput?: boolean;
  blocked?: boolean;
  reason?: string;
  job?: Partial<JobPayload>;
};

async function tryEasyApply(tabId: number): Promise<EasyApplyResult> {
  return sendToTab<EasyApplyResult>(tabId, { type: 'RUN_EASY_APPLY' });
}

async function markApplied(
  handlers: BotHandlers,
  base: JobPayload,
  id: string,
  alreadyApplied: boolean
) {
  if (alreadyApplied) {
    await handlers.persistApplicationRecorded({
      ...base,
      status: 'applied',
      appliedAt: new Date().toISOString(),
      metadata: { source: 'auto_apply', alreadyApplied: true },
    });
    await updateScannedJob(id, { status: 'already_applied' });
    await appendCopilotLog(`Already applied — skipped: ${base.title}`, 'info');
    await raiseCopilotToast(
      'Already applied — skipped',
      base.company ? `${base.title} · ${base.company}` : base.title
    );
    return;
  }

  await handlers.persistApplicationRecorded({
    ...base,
    status: 'applied',
    appliedAt: new Date().toISOString(),
    metadata: { source: 'auto_apply' },
  });
  await noteLocalApply();
  const state = await getCopilotState();
  const appliesThisSession = state.appliesThisSession + 1;
  await setCopilotState({ appliesThisSession });
  await noteStealthApply();
  await updateScannedJob(id, { status: 'applied' });
  await appendCopilotLog(`Applied: ${base.title}`, 'success');
  await raiseCopilotToast(
    'Job applied successfully',
    base.company ? `${base.title} · ${base.company}` : base.title
  );
}

async function markSkipped(
  handlers: BotHandlers,
  base: JobPayload,
  id: string,
  reason: string
) {
  if (/company site|external/i.test(reason)) {
    await markCompanySite(handlers, base, id);
    return;
  }
  await handlers.persistJobDetected({
    ...base,
    metadata: {
      source: 'auto_scan',
      skipped: true,
      skipReason: reason,
    },
  });
  await updateScannedJob(id, { status: 'skipped', skipReason: reason });
  await appendCopilotLog(`Skipped: ${base.title} — ${reason}`, 'warn');
  await raiseCopilotToast(
    'Job skipped',
    base.company
      ? `${base.title} · ${base.company}`
      : `${base.title} — ${reason}`
  );
}

async function markCompanySite(
  handlers: BotHandlers,
  base: JobPayload,
  id: string
) {
  await handlers.persistJobDetected({
    ...base,
    metadata: {
      source: 'auto_scan',
      companySiteApply: true,
    },
  });
  await updateScannedJob(id, {
    status: 'skipped',
    skipReason: 'Apply on company site',
  });
  await appendCopilotLog(
    `Company site — saved for manual apply: ${base.title}`,
    'info'
  );
  await raiseCopilotToast(
    'Saved for manual apply',
    base.company ? `${base.title} · ${base.company}` : base.title
  );
}

async function applyOneJob(
  tabId: number,
  job: SearchResultJob,
  prefs: JobPreferences,
  handlers: BotHandlers,
  searchUrl: string,
  stealth: boolean
): Promise<'continue' | 'stop' | 'limit'> {
  const id = jobKey(job);
  const mode = paceModeFromStealth(stealth);

  const detectPayload = mergeJobFields(undefined, job, {
    status: 'detected',
    metadata: { source: 'auto_scan' },
  });
  await handlers.persistJobDetected(detectPayload);

  await updateScannedJob(id, { status: 'applying' });
  await setCopilotState({ currentTitle: job.title });
  await appendCopilotLog(`Opening: ${job.title}`);

  const state = await getCopilotState();
  await chrome.tabs.update(tabId, {
    url: job.url,
    active: !state.runInBackground,
  });
  await waitForTabComplete(tabId);
  if (!(await pacedWait(mode, 'nav', { jobTitle: job.title }))) return 'stop';

  if (await checkBlockOnTab(tabId)) return 'stop';
  if (!(await waitWhilePaused())) return 'stop';
  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

  // Collect full JD fields while on the detail page.
  let detailJob: Partial<JobPayload> | undefined;
  let companySiteApply = Boolean(job.companySiteApply);
  try {
    const detail = await sendToTab<{
      job?: Partial<JobPayload> | null;
      companySiteApply?: boolean;
    }>(tabId, { type: 'READ_JOB_DETAIL' }, 4);
    detailJob = detail.job ?? undefined;
    if (detail.companySiteApply) companySiteApply = true;
  } catch {
    /* page may still be loading */
  }
  const enriched = mergeJobFields(detailJob, job, {
    status: 'detected',
    metadata: { source: 'auto_scan' },
  });
  await handlers.persistJobDetected(enriched);

  if (companySiteApply) {
    await markCompanySite(handlers, enriched, id);
    await goBackToList(tabId, searchUrl, stealth);
    return 'continue';
  }

  if (!prefs.autoApplyEnabled) {
    await markSkipped(handlers, enriched, id, 'Auto-apply is off');
    await goBackToList(tabId, searchUrl, stealth);
    return 'continue';
  }

  let quota;
  try {
    quota = await getApplyQuotaSnapshot();
  } catch (error) {
    await appendCopilotLog(
      `Could not verify apply limits: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'warn'
    );
    await goBackToList(tabId, searchUrl, stealth);
    return 'stop';
  }

  const blockReason = getApplyQuotaBlock(quota);
  if (blockReason) {
    await updateScannedJob(id, { status: 'pending' });
    const msg = quotaBlockMessage(quota, blockReason);
    await raiseCopilotAlert(
      msg,
      'warn',
      blockReason === 'month' ? 'plan_limit' : 'rate_limit'
    );
    await appendCopilotLog(msg, 'warn');
    await goBackToList(tabId, searchUrl, stealth);
    return 'limit';
  }

  if (!(await pacedWait(mode, 'dwell', { jobTitle: job.title }))) return 'stop';

  if (await checkBlockOnTab(tabId)) return 'stop';
  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

  let result = await tryEasyApply(tabId);
  if (result.blocked) {
    await handleBlockedPage(result.reason || 'verification page');
    return 'stop';
  }
  const base = mergeJobFields(result.job, enriched, {
    url: job.url,
    status: 'detected',
    metadata: { source: 'auto_apply' },
  });

  if (result.needsUserInput) {
    await setCopilotState({ paused: true, currentTitle: base.title });
    await appendCopilotLog(
      `Paused — Naukri is asking questions for "${base.title}". Answer them on the page; Atlas will continue when you save, or press Resume.`,
      'warn'
    );

    const pauseOutcome = await waitWhilePausedForQuestions(tabId);
    if (pauseOutcome === 'stopped') return 'stop';

    if (pauseOutcome === 'applied') {
      await markApplied(handlers, base, id, false);
      const after = await getCopilotState();
      if (!(await runSessionBreakIfNeeded(after.appliesThisSession))) return 'stop';
      if (
        !(await pacedWait(mode, 'betweenJobs', { jobTitle: base.title }))
      ) {
        return 'stop';
      }
      await goBackToList(tabId, searchUrl, stealth);
      return 'continue';
    }

    await appendCopilotLog(
      `Resumed — retrying apply for "${base.title}"`,
      'success'
    );
    if (!(await pacedWait(mode, 'nav', { jobTitle: base.title }))) return 'stop';
    if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

    result = await tryEasyApply(tabId);
    if (result.blocked) {
      await handleBlockedPage(result.reason || 'verification page');
      return 'stop';
    }
    if (result.needsUserInput) {
      await setCopilotState({ paused: true });
      await appendCopilotLog(
        'Still waiting on Naukri questions. Finish them — Atlas will continue when saved, or press Resume.',
        'warn'
      );
      const pause2 = await waitWhilePausedForQuestions(tabId);
      if (pause2 === 'stopped') return 'stop';
      if (pause2 === 'applied') {
        await markApplied(handlers, base, id, false);
      } else {
        if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';
        result = await tryEasyApply(tabId);
        if (result.blocked) {
          await handleBlockedPage(result.reason || 'verification page');
          return 'stop';
        }
        if (result.ok) {
          await markApplied(
            handlers,
            {
              ...base,
              title: result.job?.title || base.title,
              company: result.job?.company || base.company,
            },
            id,
            Boolean(result.alreadyApplied)
          );
        } else if (result.needsUserInput) {
          await markSkipped(
            handlers,
            base,
            id,
            'User questions not completed'
          );
        } else {
          await markSkipped(
            handlers,
            base,
            id,
            result.reason || 'Easy Apply unavailable'
          );
        }
      }
    } else if (result.ok) {
      await markApplied(
        handlers,
        {
          ...base,
          title: result.job?.title || base.title,
          company: result.job?.company || base.company,
        },
        id,
        Boolean(result.alreadyApplied)
      );
    } else {
      await markSkipped(
        handlers,
        base,
        id,
        result.reason || 'Easy Apply unavailable'
      );
    }
  } else if (result.ok) {
    await markApplied(handlers, base, id, Boolean(result.alreadyApplied));
  } else {
    await markSkipped(
      handlers,
      base,
      id,
      result.reason || 'Easy Apply unavailable'
    );
  }

  const afterApply = await getCopilotState();
  if (afterApply.appliesThisSession > 0) {
    if (
      !(await runReadPauseIfNeeded(
        mode,
        afterApply.appliesThisSession,
        job.title
      ))
    ) {
      return 'stop';
    }
    if (!(await runSessionBreakIfNeeded(afterApply.appliesThisSession))) {
      return 'stop';
    }
  }

  if (!(await pacedWait(mode, 'betweenJobs', { jobTitle: job.title }))) {
    return 'stop';
  }
  await goBackToList(tabId, searchUrl, stealth);
  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';
  return 'continue';
}

async function fetchAppliedSet(
  jobs: SearchResultJob[]
): Promise<{ ids: Set<string>; urls: Set<string> }> {
  const externalJobIds = jobs
    .map((j) => j.externalJobId)
    .filter((id): id is string => Boolean(id));
  const urls = jobs.map((j) => normalizeUrl(j.url));
  const res = await lookupAppliedJobs({ externalJobIds, urls });
  if (!res.success) {
    return { ids: new Set(), urls: new Set() };
  }
  return {
    ids: new Set(res.data.externalJobIds),
    urls: new Set(res.data.urls.map(normalizeUrl)),
  };
}

function isAlreadyInDb(
  job: SearchResultJob,
  applied: { ids: Set<string>; urls: Set<string> }
): boolean {
  if (job.externalJobId && applied.ids.has(job.externalJobId)) return true;
  return applied.urls.has(normalizeUrl(job.url));
}

export type BotHandlers = {
  persistJobDetected: (payload: JobPayload) => Promise<void>;
  persistApplicationRecorded: (payload: JobPayload) => Promise<void>;
};

let botRunning = false;

type SessionCtx = {
  handlers: BotHandlers;
  searchUrl: string;
  tabId: number;
  stealth: boolean;
  prefs: JobPreferences;
  seenKeys: Set<string>;
};

let lastSession: SessionCtx | null = null;

const MAX_SCROLL_ROUNDS = 10;

export async function stopBot(): Promise<void> {
  lastSession = null;
  await setCopilotState({
    running: false,
    paused: false,
    needsLogin: false,
    loginPauseReason: null,
    currentTitle: '',
    sessionBreakUntil: null,
    sessionBreakRemainingMs: null,
    paceLabel: null,
    paceRemainingMs: null,
    sessionComplete: null,
  });
  await appendCopilotLog('Co-pilot stopped', 'warn');
}

export async function pauseBot(): Promise<void> {
  await setCopilotState({ paused: true });
  await appendCopilotLog('Co-pilot paused', 'warn');
}

export async function resumeBot(): Promise<void> {
  const state = await getCopilotState();
  if (state.sessionBreakUntil && Date.parse(state.sessionBreakUntil) > Date.now()) {
    return;
  }
  // Keep needsLogin until ensureNaukriLoggedIn gets a positive CHECK_LOGIN.
  await setCopilotState({ paused: false });
  if (!state.needsLogin) {
    await clearCopilotAlert();
  }
  await appendCopilotLog(
    state.needsLogin
      ? 'Resumed — re-checking Naukri login…'
      : 'Co-pilot resumed',
    'success'
  );
}

export async function runBot(handlers: BotHandlers): Promise<{
  ok: boolean;
  message: string;
}> {
  if (botRunning) {
    return { ok: false, message: 'Co-pilot is already running.' };
  }
  if (await isBlocked()) {
    await raiseCopilotAlert(
      'Naukri verification cooldown active — wait before starting a new session.',
      'error',
      'blocked'
    );
    return { ok: false, message: 'Blocked cooldown active.' };
  }
  botRunning = true;

  try {
    // Always load preferences from DB (same as dashboard).
    const prefsRes = await fetchPreferences();
    const prefs: JobPreferences = prefsRes.success
      ? prefsRes.data
      : await getCachedPreferences();

    const keywordParts = [...prefs.titles, ...prefs.keywords].filter(Boolean);
    const keyword = keywordParts.slice(0, 4).join(' ') || '';

    if (!keyword) {
      await appendCopilotLog(
        'Add titles or keywords in preferences first',
        'error'
      );
      return { ok: false, message: 'Preferences incomplete.' };
    }

    const existing = await getCopilotState();
    await setCopilotState({
      running: true,
      paused: false,
      needsLogin: false,
      loginPauseReason: null,
      keyword,
      matched: 0,
      applied: 0,
      skipped: 0,
      appliesThisSession: 0,
      stealthAppliesThisSession: 0,
      stealthStartedAt: existing.runInBackground
        ? new Date().toISOString()
        : null,
      sessionBreakUntil: null,
      sessionBreakRemainingMs: null,
      sessionComplete: null,
      currentTitle: '',
      scannedJobs: [],
      runInBackground: existing.runInBackground,
    });

    const stealth = (await getCopilotState()).runInBackground;
    const mode = paceModeFromStealth(stealth);
    await appendCopilotLog(
      stealth
        ? 'Stealth ON (background tabs) — higher account risk'
        : 'Assisted mode (foreground)'
    );
    await appendCopilotLog(
      `Co-pilot session started — searching for "${keyword}"`,
      'success'
    );

    const searchUrl = buildNaukriSearchUrl(prefs);
    const tab = await chrome.tabs.create({
      url: searchUrl,
      active: !stealth,
    });
    if (!tab.id) {
      await appendCopilotLog('Could not open Naukri tab', 'error');
      await setCopilotState({ running: false });
      return { ok: false, message: 'No tab.' };
    }

    await waitForTabComplete(tab.id);
    if (!(await pacedWait(mode, 'nav', { jobTitle: 'search list' }))) {
      return { ok: true, message: 'Stopped.' };
    }

    if (await checkBlockOnTab(tab.id)) {
      return { ok: false, message: 'Naukri block detected.' };
    }

    if (!(await waitWhilePaused())) {
      return { ok: true, message: 'Stopped.' };
    }

    if (!(await ensureNaukriLoggedIn(tab.id))) {
      return { ok: false, message: 'Not logged into Naukri.' };
    }

    const seenKeys = new Set<string>();
    let hitLimit = false;

    // Human-like: scan list → process matches → back to list → scroll → repeat.
    for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
      if (!(await waitWhilePaused())) break;
      if (!(await ensureNaukriLoggedIn(tab.id))) break;

      // Ensure we are on the search list before scraping.
      const tabInfo = await chrome.tabs.get(tab.id);
      if (!tabInfo.url || !/naukri\.com/i.test(tabInfo.url) || /job-listings/i.test(tabInfo.url)) {
        await goBackToList(tab.id, searchUrl, stealth);
        if (!(await ensureNaukriLoggedIn(tab.id))) break;
      }

      await appendCopilotLog(
        round === 0 ? 'Scanning jobs on list' : `Scrolling list (round ${round + 1})`
      );

      if (round > 0) {
        await sendToTab(tab.id, { type: 'SCROLL_SEARCH_RESULTS' }).catch(
          () => undefined
        );
        await pacedWait(mode, 'scroll', { jobTitle: 'job list' });
      }

      const scrape = await sendToTab<{ jobs: SearchResultJob[] }>(tab.id, {
        type: 'RUN_SCAN_SCRAPE',
      });
      const visible = (scrape.jobs ?? []).filter((job) =>
        matchesPreferences(job, prefs)
      );

      const appliedSet = await fetchAppliedSet(visible);
      const fresh: SearchResultJob[] = [];

      for (const job of visible) {
        const id = jobKey(job);
        if (seenKeys.has(id)) continue;
        seenKeys.add(id);

        if (isAlreadyInDb(job, appliedSet)) {
          await upsertScannedJobs(
            [
              {
                id,
                title: job.title,
                company: job.company,
                url: job.url,
                externalJobId: job.externalJobId,
              },
            ],
            'already_applied'
          );
          await appendCopilotLog(
            `Already applied (Atlas) — skipped: ${job.title}`,
            'info'
          );
          continue;
        }

        await upsertScannedJobs([
          {
            id,
            title: job.title,
            company: job.company,
            url: job.url,
            externalJobId: job.externalJobId,
          },
        ]);
        fresh.push(job);
      }

      await appendCopilotLog(
        `List round ${round + 1}: ${fresh.length} new match(es) to process`,
        fresh.length ? 'success' : 'warn'
      );

      for (const job of fresh) {
        if (!(await waitWhilePaused())) {
          hitLimit = true;
          break;
        }
        const outcome = await applyOneJob(
          tab.id,
          job,
          prefs,
          handlers,
          searchUrl,
          stealth
        );
        if (outcome === 'stop' || outcome === 'limit') {
          hitLimit = true;
          break;
        }
      }

      if (hitLimit) break;

      // If this round found nothing new after a scroll, stop.
      if (round > 0 && fresh.length === 0) {
        await appendCopilotLog('No more new matching jobs on the list', 'info');
        break;
      }
    }

    const finalState = await getCopilotState();
    await appendCopilotLog(
      `Done — matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped}`,
      'success'
    );

    const applied = finalState.applied;
    await raiseCopilotToast(
      applied > 0 ? 'Applies done' : 'Session finished',
      applied > 0
        ? `Applied to ${applied} job(s) this session.`
        : `Matched ${finalState.matched}, no new applies this round.`
    );

    // Keep tab context so user can continue to next page.
    if (!hitLimit || applied > 0 || finalState.matched > 0) {
      lastSession = {
        handlers,
        searchUrl,
        tabId: tab.id,
        stealth,
        prefs,
        seenKeys,
      };
      await setCopilotState({
        running: false,
        paused: false,
        currentTitle: '',
        paceLabel: null,
        paceRemainingMs: null,
        sessionComplete: {
          applied: finalState.applied,
          matched: finalState.matched,
          skipped: finalState.skipped,
          at: new Date().toISOString(),
        },
      });
    } else {
      lastSession = null;
      await setCopilotState({
        running: false,
        paused: false,
        currentTitle: '',
        sessionComplete: null,
      });
    }
    return { ok: true, message: 'Co-pilot session finished.' };
  } catch (error) {
    logger.warn('Co-pilot failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await appendCopilotLog(
      `Co-pilot error: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    await setCopilotState({ running: false, paused: false });
    return { ok: false, message: 'Co-pilot failed.' };
  } finally {
    botRunning = false;
  }
}

/** User chose Close after session complete — point them to dashboard. */
export async function closeSessionComplete(): Promise<void> {
  lastSession = null;
  await setCopilotState({
    sessionComplete: null,
    running: false,
    paused: false,
    currentTitle: '',
    paceLabel: null,
    paceRemainingMs: null,
  });
  await raiseCopilotToast(
    'Visit your dashboard',
    'Review applications in Cosmo — co-pilot is closed.'
  );
  await appendCopilotLog(
    'Session closed — visit Cosmo dashboard to review applications.',
    'success'
  );
  await broadcastCopilotToNaukriTabs({ type: 'COPILOT_COLLAPSE' });
}

/** User chose Next page after session complete. */
export async function continueNextPage(): Promise<{
  ok: boolean;
  message: string;
}> {
  const ctx = lastSession;
  if (!ctx) {
    return { ok: false, message: 'No session to continue.' };
  }
  if (botRunning) {
    return { ok: false, message: 'Co-pilot is already running.' };
  }

  await setCopilotState({ sessionComplete: null, running: true, paused: false });
  botRunning = true;

  try {
    const mode = paceModeFromStealth(ctx.stealth);
    await appendCopilotLog(
      'Taking a short read pause before the next page…',
      'info'
    );
    if (!(await pacedWait(mode, 'read', { jobTitle: 'next page' }))) {
      return { ok: true, message: 'Stopped.' };
    }

    // Ensure we are on the search list.
    await goBackToList(ctx.tabId, ctx.searchUrl, ctx.stealth);
    if (!(await ensureNaukriLoggedIn(ctx.tabId))) {
      return { ok: false, message: 'Not logged into Naukri.' };
    }

    const next = await sendToTab<{ ok: boolean; reason?: string }>(
      ctx.tabId,
      { type: 'CLICK_NEXT_PAGE' },
      4
    ).catch(() => ({ ok: false, reason: 'Could not open next page' }));

    if (!next.ok) {
      await appendCopilotLog(
        next.reason || 'No next page available',
        'warn'
      );
      await raiseCopilotToast(
        'No more pages',
        'Visit your Cosmo dashboard to review applications.'
      );
      await setCopilotState({
        running: false,
        sessionComplete: null,
      });
      lastSession = null;
      return { ok: false, message: next.reason || 'No next page.' };
    }

    await waitForTabComplete(ctx.tabId);
    if (!(await pacedWait(mode, 'nav', { jobTitle: 'next page' }))) {
      return { ok: true, message: 'Stopped.' };
    }

    await appendCopilotLog('Next page loaded — scanning jobs', 'success');

    const seenKeys = ctx.seenKeys;
    let hitLimit = false;
    const prefs = ctx.prefs;
    const handlers = ctx.handlers;
    const stealth = ctx.stealth;
    const searchUrl = ctx.searchUrl;
    const tabId = ctx.tabId;

    for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
      if (!(await waitWhilePaused())) break;
      if (!(await ensureNaukriLoggedIn(tabId))) break;

      const tabInfo = await chrome.tabs.get(tabId);
      if (
        !tabInfo.url ||
        !/naukri\.com/i.test(tabInfo.url) ||
        /job-listings/i.test(tabInfo.url)
      ) {
        await goBackToList(tabId, searchUrl, stealth);
        if (!(await ensureNaukriLoggedIn(tabId))) break;
      }

      if (round > 0) {
        await sendToTab(tabId, { type: 'SCROLL_SEARCH_RESULTS' }).catch(
          () => undefined
        );
        await pacedWait(mode, 'scroll', { jobTitle: 'job list' });
      }

      const scrape = await sendToTab<{ jobs: SearchResultJob[] }>(tabId, {
        type: 'RUN_SCAN_SCRAPE',
      });
      const visible = (scrape.jobs ?? []).filter((job) =>
        matchesPreferences(job, prefs)
      );
      const appliedSet = await fetchAppliedSet(visible);
      const fresh: SearchResultJob[] = [];

      for (const job of visible) {
        const id = jobKey(job);
        if (seenKeys.has(id)) continue;
        seenKeys.add(id);
        if (isAlreadyInDb(job, appliedSet)) {
          await upsertScannedJobs(
            [
              {
                id,
                title: job.title,
                company: job.company,
                url: job.url,
                externalJobId: job.externalJobId,
              },
            ],
            'already_applied'
          );
          continue;
        }
        await upsertScannedJobs([
          {
            id,
            title: job.title,
            company: job.company,
            url: job.url,
            externalJobId: job.externalJobId,
          },
        ]);
        fresh.push(job);
      }

      await appendCopilotLog(
        `Next page round ${round + 1}: ${fresh.length} new match(es)`,
        fresh.length ? 'success' : 'warn'
      );

      for (const job of fresh) {
        if (!(await waitWhilePaused())) {
          hitLimit = true;
          break;
        }
        const outcome = await applyOneJob(
          tabId,
          job,
          prefs,
          handlers,
          searchUrl,
          stealth
        );
        if (outcome === 'stop' || outcome === 'limit') {
          hitLimit = true;
          break;
        }
      }
      if (hitLimit) break;
      if (round > 0 && fresh.length === 0) break;
    }

    const finalState = await getCopilotState();
    await appendCopilotLog(
      `Done — matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped}`,
      'success'
    );
    await raiseCopilotToast(
      'Applies done',
      `Applied to ${finalState.applied} job(s) so far this session.`
    );
    lastSession = {
      handlers,
      searchUrl,
      tabId,
      stealth,
      prefs,
      seenKeys,
    };
    await setCopilotState({
      running: false,
      paused: false,
      currentTitle: '',
      paceLabel: null,
      paceRemainingMs: null,
      sessionComplete: {
        applied: finalState.applied,
        matched: finalState.matched,
        skipped: finalState.skipped,
        at: new Date().toISOString(),
      },
    });
    return { ok: true, message: 'Continued to next page.' };
  } catch (error) {
    logger.warn('Continue next page failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await setCopilotState({ running: false });
    return { ok: false, message: 'Could not open next page.' };
  } finally {
    botRunning = false;
  }
}
