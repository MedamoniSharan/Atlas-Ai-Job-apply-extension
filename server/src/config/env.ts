import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const DEFAULT_JWT_ACCESS = 'dev-access-secret-change-me';
const DEFAULT_JWT_REFRESH = 'dev-refresh-secret-change-me';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/cosmo',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? DEFAULT_JWT_ACCESS,
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ?? DEFAULT_JWT_REFRESH,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // Exact origins only — include full chrome-extension://<id> after packing.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
};

/** Refuse to boot in production with insecure default JWT secrets. */
export function assertSecureEnv(): void {
  if (env.nodeEnv !== 'production') return;

  const weakAccess =
    !process.env.JWT_ACCESS_SECRET ||
    env.jwtAccessSecret === DEFAULT_JWT_ACCESS ||
    env.jwtAccessSecret.length < 32;
  const weakRefresh =
    !process.env.JWT_REFRESH_SECRET ||
    env.jwtRefreshSecret === DEFAULT_JWT_REFRESH ||
    env.jwtRefreshSecret.length < 32;

  if (weakAccess || weakRefresh) {
    throw new Error(
      'Refusing to start: set strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (min 32 chars) in production'
    );
  }

  if (
    env.corsOrigins.some((o) => /^[a-z][a-z0-9+.-]*:\/\/$/i.test(o.trim()))
  ) {
    throw new Error(
      'Refusing to start: CORS_ORIGINS must list exact origins (e.g. chrome-extension://<id>), not bare prefixes'
    );
  }
}
