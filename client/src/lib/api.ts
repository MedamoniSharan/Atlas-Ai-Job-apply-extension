import type {
  ApiResponse,
  Application,
  AuthTokens,
  JobPreferences,
  OnboardingStatus,
  User,
} from '@atlas/shared';
import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function isAuthFailure(
  status: number,
  body: ApiResponse<unknown> | null
): boolean {
  if (status === 401) return true;
  const code = body?.success === false ? body.error?.code : undefined;
  return code === 'TOKEN_INVALID' || code === 'UNAUTHORIZED';
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = (await res.json()) as ApiResponse<AuthTokens>;
    if (!res.ok || !body.success) {
      return false;
    }
    useAuthStore.getState().setSession({
      accessToken: body.data.accessToken,
      refreshToken: body.data.refreshToken,
      user: body.data.user,
    });
    return true;
  } catch {
    return false;
  }
}

function logout(): void {
  useAuthStore.getState().clearSession();
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  didRetry = false
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
      const refreshed = await refreshSession();
      if (refreshed) {
        return request<T>(path, options, auth, true);
      }
    }
    logout();
  }

  return body as ApiResponse<T>;
}

/** Refresh access token or clear the session when tokens are no longer valid. */
export async function ensureSession(): Promise<boolean> {
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (!accessToken && !refreshToken) return false;

  if (accessToken && !isJwtExpired(accessToken)) {
    return true;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    logout();
    return false;
  }
  return true;
}

function isJwtExpired(token: string, skewSeconds = 30): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as {
      exp?: number;
    };
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

export async function register(
  name: string,
  email: string,
  password: string
) {
  return request<AuthTokens>(
    '/api/v1/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    },
    false
  );
}

export async function login(email: string, password: string) {
  return request<AuthTokens>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false
  );
}

export async function fetchMe() {
  return request<User>('/api/v1/auth/me');
}

export async function fetchOnboardingStatus() {
  return request<OnboardingStatus>('/api/v1/onboarding/status');
}

export async function fetchApplications(page = 1, limit = 50) {
  return request<{
    items: Application[];
    total: number;
    page: number;
    limit: number;
  }>(`/api/v1/applications?page=${page}&limit=${limit}`);
}

export async function fetchPreferences() {
  return request<JobPreferences>('/api/v1/preferences');
}

export async function savePreferences(prefs: JobPreferences) {
  return request<{
    preferences: JobPreferences;
    preferencesCompleted: boolean;
  }>('/api/v1/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}
