import { Router } from 'express';
import { ok, platformSchema } from '@atlas/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import * as applicationsService from './applications.service';
import type { ApplicationBucket } from './applications.service';

export const applicationsRouter = Router();

const BUCKETS = new Set<ApplicationBucket>([
  'all',
  'matched',
  'applied',
  'skipped',
  'company_site',
]);

const SOURCES = new Set(['all', 'manual', 'auto_scan', 'auto_apply']);

applicationsRouter.post(
  '/lookup',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = req.body as {
      externalJobIds?: unknown;
      urls?: unknown;
    };
    const externalJobIds = Array.isArray(body.externalJobIds)
      ? body.externalJobIds.filter((id): id is string => typeof id === 'string')
      : [];
    const urls = Array.isArray(body.urls)
      ? body.urls.filter((u): u is string => typeof u === 'string')
      : [];
    const result = await applicationsService.lookupAppliedJobs(req.user!.sub, {
      externalJobIds,
      urls,
    });
    res.json(ok(result));
  })
);

applicationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 12));
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;

    const bucketRaw =
      typeof req.query.bucket === 'string' ? req.query.bucket : 'all';
    const bucket = BUCKETS.has(bucketRaw as ApplicationBucket)
      ? (bucketRaw as ApplicationBucket)
      : 'all';

    const platformRaw =
      typeof req.query.platform === 'string' ? req.query.platform : 'all';
    const platformParsed = platformSchema.safeParse(platformRaw);
    const platform =
      platformRaw === 'all'
        ? 'all'
        : platformParsed.success
          ? platformParsed.data
          : 'all';

    const sourceRaw =
      typeof req.query.source === 'string' ? req.query.source : 'all';
    const source = SOURCES.has(sourceRaw)
      ? (sourceRaw as 'all' | 'manual' | 'auto_scan' | 'auto_apply')
      : 'all';

    const result = await applicationsService.listApplications(req.user!.sub, {
      page,
      limit,
      q,
      bucket,
      platform,
      source,
    });
    res.json(ok(result));
  })
);
