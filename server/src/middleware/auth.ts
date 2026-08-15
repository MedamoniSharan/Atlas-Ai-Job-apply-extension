import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@cosmo/shared';
import { env } from '../config/env';
import { AppError } from './errorHandler';

export interface AuthPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Present when an admin is viewing the app as this user. */
  impersonatedBy?: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function signAccessToken(
  payload: AuthPayload,
  expiresIn?: jwt.SignOptions['expiresIn']
): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: (expiresIn ??
      env.jwtAccessExpiresIn) as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret) as AuthPayload & {
    role?: UserRole;
  };
  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role ?? 'user',
    ...(typeof payload.impersonatedBy === 'string' && payload.impersonatedBy
      ? { impersonatedBy: payload.impersonatedBy }
      : {}),
  };
}

export function verifyRefreshToken(token: string): AuthPayload {
  const payload = jwt.verify(token, env.jwtRefreshSecret) as AuthPayload & {
    role?: UserRole;
  };
  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role ?? 'user',
  };
}

export function requireAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
  }

  try {
    const token = header.slice(7);
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401, 'TOKEN_INVALID'));
  }
}

/** Attach user when a valid token is present; never reject missing/invalid tokens. */
export function optionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next();
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
  } catch {
    // Public routes ignore bad tokens.
  }
  next();
}

export function requireAdmin(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
  }
  if (req.user.role !== 'admin') {
    return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
  }
  next();
}
