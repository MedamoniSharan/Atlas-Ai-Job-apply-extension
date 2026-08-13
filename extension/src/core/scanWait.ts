/** Session ceiling: stop when applied + skipped reaches this. */
export const SCAN_MATCH_TARGET = 30;

export function sessionProcessedCount(state: {
  applied?: number;
  skipped?: number;
}): number {
  return Math.max(0, (state.applied ?? 0) + (state.skipped ?? 0));
}

/** How many more apply/skip outcomes we still need this session. */
export function remainingProcessSlots(
  processed: number,
  target: number = SCAN_MATCH_TARGET
): number {
  return Math.max(0, Math.max(1, Math.floor(target)) - Math.max(0, Math.floor(processed)));
}

export function hasHitProcessCeiling(
  processed: number,
  target: number = SCAN_MATCH_TARGET
): boolean {
  return remainingProcessSlots(processed, target) === 0;
}

/**
 * Product invariant: never finish a search round while matched jobs are still
 * queued — apply (or skip) them first, then decide whether to continue.
 */
export function mustApplyQueuedBeforeContinue(queuedCount: number): boolean {
  return queuedCount > 0;
}

/**
 * Simulate one continuous session: filters → scan → apply per search until
 * applied+skipped hits the ceiling (or searches run out).
 * Pure helper used by tests to lock the product loop.
 */
export function simulateContinuousSession(opts: {
  /** Matches found per search after filters+scan (pages already walked). */
  matchesPerSearch: number[];
  /** Of each queued batch, how many become skipped (rest applied). */
  skipRatio?: number;
  target?: number;
}): {
  processed: number;
  applied: number;
  skipped: number;
  searchesUsed: number;
  leftQueued: number;
  hitCeiling: boolean;
} {
  const target = opts.target ?? SCAN_MATCH_TARGET;
  const skipRatio = Math.min(1, Math.max(0, opts.skipRatio ?? 0));
  let applied = 0;
  let skipped = 0;
  let searchesUsed = 0;
  let leftQueued = 0;

  for (const found of opts.matchesPerSearch) {
    const processed = applied + skipped;
    if (hasHitProcessCeiling(processed, target)) break;
    searchesUsed += 1;

    const remaining = remainingProcessSlots(processed, target);
    const queued = Math.max(0, Math.min(found, remaining));
    if (!mustApplyQueuedBeforeContinue(queued)) continue;

    // Always drain the queue before continuing / ending.
    const toSkip = Math.round(queued * skipRatio);
    const toApply = queued - toSkip;
    skipped += toSkip;
    applied += toApply;
    leftQueued = 0;
  }

  const processed = applied + skipped;
  return {
    processed,
    applied,
    skipped,
    searchesUsed,
    leftQueued,
    hitCeiling: hasHitProcessCeiling(processed, target),
  };
}

/**
 * Plain-language progress while Cosmo is still working toward
 * applied + skipped = target. Do not invent a fixed countdown.
 */
export function scanWaitMessage(
  matched: number,
  target: number = SCAN_MATCH_TARGET,
  processed: number = 0
): string {
  const n = Math.max(0, Math.floor(matched));
  const goal = Math.max(1, Math.floor(target));
  const done = Math.max(0, Math.floor(processed));
  if (done >= goal) {
    return `${goal} applied+skipped — finishing up.`;
  }
  if (n <= 0 && done <= 0) {
    return `Scanning with your filters — will apply until ${goal} applied+skipped.`;
  }
  if (n >= goal - done || done >= goal - 5) {
    return `Almost there — ${done}/${goal} applied+skipped (${n} matched).`;
  }
  return `${done}/${goal} applied+skipped · ${n} matched — scanning & applying continuously.`;
}
