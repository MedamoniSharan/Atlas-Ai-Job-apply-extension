/**
 * Deployed Cosmo API (API Gateway HTTP API, ap-south-2).
 * Override with VITE_API_BASE when needed.
 */
export const DEPLOY_API_BASE =
  'https://shjisr6492.execute-api.ap-south-2.amazonaws.com';

/** Local API used by `vite` / `npm run dev`. */
export const LOCAL_API_BASE = 'http://localhost:4000';

function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE?.trim();
  if (fromEnv) return fromEnv;
  return import.meta.env.DEV ? LOCAL_API_BASE : DEPLOY_API_BASE;
}

/** HTTP API origin — local in dev, deploy in production builds. */
export const API_BASE = resolveApiBase();
