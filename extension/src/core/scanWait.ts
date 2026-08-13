/** Prefer collecting this many preference-matched jobs before apply. */
export const SCAN_MATCH_TARGET = 30;

export function sessionProcessedCount(state: {
  applied?: number;
  skipped?: number;
}): number {
  return Math.max(0, (state.applied ?? 0) + (state.skipped ?? 0));
}

/**
 * Plain-language wait copy while Cosmo is still scanning (not applying yet).
 * Do not invent a 1:00 countdown — scan can take longer on thin searches.
 */
export function scanWaitMessage(
  matched: number,
  target: number = SCAN_MATCH_TARGET
): string {
  const n = Math.max(0, Math.floor(matched));
  const goal = Math.max(1, Math.floor(target));
  if (n <= 0) {
    return `Please wait until ${goal} jobs match (~1 minute). Apply has not started yet.`;
  }
  if (n >= goal) {
    return `${goal} jobs matched — starting applies now.`;
  }
  if (n >= goal - 5) {
    return `Almost there — ${n}/${goal} matched. Apply starts next.`;
  }
  return `${n}/${goal} matched — please wait. Apply starts after ${goal} matches (~1 minute).`;
}
