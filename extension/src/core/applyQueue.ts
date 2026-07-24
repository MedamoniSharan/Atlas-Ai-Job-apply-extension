import type { JobPayload } from '@cosmo/shared';
import {
  handleBlockedPage,
  paceModeFromStealth,
  pacedWait,
  wait,
} from './humanPace';
import {
  getApplyQuotaBlock,
  getApplyQuotaSnapshot,
  noteLocalApply,
  quotaBlockMessage,
} from './planApplyQuota';
import {
  ApplyQueueItem,
  getApplyQueue,
  getCachedPreferences,
  setApplyQueue,
} from './storageManager';
import { lookupAppliedJobs } from './apiClient';
import { logger } from './logger';
import {
  appendCopilotLog,
  getCopilotState,
  raiseCopilotAlert,
  raiseCopilotToast,
  setCopilotState,
} from './copilotState';
import { mergeJobFields } from './jobFields';

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url.split('?')[0]?.replace(/\/$/, '') || url;
  }
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
  let remaining = 0;
  try {
    remaining = (await getApplyQuotaSnapshot()).monthRemaining;
  } catch (error) {
    logger.warn('Could not load plan apply quota', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
  if (remaining === 0) return 0;

  const queue = await getApplyQueue();
  const existing = new Set(queue.map((q) => q.url));

  const candidates = items.filter((i) => i.url && !existing.has(i.url));
  const lookup = await lookupAppliedJobs({
    externalJobIds: candidates
      .map((c) => c.externalJobId)
      .filter((id): id is string => Boolean(id)),
    urls: candidates.map((c) => c.url),
  });
  const appliedIds = new Set(
    lookup.success ? lookup.data.externalJobIds : []
  );
  const appliedUrls = new Set(
    lookup.success ? lookup.data.urls.map(normalizeUrl) : []
  );

  const toAdd = candidates
    .filter((i) => {
      if (i.externalJobId && appliedIds.has(i.externalJobId)) return false;
      if (appliedUrls.has(normalizeUrl(i.url))) return false;
      return true;
    })
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

    let processed = 0;
    let activeTabId = tabId;

    while (queue.length > 0) {
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
        break;
      }
      const blockReason = getApplyQuotaBlock(quota);
      if (blockReason) {
        const msg = quotaBlockMessage(quota, blockReason);
        await raiseCopilotAlert(
          msg,
          'warn',
          blockReason === 'month' ? 'plan_limit' : 'rate_limit'
        );
        await appendCopilotLog(msg, 'warn');
        break;
      }

      const item = queue[0]!;
      queue = queue.slice(1);
      await setApplyQueue(queue);

      try {
        const appliedLookup = await lookupAppliedJobs({
          externalJobIds: item.externalJobId ? [item.externalJobId] : [],
          urls: [item.url],
        });
        if (appliedLookup.success) {
          const already =
            (item.externalJobId &&
              appliedLookup.data.externalJobIds.includes(item.externalJobId)) ||
            appliedLookup.data.urls
              .map(normalizeUrl)
              .includes(normalizeUrl(item.url));
          if (already) {
            await appendCopilotLog(
              `Already applied — skipped: ${item.title}`,
              'info'
            );
            continue;
          }
        }

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
        const mode = paceModeFromStealth(false);
        await pacedWait(mode, 'nav', { jobTitle: item.title });
        await pacedWait(mode, 'dwell', { jobTitle: item.title });

        const block = await sendToTab<{ blocked?: boolean; reason?: string }>(
          activeTabId,
          { type: 'CHECK_BLOCK_PAGE' },
          3
        );
        if (block.blocked) {
          await handleBlockedPage(block.reason || 'verification page');
          await setApplyQueue([item, ...queue]);
          return {
            processed,
            message: 'Stopped — Naukri verification page detected.',
          };
        }

        let loggedIn = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const login = await sendToTab<{
            loggedIn: boolean;
            status?: 'loggedIn' | 'loggedOut' | 'uncertain';
          }>(activeTabId, {
            type: 'CHECK_LOGIN',
          });
          if (login.loggedIn) {
            loggedIn = true;
            await setCopilotState({ needsLogin: false, loginPauseReason: null });
            break;
          }
          const reason: 'loggedOut' | 'uncertain' =
            login.status === 'loggedOut' ? 'loggedOut' : 'uncertain';
          await setCopilotState({
            paused: true,
            running: true,
            needsLogin: true,
            loginPauseReason: reason,
          });
          await appendCopilotLog(
            reason === 'uncertain'
              ? 'Paused — confirm you’re logged into Naukri, then press Resume.'
              : 'Paused — you are not logged into Naukri. Log in, then press Resume.',
            'warn'
          );
          await sendToTab(activeTabId, {
            type: 'SHOW_LOGIN_PROMPT',
            reason,
          }).catch(() => undefined);
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
            message: 'Confirm you’re logged into Naukri, then retry apply.',
          };
        }

        const result = await sendToTab<{
          ok: boolean;
          skipped?: boolean;
          alreadyApplied?: boolean;
          blocked?: boolean;
          reason?: string;
          job?: Partial<JobPayload>;
        }>(activeTabId, { type: 'RUN_EASY_APPLY' });

        if (result.blocked) {
          await handleBlockedPage(result.reason || 'verification page');
          await setApplyQueue([item, ...queue]);
          return {
            processed,
            message: 'Stopped — Naukri verification page detected.',
          };
        }

        const base = mergeJobFields(result.job, item, {
          url: item.url,
          status: 'detected',
          metadata: { source: 'auto_apply' },
        });

        if (result.ok) {
          if (result.alreadyApplied) {
            await handlers.persistApplicationRecorded({
              ...base,
              status: 'applied',
              appliedAt: new Date().toISOString(),
              metadata: { source: 'auto_apply', alreadyApplied: true },
            });
            await appendCopilotLog(
              `Already applied — skipped: ${base.title}`,
              'info'
            );
          } else {
            await handlers.persistApplicationRecorded({
              ...base,
              status: 'applied',
              appliedAt: new Date().toISOString(),
              metadata: { source: 'auto_apply' },
            });
            noteLocalApply();
            processed += 1;
            await raiseCopilotToast(
              'Job applied successfully',
              base.company ? `${base.title} · ${base.company}` : base.title
            );
          }
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
        await handlers.persistJobDetected(
          mergeJobFields(undefined, item, {
            status: 'detected',
            metadata: {
              source: 'auto_scan',
              skipped: true,
              skipReason: 'Apply failed',
            },
          })
        );
      }

      await pacedWait(paceModeFromStealth(false), 'betweenJobs', {
        jobTitle: item.title,
      });
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
