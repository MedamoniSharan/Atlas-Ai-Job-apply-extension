import type {
  ApiResponse,
  AuthTokens,
  EventEnvelope,
  JobPreferences,
  SyncEventsRequest,
} from '@atlas/shared';
import {
  getAuthState,
  setAuthState,
  clearAuth,
  setCachedPreferences,
} from './storageManager';
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

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

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

export async function syncEvents(
  events: EventEnvelope[]
): Promise<ApiResponse<{ processed: number }>> {
  const body: SyncEventsRequest = { events };
  return request<{ processed: number }>('/api/v1/events/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchPreferences(): Promise<ApiResponse<JobPreferences>> {
  const result = await request<JobPreferences>('/api/v1/preferences');
  if (result.success) {
    await setCachedPreferences(result.data);
  }
  return result;
}

/** Jobs already applied in Atlas DB (shared with dashboard). */
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
    periodStart: string;
    periodEnd: string;
  }>
> {
  return request('/api/v1/billing/me');
}
