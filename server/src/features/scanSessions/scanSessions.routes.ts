import { Router } from 'express';
import { ok, scanSessionUpsertSchema, scanStatsQuerySchema } from '@cosmo/shared';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as scanSessionsService from './scanSessions.service';

export const scanSessionsRouter = Router();

scanSessionsRouter.post(
  '/',
  requireAuth,
  validateBody(scanSessionUpsertSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const session = await scanSessionsService.upsertScanSession(
      req.user!.sub,
      req.body
    );
    res.json(ok(session, 'Scan session saved'));
  })
);

scanSessionsRouter.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = scanStatsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const stats = await scanSessionsService.getScanStats(
      req.user!.sub,
      parsed.data
    );
    res.json(ok(stats));
  })
);
