import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@cosmo/shared';
import { env } from '../config/env';
import { AppError } from './errorHandler';

export interface AuthPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'],
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
