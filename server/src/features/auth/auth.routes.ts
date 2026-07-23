import { Router } from 'express';
import {
  googleAuthSchema,
  loginSchema,
  ok,
  refreshTokenSchema,
  registerSchema,
} from '@atlas/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as authService from './auth.service';

export const authRouter = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.register(req.body);
    res.status(201).json(ok(tokens, 'Registered successfully'));
  })
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.login(req.body);
    res.json(ok(tokens, 'Logged in successfully'));
  })
);

authRouter.post(
  '/google',
  validateBody(googleAuthSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.loginWithGoogle(req.body);
    res.json(ok(tokens, 'Logged in successfully'));
  })
);

authRouter.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.json(ok(tokens, 'Token refreshed'));
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await authService.me(req.user!.sub);
    res.json(ok(user));
  })
);
