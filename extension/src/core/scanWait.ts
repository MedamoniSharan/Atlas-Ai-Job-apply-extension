/** Session ceiling: stop when applied + skipped reaches this. */
export const SCAN_MATCH_TARGET = 30;

export function sessionProcessedCount(state: {
  applied?: number;
  skipped?: number;
}): number {
  return Math.max(0, (state.applied ?? 0) + (state.skipped ?? 0));
}

/**
 * Plain-language wait copy while Cosmo scans the current title/keyword filter.
 * Apply starts after this list; the session stops around 30 applied+skipped.
 */
export function scanWaitMessage(opts: {
  matched: number;
  target?: number;
  keyword?: string;
}): string {
  const n = Math.max(0, Math.floor(opts.matched));
  const goal = Math.max(1, Math.floor(opts.target ?? SCAN_MATCH_TARGET));
  const kw = opts.keyword?.trim();
  const label = kw ? `“${kw}”` : 'this search';

  if (n <= 0) {
    return `Scanning ${label} — apply this list next. Stopping around ${goal} applied+skipped.`;
  }
  if (n >= goal) {
    return `${n} matched on ${label} — applying now.`;
  }
  return `${n} matched on ${label} — then apply, then another title/keyword.`;
}
