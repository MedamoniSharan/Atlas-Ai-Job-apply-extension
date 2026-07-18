import type { JobPayload, JobPreferences } from '@atlas/shared';
import {
  SearchResultJob,
  buildNaukriSearchUrl,
  matchesPreferences,
} from '../adapters/naukriAdapter';
import { fetchPreferences } from './apiClient';
import { getCachedPreferences } from './storageManager';
import { logger } from './logger';
import { enqueueApplyJobs } from './applyQueue';
import { mergeJobFields } from './jobFields';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId: number, timeoutMs = 25000) {
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
  attempts = 8
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

export type ScanResult = {
  ok: boolean;
  message: string;
  matched: number;
  queuedForApply: number;
  loggedIn?: boolean;
  tabId?: number;
};

export async function runScan(options: {
  persistAndSync: (
    type: 'JobDetected',
    payload: Record<string, unknown>
  ) => Promise<void>;
}): Promise<ScanResult> {
  const prefsRes = await fetchPreferences();
  const prefs: JobPreferences = prefsRes.success
    ? prefsRes.data
    : await getCachedPreferences();

  if (!prefs.titles.length && !prefs.keywords.length) {
    return {
      ok: false,
      message: 'Add titles or keywords in preferences first.',
      matched: 0,
      queuedForApply: 0,
    };
  }

  if (!prefs.autoScanEnabled) {
    return {
      ok: false,
      message: 'Auto-scan is disabled in preferences.',
      matched: 0,
      queuedForApply: 0,
    };
  }

  const searchUrl = buildNaukriSearchUrl(prefs);
  logger.info('Starting Naukri scan', { searchUrl });

  const tab = await chrome.tabs.create({ url: searchUrl, active: true });
  if (!tab.id) {
    return {
      ok: false,
      message: 'Could not open Naukri tab.',
      matched: 0,
      queuedForApply: 0,
    };
  }

  await waitForTabComplete(tab.id);
  await wait(2500);

  const login = await sendToTab<{ loggedIn: boolean }>(tab.id, {
    type: 'CHECK_LOGIN',
  });
  if (!login.loggedIn) {
    return {
      ok: false,
      message: 'Log into Naukri in this browser, then Scan again.',
      matched: 0,
      queuedForApply: 0,
      loggedIn: false,
      tabId: tab.id,
    };
  }

  const scrape = await sendToTab<{ jobs: SearchResultJob[] }>(tab.id, {
    type: 'RUN_SCAN_SCRAPE',
  });

  const matched = (scrape.jobs ?? []).filter(
    (job) => !job.companySiteApply && matchesPreferences(job, prefs)
  );

  for (const job of matched) {
    const payload = mergeJobFields(undefined, job, {
      status: 'detected',
      metadata: { source: 'auto_scan' },
    });
    await options.persistAndSync(
      'JobDetected',
      payload as unknown as Record<string, unknown>
    );
  }

  let queuedForApply = 0;
  if (prefs.autoApplyEnabled && matched.length > 0) {
    queuedForApply = await enqueueApplyJobs(
      matched.map((j) => ({
        url: j.url,
        title: j.title,
        company: j.company,
        externalJobId: j.externalJobId,
        location: j.location,
        companyLogo: j.companyLogo,
        description: j.description,
        experience: j.experienceText,
        salary: j.salaryText,
        skills: j.skills,
        rating: j.rating,
        reviews: j.reviews,
        postedAt: j.postedAt,
      }))
    );
  }

  return {
    ok: true,
    message: `Matched ${matched.length} jobs${
      queuedForApply ? `, queued ${queuedForApply} to apply` : ''
    }.`,
    matched: matched.length,
    queuedForApply,
    loggedIn: true,
    tabId: tab.id,
  };
}
