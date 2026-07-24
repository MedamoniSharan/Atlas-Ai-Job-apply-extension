import { env } from './env';

/**
 * Exact-origin CORS matching only.
 * Bare prefixes like `chrome-extension://` are rejected — list full IDs:
 * `chrome-extension://abcdefghijklmnopqrstuvwxyz123456`
 */
export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (
    env.corsOrigins.some((allowed) => {
      const normalized = allowed.trim().replace(/\/$/, '');
      if (!normalized) return false;
      // Reject incomplete scheme prefixes (e.g. "chrome-extension://")
      if (/^[a-z][a-z0-9+.-]*:\/\/$/i.test(normalized)) return false;
      return origin === normalized || origin === `${normalized}/`;
    })
  ) {
    return true;
  }
  if (env.nodeEnv === 'development') return true;
  return false;
}
