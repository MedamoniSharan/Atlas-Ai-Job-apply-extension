import type { Platform } from '@cosmo/shared';
import { getIstMonthBounds } from '@cosmo/shared';
import { ScanSessionModel } from '../scanSessions/scanSession.model';

export type LeaderboardPeriod = 'month' | 'last_month' | 'year' | 'all';
export type LeaderboardPlatform = 'all' | Platform;

export const LEADERBOARD_LIMIT = 10;

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  handle: string;
  initials: string;
  platform: Platform;
  applied: number;
  matched: number;
  scanned: number;
  points: number;
  isYou: boolean;
  trends: {
    applied: number[];
    matched: number[];
    scanned: number[];
  };
  change: {
    applied: number;
    matched: number;
    scanned: number;
  };
};

export type LeaderboardResult = {
  period: { label: string; key: LeaderboardPeriod };
  platform: LeaderboardPlatform;
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
};

type PeriodBounds = {
  since: Date;
  until: Date;
  label: string;
  key: LeaderboardPeriod;
  prevSince: Date;
  prevUntil: Date;
};

function resolvePeriod(period: LeaderboardPeriod, now = new Date()): PeriodBounds {
  if (period === 'all') {
    return {
      since: new Date(0),
      until: now,
      label: 'All time',
      key: 'all',
      prevSince: new Date(0),
      prevUntil: new Date(0),
    };
  }

  if (period === 'month') {
    const { periodStart, periodEnd } = getIstMonthBounds(now);
    const prevAnchor = new Date(periodStart.getTime() - 12 * 60 * 60 * 1000);
    const { periodStart: prevSince, periodEnd: prevUntil } =
      getIstMonthBounds(prevAnchor);
    return {
      since: periodStart,
      until: periodEnd,
      label: 'This month',
      key: 'month',
      prevSince,
      prevUntil,
    };
  }

  if (period === 'last_month') {
    const { periodStart } = getIstMonthBounds(now);
    const anchor = new Date(periodStart.getTime() - 12 * 60 * 60 * 1000);
    const { periodStart: since, periodEnd: until } = getIstMonthBounds(anchor);
    const prevAnchor = new Date(since.getTime() - 12 * 60 * 60 * 1000);
    const { periodStart: prevSince, periodEnd: prevUntil } =
      getIstMonthBounds(prevAnchor);
    return {
      since,
      until,
      label: 'Last month',
      key: 'last_month',
      prevSince,
      prevUntil,
    };
  }

  const year = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
    }).formatToParts(now).find((p) => p.type === 'year')?.value
  );
  const since = new Date(`${year}-01-01T00:00:00+05:30`);
  const until = new Date(`${year + 1}-01-01T00:00:00+05:30`);
  const prevSince = new Date(`${year - 1}-01-01T00:00:00+05:30`);
  const prevUntil = since;
  return {
    since,
    until,
    label: 'This year',
    key: 'year',
    prevSince,
    prevUntil,
  };
}

function publicDisplayName(rank: number): string {
  return `Player ${rank}`;
}

function publicInitials(rank: number): string {
  return `#${rank}`;
}

function displayHandle(rank: number): string {
  return `@player-${rank}`;
}

function primaryPlatformFromList(platforms: Platform[]): Platform {
  const counts = new Map<Platform, number>();
  for (const p of platforms) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: Platform = 'naukri';
  let bestCount = 0;
  for (const [p, c] of counts) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
    }
  }
  return best;
}

function last7DayKeys(until: Date): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(until.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d)
    );
  }
  return keys;
}

function seriesFromBuckets(
  dayKeys: string[],
  buckets: Array<{ _id: string; value: number }>
): number[] {
  const map = new Map(buckets.map((b) => [b._id, b.value]));
  return dayKeys.map((k) => map.get(k) ?? 0);
}

