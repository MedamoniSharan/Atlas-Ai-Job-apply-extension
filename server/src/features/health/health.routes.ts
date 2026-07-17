import { Router } from 'express';
import { ok } from '@atlas/shared';
import mongoose from 'mongoose';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json(
    ok({
      status: 'ok',
      mongo: mongoose.connection.readyState === 1 ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    })
  );
});
