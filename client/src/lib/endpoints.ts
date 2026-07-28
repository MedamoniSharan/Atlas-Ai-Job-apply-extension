/** Deployed Cosmo API (Render). Used for production builds when env is unset. */
export const DEPLOY_API_BASE =
  'https://atlas-ai-job-apply-extension-1.onrender.com';

/** Local API used by `vite` / `npm run dev`. */
export const LOCAL_API_BASE = 'http://localhost:4000';

function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE?.trim();
  if (fromEnv) return fromEnv;
  return import.meta.env.DEV ? LOCAL_API_BASE : DEPLOY_API_BASE;
}

/** HTTP API origin — local in dev, deploy in production builds. */
export const API_BASE = resolveApiBase();

/** Socket.IO origin — follows VITE_SOCKET_URL, else same as API_BASE. */
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL?.trim() || API_BASE;
