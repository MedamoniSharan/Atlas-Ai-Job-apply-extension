import type {
  ApiResponse,
  AuthTokens,
  EventEnvelope,
  JobPreferences,
  ScanSession,
  ScanSessionUpsert,
  SyncEventsRequest,
  SyncEventsResult,
} from '@cosmo/shared';
import {
  getAuthState,
  setAuthState,
  clearAuth,
  getCachedPreferences,
  hasCachedPreferences,
  setCachedPreferences,
} from './storageManager';
import { resolveJobPreferences } from './defaults';
import { logger } from './logger';

function isAuthFailure(
  status: number,
  body: ApiResponse<unknown> | null
): boolean {
  if (status === 401) return true;
  const code = body?.success === false ? body.error?.code : undefined;
  return code === 'TOKEN_INVALID' || code === 'UNAUTHORIZED';
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  didRetry = false
): Promise<ApiResponse<T>> {
  const { accessToken, apiBaseUrl } = await getAuthState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Network request failed';
    logger.warn('Network request failed', { path, error: message });
    return {
      success: false,
      message,
      data: null,
      error: { code: 'NETWORK' },
    };
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    body = {
      success: false,
      message: 'Invalid server response',
      data: null,
      error: { code: 'BAD_RESPONSE' },
    };
  }

  if (auth && isAuthFailure(res.status, body)) {
    if (!didRetry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request<T>(path, options, auth, true);
      }
    }
    await clearAuth();
    logger.warn('Session cleared after auth failure', { path });
  }

  return body as ApiResponse<T>;
}

export async function login(
  email: string,
  password: string
): Promise<ApiResponse<AuthTokens>> {
  const result = await request<AuthTokens>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false
  );

  if (result.success) {
    await setAuthState({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
    });
  }
  return result;
}

export async function refreshAccessToken(): Promise<boolean> {
  const { refreshToken, apiBaseUrl } = await getAuthState();
  if (!refreshToken) {
    await clearAuth();
    return false;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const result = (await res.json()) as ApiResponse<AuthTokens>;

    if (!res.ok || !result.success) {
      await clearAuth();
      return false;
    }

    await setAuthState({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
    });
    return true;
  } catch (error) {
    logger.warn('Token refresh failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await clearAuth();
    return false;
  }
}

/** Per-event fields are absent when talking to a server older than this build. */
type SyncEventsBody = Partial<SyncEventsResult> & { processed: number };

export async function syncEvents(
  events: EventEnvelope[]
): Promise<ApiResponse<SyncEventsBody>> {
  const body: SyncEventsRequest = { events };
  return request<SyncEventsBody>('/api/v1/events/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Upsert by `sessionId` — safe to call repeatedly as a run progresses. */
export async function postScanSession(
  input: ScanSessionUpsert
): Promise<ApiResponse<ScanSession>> {
  return request<ScanSession>('/api/v1/scan-sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

const PREF_FETCH_ATTEMPTS = 3;
const PREF_RETRY_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePrefFailure(result: ApiResponse<unknown>): boolean {
  const code = result.success === false ? result.error?.code : undefined;
  return code !== 'TOKEN_INVALID' && code !== 'UNAUTHORIZED';
}

export async function fetchPreferences(): Promise<ApiResponse<JobPreferences>> {
  let last: ApiResponse<JobPreferences> | null = null;
  for (let attempt = 0; attempt < PREF_FETCH_ATTEMPTS; attempt++) {
    last = await request<JobPreferences>('/api/v1/preferences');
    if (last.success) {
      const data = resolveJobPreferences(last.data);
      await setCachedPreferences(data);
      return { ...last, data };
    }
    if (!isRetryablePrefFailure(last) || attempt === PREF_FETCH_ATTEMPTS - 1) {
      break;
    }
    await sleep(PREF_RETRY_DELAY_MS * (attempt + 1));
  }
  return (
    last ?? {
      success: false,
      message: 'Could not load preferences',
      data: null,
      error: { code: 'NETWORK' },
    }
  );
}

export type PreferencesSource = 'remote' | 'cache' | 'defaults';

export type PreferencesLoadResult = {
  preferences: JobPreferences;
  source: PreferencesSource;
  error?: string;
};

/** Remote prefs when possible; never throws — falls back to the local cache. */
export async function loadPreferencesResult(): Promise<PreferencesLoadResult> {
  try {
    const remote = await fetchPreferences();
    if (remote.success) {
      return { preferences: remote.data, source: 'remote' };
    }
    const cached = await hasCachedPreferences();
    return {
      preferences: await getCachedPreferences(),
      source: cached ? 'cache' : 'defaults',
      error: remote.message || 'Could not load preferences',
    };
  } catch (error) {
    const cached = await hasCachedPreferences();
    return {
      preferences: await getCachedPreferences(),
      source: cached ? 'cache' : 'defaults',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function loadPreferences(): Promise<JobPreferences> {
  const result = await loadPreferencesResult();
  if (result.source !== 'remote') {
    logger.warn('Preferences fetch failed; using cache', {
      source: result.source,
      message: result.error,
    });
  }
  return result.preferences;
}

/** Jobs already applied in Cosmo DB (shared with dashboard). */
export async function lookupAppliedJobs(input: {
  externalJobIds?: string[];
  urls?: string[];
}): Promise<ApiResponse<{ externalJobIds: string[]; urls: string[] }>> {
  return request<{ externalJobIds: string[]; urls: string[] }>(
    '/api/v1/applications/lookup',
    {
      method: 'POST',
      body: JSON.stringify({
        externalJobIds: input.externalJobIds ?? [],
        urls: input.urls ?? [],
      }),
    }
  );
}

export async function savePreferences(
  prefs: JobPreferences
): Promise<ApiResponse<JobPreferences>> {
  const result = await request<{
    preferences: JobPreferences;
    preferencesCompleted: boolean;
  }>('/api/v1/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
  if (result.success) {
    await setCachedPreferences(result.data.preferences);
    return {
      success: true,
      message: result.message,
      data: result.data.preferences,
      error: null,
    };
  }
  return result;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await request<{ status: string }>(
      '/api/v1/health',
      {},
      false
    );
    return result.success && result.data.status === 'ok';
  } catch (error) {
    logger.warn('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function fetchBillingMe(): Promise<
  ApiResponse<{
    plan: 'free' | 'pro' | 'max';
    planExpiresAt: string | null;
    appliesUsed: number;
    appliesLimit: number;
    appliesHourUsed: number;
    appliesHourLimit: number;
    appliesDayUsed: number;
    appliesDayLimit: number;
    periodStart: string;
    periodEnd: string;
  }>
> {
  return request('/api/v1/billing/me');
}
