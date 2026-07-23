import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ok } from '@atlas/shared';
import { env } from './config/env';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { authRouter } from './features/auth/auth.routes';
import { eventsRouter } from './features/events/events.routes';
import { applicationsRouter } from './features/applications/applications.routes';
import { healthRouter } from './features/health/health.routes';
import { onboardingRouter } from './features/onboarding/onboarding.routes';
import { preferencesRouter } from './features/preferences/preferences.routes';
import { billingRouter } from './features/billing/billing.routes';
import { adminRouter } from './features/admin/admin.routes';
import * as billingService from './features/billing/billing.service';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          env.corsOrigins.some(
            (o) =>
              origin === o || (o.endsWith('://') && origin.startsWith(o))
          )
        ) {
          return callback(null, true);
        }
        if (env.nodeEnv === 'development') return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  // Razorpay webhooks need raw body for signature verification
  app.post(
    '/api/v1/billing/webhooks/razorpay',
    express.raw({ type: 'application/json' }),
    asyncHandler(async (req, res) => {
      const signature = req.headers['x-razorpay-signature'];
      const raw =
        req.body instanceof Buffer
          ? req.body
          : Buffer.from(JSON.stringify(req.body ?? {}));
      const data = await billingService.handleRazorpayWebhook(
        raw,
        typeof signature === 'string' ? signature : undefined
      );
      res.json(ok(data, 'Webhook processed'));
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/events', eventsRouter);
  app.use('/api/v1/applications', applicationsRouter);
  app.use('/api/v1/onboarding', onboardingRouter);
  app.use('/api/v1/preferences', preferencesRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use(errorHandler);
  return app;
}
