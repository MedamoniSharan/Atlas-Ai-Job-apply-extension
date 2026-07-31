import type { EventEnvelope } from '@cosmo/shared';
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

async function scheduleRetries(events: EventEnvelope[]): Promise<void> {
  for (const event of events) {
    const nextRetry = (event.retryCount ?? 0) + 1;
    await updateRetry(event.eventId, nextRetry);
    chrome.alarms.create(`retry-${event.eventId}`, {
      when: Date.now() + backoffMs(nextRetry),
    });
  }
}

/** Stop the run and roll back local counters when the server refuses applies. */
async function handleApplyCap(
  capCode: string,
  message: string,
  cappedApplyCount: number
): Promise<void> {
  for (let i = 0; i < cappedApplyCount; i++) {
    rollbackLocalApplySuccess();
  }
  await raiseCopilotAlert(message, 'warn', applyCapKind(capCode));
  await stopBot();
  logger.warn('Sync blocked by apply safety cap', { code: capCode });
}

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
      // Older servers report only a count; then the whole batch was stored.
      const synced = result.data?.syncedEventIds ?? batch.map((e) => e.eventId);
      const failedIds = new Set(result.data?.failedEventIds ?? []);
      const failed = batch.filter((e) => failedIds.has(e.eventId));
      const invalid = result.data?.invalidEventIds ?? [];

      await removeFromQueue(synced);
      await scheduleRetries(failed);

      if (invalid.length > 0) {
        logger.error('Server rejected job payloads as invalid', {
          count: invalid.length,
          eventIds: invalid,
        });
        await raiseCopilotAlert(
          `${invalid.length} job${invalid.length === 1 ? '' : 's'} could not be saved to your dashboard (invalid data).`,
          'error',
          'error'
        );
      }

      const capError = result.data?.capError;
      if (capError) {
        await handleApplyCap(
          capError.code,
          capError.message,
          failed.filter((e) => e.type === 'ApplicationRecorded').length
        );
        await eventBus.emit('SyncFailed', { message: capError.message });
        return;
      }

      await eventBus.emit('SyncCompleted', { processed: synced.length });
      logger.info('Sync completed', {
        processed: synced.length,
        retrying: failed.length,
      });
    } else {
      const capCode = result.error?.code;
      if (capCode && APPLY_CAP_CODES.has(capCode)) {
        await handleApplyCap(
          capCode,
          result.message,
          batch.filter((e) => e.type === 'ApplicationRecorded').length
        );
        // Keep the batch queued: hour/day caps lapse and these applies are real.
        await scheduleRetries(batch);
        await eventBus.emit('SyncFailed', { message: result.message });
        return;
      }

      await scheduleRetries(batch);
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
