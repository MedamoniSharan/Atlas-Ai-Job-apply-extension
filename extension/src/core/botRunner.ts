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
import { loadPreferences, lookupAppliedJobs } from './apiClient';
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
  APPLY_BATCH_BETWEEN_JOBS_MAX_MS,
  APPLY_DWELL_READY_MAX_MS,
  APPLY_NAV_READY_MAX_MS,
  APPLY_NAV_SLOW_MAX_MS,
  APPLY_READY_FIRST_POLL_MS,
  APPLY_READY_RETRY_POLL_MS,
  handleBlockedPage,
  noteStealthApply,
  paceModeFromStealth,
  pacedWait,
  wait,
} from './humanPace';
import {
  startCopilotKeepAlive,
  stopCopilotKeepAlive,
} from './copilotKeepAlive';
import {
  SCAN_MATCH_TARGET,
  hasHitProcessCeiling,
  mustApplyQueuedBeforeContinue,
  remainingProcessSlots,
  scanWaitMessage,
  sessionProcessedCount,
} from './scanWait';
import { isBlocked } from './safetyStorage';
import {
  ensureNaukriWorkTab,
  installTabSpamGuard,
  setActiveWorkTabId,
  closeExtraNaukriTabs,
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
    await wait(250);
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

/**
 * Scan only: wait until job cards exist (or timeout). No human pacing.
 * Tight poll — exits as soon as cards appear.
 * Default timeout must be long enough for slow Naukri SPAs; 800ms caused
 * false "end of results" stops in production.
 */
async function waitForSearchListReady(
  tabId: number,
  timeoutMs = 4500
): Promise<number> {
  const end = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < end) {
    try {
      const scrape = await sendToTab<{ jobs?: SearchResultJob[] }>(
        tabId,
        { type: 'RUN_SCAN_SCRAPE' },
        1
      );
      count = scrape.jobs?.length ?? 0;
      if (count > 0) return count;
    } catch {
      /* content script may still be injecting */
    }
    await wait(100);
  }
  return count;
}

/** One empty scrape is not EOF — Naukri often needs a settle after nav/filter. */
async function scrapeSearchListWithConfirm(
  tabId: number
): Promise<SearchResultJob[]> {
  const first = await sendToTab<{ jobs?: SearchResultJob[] }>(tabId, {
    type: 'RUN_SCAN_SCRAPE',
  });
  const firstJobs = first.jobs ?? [];
  if (firstJobs.length > 0) return firstJobs;

  await wait(500);
  await waitForSearchListReady(tabId, 3000);
  const second = await sendToTab<{ jobs?: SearchResultJob[] }>(tabId, {
    type: 'RUN_SCAN_SCRAPE',
  });
  return second.jobs ?? [];
}

/** Apply Naukri filters first (no humanPace slowdown). Then scan/apply. */
/** Same keyword/location search — ignore filter query noise that UI ticks will set. */
function sameNaukriSearchIntent(currentUrl: string, targetUrl: string): boolean {
  try {
    const cur = new URL(currentUrl);
    const target = new URL(targetUrl);
    if (cur.origin !== target.origin) return false;
    // Ignore pagination suffixes (-2, -3) when comparing search identity.
    const stripPage = (p: string) =>
      p.replace(/\/$/, '').replace(/-(\d+)$/i, '');
    const curPath = stripPage(cur.pathname);
    const targetPath = stripPage(target.pathname);
    const curK = (cur.searchParams.get('k') || '').trim().toLowerCase();
    const targetK = (target.searchParams.get('k') || '').trim().toLowerCase();
    const curL = (cur.searchParams.get('l') || '').trim().toLowerCase();
    const targetL = (target.searchParams.get('l') || '').trim().toLowerCase();
    // When either side has k=, path alone is not enough (/jobs?k=A vs /jobs?k=B).
    if (curK || targetK) {
      return curPath === targetPath && curK === targetK && curL === targetL;
    }
    return curPath === targetPath;
  } catch {
    return normalizeUrl(currentUrl) === normalizeUrl(targetUrl);
  }
}

/**
 * Navigate with keyword/location only. Salary/work-mode go through All Filters UI.
 * Putting ctcFilter/wfhType in the URL makes Naukri redirect/rewrite on first load
 * (looks like 2–3 reloads before filters even run).
 */
function naukriKeywordNavUrl(searchUrl: string): string {
  try {
    const u = new URL(searchUrl);
    u.searchParams.delete('ctcFilter');
    u.searchParams.delete('wfhType');
    return u.toString();
  } catch {
    return searchUrl;
  }
}

