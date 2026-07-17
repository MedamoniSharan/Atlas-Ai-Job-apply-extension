import type { EventEnvelope } from '@atlas/shared';
import { KEYS } from './storageManager';
import { logger } from './logger';

export async function getQueue(): Promise<EventEnvelope[]> {
  const data = await chrome.storage.local.get(KEYS.queue);
  return (data[KEYS.queue] as EventEnvelope[]) ?? [];
}

export async function enqueue(event: EventEnvelope): Promise<void> {
  const queue = await getQueue();
  if (queue.some((e) => e.eventId === event.eventId)) {
    logger.debug('Skipping duplicate queue event', { eventId: event.eventId });
    return;
  }
  queue.push(event);
  await chrome.storage.local.set({ [KEYS.queue]: queue });
  logger.info('Event queued', { eventId: event.eventId, type: event.type });
}

export async function removeFromQueue(eventIds: string[]): Promise<void> {
  const queue = await getQueue();
  const remaining = queue.filter((e) => !eventIds.includes(e.eventId));
  await chrome.storage.local.set({ [KEYS.queue]: remaining });
}

export async function updateRetry(
  eventId: string,
  retryCount: number
): Promise<void> {
  const queue = await getQueue();
  const next = queue.map((e) =>
    e.eventId === eventId
      ? { ...e, retryCount, syncStatus: 'failed' as const }
      : e
  );
  await chrome.storage.local.set({ [KEYS.queue]: next });
}

export function backoffMs(retryCount: number): number {
  const base = 2000;
  const max = 5 * 60 * 1000;
  return Math.min(max, base * Math.pow(2, retryCount));
}
