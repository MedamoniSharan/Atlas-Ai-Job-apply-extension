import { z } from 'zod';
import { platformSchema } from './events';

export const scanSessionStatusSchema = z.enum([
  'running',
  'completed',
  'stopped',
  'failed',
]);

export type ScanSessionStatus = z.infer<typeof scanSessionStatusSchema>;

/**
 * A single co-pilot run. The extension owns `sessionId` and re-sends the same
 * id as counters grow, so the server upsert stays idempotent under retry.
 */
export const scanSessionUpsertSchema = z.object({
  sessionId: z.string().uuid(),
  platform: platformSchema.default('naukri'),
  keyword: z.string().max(200).default(''),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  status: scanSessionStatusSchema.default('running'),
  /** Unique job cards seen on the search list, matched or not. */
  scanned: z.number().int().nonnegative().default(0),
  matched: z.number().int().nonnegative().default(0),
  applied: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  pagesScanned: z.number().int().nonnegative().default(0),
});

export type ScanSessionUpsert = z.infer<typeof scanSessionUpsertSchema>;

export const scanStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /** Inclusive ISO lower bound. When set with `to`, overrides rolling `days`. */
  from: z.string().datetime().optional(),
  /** Exclusive ISO upper bound. */
  to: z.string().datetime().optional(),
});

export type ScanStatsQuery = z.infer<typeof scanStatsQuerySchema>;

export type ScanSession = {
  id: string;
  sessionId: string;
  platform: string;
  keyword: string;
  status: ScanSessionStatus;
  scanned: number;
  matched: number;
  applied: number;
  skipped: number;
  pagesScanned: number;
  startedAt: string;
  endedAt: string | null;
};

export type ScanStats = {
  totals: {
    sessions: number;
    scanned: number;
    matched: number;
    applied: number;
    skipped: number;
  };
  /** Same counters limited to the requested window. */
  window: {
    days: number;
    from?: string;
    to?: string;
    sessions: number;
    scanned: number;
    matched: number;
    applied: number;
    skipped: number;
  };
  /** Ascending by date, one entry per day that had at least one session. */
  series: Array<{
    date: string;
    sessions: number;
    scanned: number;
    matched: number;
    applied: number;
    skipped: number;
  }>;
  recent: ScanSession[];
  lastScanAt: string | null;
};
