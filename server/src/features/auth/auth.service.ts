import bcrypt from 'bcryptjs';
import {
  AuthTokens,
  LoginInput,
  RegisterInput,
  User,
} from '@atlas/shared';
import { UserModel } from '../users/user.model';
import { AppError } from '../../middleware/errorHandler';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../middleware/auth';

function toUser(doc: {
  _id: { toString(): string };
  email: string;
  name: string;
  plan?: 'free' | 'pro' | 'max';
  planExpiresAt?: Date | null;
  createdAt?: Date;
  extensionConnectedAt?: Date;
}): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    plan: doc.plan ?? 'free',
    planExpiresAt: doc.planExpiresAt?.toISOString(),
    createdAt: doc.createdAt?.toISOString(),
    extensionConnectedAt: doc.extensionConnectedAt?.toISOString(),
  };
}

async function issueTokens(user: {
  _id: { toString(): string };
  email: string;
  name: string;
  plan?: 'free' | 'pro' | 'max';
  planExpiresAt?: Date | null;
  createdAt?: Date;
}): Promise<AuthTokens> {
  const payload = { sub: user._id.toString(), email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await UserModel.findByIdAndUpdate(user._id, { refreshTokenHash });
  return { accessToken, refreshToken, user: toUser(user) };
}

export async function register(input: RegisterInput): Promise<AuthTokens> {
  const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await UserModel.create({
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name,
  });

  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  const user = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  return issueTokens(user);
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');
  }

  const user = await UserModel.findById(payload.sub);
  if (!user?.refreshTokenHash) {
    throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');
  }

  const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!match) {
    throw new AppError('Invalid refresh token', 401, 'TOKEN_INVALID');
  }

  return issueTokens(user);
}

export async function me(userId: string): Promise<User> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return toUser(user);
}
