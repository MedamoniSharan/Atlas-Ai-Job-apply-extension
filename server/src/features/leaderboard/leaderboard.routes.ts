import { Router } from 'express';
import { ok } from '@cosmo/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { optionalAuth, AuthedRequest } from '../../middleware/auth';
import * as leaderboardService from './leaderboard.service';
import type {
  LeaderboardPeriod,
  LeaderboardPlatform,
} from './leaderboard.service';

export const leaderboardRouter = Router();

const PERIODS = new Set<LeaderboardPeriod>([
  'month',
  'last_month',
  'year',
  'all',
]);

const PLATFORMS = new Set<LeaderboardPlatform>([
  'all',
  'naukri',
  'linkedin',
  'foundit',
  'indeed',
  'wellfound',
  'internshala',
  'unknown',
]);

leaderboardRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const periodRaw =
      typeof req.query.period === 'string' ? req.query.period : 'month';
    const platformRaw =
      typeof req.query.platform === 'string' ? req.query.platform : 'all';

    const period = PERIODS.has(periodRaw as LeaderboardPeriod)
      ? (periodRaw as LeaderboardPeriod)
      : 'month';
    const platform = PLATFORMS.has(platformRaw as LeaderboardPlatform)
      ? (platformRaw as LeaderboardPlatform)
      : 'all';

    const data = await leaderboardService.getLeaderboard({
      period,
      platform,
      currentUserId: req.user?.sub,
    });
    res.json(ok(data));
  })
);
