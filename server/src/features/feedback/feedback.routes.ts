import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ok, uninstallFeedbackSubmitSchema } from '@cosmo/shared';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import * as feedbackService from './feedback.service';

export const feedbackRouter = Router();

const uninstallLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]?.trim();
  return req.ip;
}

feedbackRouter.post(
  '/uninstall',
  uninstallLimiter,
  asyncHandler(async (req, res) => {
    const parsed = uninstallFeedbackSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await feedbackService.submitUninstallFeedback(
      parsed.data,
      clientIp(req)
    );
    res.json(ok(data, 'Thanks for your feedback'));
  })
);