export async function getLeaderboard(input: {
  period?: LeaderboardPeriod;
  platform?: LeaderboardPlatform;
  currentUserId?: string;
}): Promise<LeaderboardResult> {
  const periodKey = input.period ?? 'month';
  const platform = input.platform ?? 'all';
  const bounds = resolvePeriod(periodKey);
  const platformFilter =
    platform !== 'all' ? { platform } : ({} as Record<string, unknown>);

  const matchCurrent = {
    startedAt: { $gte: bounds.since, $lt: bounds.until },
    ...platformFilter,
  };

  const topRaw = await ScanSessionModel.aggregate<{
    _id: unknown;
    applied: number;
    matched: number;
    scanned: number;
    platformCounts: Platform[];
  }>([
    { $match: matchCurrent },
    {
      $group: {
        _id: '$userId',
        applied: { $sum: '$applied' },
        matched: { $sum: '$matched' },
        scanned: { $sum: '$scanned' },
        platformCounts: { $push: '$platform' },
      },
    },
    { $match: { applied: { $gt: 0 } } },
    { $sort: { applied: -1 } },
    { $limit: LEADERBOARD_LIMIT },
  ]);

  const userIds = topRaw.map((r) => r._id);

  const dayKeys = last7DayKeys(
    bounds.until.getTime() > Date.now() ? new Date() : bounds.until
  );
  const trendSince = new Date(
    new Date(dayKeys[0] + 'T00:00:00+05:30').getTime()
  );
  const trendUntil = new Date(
    new Date(dayKeys[dayKeys.length - 1]! + 'T23:59:59+05:30').getTime() +
      24 * 60 * 60 * 1000
  );

  const [appliedTrends, matchedTrends, scannedTrends, prevTotals] =
    await Promise.all([
      ScanSessionModel.aggregate<{ _id: { userId: unknown; day: string }; value: number }>([
        {
          $match: {
            userId: { $in: userIds },
            startedAt: { $gte: trendSince, $lt: trendUntil },
            ...platformFilter,
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$startedAt',
                  timezone: 'Asia/Kolkata',
                },
              },
            },
            value: { $sum: '$applied' },
          },
        },
      ]),
      ScanSessionModel.aggregate<{ _id: { userId: unknown; day: string }; value: number }>([
        {
          $match: {
            userId: { $in: userIds },
            startedAt: { $gte: trendSince, $lt: trendUntil },
            ...platformFilter,
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$startedAt',
                  timezone: 'Asia/Kolkata',
                },
              },
            },
            value: { $sum: '$matched' },
          },
        },
      ]),
      ScanSessionModel.aggregate<{ _id: { userId: unknown; day: string }; value: number }>([
        {
          $match: {
            userId: { $in: userIds },
            startedAt: { $gte: trendSince, $lt: trendUntil },
            ...platformFilter,
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$startedAt',
                  timezone: 'Asia/Kolkata',
                },
              },
            },
            value: { $sum: '$scanned' },
          },
        },
      ]),
      periodKey === 'all'
        ? Promise.resolve([] as Array<{ _id: unknown; applied: number; matched: number; scanned: number }>)
        : ScanSessionModel.aggregate<{
            _id: unknown;
            applied: number;
            matched: number;
            scanned: number;
          }>([
            {
              $match: {
                userId: { $in: userIds },
                startedAt: { $gte: bounds.prevSince, $lt: bounds.prevUntil },
                ...platformFilter,
              },
            },
            {
              $group: {
                _id: '$userId',
                applied: { $sum: '$applied' },
                matched: { $sum: '$matched' },
                scanned: { $sum: '$scanned' },
              },
            },
          ]),
    ]);

  const prevMap = new Map(
    prevTotals.map((r) => [String(r._id), r] as const)
  );

  function trendsForUser(
    userId: unknown,
    rows: Array<{ _id: { userId: unknown; day: string }; value: number }>
  ): number[] {
    const buckets = rows
      .filter((r) => String(r._id.userId) === String(userId))
      .map((r) => ({ _id: r._id.day, value: r.value }));
    return seriesFromBuckets(dayKeys, buckets);
  }

  const entries: LeaderboardEntry[] = topRaw.map((row, index) => {
    const prev = prevMap.get(String(row._id));
    const rank = index + 1;
    const isYou = input.currentUserId
      ? String(row._id) === input.currentUserId
      : false;
    return {
      rank,
      displayName: publicDisplayName(rank),
      handle: displayHandle(rank),
      initials: publicInitials(rank),
      platform: primaryPlatformFromList(row.platformCounts ?? []),
      applied: row.applied,
      matched: row.matched,
      scanned: row.scanned,
      points: row.applied * 100,
      isYou,
      trends: {
        applied: trendsForUser(row._id, appliedTrends),
        matched: trendsForUser(row._id, matchedTrends),
        scanned: trendsForUser(row._id, scannedTrends),
      },
      change: {
        applied: row.applied - (prev?.applied ?? 0),
        matched: row.matched - (prev?.matched ?? 0),
        scanned: row.scanned - (prev?.scanned ?? 0),
      },
    };
  });

  let currentUserRank: number | null = null;
  if (input.currentUserId) {
    const yours = entries.find((e) => e.isYou);
    if (yours) {
      currentUserRank = yours.rank;
    } else {
      const userTotals = await ScanSessionModel.aggregate<{
        _id: unknown;
        applied: number;
      }>([
        { $match: matchCurrent },
        {
          $group: {
            _id: '$userId',
            applied: { $sum: '$applied' },
          },
        },
        { $match: { applied: { $gt: 0 } } },
        { $sort: { applied: -1 } },
      ]);
      const idx = userTotals.findIndex(
        (r) => String(r._id) === input.currentUserId
      );
      currentUserRank = idx >= 0 ? idx + 1 : null;
    }
  }

  return {
    period: { label: bounds.label, key: bounds.key },
    platform,
    entries,
    currentUserRank,
  };
}
