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
  clearCopilotAlert,
  getCopilotState,
  jobKey,
  raiseCopilotToast,
  setCopilotState,
  updateScannedJob,
  upsertScannedJobs,
} from './copilotState';
import { mergeJobFields } from './jobFields';
import { getPlanApplyQuota, noteLocalApply } from './planApplyQuota';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return 2500 + Math.floor(Math.random() * 4000);
}

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
        await setCopilotState({ paused: false, needsLogin: false });
        await clearCopilotAlert();
        await appendCopilotLog(
          'Apply success detected after your answers — continuing',
          'success'
        );
        return 'applied';
      }
      if (status.needsQuestions === false) {
        await setCopilotState({ paused: false, needsLogin: false });
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
 * Before each apply: require Naukri login. If logged out, pause and wait for Resume.
 */
async function ensureNaukriLoggedIn(tabId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!(await waitWhilePaused())) return false;

    // Give the React header time to swap Login → profile drawer.
    await wait(attempt === 0 ? 1500 : 700);

    const login = await sendToTab<{ loggedIn: boolean }>(tabId, {
      type: 'CHECK_LOGIN',
    });
    if (login.loggedIn) {
      await setCopilotState({ needsLogin: false });
      if (attempt > 0) {
        await appendCopilotLog('Naukri login detected — continuing', 'success');
      }
      return true;
    }

    await setCopilotState({ paused: true, needsLogin: true });
    await appendCopilotLog(
      'Paused — please log into Naukri to continue. Open login in a new tab, then press Continue.',
      'warn'
    );
    await sendToTab(tabId, { type: 'SHOW_LOGIN_PROMPT' }).catch(() => undefined);

    if (!(await waitWhilePaused())) return false;

    await appendCopilotLog('Resumed — checking Naukri login again…');
    await wait(2000);
  }

  await appendCopilotLog(
    'Still not logged into Naukri. Stopping bot.',
    'error'
  );
  await setCopilotState({
    running: false,
    paused: false,
    needsLogin: false,
  });
  return false;
}

async function goBackToList(
  tabId: number,
  searchUrl: string,
  stealth: boolean
): Promise<void> {
  await chrome.tabs.update(tabId, {
    url: searchUrl,
    active: !stealth,
  });
  await waitForTabComplete(tabId);
  await wait(2000);
}

type EasyApplyResult = {
  ok: boolean;
  skipped?: boolean;
  alreadyApplied?: boolean;
  needsUserInput?: boolean;
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
  await wait(2000);

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

  const quota = await getPlanApplyQuota();
  if (quota.remaining <= 0) {
    await updateScannedJob(id, { status: 'pending' });
    await appendCopilotLog(
      `Plan apply limit reached (${quota.used}/${quota.limit} this month). Upgrade in Atlas to continue.`,
      'warn'
    );
    await goBackToList(tabId, searchUrl, stealth);
    return 'limit';
  }

  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

  let result = await tryEasyApply(tabId);
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
      await wait(randomDelay());
      await goBackToList(tabId, searchUrl, stealth);
      return 'continue';
    }

    await appendCopilotLog(
      `Resumed — retrying apply for "${base.title}"`,
      'success'
    );
    await wait(1500);
    if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

    result = await tryEasyApply(tabId);
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

  await wait(randomDelay());
  // Human-like: return to the search list before the next job.
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

const MAX_SCROLL_ROUNDS = 10;

export async function stopBot(): Promise<void> {
  await setCopilotState({
    running: false,
    paused: false,
    needsLogin: false,
    currentTitle: '',
  });
  await appendCopilotLog('Bot stopped', 'warn');
}

export async function pauseBot(): Promise<void> {
  await setCopilotState({ paused: true });
  await appendCopilotLog('Bot paused', 'warn');
}

export async function resumeBot(): Promise<void> {
  await setCopilotState({ paused: false, needsLogin: false });
  await clearCopilotAlert();
  await appendCopilotLog('Bot resumed', 'success');
}

export async function runBot(handlers: BotHandlers): Promise<{
  ok: boolean;
  message: string;
}> {
  if (botRunning) {
    return { ok: false, message: 'Bot is already running.' };
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
      keyword,
      matched: 0,
      applied: 0,
      skipped: 0,
      currentTitle: '',
      scannedJobs: [],
      runInBackground: existing.runInBackground,
    });

    const stealth = (await getCopilotState()).runInBackground;
    await appendCopilotLog(
      stealth ? 'Stealth Mode ON (Background)' : 'Stealth Mode OFF (Foreground)'
    );
    await appendCopilotLog(
      `Bot started — searching for "${keyword}"`,
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
    await wait(2500);

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
        await wait(1800);
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
    await setCopilotState({
      running: false,
      paused: false,
      currentTitle: '',
    });
    return { ok: true, message: 'Bot finished.' };
  } catch (error) {
    logger.warn('Bot failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await appendCopilotLog(
      `Bot error: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    await setCopilotState({ running: false, paused: false });
    return { ok: false, message: 'Bot failed.' };
  } finally {
    botRunning = false;
  }
}
