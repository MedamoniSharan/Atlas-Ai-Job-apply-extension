import type { JobPayload, JobPreferences } from '@atlas/shared';
import {
  SearchResultJob,
  buildNaukriSearchUrl,
  matchesPreferences,
} from '../adapters/naukriAdapter';
import { fetchPreferences } from './apiClient';
import { getCachedPreferences } from './storageManager';
import { logger } from './logger';
import {
  appendCopilotLog,
  getCopilotState,
  setCopilotState,
} from './copilotState';
import { mergeJobFields } from './jobFields';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return 2500 + Math.floor(Math.random() * 4000);
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
        await appendCopilotLog(
          'Apply success detected after your answers — continuing',
          'success'
        );
        return 'applied';
      }
      if (status.needsQuestions === false) {
        await setCopilotState({ paused: false, needsLogin: false });
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


export type BotHandlers = {
  persistJobDetected: (payload: JobPayload) => Promise<void>;
  persistApplicationRecorded: (payload: JobPayload) => Promise<void>;
};

let botRunning = false;

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

    // Must be logged into Naukri before scanning/applying.
    if (!(await ensureNaukriLoggedIn(tab.id))) {
      return { ok: false, message: 'Not logged into Naukri.' };
    }

    await appendCopilotLog('Scanning jobs');
    const scrape = await sendToTab<{ jobs: SearchResultJob[] }>(tab.id, {
      type: 'RUN_SCAN_SCRAPE',
    });
    const matched = (scrape.jobs ?? []).filter(
      (job) => !job.companySiteApply && matchesPreferences(job, prefs)
    );
    await setCopilotState({ matched: matched.length });
    await appendCopilotLog(
      `Found ${matched.length} matching job(s)`,
      matched.length ? 'success' : 'warn'
    );

    for (const job of matched) {
      if (!(await waitWhilePaused())) break;

      const detectPayload = mergeJobFields(undefined, job, {
        status: 'detected',
        metadata: { source: 'auto_scan' },
      });
      await handlers.persistJobDetected(detectPayload);

      await setCopilotState({ currentTitle: job.title });
      await appendCopilotLog(`Opening: ${job.title}`);

      const state = await getCopilotState();
      await chrome.tabs.update(tab.id, {
        url: job.url,
        active: !state.runInBackground,
      });
      await waitForTabComplete(tab.id);
      await wait(2000);

      if (!(await waitWhilePaused())) break;

      if (!(await ensureNaukriLoggedIn(tab.id))) break;

      if (!prefs.autoApplyEnabled) {
        await appendCopilotLog(
          `Matched (apply off): ${job.title}`,
          'info'
        );
        continue;
      }

      const dayOk = await canApplyToday(prefs.dailyApplyLimit);
      if (!dayOk) {
        await appendCopilotLog(
          `Daily apply limit reached (${prefs.dailyApplyLimit}/day). Raise the limit in the Atlas popup or try again tomorrow.`,
          'warn'
        );
        break;
      }

      if (!(await ensureNaukriLoggedIn(tab.id))) break;

      const result = await sendToTab<{
        ok: boolean;
        skipped?: boolean;
        needsUserInput?: boolean;
        reason?: string;
        job?: Partial<JobPayload>;
      }>(tab.id, { type: 'RUN_EASY_APPLY' });

      const base = mergeJobFields(result.job, job, {
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

        const pauseOutcome = await waitWhilePausedForQuestions(tab.id);
        if (pauseOutcome === 'stopped') break;

        if (pauseOutcome === 'applied') {
          await handlers.persistApplicationRecorded({
            ...base,
            status: 'applied',
            appliedAt: new Date().toISOString(),
            metadata: { source: 'auto_apply' },
          });
          await incrementAppliedToday();
          const st = await getCopilotState();
          await setCopilotState({ applied: st.applied + 1 });
          await appendCopilotLog(`Applied: ${base.title}`, 'success');
          await wait(randomDelay());
          continue;
        }

        await appendCopilotLog(
          `Resumed — retrying apply for "${base.title}"`,
          'success'
        );
        await wait(1500);

        if (!(await ensureNaukriLoggedIn(tab.id))) break;

        const retry = await sendToTab<{
          ok: boolean;
          skipped?: boolean;
          needsUserInput?: boolean;
          reason?: string;
          job?: Partial<JobPayload>;
        }>(tab.id, { type: 'RUN_EASY_APPLY' });

        if (retry.ok) {
          await handlers.persistApplicationRecorded({
            ...base,
            title: retry.job?.title || base.title,
            company: retry.job?.company || base.company,
            status: 'applied',
            appliedAt: new Date().toISOString(),
            metadata: { source: 'auto_apply' },
          });
          await incrementAppliedToday();
          const st = await getCopilotState();
          await setCopilotState({ applied: st.applied + 1 });
          await appendCopilotLog(`Applied: ${base.title}`, 'success');
        } else if (retry.needsUserInput) {
          await setCopilotState({ paused: true });
          await appendCopilotLog(
            'Still waiting on Naukri questions. Finish them — Atlas will continue when saved, or press Resume.',
            'warn'
          );
          const pause2 = await waitWhilePausedForQuestions(tab.id);
          if (pause2 === 'stopped') break;

          if (pause2 === 'applied') {
            await handlers.persistApplicationRecorded({
              ...base,
              status: 'applied',
              appliedAt: new Date().toISOString(),
              metadata: { source: 'auto_apply' },
            });
            await incrementAppliedToday();
            const st = await getCopilotState();
            await setCopilotState({ applied: st.applied + 1 });
            await appendCopilotLog(`Applied: ${base.title}`, 'success');
          } else {
            if (!(await ensureNaukriLoggedIn(tab.id))) break;

            const retry2 = await sendToTab<{
              ok: boolean;
              skipped?: boolean;
              needsUserInput?: boolean;
              reason?: string;
              job?: Partial<JobPayload>;
            }>(tab.id, { type: 'RUN_EASY_APPLY' });

            if (retry2.ok) {
              await handlers.persistApplicationRecorded({
                ...base,
                title: retry2.job?.title || base.title,
                company: retry2.job?.company || base.company,
                status: 'applied',
                appliedAt: new Date().toISOString(),
                metadata: { source: 'auto_apply' },
              });
              await incrementAppliedToday();
              const st = await getCopilotState();
              await setCopilotState({ applied: st.applied + 1 });
              await appendCopilotLog(`Applied: ${base.title}`, 'success');
            } else if (retry2.needsUserInput) {
              const st = await getCopilotState();
              await setCopilotState({ skipped: st.skipped + 1 });
              await handlers.persistJobDetected({
                ...base,
                metadata: {
                  source: 'auto_scan',
                  skipped: true,
                  skipReason: 'User questions not completed',
                },
              });
              await appendCopilotLog(
                `Skipped: ${base.title} — questions still open. Continuing scan.`,
                'warn'
              );
            } else {
              const st = await getCopilotState();
              await setCopilotState({ skipped: st.skipped + 1 });
              await appendCopilotLog(
                `Skipped: ${base.title} — ${retry2.reason || 'unavailable'}`,
                'warn'
              );
            }
          }
        } else {
          const st = await getCopilotState();
          await setCopilotState({ skipped: st.skipped + 1 });
          await handlers.persistJobDetected({
            ...base,
            metadata: {
              source: 'auto_scan',
              skipped: true,
              skipReason: retry.reason || 'Easy Apply unavailable',
            },
          });
          await appendCopilotLog(
            `Skipped: ${base.title} — ${retry.reason || 'unavailable'}`,
            'warn'
          );
        }
      } else if (result.ok) {
        await handlers.persistApplicationRecorded({
          ...base,
          status: 'applied',
          appliedAt: new Date().toISOString(),
          metadata: { source: 'auto_apply' },
        });
        await incrementAppliedToday();
        const st = await getCopilotState();
        await setCopilotState({ applied: st.applied + 1 });
        await appendCopilotLog(`Applied: ${base.title}`, 'success');
      } else {
        await handlers.persistJobDetected({
          ...base,
          metadata: {
            source: 'auto_scan',
            skipped: true,
            skipReason: result.reason || 'Easy Apply unavailable',
          },
        });
        const st = await getCopilotState();
        await setCopilotState({ skipped: st.skipped + 1 });
        await appendCopilotLog(
          `Skipped: ${base.title} — ${result.reason || 'unavailable'}`,
          'warn'
        );
      }

      await wait(randomDelay());
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

async function canApplyToday(limit: number): Promise<boolean> {
  const { getApplyDayStats } = await import('./storageManager');
  const stats = await getApplyDayStats();
  return stats.count < limit;
}

async function incrementAppliedToday(): Promise<void> {
  const { getApplyDayStats, setApplyDayStats } = await import(
    './storageManager'
  );
  const stats = await getApplyDayStats();
  await setApplyDayStats({ date: stats.date, count: stats.count + 1 });
}
