import { v4 as uuidv4 } from 'uuid';
import type { ScanSessionStatus, ScanSessionUpsert } from '@cosmo/shared';
import { postScanSession } from './apiClient';
import { getAuthState } from './storageManager';
import { getCopilotState, setCopilotState } from './copilotState';
import { logger } from './logger';

const QUEUE_KEY = 'scanSessionQueue';
/** Runs are tiny; keep enough to survive a long offline stretch, not forever. */
const MAX_PENDING = 50;
/** Throttle mid-run progress reports so a 40-page scan is not 40 requests. */
const PROGRESS_INTERVAL_MS = 20_000;

/** Retrying cannot fix these, so the snapshot is dropped instead of requeued. */
const PERMANENT_ERROR_CODES = new Set(['VALIDATION_ERROR', 'NOT_FOUND']);

let queueWriteChain: Promise<unknown> = Promise.resolve();
let lastProgressReportAt = 0;

async function getPending(): Promise<ScanSessionUpsert[]> {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return (data[QUEUE_KEY] as ScanSessionUpsert[] | undefined) ?? [];
}

async function commitPending(
  updater: (current: ScanSessionUpsert[]) => ScanSessionUpsert[]
): Promise<void> {
  const run = async () => {
    const next = updater(await getPending()).slice(-MAX_PENDING);
    await chrome.storage.local.set({ [QUEUE_KEY]: next });
  };
  const result = queueWriteChain.then(run, run);
  queueWriteChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** Later snapshots supersede earlier ones for the same run. */
async function queueScanSession(input: ScanSessionUpsert): Promise<void> {
  await commitPending((pending) => [
    ...pending.filter((item) => item.sessionId !== input.sessionId),
    input,
  ]);
}

export async function flushScanSessions(): Promise<void> {
  const pending = await getPending();
  if (pending.length === 0) return;

  const { accessToken } = await getAuthState();
  if (!accessToken) return;

  const delivered = new Set<string>();
  for (const item of pending) {
    try {
      const res = await postScanSession(item);
      if (res.success) {
        delivered.add(JSON.stringify(item));
        continue;
      }
      const code = res.error?.code;
      if (code && PERMANENT_ERROR_CODES.has(code)) {
        delivered.add(JSON.stringify(item));
        logger.warn('Scan session rejected', { code, message: res.message });
      }
    } catch (error) {
      logger.warn('Scan session sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (delivered.size === 0) return;

  // Drop only the exact snapshots that landed, so a newer one queued mid-flush survives.
  await commitPending((current) =>
    current.filter((item) => !delivered.has(JSON.stringify(item)))
  );
}

/** Mint the run id the backend keys scan stats on. */
export async function beginScanSession(): Promise<string> {
  const sessionId = uuidv4();
  await setCopilotState({
    sessionId,
    sessionStartedAt: new Date().toISOString(),
    pagesScanned: 0,
  });
  lastProgressReportAt = 0;
  return sessionId;
}

/**
 * Snapshot the live counters to the backend. Queued first so a run that ends
 * offline (or with the browser closing) still reports once connectivity returns.
 */
export async function reportScanSession(
  status: ScanSessionStatus
): Promise<void> {
  const state = await getCopilotState();
  if (!state.sessionId || !state.sessionStartedAt) return;

  const isTerminal = status !== 'running';
  if (!isTerminal) {
    const now = Date.now();
    if (now - lastProgressReportAt < PROGRESS_INTERVAL_MS) return;
    lastProgressReportAt = now;
  }

  await queueScanSession({
    sessionId: state.sessionId,
    platform: 'naukri',
    keyword: state.keyword ?? '',
    startedAt: state.sessionStartedAt,
    ...(isTerminal ? { endedAt: new Date().toISOString() } : {}),
    status,
    scanned: state.scanned ?? 0,
    matched: state.matched ?? 0,
    applied: state.applied ?? 0,
    skipped: state.skipped ?? 0,
    pagesScanned: state.pagesScanned ?? 0,
  });

  await flushScanSessions();

  if (isTerminal) {
    await setCopilotState({ sessionId: null, sessionStartedAt: null });
  }
}
