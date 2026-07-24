import { Router } from 'express';
import { ok, OnboardingStatus, preferencesAreComplete } from '@cosmo/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { UserModel } from '../users/user.model';
import { ApplicationModel } from '../applications/application.model';

export const onboardingRouter = Router();

onboardingRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.sub;
    const [user, applicationCount] = await Promise.all([
      UserModel.findById(userId),
      ApplicationModel.countDocuments({ userId }),
    ]);

    const status: OnboardingStatus = {
      accountCreated: Boolean(user),
      extensionConnected: Boolean(user?.extensionConnectedAt),
      preferencesCompleted:
        Boolean(user?.preferencesCompletedAt) ||
        preferencesAreComplete(user?.preferences),
      hasApplications: applicationCount > 0,
      extensionConnectedAt: user?.extensionConnectedAt?.toISOString(),
    };

    res.json(ok(status));
  })
);
