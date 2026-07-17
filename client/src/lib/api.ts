import type {
  ApiResponse,
  Application,
  AuthTokens,
  User,
} from '@codexcareer/shared';
import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
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
  return (await res.json()) as ApiResponse<T>;
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

export async function fetchApplications(page = 1, limit = 50) {
  return request<{
    items: Application[];
    total: number;
    page: number;
    limit: number;
  }>(`/api/v1/applications?page=${page}&limit=${limit}`);
}
