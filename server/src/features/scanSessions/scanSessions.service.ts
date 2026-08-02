import { Types } from 'mongoose';
import type {
  ScanSession,
  ScanSessionUpsert,
  ScanStats,
  ScanStatsQuery,
} from '@cosmo/shared';
import { ScanSessionModel, IScanSession } from './scanSession.model';

/** Counters are reported in IST so a "day" lines up with the apply caps. */
const REPORT_TIMEZONE = 'Asia/Kolkata';

const TERMINAL_STATUSES = new Set(['completed', 'stopped', 'failed']);

function toScanSession(doc: IScanSession): ScanSession {
  return {
    id: String(doc._id),
    sessionId: doc.sessionId,
    platform: doc.platform,
    keyword: doc.keyword,
    status: doc.status,
    scanned: doc.scanned,
    matched: doc.matched,
    applied: doc.applied,
    skipped: doc.skipped,
    pagesScanned: doc.pagesScanned,
    startedAt: doc.startedAt.toISOString(),
    endedAt: doc.endedAt ? doc.endedAt.toISOString() : null,
  };
}

/**
 * Idempotent by `{userId, sessionId}` so the extension can report progress
 * repeatedly and safely retry. Counters only ever move up: a delayed retry
 * carrying stale numbers must not roll back a later report.
 */
export async function upsertScanSession(
  userId: string,
  input: ScanSessionUpsert
): Promise<ScanSession> {
  const isTerminal = TERMINAL_STATUSES.has(input.status);

  const set: Record<string, unknown> = {
    platform: input.platform,
    keyword: input.keyword,
  };
  const setOnInsert: Record<string, unknown> = {
    startedAt: new Date(input.startedAt),
  };

  if (isTerminal) {
    set.status = input.status;
    set.endedAt = new Date(input.endedAt ?? new Date().toISOString());
  } else {
    setOnInsert.status = input.status;
  }

  const doc = await ScanSessionModel.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), sessionId: input.sessionId },
    {
      $set: set,
      $setOnInsert: setOnInsert,
      $max: {
        scanned: input.scanned,
        matched: input.matched,
        applied: input.applied,
        skipped: input.skipped,
        pagesScanned: input.pagesScanned,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return toScanSession(doc as IScanSession);
}

type CounterTotals = {
  sessions: number;
  scanned: number;
  matched: number;
  applied: number;
  skipped: number;
};

const EMPTY_TOTALS: CounterTotals = {
  sessions: 0,
  scanned: 0,
  matched: 0,
  applied: 0,
  skipped: 0,
};

const SUM_STAGE = {
  sessions: { $sum: 1 },
  scanned: { $sum: '$scanned' },
  matched: { $sum: '$matched' },
  applied: { $sum: '$applied' },
  skipped: { $sum: '$skipped' },
};

async function sumCounters(
  match: Record<string, unknown>
): Promise<CounterTotals> {
  const [row] = await ScanSessionModel.aggregate<CounterTotals>([
    { $match: match },
    { $group: { _id: null, ...SUM_STAGE } },
    { $project: { _id: 0 } },
  ]);
  return row ?? EMPTY_TOTALS;
}

export async function getScanStats(
  userId: string,
  query: ScanStatsQuery
): Promise<ScanStats> {
  const uid = new Types.ObjectId(userId);

  const fromDate = query.from ? new Date(query.from) : null;
  const toDate = query.to ? new Date(query.to) : null;
  const useRange =
    fromDate != null &&
    toDate != null &&
    !Number.isNaN(fromDate.getTime()) &&
    !Number.isNaN(toDate.getTime()) &&
    fromDate.getTime() < toDate.getTime();

  const since = useRange
    ? fromDate
    : new Date(Date.now() - query.days * 86_400_000);
  const until = useRange ? toDate : null;
  const windowMatch: Record<string, unknown> = {
    userId: uid,
    startedAt: until
      ? { $gte: since, $lt: until }
      : { $gte: since },
  };
  const days = useRange
    ? Math.max(
        1,
        Math.ceil((until!.getTime() - since.getTime()) / 86_400_000)
      )
    : query.days;

  const [totals, window, series, recent] = await Promise.all([
    sumCounters({ userId: uid }),
    sumCounters(windowMatch),
    ScanSessionModel.aggregate<ScanStats['series'][number]>([
      { $match: windowMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$startedAt',
              timezone: REPORT_TIMEZONE,
            },
          },
          ...SUM_STAGE,
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', sessions: 1, scanned: 1, matched: 1, applied: 1, skipped: 1 } },
    ]),
    ScanSessionModel.find({ userId: uid })
      .sort({ startedAt: -1 })
      .limit(query.limit),
  ]);

  const items = recent.map(toScanSession);

  return {
    totals,
    window: {
      days,
      ...(useRange
        ? { from: since.toISOString(), to: until!.toISOString() }
        : {}),
      ...window,
    },
    series,
    recent: items,
    lastScanAt: items[0]?.startedAt ?? null,
  };
}
