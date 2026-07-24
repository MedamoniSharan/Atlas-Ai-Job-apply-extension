declare const __EXTENSION_API_ORIGIN__: string | undefined;
declare const __EXTENSION_WEB_ORIGIN__: string | undefined;

/** Deployed Cosmo API (Render). */
export const PRODUCTION_API_BASE =
  'https://atlas-ai-job-apply-extension-1.onrender.com';

/**
 * API bases the extension may call. Built-in localhost for local/dev
 * plus the production API; release builds can inject more via
 * EXTENSION_API_ORIGIN.
 */
const BUILTIN = [
  PRODUCTION_API_BASE,
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
