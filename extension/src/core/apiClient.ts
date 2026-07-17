import type {
  ApiResponse,
  AuthTokens,
  EventEnvelope,
  SyncEventsRequest,
} from '@atlas/shared';
import { getAuthState, setAuthState, clearAuth } from './storageManager';
import { logger } from './logger';

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
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

  const body = (await res.json()) as ApiResponse<T>;
  return body;
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
  const { refreshToken } = await getAuthState();
  if (!refreshToken) return false;

  const result = await request<AuthTokens>(
    '/api/v1/auth/refresh',
    {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    },
    false
  );

  if (!result.success) {
    await clearAuth();
    return false;
  }

  await setAuthState({
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
  });
  return true;
}

export async function syncEvents(
  events: EventEnvelope[]
): Promise<ApiResponse<{ processed: number }>> {
  const body: SyncEventsRequest = { events };
  let result = await request<{ processed: number }>('/api/v1/events/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!result.success && result.error?.code === 'TOKEN_INVALID') {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      result = await request<{ processed: number }>('/api/v1/events/sync', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
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
