import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './features/auth/auth.routes';
import { eventsRouter } from './features/events/events.routes';
import { applicationsRouter } from './features/applications/applications.routes';
import { healthRouter } from './features/health/health.routes';
import { onboardingRouter } from './features/onboarding/onboarding.routes';
import { preferencesRouter } from './features/preferences/preferences.routes';

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

  app.use(errorHandler);
  return app;
}
