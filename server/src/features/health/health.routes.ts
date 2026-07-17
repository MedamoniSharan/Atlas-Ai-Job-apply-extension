import { Router } from 'express';
import { ok } from '@codexcareer/shared';
import { isRedisAvailable } from '../../config/redis';
import mongoose from 'mongoose';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json(
    ok({
      status: 'ok',
      mongo: mongoose.connection.readyState === 1 ? 'up' : 'down',
      redis: isRedisAvailable() ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    })
  );
});
