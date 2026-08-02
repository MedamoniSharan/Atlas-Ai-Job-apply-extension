import { describe, expect, it } from 'vitest';
import { scanSessionUpsertSchema, scanStatsQuerySchema } from './scanSessions';

describe('scanSessionUpsertSchema', () => {
  it('accepts a full session snapshot', () => {
    const parsed = scanSessionUpsertSchema.parse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'naukri',
      keyword: 'react developer',
      startedAt: '2026-07-31T10:00:00.000Z',
      endedAt: '2026-07-31T10:20:00.000Z',
      status: 'completed',
      scanned: 120,
      matched: 30,
      applied: 28,
      skipped: 2,
      pagesScanned: 4,
    });
    expect(parsed.scanned).toBe(120);
    expect(parsed.status).toBe('completed');
  });

  it('defaults counters and platform', () => {
    const parsed = scanSessionUpsertSchema.parse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      startedAt: '2026-07-31T10:00:00.000Z',
    });
    expect(parsed.platform).toBe('naukri');
    expect(parsed.scanned).toBe(0);
    expect(parsed.status).toBe('running');
  });
});

describe('scanStatsQuerySchema', () => {
  it('coerces query strings', () => {
    const parsed = scanStatsQuerySchema.parse({ days: '14', limit: '5' });
    expect(parsed).toEqual({ days: 14, limit: 5 });
  });
});
