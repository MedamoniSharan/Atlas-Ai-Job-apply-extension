declare const __EXTENSION_API_ORIGIN__: string | undefined;
declare const __EXTENSION_WEB_ORIGIN__: string | undefined;

/**
 * Deployed Cosmo API (API Gateway HTTP API, ap-south-2).
 */
export const PRODUCTION_API_BASE =
  'https://shjisr6492.execute-api.ap-south-2.amazonaws.com';

/** Previous Render host — kept allow-listed during cutover overlap. */
export const LEGACY_RENDER_API_BASE =
  'https://atlas-ai-job-apply-extension-1.onrender.com';
/** Deployed Cosmo web app. */
export const PRODUCTION_WEB_BASE = 'https://www.cosmovai.in';

/**
 * API bases the extension may call. Built-in localhost for local/dev
 * plus the production API; release builds can inject more via
 * EXTENSION_API_ORIGIN (include the API Gateway URL when live).
 */
const BUILTIN = [
  PRODUCTION_API_BASE,
  LEGACY_RENDER_API_BASE,
  'http://localhost:4000',
  'http://127.0.0.1:4000',
] as const;

function injectedOrigins(): string[] {
  try {
    const raw =
      typeof __EXTENSION_API_ORIGIN__ === 'string'
        ? __EXTENSION_API_ORIGIN__
        : '';
    return raw
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function injectedWebOrigins(): string[] {
  try {
    const raw =
      typeof __EXTENSION_WEB_ORIGIN__ === 'string'
        ? __EXTENSION_WEB_ORIGIN__
        : '';
    return raw
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function isAllowedApiBase(url: string): boolean {
  const normalized = normalizeApiBase(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (/\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/i.test(parsed.hostname)) {
      const allow = new Set([...BUILTIN, ...injectedOrigins()]);
      if (allow.has(normalized)) return true;
      for (const origin of injectedOrigins()) {
        try {
          if (new URL(origin).hostname === parsed.hostname) return true;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    return false;
  }
  const allow = new Set([...BUILTIN, ...injectedOrigins()]);
  return allow.has(normalized);
}

export function resolveApiBase(
  url: string | undefined,
  fallback: string
): string {
  const candidate = normalizeApiBase(url || fallback);
  if (isAllowedApiBase(candidate)) return candidate;
  const safeFallback = normalizeApiBase(fallback);
  if (isAllowedApiBase(safeFallback)) return safeFallback;
  return BUILTIN[0];
}

/**
 * If storage still points at Render, rewrite to the current production API
 * (API Gateway). Also prefer an injected non-Render origin when present.
 */
export function migrateApiBaseIfNeeded(stored: string | undefined): string {
  const injected = injectedOrigins().filter(
    (o) =>
      /^https:\/\//i.test(o) &&
      !/onrender\.com/i.test(o) &&
      isAllowedApiBase(o)
  );
  const current = normalizeApiBase(stored || '');

  // Always leave Render behind once Gateway is the production default.
  if (!current || /onrender\.com/i.test(current)) {
    return injected[0] || PRODUCTION_API_BASE;
  }

  if (injected.length) {
    return resolveApiBase(current, injected[0]!);
  }
  return resolveApiBase(current, PRODUCTION_API_BASE);
}

const LOCAL_WEB_BASE = 'http://localhost:5173';

function isLocalOrigin(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

/**
 * Dashboard origin used for Google sign-in. Prefers an injected production
 * web origin when the API is remote; otherwise local Vite.
 * Production fallback is always https://www.cosmovai.in.
 */
export function resolveWebBase(apiBaseUrl: string): string {
  const injected = injectedWebOrigins();
  if (isLocalOrigin(apiBaseUrl)) {
    return (
      injected.find((origin) => isLocalOrigin(origin)) || LOCAL_WEB_BASE
    );
  }
  return (
    injected.find((origin) => !isLocalOrigin(origin)) ||
    PRODUCTION_WEB_BASE
  );
}

/** Opens Cosmo login; after auth the web app navigates to /dashboard. */
export function googleLoginUrl(apiBaseUrl: string): string {
  const web = resolveWebBase(apiBaseUrl).replace(/\/$/, '');
  return `${web}/login?next=${encodeURIComponent('/dashboard')}`;
}
