import { describe, expect, it } from 'vitest';
import {
  SCAN_MATCH_TARGET,
  scanWaitMessage,
  sessionProcessedCount,
} from './scanWait';

describe('scanWaitMessage', () => {
  it('tells users to wait before any matches', () => {
    expect(scanWaitMessage(0)).toBe(
      'Please wait until 30 jobs match (~1 minute). Apply has not started yet.'
    );
  });

  it('shows mid-scan progress toward 30', () => {
    expect(scanWaitMessage(12)).toBe(
      '12/30 matched — please wait. Apply starts after 30 matches (~1 minute).'
    );
  });

  it('uses almost-there copy near the target', () => {
    expect(scanWaitMessage(25)).toMatch(/Almost there — 25\/30 matched/);
    expect(scanWaitMessage(29)).toBe(
      'Almost there — 29/30 matched. Apply starts next.'
    );
  });

  it('announces apply start at the target', () => {
    expect(scanWaitMessage(30)).toBe(
      '30 jobs matched — starting applies now.'
    );
    expect(scanWaitMessage(SCAN_MATCH_TARGET)).toContain('starting applies');
  });

  it('respects a custom target', () => {
    expect(scanWaitMessage(0, 10)).toContain('until 10 jobs match');
    expect(scanWaitMessage(8, 10)).toMatch(/Almost there — 8\/10/);
  });
});

describe('sessionProcessedCount', () => {
  it('sums applied and skipped', () => {
    expect(sessionProcessedCount({ applied: 12, skipped: 8 })).toBe(20);
    expect(sessionProcessedCount({})).toBe(0);
  });
});
