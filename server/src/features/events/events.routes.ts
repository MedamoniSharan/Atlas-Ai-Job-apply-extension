import { Router } from 'express';
import { ok, syncEventsRequestSchema } from '@cosmo/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as eventsService from './events.service';

export const eventsRouter = Router();

eventsRouter.post(
  '/sync',
  requireAuth,
  validateBody(syncEventsRequestSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await eventsService.syncEvents(req.user!.sub, req.body);
    res.json(ok(result, 'Events synced'));
  })
);
