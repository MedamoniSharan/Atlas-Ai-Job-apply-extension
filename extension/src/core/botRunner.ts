import type { JobPayload, JobPreferences } from '@cosmo/shared';
import {
  NaukriAdapter,
  SearchResultJob,
  buildNaukriSearchQueryPlan,
  buildNaukriSearchUrl,
  buildSearchKeyword,
  matchesListCandidate,
  matchesPreferences,
  preferenceSkipReason,
  searchUrlHasPreferenceFilters,
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
  noteJobsScanned,
  notePageScanned,
} from './copilotState';
import {
  beginScanSession,
  reportScanSession,
} from './scanSessionReporter';
import { mergeJobFields, jobDetailRichness } from './jobFields';
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
import {
  ensureNaukriWorkTab,
  installTabSpamGuard,
  setActiveWorkTabId,
} from './singleTab';

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

/** Apply Naukri filters first (no humanPace slowdown). Then scan/apply. */
async function applyNaukriPreferenceFilters(
  tabId: number,
  prefs: JobPreferences,
  stealth: boolean,
  searchUrl: string,
  options?: { forceNavigate?: boolean; focusLocation?: string | null }
): Promise<boolean> {
  const forceNavigate = options?.forceNavigate !== false;
  const focusLocation = options?.focusLocation ?? null;
  const needsSalary = prefs.minSalaryLpa != null && prefs.minSalaryLpa > 0;
  const needsWork = prefs.workMode !== 'any' && prefs.workMode != null;
  const needsLocation = prefs.locations.some((l) => Boolean(l?.trim()));
  const needsFilters = needsSalary || needsWork || needsLocation;

  if (!needsFilters) {
    await appendCopilotLog(
      'No salary/location/work-mode in preferences — keyword search only.',
      'warn'
    );
    return true;
  }

  await appendCopilotLog(
    `Applying Naukri All Filters — salary≥${prefs.minSalaryLpa ?? 'any'} LPA, location=${
      focusLocation || prefs.locations.filter(Boolean).join('/') || 'any'
    }, work=${prefs.workMode}`,
    'info'
  );

  if (forceNavigate) {
    await appendCopilotLog(`Filter search URL: ${searchUrl}`, 'info');
    await chrome.tabs.update(tabId, {
      url: searchUrl,
      active: !stealth,
    });
    await waitForTabComplete(tabId);
    await wait(2500);
    if (!(await ensureNaukriLoggedIn(tabId))) return false;

    for (let i = 0; i < 2; i++) {
      const tab = await chrome.tabs.get(tabId);
      if (searchUrlHasPreferenceFilters(tab.url || '', prefs)) break;
      await appendCopilotLog(
        'Naukri dropped filter params — reloading filtered URL…',
        'warn'
      );
      await chrome.tabs.update(tabId, {
        url: searchUrl,
        active: !stealth,
      });
      await waitForTabComplete(tabId);
      await wait(2000);
    }
  }

  await appendCopilotLog(
    'Opening Naukri All Filters, then applying salary/location/work-mode…',
    'info'
  );

  let confirmed = false;
  let lastDetails: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await waitWhilePaused())) return false;
    try {
      const result = await sendToTab<{
        ok?: boolean;
        alreadyApplied?: boolean;
        confirmed?: boolean;
        ready?: boolean;
        openedAllFilters?: boolean;
        applied?: string[];
        skipped?: string[];
        confirmDetails?: string[];
      }>(
        tabId,
        { type: 'APPLY_PREFERENCE_FILTERS', prefs, focusLocation },
        10
      );

      if (result.openedAllFilters) {
        await appendCopilotLog('All Filters panel is open', 'success');
      }

      lastDetails = result.confirmDetails ?? [];

      if (
        result.confirmed ||
        result.alreadyApplied ||
        (result.applied?.length ?? 0) > 0
      ) {
        if (result.confirmed || result.alreadyApplied) {
          confirmed = true;
        }
        if (result.alreadyApplied && !result.applied?.length) {
          await appendCopilotLog(
            'Naukri All Filters already match preferences',
            'success'
          );
        } else if (result.applied?.length) {
          await appendCopilotLog(
            `All Filters applied: ${result.applied.join(', ')}`,
            'success'
          );
        }
        if (result.confirmed || result.alreadyApplied) {
          await appendCopilotLog(
            `Filters reconfirmed${
              lastDetails.length ? `: ${lastDetails.join('; ')}` : ''
            }`,
            'success'
          );
          break;
        }
      }

      await appendCopilotLog(
        `All Filters attempt ${attempt + 1}: ${(result.skipped ?? []).join('; ') || 'panel not ready'}`,
        'warn'
      );
      await wait(1500);
    } catch (error) {
      await appendCopilotLog(
        `All Filters click error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'warn'
      );
      await wait(1200);
    }
  }

  // Final live reconfirm on the page.
  if (!confirmed) {
    try {
      const verify = await sendToTab<{
        confirmed?: boolean;
        details?: string[];
      }>(
        tabId,
        { type: 'CONFIRM_PREFERENCE_FILTERS', prefs, focusLocation },
        4
      );
      confirmed = Boolean(verify.confirmed);
      lastDetails = verify.details ?? lastDetails;
      if (confirmed) {
        await appendCopilotLog(
          `Filters reconfirmed: ${(lastDetails || []).join('; ') || 'ok'}`,
          'success'
        );
      }
    } catch {
      /* ignore */
    }
  }

  const tabAfter = await chrome.tabs.get(tabId);
  const urlOk = searchUrlHasPreferenceFilters(tabAfter.url || '', prefs);
  if (!confirmed && !urlOk) {
    await appendCopilotLog(
      `Could not confirm Naukri filters (salary/location/work). ${lastDetails.join('; ')}`,
      'error'
    );
    return false;
  }
  if (!confirmed && urlOk) {
    await appendCopilotLog(
      'URL filters active — sidebar ticks incomplete, continuing with URL filters',
      'warn'
    );
  }

  await wait(2000);
  await waitForTabComplete(tabId);
  return true;
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
 * loggedOut → pause with login CTA; uncertain → pause with confirm CTA (don't guess),
 * unless the user already confirmed login this run.
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

    const state = await getCopilotState();
    // User already confirmed this session — don't keep showing the popup.
    if (state.loginUserConfirmed && login.status !== 'loggedOut') {
      await setCopilotState({ needsLogin: false, loginPauseReason: null });
      await appendCopilotLog(
        'Using your confirmed Naukri login — continuing',
        'success'
      );
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
        ? 'Paused — confirm you’re logged into Naukri, then press Confirm.'
        : 'Paused — please log into Naukri to continue. Open login in a new tab, then press Confirm.',
      'warn'
    );
    await sendToTab(tabId, {
      type: 'SHOW_LOGIN_PROMPT',
      reason,
    }).catch(() => undefined);

    if (!(await waitWhilePaused())) return false;

    // After Confirm / Resume, re-read state — honor sticky confirm immediately.
    const after = await getCopilotState();
    if (after.loginUserConfirmed) {
      await setCopilotState({ needsLogin: false, loginPauseReason: null });
      await appendCopilotLog(
        'Login confirmed — continuing co-pilot',
        'success'
      );
      return true;
    }

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
  stealth: boolean,
  options?: { maxNavMs?: number }
): Promise<void> {
  const mode = paceModeFromStealth(stealth);
  await chrome.tabs.update(tabId, {
    url: searchUrl,
    active: !stealth,
  });
  await waitForTabComplete(tabId);
  await pacedWait(mode, 'nav', {
    jobTitle: 'search list',
    maxMs: options?.maxNavMs,
    label: options?.maxNavMs != null ? 'Back to list' : undefined,
  });
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

/** Second check on the live tab before Cosmo records an apply. */
async function reconfirmAppliedOnTab(tabId: number): Promise<{
  applied: boolean;
  needsQuestions: boolean;
}> {
  try {
    const res = await sendToTab<{
      applied?: boolean;
      needsQuestions?: boolean;
    }>(tabId, { type: 'CHECK_APPLY_STATUS' }, 4);
    return {
      applied: Boolean(res.applied),
      needsQuestions: Boolean(res.needsQuestions),
    };
  } catch {
    return { applied: false, needsQuestions: false };
  }
}

async function probeApplyReady(tabId: number): Promise<boolean> {
  try {
    const res = await sendToTab<{ ready?: boolean }>(
      tabId,
      { type: 'PROBE_APPLY_READY' },
      3
    );
    return Boolean(res.ready);
  } catch {
    return false;
  }
}

/** Poll until Easy Apply is visible, or timeout — avoid sitting on "Loading page" forever. */
async function waitForApplyReady(
  tabId: number,
  timeoutMs = 4000
): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await probeApplyReady(tabId)) return true;
    await wait(350);
  }
  return probeApplyReady(tabId);
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
  const reason = 'Apply on company site — needs manual apply';
  await handlers.persistJobDetected({
    ...base,
    metadata: {
      source: 'auto_scan',
      skipped: true,
      companySiteApply: true,
      skipReason: reason,
    },
  });
  await updateScannedJob(id, {
    status: 'skipped',
    skipReason: reason,
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

  // Poll for Apply — do NOT show a fake multi-second "slowdown" while waiting.
  await setCopilotState({
    paceLabel: 'Opening job',
    paceRemainingMs: null,
  });
  const applyReadyEarly = await waitForApplyReady(tabId, 3500);

  // If Apply is already visible, only a tiny settle — full humanPace was
  // blocking the click and looking like a skip.
  if (
    !(await pacedWait(mode, 'nav', {
      jobTitle: job.title,
      maxMs: applyReadyEarly ? 400 : undefined,
      label: applyReadyEarly
        ? 'Apply ready — clicking soon'
        : 'Loading page',
    }))
  ) {
    return 'stop';
  }

  if (await checkBlockOnTab(tabId)) return 'stop';
  if (!(await waitWhilePaused())) return 'stop';
  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

  // Collect JD fields. When Apply is ready, keep this short so pace doesn't
  // starve the click.
  let detailJob: Partial<JobPayload> | undefined;
  let companySiteApply = Boolean(job.companySiteApply);
  const detailAttempts = applyReadyEarly ? 2 : 4;
  for (let attempt = 0; attempt < detailAttempts; attempt++) {
    try {
      const detail = await sendToTab<{
        job?: Partial<JobPayload> | null;
        companySiteApply?: boolean;
      }>(tabId, { type: 'READ_JOB_DETAIL' }, 4);
      detailJob = detail.job ?? detailJob;
      if (detail.companySiteApply) companySiteApply = true;
      if (jobDetailRichness(detailJob) >= 8) break;
    } catch {
      /* page may still be loading */
    }
    await wait(applyReadyEarly ? 300 : 700 + attempt * 400);
  }
  const enriched = mergeJobFields(detailJob, job, {
    status: 'detected',
    metadata: { source: 'auto_scan' },
  });
  await handlers.persistJobDetected(enriched);
  await appendCopilotLog(
    `Captured details for ${enriched.title} (${jobDetailRichness(enriched)} fields)`,
    jobDetailRichness(enriched) >= 8 ? 'success' : 'warn'
  );

  const detailCandidate: SearchResultJob = {
    ...job,
    title: enriched.title || job.title,
    company: enriched.company || job.company,
    location: enriched.location || job.location,
    salaryText: enriched.salary || job.salaryText,
    experienceText: enriched.experience || job.experienceText,
    skills: enriched.skills || job.skills,
    description: enriched.description || job.description,
  };
  // Already list-matched — don't skip solely for "salary not disclosed" on JD.
  // Still skip if disclosed salary/exp clearly fails prefs.
  if (
    !matchesPreferences(detailCandidate, prefs, {
      requireDisclosedSalary: false,
    })
  ) {
    const reason =
      preferenceSkipReason(detailCandidate, prefs, {
        requireDisclosedSalary: false,
      }) || 'Did not match job preferences';
    await markSkipped(handlers, enriched, id, reason);
    await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    return 'continue';
  }

  if (companySiteApply) {
    await markCompanySite(handlers, enriched, id);
    await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    return 'continue';
  }

  if (!prefs.autoApplyEnabled) {
    await markSkipped(handlers, enriched, id, 'Auto-apply is off');
    await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
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
    await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
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
    await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    return 'limit';
  }

  const applyReady = applyReadyEarly || (await probeApplyReady(tabId));
  if (
    !(await pacedWait(mode, 'dwell', {
      jobTitle: job.title,
      // Apply on screen → click almost immediately; don't burn 3–8s dwell.
      maxMs: applyReady ? 350 : undefined,
      label: applyReady ? 'About to apply' : 'Reading job details',
    }))
  ) {
    return 'stop';
  }

  if (await checkBlockOnTab(tabId)) return 'stop';
  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

  // If Apply vanished during detail scrape, wait briefly once more.
  if (!applyReady && !(await waitForApplyReady(tabId, 2500))) {
    await appendCopilotLog(
      `Apply button not found yet for "${job.title}" — trying Easy Apply anyway`,
      'warn'
    );
  }

  await setCopilotState({
    paceLabel: 'Clicking Apply',
    paceRemainingMs: null,
    currentTitle: job.title,
  });
  await appendCopilotLog(`Clicking Apply: ${job.title}`);

  let result = await tryEasyApply(tabId);
  if (result.blocked) {
    await handleBlockedPage(result.reason || 'verification page');
    return 'stop';
  }

  // Reconfirm on the live page — never trust a hopeful Easy Apply result alone.
  if (result.ok && !result.needsUserInput) {
    await setCopilotState({
      paceLabel: 'Confirming apply',
      paceRemainingMs: null,
    });
    await wait(700);
    let confirm = await reconfirmAppliedOnTab(tabId);
    if (confirm.needsQuestions) {
      result = {
        ...result,
        ok: false,
        needsUserInput: true,
        reason: 'Naukri is asking apply questions',
      };
    } else if (!confirm.applied) {
      // Don't skip immediately — Naukri sometimes lags; retry click once.
      await appendCopilotLog(
        `Apply not confirmed yet for "${job.title}" — retrying click`,
        'warn'
      );
      await wait(500);
      const retry = await tryEasyApply(tabId);
      if (retry.blocked) {
        await handleBlockedPage(retry.reason || 'verification page');
        return 'stop';
      }
      if (retry.needsUserInput) {
        result = {
          ...retry,
          ok: false,
          needsUserInput: true,
          reason: retry.reason || 'Naukri is asking apply questions',
        };
      } else if (retry.ok) {
        await wait(700);
        confirm = await reconfirmAppliedOnTab(tabId);
        if (confirm.needsQuestions) {
          result = {
            ...retry,
            ok: false,
            needsUserInput: true,
            reason: 'Naukri is asking apply questions',
          };
        } else if (confirm.applied) {
          result = retry;
          await appendCopilotLog(
            `Confirmed applied on Naukri: ${job.title}`,
            'success'
          );
        } else {
          result = {
            ...retry,
            ok: false,
            skipped: true,
            reason: 'Apply not confirmed on Naukri',
          };
        }
      } else {
        result = {
          ...retry,
          ok: false,
          skipped: true,
          reason: retry.reason || 'Apply not confirmed on Naukri',
        };
      }
    } else {
      await appendCopilotLog(`Confirmed applied on Naukri: ${job.title}`, 'success');
    }
  }

  const base = mergeJobFields(result.job, enriched, {
    url: job.url,
    status: 'detected',
    metadata: { source: 'auto_apply' },
  });

  if (result.needsUserInput) {
    await setCopilotState({ paused: true, currentTitle: base.title });
    await appendCopilotLog(
      `Paused — Naukri is asking questions for "${base.title}". Answer them on the page; Cosmo will continue when you save, or press Resume.`,
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
      await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 900 });
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
        'Still waiting on Naukri questions. Finish them — Cosmo will continue when saved, or press Resume.',
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
  await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 900 });
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
  /** All unique job cards seen on SRP (matched or not). */
  scannedKeys: Set<string>;
  /** Matched jobs waiting until we reach SCAN_BATCH_SIZE before apply. */
  pendingBatch: SearchResultJob[];
};

let lastSession: SessionCtx | null = null;

const MAX_SCROLL_ROUNDS = 20;
/** Hard rule: never apply until this many preference-matched jobs are queued. */
const SCAN_BATCH_SIZE = 30;
/** How many Naukri result pages to walk while filling the 30-job batch (auto — never ask). */
const MAX_SCAN_PAGES = 40;
/** Stop only after this many consecutive pages add zero new matches. */
const MAX_EMPTY_PAGES = 3;

const naukriPager = new NaukriAdapter();

/** Advance Naukri search to the next results page (click, then URL fallback). */
async function goToNextSearchPage(
  tabId: number
): Promise<{ ok: boolean; reason?: string }> {
  const before = (await chrome.tabs.get(tabId)).url || '';
  const clicked = await sendToTab<{ ok: boolean; reason?: string; via?: string }>(
    tabId,
    { type: 'CLICK_NEXT_PAGE' },
    4
  ).catch(() => ({ ok: false, reason: 'Could not open next page' }));

  await waitForTabComplete(tabId).catch(() => undefined);
  await wait(1800);
  let after = (await chrome.tabs.get(tabId)).url || '';

  if (clicked.ok && after !== before) {
    return { ok: true };
  }

  // Click reported ok but SPA didn't move, or click missed — force URL page bump.
  const nextUrl = naukriPager.nextSearchPageUrl(after || before);
  if (!nextUrl || nextUrl === after || nextUrl === before) {
    return {
      ok: false,
      reason: clicked.reason || 'Already on the last page',
    };
  }
  await chrome.tabs.update(tabId, { url: nextUrl, active: true });
  await waitForTabComplete(tabId);
  await wait(2000);
  after = (await chrome.tabs.get(tabId)).url || '';
  if (after === before) {
    return { ok: false, reason: 'Next page navigation did not stick' };
  }
  return { ok: true };
}

/**
 * Phase 1: scroll the search list and collect up to SCAN_BATCH_SIZE jobs
 * that match job preferences (list-card rules). Does not apply yet.
 */
async function collectPreferenceMatches(opts: {
  tabId: number;
  searchUrl: string;
  stealth: boolean;
  prefs: JobPreferences;
  seenKeys: Set<string>;
  scannedKeys: Set<string>;
  logPrefix?: string;
  /** Existing queue to append into (toward SCAN_BATCH_SIZE). */
  into?: SearchResultJob[];
}): Promise<SearchResultJob[]> {
  const { tabId, searchUrl, stealth, prefs, seenKeys, scannedKeys } = opts;
  const prefix = opts.logPrefix ?? 'Scan';
  const mode = paceModeFromStealth(stealth);
  const batch = opts.into ?? [];

  await appendCopilotLog(
    `${prefix}: collecting matched jobs (${batch.length}/${SCAN_BATCH_SIZE}) — no apply until ${SCAN_BATCH_SIZE}…`,
    'info'
  );

  for (
    let round = 0;
    round < MAX_SCROLL_ROUNDS && batch.length < SCAN_BATCH_SIZE;
    round++
  ) {
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

    await appendCopilotLog(
      round === 0
        ? `${prefix}: scanning job list`
        : `${prefix}: scrolling list (round ${round + 1})`
    );

    if (round > 0) {
      await sendToTab(tabId, { type: 'SCROLL_SEARCH_RESULTS' }).catch(
        () => undefined
      );
      await pacedWait(mode, 'scroll', { jobTitle: 'job list' });
    }

    const scrape = await sendToTab<{ jobs: SearchResultJob[] }>(tabId, {
      type: 'RUN_SCAN_SCRAPE',
    });
    const allJobs = scrape.jobs ?? [];
    const scannedTotal = await noteJobsScanned(allJobs, scannedKeys);

    const visible = allJobs.filter((job) => matchesListCandidate(job, prefs));

    const appliedSet = await fetchAppliedSet(visible);
    let addedThisRound = 0;

    for (const job of visible) {
      if (batch.length >= SCAN_BATCH_SIZE) break;
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
          `Already applied (Cosmo) — skipped: ${job.title}`,
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
      batch.push(job);
      addedThisRound += 1;
    }

    await appendCopilotLog(
      `${prefix} round ${round + 1}: scanned ${scannedTotal} · +${addedThisRound} match → ${batch.length}/${SCAN_BATCH_SIZE}`,
      addedThisRound ? 'success' : 'warn'
    );

    if (batch.length >= SCAN_BATCH_SIZE) break;
    if (round > 0 && addedThisRound === 0) {
      await appendCopilotLog(
        `${prefix}: no more new matching jobs on this page`,
        'info'
      );
      break;
    }
  }

  return batch;
}

/**
 * Keep scanning and auto-advance Naukri pages until SCAN_BATCH_SIZE matches
 * (or pages run out). Never asks the user to click Next. Never starts apply.
 */
async function collectUntilMatchedBatch(opts: {
  tabId: number;
  searchUrl: string;
  stealth: boolean;
  prefs: JobPreferences;
  seenKeys: Set<string>;
  scannedKeys: Set<string>;
  pending?: SearchResultJob[];
  logPrefix?: string;
}): Promise<SearchResultJob[]> {
  const batch = [...(opts.pending ?? [])];
  const prefix = opts.logPrefix ?? 'Scan';
  let emptyPages = 0;

  for (
    let page = 0;
    page < MAX_SCAN_PAGES && batch.length < SCAN_BATCH_SIZE;
    page++
  ) {
    if (!(await waitWhilePaused())) break;
    if (!(await ensureNaukriLoggedIn(opts.tabId))) break;

    if (page > 0) {
      await appendCopilotLog(
        `${prefix}: ${batch.length}/${SCAN_BATCH_SIZE} matched — auto next page (no ask)…`,
        'info'
      );
      const next = await goToNextSearchPage(opts.tabId);
      if (!next.ok) {
        await appendCopilotLog(
          next.reason || `No more pages — still at ${batch.length}/${SCAN_BATCH_SIZE}`,
          'warn'
        );
        break;
      }
    }

    const before = batch.length;
    await collectPreferenceMatches({
      tabId: opts.tabId,
      searchUrl: opts.searchUrl,
      stealth: opts.stealth,
      prefs: opts.prefs,
      seenKeys: opts.seenKeys,
      scannedKeys: opts.scannedKeys,
      into: batch,
      logPrefix: `${prefix} p${page + 1}`,
    });
    await notePageScanned();
    await reportScanSession('running');
    if (batch.length >= SCAN_BATCH_SIZE) break;

    if (batch.length === before) {
      emptyPages += 1;
      await appendCopilotLog(
        `${prefix}: page added 0 new matches (${emptyPages}/${MAX_EMPTY_PAGES} empty)`,
        'warn'
      );
      if (emptyPages >= MAX_EMPTY_PAGES) {
        await appendCopilotLog(
          `${prefix}: stopping after ${MAX_EMPTY_PAGES} empty pages — ${batch.length}/${SCAN_BATCH_SIZE}`,
          'warn'
        );
        break;
      }
    } else {
      emptyPages = 0;
    }
  }

  const ready = batch.slice(0, SCAN_BATCH_SIZE);
  const scannedTotal = (await getCopilotState()).scanned;
  if (ready.length >= SCAN_BATCH_SIZE) {
    await appendCopilotLog(
      `Matched batch ready — scanned ${scannedTotal} jobs, matched ${ready.length}/${SCAN_BATCH_SIZE}. Starting applies…`,
      'success'
    );
  } else {
    await appendCopilotLog(
      `Only ${ready.length}/${SCAN_BATCH_SIZE} matched after scanning ${scannedTotal} jobs — will NOT apply under ${SCAN_BATCH_SIZE}.`,
      'warn'
    );
  }
  return ready;
}

/** Phase 2: apply collected jobs one by one — only when batch is full (30). */
async function applyCollectedJobs(opts: {
  tabId: number;
  jobs: SearchResultJob[];
  prefs: JobPreferences;
  handlers: BotHandlers;
  searchUrl: string;
  stealth: boolean;
}): Promise<'ok' | 'stop' | 'limit' | 'waiting'> {
  const { tabId, jobs, prefs, handlers, searchUrl, stealth } = opts;
  if (jobs.length < SCAN_BATCH_SIZE) {
    await appendCopilotLog(
      `Apply blocked — need ${SCAN_BATCH_SIZE} matched jobs, have ${jobs.length}`,
      'warn'
    );
    return 'waiting';
  }

  await appendCopilotLog(
    `Applying ${jobs.length} matched job(s) one by one (slowdown on)…`,
    'success'
  );

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    if (!(await waitWhilePaused())) return 'stop';
    await appendCopilotLog(
      `Apply ${i + 1}/${jobs.length}: ${job.title}`,
      'info'
    );
    const outcome = await applyOneJob(
      tabId,
      job,
      prefs,
      handlers,
      searchUrl,
      stealth
    );
    if (outcome === 'stop') return 'stop';
    if (outcome === 'limit') return 'limit';
  }
  return 'ok';
}

export async function stopBot(): Promise<void> {
  lastSession = null;
  setActiveWorkTabId(null);
  await reportScanSession('stopped');
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

    const keyword = buildSearchKeyword(prefs);

    if (!prefs.titles.length && !prefs.keywords.length) {
      await appendCopilotLog(
        'Add at least 3 job titles and 4 keywords in preferences first',
        'error'
      );
      return { ok: false, message: 'Preferences incomplete.' };
    }
    if (prefs.titles.length < 3 || prefs.keywords.length < 4) {
      await appendCopilotLog(
        'Preferences need at least 3 job titles and 4 keywords',
        'error'
      );
      return { ok: false, message: 'Preferences incomplete.' };
    }

    const existing = await getCopilotState();
    await setCopilotState({
      running: true,
      paused: false,
      needsLogin: false,
      loginUserConfirmed: false,
      loginPauseReason: null,
      keyword,
      scanned: 0,
      matched: 0,
      applied: 0,
      skipped: 0,
      pagesScanned: 0,
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
    await beginScanSession();

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
    await broadcastCopilotToNaukriTabs({ type: 'COPILOT_EXPAND' });

    const searchPlan = buildNaukriSearchQueryPlan(prefs);
    const firstQuery = searchPlan[0]!;
    let searchUrl = firstQuery.url;
    installTabSpamGuard();
    const tab = await ensureNaukriWorkTab({
      url: searchUrl,
      active: !stealth,
    });
    if (!tab.id) {
      await appendCopilotLog('Could not open Naukri tab', 'error');
      await setCopilotState({ running: false });
      return { ok: false, message: 'No tab.' };
    }
    setActiveWorkTabId(tab.id);

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
    const scannedKeys = new Set<string>();
    let hitLimit = false;
    let batch: SearchResultJob[] = [];

    // Phase 1: for each title × location, scan until 30 matched.
    await appendCopilotLog(
      `Will try up to ${searchPlan.length} search combinations (titles × cities × skills) until ${SCAN_BATCH_SIZE} matches…`,
      'info'
    );

    for (let qi = 0; qi < searchPlan.length && batch.length < SCAN_BATCH_SIZE; qi++) {
      const query = searchPlan[qi]!;
      searchUrl = query.url;
      await setCopilotState({ keyword: query.keyword });
      await appendCopilotLog(
        `Search ${qi + 1}/${searchPlan.length} [${query.kind}]: "${query.keyword}"${
          query.location ? ` in ${query.location}` : ' (India-wide)'
        } (${batch.length}/${SCAN_BATCH_SIZE} so far)`,
        'success'
      );

      if (qi > 0) {
        await chrome.tabs.update(tab.id, { url: searchUrl, active: !stealth });
        await waitForTabComplete(tab.id);
        await wait(1500);
        if (!(await ensureNaukriLoggedIn(tab.id))) break;
      }

      if (
        !(await applyNaukriPreferenceFilters(tab.id, prefs, stealth, searchUrl, {
          focusLocation: query.location || null,
        }))
      ) {
        return { ok: false, message: 'Stopped while applying Naukri filters.' };
      }

      const before = batch.length;
      batch = await collectUntilMatchedBatch({
        tabId: tab.id,
        searchUrl,
        stealth,
        prefs,
        seenKeys,
        scannedKeys,
        pending: batch,
        logPrefix: `Scan “${query.keyword}”`,
      });

      if (batch.length >= SCAN_BATCH_SIZE) break;
      if (batch.length === before) {
        await appendCopilotLog(
          `No new matches for "${query.keyword}"${
            query.location ? ` / ${query.location}` : ''
          } — trying next title/location…`,
          'warn'
        );
      } else {
        await appendCopilotLog(
          `Still ${batch.length}/${SCAN_BATCH_SIZE} — switching to next title/location…`,
          'info'
        );
      }
    }

    // Phase 2: apply only when we have a full 30-match batch.
    if (batch.length >= SCAN_BATCH_SIZE) {
      const applyOutcome = await applyCollectedJobs({
        tabId: tab.id,
        jobs: batch,
        prefs,
        handlers,
        searchUrl,
        stealth,
      });
      if (applyOutcome === 'stop' || applyOutcome === 'limit') {
        hitLimit = true;
      }
    } else {
      await raiseCopilotToast(
        `Only ${batch.length}/${SCAN_BATCH_SIZE} matches`,
        `Tried ${searchPlan.length} title/location search(es). Apply starts only at ${SCAN_BATCH_SIZE}.`
      );
    }

    const finalState = await getCopilotState();
    const allApplied =
      batch.length >= SCAN_BATCH_SIZE &&
      finalState.applied >= SCAN_BATCH_SIZE &&
      !hitLimit;
    await appendCopilotLog(
      allApplied
        ? `All ${SCAN_BATCH_SIZE} matched jobs applied — scanned ${finalState.scanned}, matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped}`
        : `Done — scanned ${finalState.scanned}, matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped}`,
      'success'
    );

    await raiseCopilotToast(
      allApplied || finalState.applied > 0
        ? 'All jobs matched and applied'
        : batch.length >= SCAN_BATCH_SIZE
          ? 'Session finished'
          : `Only ${batch.length}/${SCAN_BATCH_SIZE} matches`,
      allApplied || finalState.applied > 0
        ? `Matched and applied ${finalState.applied} job(s). Review them on your Cosmo dashboard.`
        : batch.length >= SCAN_BATCH_SIZE
          ? `Matched ${finalState.matched}, no new applies this round.`
          : `Auto page scan found ${batch.length}/${SCAN_BATCH_SIZE} — apply not started.`
    );

    // Keep tab context only if still short of 30 (rare — pages exhausted).
    if (!hitLimit || finalState.applied > 0 || finalState.matched > 0 || batch.length > 0) {
      lastSession = {
        handlers,
        searchUrl,
        tabId: tab.id,
        stealth,
        prefs,
        seenKeys,
        scannedKeys,
        pendingBatch: batch.length >= SCAN_BATCH_SIZE ? [] : batch,
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
          offerNextPage: false,
          allApplied: allApplied || finalState.applied > 0,
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
    await reportScanSession('completed');
    return { ok: true, message: 'Co-pilot session finished.' };
  } catch (error) {
    logger.warn('Co-pilot failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await appendCopilotLog(
      `Co-pilot error: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    await reportScanSession('failed');
    await setCopilotState({ running: false, paused: false });
    return { ok: false, message: 'Co-pilot failed.' };
  } finally {
    // Early returns (login fail, stop mid-run, etc.) never hit the summary
    // block — still flush whatever counters we gathered.
    const leftover = await getCopilotState();
    if (leftover.sessionId) {
      await reportScanSession('stopped');
    }
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
    const existingSession = await getCopilotState();
    if (!existingSession.sessionId) {
      await beginScanSession();
    }

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

    const next = await goToNextSearchPage(ctx.tabId);

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

    if (!(await pacedWait(mode, 'nav', { jobTitle: 'next page' }))) {
      return { ok: true, message: 'Stopped.' };
    }

    await appendCopilotLog('Next page loaded — scanning jobs', 'success');

    const seenKeys = ctx.seenKeys;
    const scannedKeys = ctx.scannedKeys ?? new Set<string>();
    let hitLimit = false;
    const prefs = ctx.prefs;
    const handlers = ctx.handlers;
    const stealth = ctx.stealth;
    const searchUrl = ctx.searchUrl;
    const tabId = ctx.tabId;

    // Re-check sidebar filters only (do not jump back to page 1).
    if (
      !(await applyNaukriPreferenceFilters(tabId, prefs, stealth, searchUrl, {
        forceNavigate: false,
      }))
    ) {
      return { ok: false, message: 'Stopped while applying Naukri filters.' };
    }

    const batch = await collectUntilMatchedBatch({
      tabId,
      searchUrl,
      stealth,
      prefs,
      seenKeys,
      scannedKeys,
      pending: ctx.pendingBatch ?? [],
      logPrefix: 'Next-page scan',
    });

    if (batch.length >= SCAN_BATCH_SIZE) {
      const applyOutcome = await applyCollectedJobs({
        tabId,
        jobs: batch,
        prefs,
        handlers,
        searchUrl,
        stealth,
      });
      if (applyOutcome === 'stop' || applyOutcome === 'limit') {
        hitLimit = true;
      }
    } else {
      await raiseCopilotToast(
        `Only ${batch.length}/${SCAN_BATCH_SIZE} matches`,
        `Auto-scanned pages — apply starts only at ${SCAN_BATCH_SIZE}.`
      );
    }

    const finalState = await getCopilotState();
    const allApplied =
      batch.length >= SCAN_BATCH_SIZE &&
      finalState.applied >= SCAN_BATCH_SIZE &&
      !hitLimit;
    await appendCopilotLog(
      allApplied
        ? `All ${SCAN_BATCH_SIZE} matched jobs applied — scanned ${finalState.scanned}, matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped}`
        : `Done — scanned ${finalState.scanned}, matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped}`,
      'success'
    );
    await raiseCopilotToast(
      allApplied || finalState.applied > 0
        ? 'All jobs matched and applied'
        : `Only ${batch.length}/${SCAN_BATCH_SIZE} matches`,
      allApplied || finalState.applied > 0
        ? `Matched and applied ${finalState.applied} job(s). Review them on your Cosmo dashboard.`
        : `Auto page scan found ${batch.length}/${SCAN_BATCH_SIZE}.`
    );
    lastSession = {
      handlers,
      searchUrl,
      tabId,
      stealth,
      prefs,
      seenKeys,
      scannedKeys,
      pendingBatch: batch.length >= SCAN_BATCH_SIZE ? [] : batch,
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
        offerNextPage: false,
        allApplied: allApplied || finalState.applied > 0,
      },
    });
    await reportScanSession('completed');
    return { ok: true, message: hitLimit ? 'Stopped during apply.' : 'Continued to next page.' };
  } catch (error) {
    logger.warn('Continue next page failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await reportScanSession('failed');
    await setCopilotState({ running: false });
    return { ok: false, message: 'Could not open next page.' };
  } finally {
    const leftover = await getCopilotState();
    if (leftover.sessionId) {
      await reportScanSession('stopped');
    }
    botRunning = false;
  }
}