async function applyNaukriPreferenceFilters(
  tabId: number,
  prefs: JobPreferences,
  stealth: boolean,
  searchUrl: string,
  options?: { forceNavigate?: boolean; focusLocation?: string | null }
): Promise<boolean> {
  // Default false: All Filters UI ticks prefs on the current SRP.
  // Full reloads blink the page and were happening every search.
  const forceNavigate = options?.forceNavigate === true;
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

  const tabNow = await chrome.tabs.get(tabId);
  const alreadyOnSearch = sameNaukriSearchIntent(tabNow.url || '', searchUrl);
  if (forceNavigate || !alreadyOnSearch) {
    if (!alreadyOnSearch) {
      const navUrl = naukriKeywordNavUrl(searchUrl);
      await appendCopilotLog(`Filter search URL: ${navUrl}`, 'info');
      await chrome.tabs.update(tabId, {
        url: navUrl,
        active: !stealth,
      });
      await waitForTabComplete(tabId);
      await waitForSearchListReady(tabId);
      if (!(await ensureNaukriLoggedIn(tabId))) return false;
    }
    // Do NOT reload when Naukri strips ctcFilter/wfhType from the URL —
    // All Filters clicks below re-apply those without a full page blink.
  } else {
    await appendCopilotLog(
      'Already on this search — applying All Filters without reload',
      'info'
    );
  }

  await appendCopilotLog(
    'Opening Naukri All Filters, then applying salary/location/work-mode…',
    'info'
  );

  let confirmed = false;
  let lastDetails: string[] = [];
  // At most 2 outer attempts — content script already does one retry.
  for (let attempt = 0; attempt < 2; attempt++) {
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
      await wait(250);
    } catch (error) {
      await appendCopilotLog(
        `All Filters click error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'warn'
      );
      await wait(250);
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

  // Filters refresh the SRP — continue as soon as cards exist (no pace delay).
  await waitForTabComplete(tabId);
  await waitForSearchListReady(tabId);
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
    'Still not logged into Naukri — paused. Log in, then press Confirm / Resume.',
    'error'
  );
  await setCopilotState({
    // Keep the session alive — do not set running:false (that mass-skips the queue).
    paused: true,
    needsLogin: true,
    loginPauseReason: 'loggedOut',
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

function isNaukriSearchListUrl(url: string | undefined): boolean {
  if (!url || !/naukri\.com/i.test(url)) return false;
  if (/job-listings/i.test(url)) return false;
  return /\/(jobs|jobseeker|mnjuser)/i.test(url) || /-jobs/i.test(url);
}

async function goBackToList(
  tabId: number,
  searchUrl: string,
  stealth: boolean,
  options?: { maxNavMs?: number; humanPace?: boolean; listUrl?: string }
): Promise<void> {
  const mode = paceModeFromStealth(stealth);
  // Prefer the live filtered/paged SRP URL. Keyword-only nav drops All Filters
  // and page position, which made the next chunk think results were exhausted.
  const preferred = options?.listUrl?.trim();
  const navUrl =
    preferred && isNaukriSearchListUrl(preferred)
      ? preferred
      : naukriKeywordNavUrl(searchUrl);
  await chrome.tabs.update(tabId, {
    url: navUrl,
    active: !stealth,
  });
  await waitForTabComplete(tabId);
  // Human pacing only when applying — scan just needs a short DOM settle.
  if (options?.humanPace) {
    await pacedWait(mode, 'nav', {
      jobTitle: 'search list',
      maxMs: options?.maxNavMs,
      label: options?.maxNavMs != null ? 'Back to list' : undefined,
    });
    return;
  }
  await waitForSearchListReady(tabId, 2500);
  await wait(options?.maxNavMs ?? 0);
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
  stealth: boolean,
  options?: { returnToList?: boolean }
): Promise<'continue' | 'stop' | 'limit'> {
  const id = jobKey(job);
  const mode = paceModeFromStealth(stealth);
  const returnToList = options?.returnToList === true;

  async function finishTowardNext(): Promise<'continue' | 'stop'> {
    if (
      !(await pacedWait(mode, 'betweenJobs', {
        jobTitle: job.title,
        maxMs: APPLY_BATCH_BETWEEN_JOBS_MAX_MS,
        label: 'Next job',
      }))
    ) {
      return 'stop';
    }
    if (returnToList) {
      await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    }
    if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';
    return 'continue';
  }

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
  const applyReadyEarly = await waitForApplyReady(tabId, APPLY_READY_FIRST_POLL_MS);

  // If Apply is already visible, only a tiny settle — full humanPace was
  // blocking the click and looking like a skip.
  if (
    !(await pacedWait(mode, 'nav', {
      jobTitle: job.title,
      maxMs: applyReadyEarly ? APPLY_NAV_READY_MAX_MS : APPLY_NAV_SLOW_MAX_MS,
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
    if (returnToList) {
      await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    }
    return 'continue';
  }

  if (companySiteApply) {
    await markCompanySite(handlers, enriched, id);
    // Stay on Naukri — never click external apply. Next job navigates away.
    return 'continue';
  }

  if (!prefs.autoApplyEnabled) {
    await markSkipped(handlers, enriched, id, 'Auto-apply is off');
    if (returnToList) {
      await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    }
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
      maxMs: applyReady ? APPLY_DWELL_READY_MAX_MS : APPLY_NAV_SLOW_MAX_MS,
      label: applyReady ? 'About to apply' : 'Reading job details',
    }))
  ) {
    return 'stop';
  }

  if (await checkBlockOnTab(tabId)) return 'stop';
  if (!(await ensureNaukriLoggedIn(tabId))) return 'stop';

  // Re-check after dwell — Naukri sometimes reveals company-site CTA late.
  try {
    const late = await sendToTab<{ companySiteApply?: boolean }>(
      tabId,
      { type: 'READ_JOB_DETAIL' },
      2
    );
    if (late.companySiteApply) {
      await markCompanySite(handlers, enriched, id);
      return 'continue';
    }
  } catch {
    /* ignore */
  }

  // If Apply vanished during detail scrape, wait briefly once more.
  if (!applyReady && !(await waitForApplyReady(tabId, APPLY_READY_RETRY_POLL_MS))) {
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

  // External apply click must never strand us off Naukri.
  if (
    result.skipped &&
    /company site|external/i.test(result.reason || '')
  ) {
    await markCompanySite(handlers, enriched, id);
    const tabUrl = (await chrome.tabs.get(tabId)).url || '';
    if (!/naukri\.com/i.test(tabUrl)) {
      await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 800 });
    }
    return 'continue';
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
      return finishTowardNext();
    }

    await appendCopilotLog(
      `Resumed — retrying apply for "${base.title}"`,
      'success'
    );
    if (
      !(await pacedWait(mode, 'nav', {
        jobTitle: base.title,
        maxMs: APPLY_NAV_SLOW_MAX_MS,
      }))
    ) {
      return 'stop';
    }
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

  return finishTowardNext();
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

export function isBotRunning(): boolean {
  return botRunning;
}

const MAX_SCROLL_ROUNDS = 20;
/** Session ceiling: stop when applied + skipped reaches this. */
const SCAN_BATCH_SIZE = SCAN_MATCH_TARGET;
/**
 * Collect/apply in small chunks toward 30 — never wait to queue all 30
 * before the first Easy Apply (that left jobs Queued when the tab/SW hiccuped).
 */
const APPLY_CHUNK_SIZE = 5;
/** How many Naukri result pages to walk for one title/keyword search (auto — never ask). */
const MAX_SCAN_PAGES = 40;
/** Stop after this many consecutive pages that add zero new matches. */
const MAX_EMPTY_PAGES = 6;
/** Re-walk searches while under 30 — SW death / false EOF used to quit after 1–2. */
const MAX_PLAN_PASSES = 10;

/** Recover work tab if Chrome closed it or SW lost the id mid-run. */
async function ensureLiveWorkTabId(
  tabId: number | undefined,
  searchUrl: string,
  stealth: boolean
): Promise<number> {
  if (tabId != null) {
    try {
      const existing = await chrome.tabs.get(tabId);
      if (existing.id != null) {
        setActiveWorkTabId(existing.id);
        return existing.id;
      }
    } catch {
      /* tab gone */
    }
  }
  const tab = await ensureNaukriWorkTab({
    url: naukriKeywordNavUrl(searchUrl),
    active: !stealth,
  });
  if (!tab.id) {
    throw new Error('Could not open Naukri work tab');
  }
  setActiveWorkTabId(tab.id);
  await appendCopilotLog('Recovered Naukri work tab — continuing toward 30', 'warn');
  return tab.id;
}

async function publishScanWait(matched: number, _target?: number): Promise<void> {
  // Always show progress against the session ceiling (30), not the chunk size.
  const goal = SCAN_BATCH_SIZE;
  const state = await getCopilotState();
  const processed = sessionProcessedCount(state);
  await setCopilotState({
    runPhase: 'scan',
    paceLabel: scanWaitMessage(matched, goal, processed),
    paceRemainingMs: null,
  });
}

const naukriPager = new NaukriAdapter();

/**
 * Advance Naukri search to the next results page.
 * Only bumps the URL when Next was clicked but the SPA did not navigate —
 * never invents pages when Next is missing/disabled (1–2 page result sets).
 */
async function goToNextSearchPage(
  tabId: number
): Promise<{ ok: boolean; reason?: string }> {
  const before = (await chrome.tabs.get(tabId)).url || '';
  let beforeFinger = '';
  try {
    const scrape = await sendToTab<{ jobs?: SearchResultJob[] }>(
      tabId,
      { type: 'RUN_SCAN_SCRAPE' },
      2
    );
    beforeFinger = (scrape.jobs || [])
      .map((j) => j.externalJobId || j.url || j.title)
      .slice(0, 8)
      .join('|');
  } catch {
    /* ignore */
  }

  const clicked = await sendToTab<{ ok: boolean; reason?: string; via?: string }>(
    tabId,
    { type: 'CLICK_NEXT_PAGE' },
    4
  ).catch(() => ({ ok: false, reason: 'Could not open next page' }));

  await waitForTabComplete(tabId).catch(() => undefined);
  await waitForSearchListReady(tabId);
  let after = (await chrome.tabs.get(tabId)).url || '';

  let afterFinger = beforeFinger;
  try {
    const scrape = await sendToTab<{ jobs?: SearchResultJob[] }>(
      tabId,
      { type: 'RUN_SCAN_SCRAPE' },
      2
    );
    afterFinger = (scrape.jobs || [])
      .map((j) => j.externalJobId || j.url || j.title)
      .slice(0, 8)
      .join('|');
  } catch {
    /* ignore */
  }

  // SPA may keep the same URL while replacing cards — treat that as success.
  if (clicked.ok && (after !== before || (beforeFinger && afterFinger && afterFinger !== beforeFinger))) {
    return { ok: true };
  }

  if (!clicked.ok) {
    return {
      ok: false,
      reason: clicked.reason || 'Already on the last page',
    };
  }

  // Click reported ok but SPA didn't move — force URL page bump once.
  const nextUrl = naukriPager.nextSearchPageUrl(after || before);
  if (!nextUrl || nextUrl === after || nextUrl === before) {
    return {
      ok: false,
      reason: clicked.reason || 'Already on the last page',
    };
  }
  await chrome.tabs.update(tabId, { url: nextUrl, active: true });
  await waitForTabComplete(tabId);
  await waitForSearchListReady(tabId);
  after = (await chrome.tabs.get(tabId)).url || '';
  if (after === before) {
    return { ok: false, reason: 'Next page navigation did not stick' };
  }
  return { ok: true };
}

/**
 * Stay logged in during scan/apply. Login flicker must pause + wait —
 * never treat it as end-of-results / abandon the search.
 */
async function ensureLoggedInForSession(tabId: number): Promise<boolean> {
  while (true) {
    if (!(await waitWhilePaused())) return false;
    if (await ensureNaukriLoggedIn(tabId)) return true;
    await appendCopilotLog(
      'Waiting for Naukri login before continuing toward 30…',
      'warn'
    );
    // ensureNaukriLoggedIn left us paused — block until Confirm/Resume/Stop.
    if (!(await waitWhilePaused())) return false;
  }
}

/**
 * Scroll the current search list and collect up to `target` preference matches.
 * Does not apply yet. `listCardsSeen` is cards on this page (0 = empty / past last).
 */
async function collectPreferenceMatches(opts: {
  tabId: number;
  searchUrl: string;
  stealth: boolean;
  prefs: JobPreferences;
  seenKeys: Set<string>;
  scannedKeys: Set<string>;
  logPrefix?: string;
  /** Existing queue to append into (toward `target`). */
  into?: SearchResultJob[];
  /** Max matches to collect for this filter (remaining session cap). */
  target?: number;
}): Promise<{
  batch: SearchResultJob[];
  listCardsSeen: number;
  /** Easy-Apply matches newly queued this call. */
  newQueued: number;
  /** already_applied skips (count toward applied+skipped ceiling). */
  progressed: number;
  /** Pref-matching company-site cards bypassed — keep paging, do NOT count toward ceiling. */
  companySiteBypassed: number;
  /** Pref-matching cards already in seenKeys (keep paging — not EOF). */
  alreadySeenMatches: number;
}> {
  const { tabId, searchUrl, stealth, prefs, seenKeys, scannedKeys } = opts;
  const prefix = opts.logPrefix ?? 'Scan';
  const target = Math.max(1, opts.target ?? SCAN_BATCH_SIZE);
  const batch = opts.into ?? [];
  const batchStart = batch.length;
  let listCardsSeen = 0;
  let progressed = 0;
  let companySiteBypassed = 0;
  let alreadySeenMatches = 0;

  await publishScanWait(batch.length, target);
  const processed = sessionProcessedCount(await getCopilotState());
  await appendCopilotLog(
    `${prefix}: ${scanWaitMessage(batch.length, target, processed)}`,
    'info'
  );

  for (
    let round = 0;
    round < MAX_SCROLL_ROUNDS && batch.length < target;
    round++
  ) {
    if (!(await waitWhilePaused())) break;
    if (!(await ensureLoggedInForSession(tabId))) break;
    if (hasHitProcessCeiling(sessionProcessedCount(await getCopilotState()), SCAN_BATCH_SIZE)) {
      break;
    }

    const tabInfo = await chrome.tabs.get(tabId);
    if (
      !tabInfo.url ||
      !/naukri\.com/i.test(tabInfo.url) ||
      /job-listings/i.test(tabInfo.url)
    ) {
      await goBackToList(tabId, searchUrl, stealth, { maxNavMs: 0 });
      if (!(await ensureLoggedInForSession(tabId))) break;
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
      // No settle delay while scanning — scrape immediately after scroll.
    }

    const allJobs = await scrapeSearchListWithConfirm(tabId);
    listCardsSeen = Math.max(listCardsSeen, allJobs.length);

    // Empty listing after confirm = real end of results (or invented page).
    // Do not scroll 20 rounds or keep paging toward MAX_EMPTY_PAGES.
    if (allJobs.length === 0) {
      await appendCopilotLog(
        `${prefix}: no job cards on this page — end of results`,
        'warn'
      );
      break;
    }

    const scannedTotal = await noteJobsScanned(allJobs, scannedKeys);

    const visible = allJobs.filter((job) => matchesListCandidate(job, prefs));

    const appliedSet = await fetchAppliedSet(visible);
    let addedThisRound = 0;
    let progressedThisRound = 0;
    let companySiteThisRound = 0;

    for (const job of visible) {
      if (batch.length >= target) break;
      if (hasHitProcessCeiling(sessionProcessedCount(await getCopilotState()), SCAN_BATCH_SIZE)) {
        break;
      }
      const id = jobKey(job);
      if (seenKeys.has(id)) {
        alreadySeenMatches += 1;
        continue;
      }
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
        progressed += 1;
        progressedThisRound += 1;
        await appendCopilotLog(
          `Already applied (Cosmo) — skipped: ${job.title}`,
          'info'
        );
        continue;
      }

      // Company-site / external apply: never open or click — and do NOT burn
      // the applied+skipped ceiling (Cosmo cannot Easy Apply these).
      if (job.companySiteApply) {
        companySiteBypassed += 1;
        companySiteThisRound += 1;
        await appendCopilotLog(
          `Company site — bypassed (no Easy Apply, not counted): ${job.title}`,
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
      await publishScanWait(batch.length, target);
    }

    await appendCopilotLog(
      `${prefix} round ${round + 1}: scanned ${scannedTotal} · +${addedThisRound} match → ${batch.length}/${target}` +
        (progressedThisRound ? ` · ${progressedThisRound} already-applied toward ceiling` : '') +
        (companySiteThisRound
          ? ` · ${companySiteThisRound} company-site bypassed`
          : ''),
      addedThisRound || progressedThisRound || companySiteThisRound
        ? 'success'
        : 'warn'
    );

    if (batch.length >= target) break;
    if (hasHitProcessCeiling(sessionProcessedCount(await getCopilotState()), SCAN_BATCH_SIZE)) {
      break;
    }
    if (
      round > 0 &&
      addedThisRound === 0 &&
      progressedThisRound === 0 &&
      companySiteThisRound === 0
    ) {
      await appendCopilotLog(
        `${prefix}: no more new matching jobs on this page`,
        'info'
      );
      break;
    }
  }

  return {
    batch,
    listCardsSeen,
    newQueued: batch.length - batchStart,
    progressed,
    companySiteBypassed,
    alreadySeenMatches,
  };
}

/** Apply collected matches one by one (short settle — not full humanPace).
 * Always drains the queued batch before returning (product invariant).
 * Soft ceiling stops *new* searches later — never leave jobs as Queued
 * unless the user truly Stop'd or we are paused for login.
 */
async function applyCollectedJobs(opts: {
  tabId: number;
  jobs: SearchResultJob[];
  prefs: JobPreferences;
  handlers: BotHandlers;
  searchUrl: string;
  /** Filtered/paged list URL to restore after the chunk (not keyword-only). */
  listUrl?: string;
  stealth: boolean;
}): Promise<'ok' | 'stop' | 'limit' | 'waiting'> {
  const { tabId, jobs, prefs, handlers, searchUrl, stealth } = opts;
  const listUrl = opts.listUrl || searchUrl;
  const back = { maxNavMs: 800, listUrl } as const;
  if (jobs.length === 0) {
    await appendCopilotLog('Apply skipped — no matched jobs in queue', 'warn');
    return 'waiting';
  }

  // Login flicker / false CHECK_LOGIN must not kill the batch.
  let state = await getCopilotState();
  if (!state.running) {
    await setCopilotState({ running: true, paused: false });
  }
  if (!(await ensureLoggedInForSession(tabId))) {
    await appendCopilotLog(
      'Paused for Naukri login — matched jobs stay Queued until you Confirm.',
      'warn'
    );
    return 'waiting';
  }

  await appendCopilotLog(
    `Applying ${jobs.length} matched job(s)…`,
    'success'
  );
  await setCopilotState({
    runPhase: 'apply',
    paceLabel: `Applying 1/${jobs.length}`,
    paceRemainingMs: null,
  });

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    state = await getCopilotState();
    const existing = state.scannedJobs.find((j) => j.id === jobKey(job));
    if (
      existing &&
      (existing.status === 'applied' ||
        existing.status === 'already_applied' ||
        existing.status === 'skipped')
    ) {
      continue;
    }
    if (!state.running) {
      // User pressed Stop — leave remaining Queued (pending), don't fake-skip.
      await appendCopilotLog(
        `Stop pressed — ${jobs.length - i} job(s) left Queued`,
        'warn'
      );
      await goBackToList(tabId, searchUrl, stealth, back);
      return 'stop';
    }
    if (state.paused) {
      if (!(await waitWhilePaused())) {
        await goBackToList(tabId, searchUrl, stealth, back);
        return 'stop';
      }
    }
    if (!(await ensureLoggedInForSession(tabId))) {
      await appendCopilotLog(
        `Paused for login — ${jobs.length - i} job(s) stay Queued`,
        'warn'
      );
      await goBackToList(tabId, searchUrl, stealth, back);
      return 'waiting';
    }
    await setCopilotState({
      runPhase: 'apply',
      paceLabel: `Applying ${i + 1}/${jobs.length}`,
      paceRemainingMs: null,
      currentTitle: job.title,
    });
    await appendCopilotLog(
      `Apply ${i + 1}/${jobs.length}: ${job.title}`,
      'info'
    );
    const outcome = await applyOneJob(
      tabId,
      job,
      prefs,
      handlers,
      listUrl,
      stealth,
      { returnToList: false }
    );
    if (outcome === 'limit') {
      await markRemainingQueuedSkipped(jobs, i + 1, 'Apply limit reached');
      await goBackToList(tabId, searchUrl, stealth, back);
      return 'limit';
    }
    if (outcome === 'stop') {
      const still = await getCopilotState();
      if (!still.running) {
        await goBackToList(tabId, searchUrl, stealth, back);
        return 'stop';
      }
      // Login pause / soft interrupt — keep this job + rest Queued for retry.
      await updateScannedJob(jobKey(job), { status: 'pending' });
      await appendCopilotLog(
        'Apply interrupted — keeping jobs Queued until login/resume',
        'warn'
      );
      await goBackToList(tabId, searchUrl, stealth, back);
      return 'waiting';
    }
  }
  await goBackToList(tabId, searchUrl, stealth, back);
  return 'ok';
}

/** Clear leftover Queued rows so the panel never ends mid-batch on "Queued". */
async function markRemainingQueuedSkipped(
  jobs: SearchResultJob[],
  fromIndex: number,
  reason: string
): Promise<void> {
  for (let i = fromIndex; i < jobs.length; i++) {
    const job = jobs[i]!;
    const id = jobKey(job);
    if (!id) continue;
    await updateScannedJob(id, { status: 'skipped', skipReason: reason });
  }
}

/** Never end a session while matched jobs are still Queued/Applying. */
async function drainRemainingQueuedJobs(opts: {
  tabId: number;
  prefs: JobPreferences;
  handlers: BotHandlers;
  searchUrl: string;
  stealth: boolean;
}): Promise<void> {
  const state = await getCopilotState();
  const pending = state.scannedJobs.filter(
    (j) => j.status === 'pending' || j.status === 'applying'
  );
  if (!pending.length) return;

  await appendCopilotLog(
    `Draining ${pending.length} Queued job(s) before ending session…`,
    'warn'
  );
  // Keep session alive for the drain pass.
  if (!state.running) {
    await setCopilotState({ running: true, paused: false });
  }

  const jobs: SearchResultJob[] = pending.map((j) => ({
    title: j.title,
    company: j.company,
    url: j.url,
    externalJobId: j.externalJobId || j.id,
  }));

  let outcome = await applyCollectedJobs({
    tabId: opts.tabId,
    jobs,
    prefs: opts.prefs,
    handlers: opts.handlers,
    searchUrl: opts.searchUrl,
    listUrl: opts.searchUrl,
    stealth: opts.stealth,
  });

  while (outcome === 'waiting') {
    if (!(await waitWhilePaused())) break;
    if (!(await ensureLoggedInForSession(opts.tabId))) continue;
    outcome = await applyCollectedJobs({
      tabId: opts.tabId,
      jobs,
      prefs: opts.prefs,
      handlers: opts.handlers,
      searchUrl: opts.searchUrl,
      listUrl: opts.searchUrl,
      stealth: opts.stealth,
    });
  }

  // Absolute last resort — never leave the panel on Queued.
  const leftover = (await getCopilotState()).scannedJobs.filter(
    (j) => j.status === 'pending' || j.status === 'applying'
  );
  for (const j of leftover) {
    await updateScannedJob(j.id, {
      status: 'skipped',
      skipReason: 'Session ended before apply finished',
    });
  }
}

/**
 * Scan this search (auto next-page) until we have `target` queued matches
 * or pages run out. Never asks Next. Never starts apply.
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
  target?: number;
}): Promise<{
  jobs: SearchResultJob[];
  listUrl: string;
  /** True only when this search has no more pages/matches to mine. */
  exhausted: boolean;
}> {
  const batch = [...(opts.pending ?? [])];
  const prefix = opts.logPrefix ?? 'Scan';
  const target = Math.max(1, opts.target ?? SCAN_BATCH_SIZE);
  let emptyPages = 0;
  let listUrl = opts.searchUrl;
  let recoveredEmptyFirstPage = false;
  let exhausted = false;
  let stoppedForTargetOrCeiling = false;

  // Resume on the live SRP when possible (keeps filters + page).
  try {
    const cur = (await chrome.tabs.get(opts.tabId)).url || '';
    if (isNaukriSearchListUrl(cur)) {
      listUrl = cur;
    } else if (isNaukriSearchListUrl(opts.searchUrl)) {
      await goBackToList(opts.tabId, opts.searchUrl, opts.stealth, {
        listUrl: opts.searchUrl,
        maxNavMs: 400,
      });
      listUrl = (await chrome.tabs.get(opts.tabId)).url || opts.searchUrl;
    }
  } catch {
    /* tab may be mid-nav */
  }

  for (
    let page = 0;
    page < MAX_SCAN_PAGES && batch.length < target;
    page++
  ) {
    // already_applied during scan counts as skipped toward the ceiling
    if (hasHitProcessCeiling(sessionProcessedCount(await getCopilotState()), SCAN_BATCH_SIZE)) {
      stoppedForTargetOrCeiling = true;
      break;
    }
    if (!(await waitWhilePaused())) break;
    if (!(await ensureLoggedInForSession(opts.tabId))) break;

    if (page > 0) {
      const processed = sessionProcessedCount(await getCopilotState());
      await publishScanWait(batch.length, target);
      await appendCopilotLog(
        `${prefix}: ${scanWaitMessage(batch.length, target, processed)} Auto next page…`,
        'info'
      );
      const next = await goToNextSearchPage(opts.tabId);
      if (!next.ok) {
        await appendCopilotLog(
          next.reason || `No more pages — still at ${batch.length}/${target} queued`,
          'warn'
        );
        exhausted = true;
        break;
      }
      listUrl = (await chrome.tabs.get(opts.tabId)).url || listUrl;
    }

    const before = batch.length;
    let {
      listCardsSeen,
      newQueued,
      progressed,
      companySiteBypassed,
      alreadySeenMatches,
    } = await collectPreferenceMatches({
      tabId: opts.tabId,
      searchUrl: listUrl,
      stealth: opts.stealth,
      prefs: opts.prefs,
      seenKeys: opts.seenKeys,
      scannedKeys: opts.scannedKeys,
      into: batch,
      target,
      logPrefix: `${prefix} p${page + 1}`,
    });
    await notePageScanned();
    await reportScanSession('running');
    {
      const cur = (await chrome.tabs.get(opts.tabId)).url || '';
      if (isNaukriSearchListUrl(cur)) listUrl = cur;
    }

    // First page empty is often a false EOF (SPA not settled after nav/filters).
    // Reload keyword URL once and re-scrape before abandoning this search.
    if (
      listCardsSeen === 0 &&
      page === 0 &&
      batch.length === before &&
      !recoveredEmptyFirstPage
    ) {
      recoveredEmptyFirstPage = true;
      const navUrl = isNaukriSearchListUrl(opts.searchUrl)
        ? opts.searchUrl
        : naukriKeywordNavUrl(opts.searchUrl);
      await appendCopilotLog(
        `${prefix}: first page looked empty — reloading search once and retrying…`,
        'warn'
      );
      await chrome.tabs.update(opts.tabId, {
        url: navUrl,
        active: !opts.stealth,
      });
      await waitForTabComplete(opts.tabId);
      await waitForSearchListReady(opts.tabId, 6000);
      if (!(await ensureLoggedInForSession(opts.tabId))) break;
      listUrl = (await chrome.tabs.get(opts.tabId)).url || navUrl;
      const retry = await collectPreferenceMatches({
        tabId: opts.tabId,
        searchUrl: listUrl,
        stealth: opts.stealth,
        prefs: opts.prefs,
        seenKeys: opts.seenKeys,
        scannedKeys: opts.scannedKeys,
        into: batch,
        target,
        logPrefix: `${prefix} p1-retry`,
      });
      listCardsSeen = retry.listCardsSeen;
      newQueued = retry.newQueued;
      progressed = retry.progressed;
      companySiteBypassed = retry.companySiteBypassed;
      alreadySeenMatches = retry.alreadySeenMatches;
      await notePageScanned();
    }

    if (batch.length >= target) {
      stoppedForTargetOrCeiling = true;
      break;
    }
    if (hasHitProcessCeiling(sessionProcessedCount(await getCopilotState()), SCAN_BATCH_SIZE)) {
      stoppedForTargetOrCeiling = true;
      break;
    }

    if (listCardsSeen === 0) {
      await appendCopilotLog(
        page === 0
          ? `${prefix}: empty search results — no pages to scan`
          : `${prefix}: no jobs after page advance — treating as last page (${batch.length}/${target} queued)`,
        'warn'
      );
      exhausted = true;
      break;
    }

    // Queued / already-applied / company-site-bypass reset the empty streak.
    // Company-site does NOT count toward the applied+skipped ceiling.
    // Already-seen match pages must keep paging — not count as EOF.
    if (newQueued > 0 || progressed > 0 || companySiteBypassed > 0) {
      emptyPages = 0;
    } else if (alreadySeenMatches > 0) {
      await appendCopilotLog(
        `${prefix}: page already scanned — continuing to next page toward 30`,
        'info'
      );
    } else {
      emptyPages += 1;
      await appendCopilotLog(
        `${prefix}: page added 0 new matches (${emptyPages}/${MAX_EMPTY_PAGES} empty)`,
        'warn'
      );
      if (emptyPages >= MAX_EMPTY_PAGES) {
        await appendCopilotLog(
          `${prefix}: stopping scan after ${MAX_EMPTY_PAGES} empty pages — ${batch.length}/${target} queued`,
          'warn'
        );
        exhausted = true;
        break;
      }
    }
  }

  if (!stoppedForTargetOrCeiling && batch.length < target) {
    exhausted = true;
  }

  const ready = batch.slice(0, target);
  const scannedTotal = (await getCopilotState()).scanned;
  if (ready.length >= target) {
    await appendCopilotLog(
      `Scan ready — scanned ${scannedTotal}, queued ${ready.length}. Starting applies…`,
      'success'
    );
  } else if (ready.length > 0) {
    await appendCopilotLog(
      `Scan exhausted at ${ready.length} queued (scanned ${scannedTotal}) — applying what was found.`,
      'warn'
    );
  } else {
    await appendCopilotLog(
      `No preference matches after scanning ${scannedTotal} jobs — nothing to apply on this search.`,
      'warn'
    );
  }
  return { jobs: ready, listUrl, exhausted };
}

export async function stopBot(): Promise<void> {
  setActiveWorkTabId(null);
  await stopCopilotKeepAlive();
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
    runPhase: 'idle',
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

export async function runBot(
  handlers: BotHandlers,
  opts?: { resume?: boolean }
): Promise<{
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
  await startCopilotKeepAlive();

  try {
    // Prefer DB, then the dashboard-pushed / last-good cache.
    const prefs: JobPreferences = await loadPreferences();

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
    const resume =
      Boolean(opts?.resume) &&
      existing.running &&
      !existing.sessionComplete &&
      !hasHitProcessCeiling(sessionProcessedCount(existing), SCAN_BATCH_SIZE);

    if (resume) {
      await setCopilotState({
        running: true,
        paused: false,
        sessionComplete: null,
        runPhase: 'scan',
        paceLabel: null,
        paceRemainingMs: null,
      });
      await appendCopilotLog(
        `Resuming co-pilot after background wake — ${sessionProcessedCount(existing)}/${SCAN_BATCH_SIZE} processed so far`,
        'warn'
      );
    } else {
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
        runPhase: 'scan',
        paceLabel: null,
        paceRemainingMs: null,
        runInBackground: existing.runInBackground,
      });
      await beginScanSession();
    }
    const stealth = (await getCopilotState()).runInBackground;
    if (!resume) {
      await appendCopilotLog(
        stealth
          ? 'Stealth ON (background tabs) — higher account risk'
          : 'Assisted mode (foreground)'
      );
      await appendCopilotLog(
        `Co-pilot session started — searching for "${keyword}"`,
        'success'
      );
    }
    await broadcastCopilotToNaukriTabs({ type: 'COPILOT_EXPAND' });

    const searchPlan = buildNaukriSearchQueryPlan(prefs);
    const firstQuery = searchPlan[0]!;
    let searchUrl = firstQuery.url;
    installTabSpamGuard();
    let workTabId = await ensureLiveWorkTabId(
      undefined,
      searchUrl,
      stealth
    );

    await waitForTabComplete(workTabId);
    await waitForSearchListReady(workTabId);

    if (await checkBlockOnTab(workTabId)) {
      return { ok: false, message: 'Naukri block detected.' };
    }

    if (!(await waitWhilePaused())) {
      return { ok: true, message: 'Stopped.' };
    }
    if (!(await ensureLoggedInForSession(workTabId))) {
      await appendCopilotLog(
        'Still not logged into Naukri — paused. Confirm login to continue.',
        'error'
      );
      // Keep running=true so keep-alive / resume can continue after Confirm.
      await setCopilotState({ paused: true, needsLogin: true });
      return { ok: false, message: 'Naukri login required.' };
    }

    await closeExtraNaukriTabs(workTabId);

    const seenKeys = new Set<string>();
    // On resume, don't re-queue jobs already in this session.
    if (resume) {
      for (const j of (await getCopilotState()).scannedJobs) {
        if (j.id) seenKeys.add(j.id);
      }
    }
    const scannedKeys = new Set<string>();
    let hitLimit = false;
    let anyMatched = resume
      ? sessionProcessedCount(await getCopilotState()) > 0 ||
        (await getCopilotState()).matched > 0
      : false;
    let queriesTried = 0;

    // Continuous: filters once → scan pages → apply → repeat until
    // applied + skipped >= 30 (or searches/pages are truly exhausted).
    await publishScanWait(0);
    if (!resume) {
      await appendCopilotLog(
        scanWaitMessage(0, SCAN_BATCH_SIZE, 0),
        'info'
      );
      await appendCopilotLog(
        `Filters once per search, then scan → apply continuously until ${SCAN_BATCH_SIZE} applied+skipped.`,
        'info'
      );
    }

    outer: for (let pass = 0; pass < MAX_PLAN_PASSES; pass++) {
      if (pass > 0) {
        const mid = sessionProcessedCount(await getCopilotState());
        if (hasHitProcessCeiling(mid, SCAN_BATCH_SIZE)) break;
        await appendCopilotLog(
          `Still at ${mid}/${SCAN_BATCH_SIZE} — another pass over searches (${pass + 1}/${MAX_PLAN_PASSES})…`,
          'warn'
        );
      }

      for (let qi = 0; qi < searchPlan.length; qi++) {
        let processed = sessionProcessedCount(await getCopilotState());
        if (hasHitProcessCeiling(processed, SCAN_BATCH_SIZE)) {
          await appendCopilotLog(
            `Reached ${processed} applied+skipped — done.`,
            'success'
          );
          break outer;
        }

        const query = searchPlan[qi]!;
        searchUrl = query.url;
        queriesTried += 1;
        const remaining = remainingProcessSlots(processed, SCAN_BATCH_SIZE);
        await setCopilotState({ keyword: query.keyword });
        await publishScanWait(0, remaining);
        await appendCopilotLog(
          `Search ${qi + 1}/${searchPlan.length} [${query.kind}]: "${query.keyword}"${
            query.location ? ` in ${query.location}` : ' (India-wide)'
          } — filters once, then scan → apply (${processed}/${SCAN_BATCH_SIZE} processed)`,
          'success'
        );

        workTabId = await ensureLiveWorkTabId(workTabId, searchUrl, stealth);
        const navUrl = naukriKeywordNavUrl(searchUrl);
        // Always open this plan query — skipping nav when path matched left us
        // stuck on one filtered SRP and quit under 30 with scanned frozen.
        await chrome.tabs.update(workTabId, { url: navUrl, active: !stealth });
        await waitForTabComplete(workTabId);
        await waitForSearchListReady(workTabId, 6000);
        if (!(await ensureLoggedInForSession(workTabId))) {
          await appendCopilotLog(
            'Naukri login check failed — trying next search…',
            'warn'
          );
          continue;
        }

        // Filters once per search via All Filters UI — no second reload.
        if (
          !(await applyNaukriPreferenceFilters(workTabId, prefs, stealth, searchUrl, {
            forceNavigate: false,
            focusLocation: query.location || null,
          }))
        ) {
          await appendCopilotLog(
            `Could not apply Naukri filters for "${query.keyword}" — trying next search…`,
            'warn'
          );
          continue;
        }

        // Capture the filtered SRP URL — goBackToList must restore this, not keyword-only.
        let activeListUrl =
          (await chrome.tabs.get(workTabId)).url || searchUrl;
        if (!isNaukriSearchListUrl(activeListUrl)) {
          activeListUrl = searchUrl;
        }

        // Chunked scan→apply on this search until ceiling or no more matches.
        let searchExhausted = false;
        while (!searchExhausted) {
          processed = sessionProcessedCount(await getCopilotState());
          if (hasHitProcessCeiling(processed, SCAN_BATCH_SIZE)) {
            await appendCopilotLog(
              `Reached ${processed} applied+skipped — done.`,
              'success'
            );
            break outer;
          }
          const slotsLeft = remainingProcessSlots(processed, SCAN_BATCH_SIZE);
          const chunkTarget = Math.min(APPLY_CHUNK_SIZE, Math.max(1, slotsLeft));

          workTabId = await ensureLiveWorkTabId(workTabId, activeListUrl, stealth);
          const collected = await collectUntilMatchedBatch({
            tabId: workTabId,
            searchUrl: activeListUrl,
            stealth,
            prefs,
            seenKeys,
            scannedKeys,
            pending: [],
            target: chunkTarget,
            logPrefix: `Scan “${query.keyword}”`,
          });
          const filterBatch = collected.jobs;
          if (isNaukriSearchListUrl(collected.listUrl)) {
            activeListUrl = collected.listUrl;
          }

          // Phase 2: always apply what we queued before ending or switching
          if (mustApplyQueuedBeforeContinue(filterBatch.length)) {
            anyMatched = true;
            workTabId = await ensureLiveWorkTabId(workTabId, activeListUrl, stealth);
            let applyOutcome = await applyCollectedJobs({
              tabId: workTabId,
              jobs: filterBatch,
              prefs,
              handlers,
              searchUrl: activeListUrl,
              listUrl: activeListUrl,
              stealth,
            });

            while (applyOutcome === 'waiting') {
              await appendCopilotLog(
                'Paused for Naukri login — Confirm/Resume to keep applying toward 30…',
                'warn'
              );
              if (!(await waitWhilePaused())) {
                hitLimit = true;
                break outer;
              }
              workTabId = await ensureLiveWorkTabId(workTabId, activeListUrl, stealth);
              if (!(await ensureLoggedInForSession(workTabId))) {
                continue;
              }
              applyOutcome = await applyCollectedJobs({
                tabId: workTabId,
                jobs: filterBatch,
                prefs,
                handlers,
                searchUrl: activeListUrl,
                listUrl: activeListUrl,
                stealth,
              });
            }

            if (applyOutcome === 'limit') {
              hitLimit = true;
              break outer;
            }
            if (applyOutcome === 'stop') {
              const st = await getCopilotState();
              if (!st.running) {
                hitLimit = true;
                break outer;
              }
              await appendCopilotLog(
                'Apply interrupted — continuing toward 30 applied+skipped…',
                'warn'
              );
            }

            processed = sessionProcessedCount(await getCopilotState());
            await appendCopilotLog(
              `${processed}/${SCAN_BATCH_SIZE} processed — continuing…`,
              'info'
            );
            // Only leave this search when collect truly exhausted pages —
            // never because a chunk was smaller than APPLY_CHUNK_SIZE after
            // goBackToList dropped filters (that was the early-stop bug).
            if (collected.exhausted) {
              searchExhausted = true;
            }
          } else {
            await appendCopilotLog(
              `No new matches for "${query.keyword}"${
                query.location ? ` / ${query.location}` : ''
              } — next search…`,
              'warn'
            );
            searchExhausted = true;
          }
        }
      }
    }

    // Product invariant: never show Apply more / Close with jobs still Queued.
    try {
      workTabId = await ensureLiveWorkTabId(workTabId, searchUrl, stealth);
      await drainRemainingQueuedJobs({
        tabId: workTabId,
        prefs,
        handlers,
        searchUrl,
        stealth,
      });
    } catch (drainErr) {
      await appendCopilotLog(
        `Drain queued failed: ${
          drainErr instanceof Error ? drainErr.message : String(drainErr)
        }`,
        'warn'
      );
    }

    const finalState = await getCopilotState();
    const appliedAny = finalState.applied > 0;
    const processedFinal = sessionProcessedCount(finalState);
    const hitCeiling = hasHitProcessCeiling(processedFinal, SCAN_BATCH_SIZE);
    await appendCopilotLog(
      `Done — scanned ${finalState.scanned}, matched ${finalState.matched}, applied ${finalState.applied}, skipped ${finalState.skipped} (${processedFinal} processed)`,
      'success'
    );

    if (!anyMatched && !appliedAny) {
      await raiseCopilotToast(
        'No matches found',
        `Tried ${queriesTried} title/location search(es). Broaden prefs and Start again.`
      );
    } else {
      await raiseCopilotToast(
        hitCeiling
          ? 'Reached 30 applied+skipped'
          : appliedAny
            ? `Applied ${finalState.applied} job(s)`
            : 'Session finished',
        hitCeiling
          ? `Applied ${finalState.applied}, skipped ${finalState.skipped}. Review them on your Cosmo dashboard.`
          : `Processed ${processedFinal}/${SCAN_BATCH_SIZE} across ${queriesTried} search(es) — broaden prefs or press Apply more to keep going.`
      );
    }

    if (!hitLimit || appliedAny || finalState.matched > 0 || anyMatched) {
      await setCopilotState({
        running: false,
        paused: false,
        currentTitle: '',
        paceLabel: null,
        paceRemainingMs: null,
        runPhase: 'idle',
        sessionComplete: {
          applied: finalState.applied,
          matched: finalState.matched,
          skipped: finalState.skipped,
          at: new Date().toISOString(),
          // Only true when we actually hit the 30 ceiling — never for partial runs.
          allApplied: hitCeiling,
        },
      });
    } else {
      await setCopilotState({
        running: false,
        paused: false,
        currentTitle: '',
        sessionComplete: null,
        runPhase: 'idle',
        paceLabel: null,
        paceRemainingMs: null,
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
    await setCopilotState({
      running: false,
      paused: false,
      runPhase: 'idle',
      paceLabel: null,
      paceRemainingMs: null,
    });
    return { ok: false, message: 'Co-pilot failed.' };
  } finally {
    // Early returns (login fail, stop mid-run, etc.) never hit the summary
    // block — still flush whatever counters we gathered.
    const leftover = await getCopilotState();
    if (leftover.sessionId) {
      await reportScanSession('stopped');
    }
    botRunning = false;
    // Login pause / SW death leave running=true — keep the alarm so Confirm
    // or the next wake can resume toward 30. Clear only when truly done.
    if (!leftover.running || leftover.sessionComplete) {
      await stopCopilotKeepAlive();
    }
  }
}

/** User chose Close after session complete — dashboard opens in background. */
export async function closeSessionComplete(): Promise<void> {
  await setCopilotState({
    sessionComplete: null,
    running: false,
    paused: false,
    currentTitle: '',
    paceLabel: null,
    paceRemainingMs: null,
    runPhase: 'idle',
  });
  await appendCopilotLog(
    'Session closed — opening Cosmo dashboard.',
    'success'
  );
}

/** User chose Apply more — clear the done prompt so a new session can start. */
export async function continueSessionForMoreApplies(): Promise<void> {
  await setCopilotState({
    sessionComplete: null,
    running: false,
    paused: false,
    currentTitle: '',
    paceLabel: null,
    paceRemainingMs: null,
    runPhase: 'idle',
  });
  await appendCopilotLog(
    'Apply more — start another co-pilot session when ready.',
    'info'
  );
}
