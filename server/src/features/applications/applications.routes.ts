import { Router } from 'express';
import { ok } from '@atlas/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import * as applicationsService from './applications.service';

export const applicationsRouter = Router();

applicationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await applicationsService.listApplications(
      req.user!.sub,
      page,
      limit
    );
    res.json(ok(result));
  })
);
