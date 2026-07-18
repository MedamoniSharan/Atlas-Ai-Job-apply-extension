import { Router } from 'express';
import { jobPreferencesUpdateSchema, ok } from '@atlas/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as preferencesService from './preferences.service';

export const preferencesRouter = Router();

preferencesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const prefs = await preferencesService.getPreferences(req.user!.sub);
    res.json(ok(prefs));
  })
);

preferencesRouter.put(
  '/',
  requireAuth,
  validateBody(jobPreferencesUpdateSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await preferencesService.updatePreferences(
      req.user!.sub,
      req.body
    );
    res.json(
      ok(
        {
          preferences: result.preferences,
          preferencesCompleted: result.preferencesCompleted,
        },
        'Preferences saved'
      )
    );
  })
);
