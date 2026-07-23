import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import {
  AuthTokens,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  User,
  type UserRole,
  type UserStatus,
} from '@atlas/shared';
import { env } from '../../config/env';
import { UserModel } from '../users/user.model';
import { AppError } from '../../middleware/errorHandler';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../middleware/auth';

const googleOAuthClient = new OAuth2Client(
  env.googleClientId,
  env.googleClientSecret,
  'postmessage'
);

function isAdminEmail(email: string): boolean {
  return env.adminEmails.includes(email.toLowerCase());
}

function toUser(doc: {
  _id: { toString(): string };
  email: string;
  name: string;
  role?: UserRole;
  status?: UserStatus;
  plan?: 'free' | 'pro' | 'max';
  planExpiresAt?: Date | null;
  createdAt?: Date;
  extensionConnectedAt?: Date;
}): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    role: doc.role ?? 'user',
    status: doc.status ?? 'active',
    plan: doc.plan ?? 'free',
    planExpiresAt: doc.planExpiresAt?.toISOString(),
    createdAt: doc.createdAt?.toISOString(),
    extensionConnectedAt: doc.extensionConnectedAt?.toISOString(),
  };
}

async function ensureAdminRole(user: {
  _id: { toString(): string };
  email: string;
  role?: UserRole;
  save?: () => Promise<unknown>;
}): Promise<UserRole> {
  if (isAdminEmail(user.email) && user.role !== 'admin') {
    await UserModel.findByIdAndUpdate(user._id, { role: 'admin' });
    return 'admin';
  }
  return user.role ?? 'user';
}

async function issueTokens(user: {
  _id: { toString(): string };
  email: string;
  name: string;
  role?: UserRole;
  status?: UserStatus;
  plan?: 'free' | 'pro' | 'max';
  planExpiresAt?: Date | null;
  createdAt?: Date;
  extensionConnectedAt?: Date;
  toObject?: () => Record<string, unknown>;
}): Promise<AuthTokens> {
  if (user.status === 'suspended') {
    throw new AppError('Account suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const role = await ensureAdminRole(user);
  const payload = {
    sub: user._id.toString(),
    email: user.email,
    role,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await UserModel.findByIdAndUpdate(user._id, { refreshTokenHash, role });
  return {
    accessToken,
    refreshToken,
    user: toUser({
      _id: user._id,
      email: user.email,
      name: user.name,
      role,
      status: user.status,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
      createdAt: user.createdAt,
      extensionConnectedAt: user.extensionConnectedAt,
    }),
  };
}

export async function register(input: RegisterInput): Promise<AuthTokens> {
  const email = input.email.toLowerCase();
  if (!isAdminEmail(email)) {
    throw new AppError(
      'Account creation is via Google sign-in',
      403,
      'USE_GOOGLE_SIGN_IN'
    );
  }

  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await UserModel.create({
    email,
    passwordHash,
    name: input.name,
    role: 'admin',
  });

  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  const user = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.passwordHash) {
    throw new AppError(
      'This account uses Google sign-in. Continue with Google instead.',
      401,
      'USE_GOOGLE_SIGN_IN'
    );
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (user.role !== 'admin' && !isAdminEmail(user.email)) {
    throw new AppError(
      'Password sign-in is for admins only. Continue with Google instead.',
      403,
      'USE_GOOGLE_SIGN_IN'
    );
  }

  return issueTokens(user);
}

export async function loginWithGoogle(input: GoogleAuthInput): Promise<AuthTokens> {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new AppError('Google sign-in is not configured', 503, 'GOOGLE_NOT_CONFIGURED');
  }

  let idToken: string | null | undefined;
  try {
    const { tokens } = await googleOAuthClient.getToken(input.code);
    idToken = tokens.id_token;
  } catch {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_AUTH_FAILED');
  }

  if (!idToken) {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_AUTH_FAILED');
  }

  let payload;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_AUTH_FAILED');
  }

  const googleId = payload?.sub;
  const email = payload?.email?.toLowerCase();
  const emailVerified = payload?.email_verified;
  const name =
    payload?.name?.trim() ||
    [payload?.given_name, payload?.family_name].filter(Boolean).join(' ').trim() ||
    email?.split('@')[0] ||
    'Google user';

  if (!googleId || !email || !emailVerified) {
    throw new AppError(
      'Google account email is not verified',
      401,
      'GOOGLE_AUTH_FAILED'
    );
  }

  if (isAdminEmail(email)) {
    throw new AppError(
      'Admin accounts must sign in with email and password at /admin/login',
      403,
      'USE_PASSWORD_SIGN_IN'
    );
  }

  let user = await UserModel.findOne({
    $or: [{ googleId }, { email }],
  });

  if (user?.role === 'admin') {
    throw new AppError(
      'Admin accounts must sign in with email and password at /admin/login',
      403,
      'USE_PASSWORD_SIGN_IN'
    );
  }

  if (user) {
    if (user.googleId && user.googleId !== googleId) {
      throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
    }
    if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }
  } else {
    user = await UserModel.create({
      email,
      googleId,
      name,
      role: isAdminEmail(email) ? 'admin' : 'user',
    });
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
  const role = await ensureAdminRole(user);
  return toUser({
    _id: user._id,
    email: user.email,
    name: user.name,
    role,
    status: user.status,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
    createdAt: user.createdAt,
    extensionConnectedAt: user.extensionConnectedAt,
  });
}
