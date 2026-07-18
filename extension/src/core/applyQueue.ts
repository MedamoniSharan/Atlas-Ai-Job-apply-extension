import type { JobPayload } from '@atlas/shared';
import {
  ApplyQueueItem,
  getApplyDayStats,
  getApplyQueue,
  getCachedPreferences,
  setApplyDayStats,
  setApplyQueue,
} from './storageManager';
import { logger } from './logger';
import {
  appendCopilotLog,
  getCopilotState,
  setCopilotState,
} from './copilotState';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return 3000 + Math.floor(Math.random() * 5000);
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
  attempts = 10
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

let processing = false;

export async function enqueueApplyJobs(
  items: ApplyQueueItem[]
): Promise<number> {
  const prefs = await getCachedPreferences();
  const stats = await getApplyDayStats();
  const remaining = Math.max(0, prefs.dailyApplyLimit - stats.count);
  if (remaining === 0) return 0;

  const queue = await getApplyQueue();
  const existing = new Set(queue.map((q) => q.url));
  const toAdd = items
    .filter((i) => i.url && !existing.has(i.url))
    .slice(0, remaining);
  if (toAdd.length === 0) return 0;

  await setApplyQueue([...queue, ...toAdd]);
  return toAdd.length;
}

export type ApplyHandlers = {
  persistJobDetected: (payload: JobPayload) => Promise<void>;
  persistApplicationRecorded: (payload: JobPayload) => Promise<void>;
};

export async function processApplyQueue(
  handlers: ApplyHandlers,
  tabId?: number
): Promise<{ processed: number; message: string }> {
  if (processing) {
    return { processed: 0, message: 'Apply already running.' };
  }
  processing = true;

  try {
    const prefs = await getCachedPreferences();
    if (!prefs.autoApplyEnabled) {
      return { processed: 0, message: 'Auto-apply is disabled.' };
    }

    let queue = await getApplyQueue();
    if (queue.length === 0) {
      return { processed: 0, message: 'Apply queue is empty.' };
    }

    let stats = await getApplyDayStats();
    let processed = 0;
    let activeTabId = tabId;

    while (queue.length > 0) {
      stats = await getApplyDayStats();
      if (stats.count >= prefs.dailyApplyLimit) {
        break;
      }

      const item = queue[0]!;
      queue = queue.slice(1);
      await setApplyQueue(queue);

      try {
        if (activeTabId == null) {
          const tab = await chrome.tabs.create({
            url: item.url,
            active: true,
          });
          activeTabId = tab.id;
        } else {
          await chrome.tabs.update(activeTabId, { url: item.url, active: true });
        }
        if (activeTabId == null) continue;

        await waitForTabComplete(activeTabId);
        await wait(2000);

        let loggedIn = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const login = await sendToTab<{ loggedIn: boolean }>(activeTabId, {
            type: 'CHECK_LOGIN',
          });
          if (login.loggedIn) {
            loggedIn = true;
            break;
          }
          await setCopilotState({ paused: true, running: true });
          await appendCopilotLog(
            'Paused — you are not logged into Naukri. Log in, then press Resume.',
            'warn'
          );
          const start = Date.now();
          while (Date.now() - start < 120_000) {
            const st = await getCopilotState();
            if (!st.paused) break;
            if (!st.running) {
              await setApplyQueue([item, ...queue]);
              return {
                processed,
                message: 'Stopped while waiting for Naukri login.',
              };
            }
            await wait(500);
          }
          await wait(1000);
        }

        if (!loggedIn) {
          await setApplyQueue([item, ...queue]);
          return {
            processed,
            message: 'Log into Naukri, then retry apply.',
          };
        }

        const result = await sendToTab<{
          ok: boolean;
          skipped?: boolean;
          reason?: string;
          job?: Partial<JobPayload>;
        }>(activeTabId, { type: 'RUN_EASY_APPLY' });

        const base: JobPayload = {
          platform: 'naukri',
          title: result.job?.title || item.title,
          company: result.job?.company || item.company,
          location: result.job?.location || item.location,
          url: item.url,
          externalJobId: result.job?.externalJobId || item.externalJobId,
          status: 'detected',
          metadata: { source: 'auto_apply' },
        };

        if (result.ok) {
          await handlers.persistApplicationRecorded({
            ...base,
            status: 'applied',
            appliedAt: new Date().toISOString(),
            metadata: { source: 'auto_apply' },
          });
          stats = {
            date: stats.date,
            count: stats.count + 1,
          };
          await setApplyDayStats(stats);
          processed += 1;
        } else {
          await handlers.persistJobDetected({
            ...base,
            metadata: {
              source: 'auto_scan',
              skipped: true,
              skipReason: result.reason || 'Easy Apply unavailable',
            },
          });
        }
      } catch (error) {
        logger.warn('Apply item failed', {
          url: item.url,
          error: error instanceof Error ? error.message : String(error),
        });
        await handlers.persistJobDetected({
          platform: 'naukri',
          title: item.title,
          company: item.company,
          location: item.location,
          url: item.url,
          externalJobId: item.externalJobId,
          status: 'detected',
          metadata: {
            source: 'auto_scan',
            skipped: true,
            skipReason: 'Apply failed',
          },
        });
      }

      await wait(randomDelay());
      queue = await getApplyQueue();
    }

    return {
      processed,
      message:
        processed > 0
          ? `Applied to ${processed} job(s).`
          : 'No Easy Apply jobs processed.',
    };
  } finally {
    processing = false;
  }
}

export async function getApplyQueueDepth(): Promise<number> {
  const queue = await getApplyQueue();
  return queue.length;
}
