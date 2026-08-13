import { describe, expect, it } from 'vitest';
import {
  SCAN_MATCH_TARGET,
  hasHitProcessCeiling,
  mustApplyQueuedBeforeContinue,
  remainingProcessSlots,
  scanWaitMessage,
  sessionProcessedCount,
  simulateContinuousSession,
} from './scanWait';

describe('sessionProcessedCount', () => {
  it('sums applied and skipped', () => {
    expect(sessionProcessedCount({ applied: 12, skipped: 8 })).toBe(20);
    expect(sessionProcessedCount({})).toBe(0);
  });
});

describe('process ceiling helpers', () => {
  it('tracks remaining slots to 30', () => {
    expect(remainingProcessSlots(0)).toBe(30);
    expect(remainingProcessSlots(5)).toBe(25);
    expect(remainingProcessSlots(30)).toBe(0);
    expect(remainingProcessSlots(40)).toBe(0);
  });

  it('hits ceiling only at applied+skipped >= 30', () => {
    expect(hasHitProcessCeiling(0)).toBe(false);
    expect(hasHitProcessCeiling(29)).toBe(false);
    expect(hasHitProcessCeiling(30)).toBe(true);
    expect(hasHitProcessCeiling(1, 1)).toBe(true);
  });

  it('requires applying queued matches before continue/end', () => {
    expect(mustApplyQueuedBeforeContinue(0)).toBe(false);
    expect(mustApplyQueuedBeforeContinue(5)).toBe(true);
  });
});

describe('simulateContinuousSession (product loop)', () => {
  it('keeps going across searches until applied+skipped = 30', () => {
    // Reproduces the screenshot failure mode: first search only found 5.
    // Old bug: stop and ask Apply more. Correct: apply those 5, continue.
    const result = simulateContinuousSession({
      matchesPerSearch: [5, 10, 10, 10, 10],
      skipRatio: 0.2,
    });
    expect(result.leftQueued).toBe(0);
    expect(result.processed).toBe(SCAN_MATCH_TARGET);
    expect(result.hitCeiling).toBe(true);
    expect(result.searchesUsed).toBeGreaterThan(1);
    expect(result.applied + result.skipped).toBe(30);
  });

  it('never leaves queued jobs when ending under 30 (exhausted)', () => {
    const result = simulateContinuousSession({
      matchesPerSearch: [5, 0, 3],
      skipRatio: 0,
      target: 30,
    });
    expect(result.leftQueued).toBe(0);
    expect(result.processed).toBe(8);
    expect(result.hitCeiling).toBe(false);
    expect(result.applied).toBe(8);
  });

  it('stops at exactly 30 even when more matches are available', () => {
    const result = simulateContinuousSession({
      matchesPerSearch: [40, 40],
      skipRatio: 0,
    });
    expect(result.processed).toBe(30);
    expect(result.searchesUsed).toBe(1);
    expect(result.leftQueued).toBe(0);
  });

  it('counts skips toward the same 30 ceiling', () => {
    const result = simulateContinuousSession({
      matchesPerSearch: [30],
      skipRatio: 1,
    });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(30);
    expect(result.hitCeiling).toBe(true);
  });

  it('does not ask to stop after a single short page of matches', () => {
    // 5 matched / 1 skipped mid-scan path from production screenshot
    const mid = simulateContinuousSession({
      matchesPerSearch: [5],
      skipRatio: 0,
    });
    // One search alone under 30 is fine only if no more searches exist.
    expect(mid.processed).toBe(5);
    expect(mid.leftQueued).toBe(0);

    const continued = simulateContinuousSession({
      matchesPerSearch: [5, 12, 13],
      skipRatio: 0,
    });
    expect(continued.hitCeiling).toBe(true);
    expect(continued.processed).toBe(30);
    expect(continued.leftQueued).toBe(0);
  });
});

describe('scanWaitMessage', () => {
  it('tells users the continuous applied+skipped goal', () => {
    expect(scanWaitMessage(0)).toBe(
      'Scanning with your filters — will apply until 30 applied+skipped.'
    );
  });

  it('shows mid-run processed progress', () => {
    expect(scanWaitMessage(12, 30, 8)).toBe(
      '8/30 applied+skipped · 12 matched — scanning & applying continuously.'
    );
  });

  it('uses almost-there copy near the target', () => {
    expect(scanWaitMessage(28, 30, 25)).toMatch(/Almost there — 25\/30/);
    expect(scanWaitMessage(5, 30, 27)).toBe(
      'Almost there — 27/30 applied+skipped (5 matched).'
    );
  });

  it('announces finish at the target', () => {
    expect(scanWaitMessage(30, 30, 30)).toBe(
      '30 applied+skipped — finishing up.'
    );
  });
});
