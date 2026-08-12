import { describe, expect, it } from 'vitest';
import {
  SCAN_MATCH_TARGET,
  scanWaitMessage,
  sessionProcessedCount,
} from './scanWait';

describe('scanWaitMessage', () => {
  it('explains per-filter scan then apply, with a 30 processed cap', () => {
    expect(scanWaitMessage({ matched: 0, keyword: 'Java Developer' })).toBe(
      'Scanning “Java Developer” — apply this list next. Stopping around 30 applied+skipped.'
    );
  });

  it('shows mid-filter progress then apply', () => {
    expect(
      scanWaitMessage({ matched: 8, keyword: 'Java Developer' })
    ).toBe(
      '8 matched on “Java Developer” — then apply, then another title/keyword.'
    );
  });

  it('announces apply when this filter hits the remaining cap', () => {
    expect(
      scanWaitMessage({
        matched: 30,
        target: SCAN_MATCH_TARGET,
        keyword: 'React',
      })
    ).toBe('30 matched on “React” — applying now.');
  });

  it('falls back when keyword is missing', () => {
    expect(scanWaitMessage({ matched: 0 })).toContain('this search');
    expect(scanWaitMessage({ matched: 3 })).toContain('this search');
  });

  it('respects a custom remaining target', () => {
    expect(scanWaitMessage({ matched: 0, target: 10, keyword: 'Dev' })).toBe(
      'Scanning “Dev” — apply this list next. Stopping around 10 applied+skipped.'
    );
  });
});

describe('sessionProcessedCount', () => {
  it('sums applied and skipped toward the session ceiling', () => {
    expect(sessionProcessedCount({ applied: 12, skipped: 8 })).toBe(20);
    expect(sessionProcessedCount({ applied: 30, skipped: 0 })).toBe(30);
    expect(sessionProcessedCount({})).toBe(0);
  });
});
