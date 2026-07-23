import {
  backoffMs,
  getQueue,
  removeFromQueue,
  updateRetry,
} from './queueManager';
import { syncEvents } from './apiClient';
import { logger } from './logger';
import { handleError } from './errorHandler';
import { eventBus } from './eventBus';
import { rollbackLocalApplySuccess } from './applySafetyQuota';
import {
  raiseCopilotAlert,
} from './copilotState';
import { stopBot } from './botRunner';

const APPLY_CAP_CODES = new Set([
  'APPLY_HOUR_CAP',
  'APPLY_DAY_CAP',
  'APPLY_PLAN_CAP',
]);

function applyCapKind(
  code: string | undefined
): 'rate_limit' | 'plan_limit' {
  return code === 'APPLY_PLAN_CAP' ? 'plan_limit' : 'rate_limit';
}

let syncing = false;

export async function flushQueue(): Promise<void> {
  if (syncing) return;
  syncing = true;

  try {
    await eventBus.emit('SyncStarted', {});
    const queue = await getQueue();
    if (queue.length === 0) {
      await eventBus.emit('SyncCompleted', { processed: 0 });
      return;
    }

    const batch = queue.slice(0, 50).map((e) => ({
      ...e,
      syncStatus: 'syncing' as const,
    }));

    const result = await syncEvents(batch);
    if (result.success) {
      await removeFromQueue(batch.map((e) => e.eventId));
      await eventBus.emit('SyncCompleted', { processed: batch.length });
      logger.info('Sync completed', { processed: batch.length });
    } else {
      const capCode = result.error?.code;
      if (capCode && APPLY_CAP_CODES.has(capCode)) {
        const applyEvents = batch.filter((e) => e.type === 'ApplicationRecorded');
        for (let i = 0; i < applyEvents.length; i++) {
          rollbackLocalApplySuccess();
        }
        await raiseCopilotAlert(
          result.message,
          'warn',
          applyCapKind(capCode)
        );
        await stopBot();
        await removeFromQueue(batch.map((e) => e.eventId));
        await eventBus.emit('SyncFailed', { message: result.message });
        logger.warn('Sync blocked by apply safety cap', { code: capCode });
        return;
      }

      for (const event of batch) {
        const nextRetry = (event.retryCount ?? 0) + 1;
        await updateRetry(event.eventId, nextRetry);
        chrome.alarms.create(`retry-${event.eventId}`, {
          when: Date.now() + backoffMs(nextRetry),
        });
      }
      await eventBus.emit('SyncFailed', { message: result.message });
      logger.warn('Sync failed', { message: result.message });
    }
  } catch (error) {
    handleError(error, 'flushQueue');
    await eventBus.emit('SyncFailed', {
      message: error instanceof Error ? error.message : 'Sync error',
    });
  } finally {
    syncing = false;
  }
}
