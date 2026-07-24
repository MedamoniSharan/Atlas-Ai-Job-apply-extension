import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  googleAuthSchema,
  loginSchema,
  ok,
  refreshTokenSchema,
  registerSchema,
} from '@cosmo/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  requireAuth,
  AuthedRequest,
  verifyAccessToken,
} from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as authService from './auth.service';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many auth attempts — try again later',
    data: null,
    error: { code: 'RATE_LIMITED' },
  },
});

authRouter.use(authLimiter);

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

const logoutBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

authRouter.post(
  '/logout',
  validateBody(logoutBodySchema),
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = verifyAccessToken(authHeader.slice(7));
        await authService.logout(payload.sub);
        res.json(ok({ loggedOut: true }, 'Logged out'));
        return;
      } catch {
        /* fall through */
      }
    }

    if (req.body?.refreshToken) {
      await authService.logoutWithRefreshToken(req.body.refreshToken);
    }

    res.json(ok({ loggedOut: true }, 'Logged out'));
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
