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

export async function loginWithGoogle(code: string) {
  return request<AuthTokens>(
    '/api/v1/auth/google',
    {
      method: 'POST',
      body: JSON.stringify({ code }),
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

export type ApplicationsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  bucket?: 'all' | 'matched' | 'applied' | 'skipped' | 'company_site';
  platform?: string;
  source?: 'all' | 'manual' | 'auto_scan' | 'auto_apply';
};

export async function fetchApplications(params: ApplicationsQuery = {}) {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 12));
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.bucket && params.bucket !== 'all') {
    search.set('bucket', params.bucket);
  }
  if (params.platform && params.platform !== 'all') {
    search.set('platform', params.platform);
  }
  if (params.source && params.source !== 'all') {
    search.set('source', params.source);
  }

  return request<{
    items: Application[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`/api/v1/applications?${search.toString()}`);
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

export type PaidPlan = 'pro' | 'max';

export async function createBillingOrder(plan: PaidPlan) {
  return request<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    plan: PaidPlan;
  }>('/api/v1/billing/create-order', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function verifyBillingPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: PaidPlan;
}) {
  return request<{
    paymentId: string;
    plan: PaidPlan;
    planExpiresAt: string;
    invoiceUrl: string;
    invoiceNumber: string;
  }>('/api/v1/billing/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createSubscription(plan: PaidPlan) {
  return request<{
    subscriptionId: string;
    localSubscriptionId: string;
    keyId: string;
    plan: PaidPlan;
    amountPaise: number;
  }>('/api/v1/billing/subscribe', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function verifySubscription(payload: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
  plan: PaidPlan;
}) {
  return request<{
    paymentId: string;
    subscriptionId: string;
    plan: PaidPlan;
    planExpiresAt: string;
    invoiceUrl: string;
    invoiceNumber: string;
  }>('/api/v1/billing/verify-subscription', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelSubscription(immediate = false) {
  return request<{
    subscriptionId: string;
    cancelAtPeriodEnd: boolean;
    status: string;
    planExpiresAt: string | null;
  }>('/api/v1/billing/cancel', {
    method: 'POST',
    body: JSON.stringify({ immediate }),
  });
}

export async function fetchBillingMe() {
  return request<{
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
    subscription: {
      id: string;
      tier: PaidPlan;
      status: string;
      source: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      razorpaySubscriptionId?: string;
    } | null;
    payments: Array<{
      id: string;
      plan: PaidPlan;
      amountPaise: number;
      currency: string;
      invoiceNumber?: string;
      invoiceUrl: string;
      paidAt?: string;
    }>;
  }>('/api/v1/billing/me');
}

// ─── Admin API ───────────────────────────────────────────────

export async function fetchAdminMetrics(days = 30) {
  return request<{
    kpis: {
      totalUsers: number;
      newUsers7: number;
      newUsers30: number;
      activePaid: number;
      mrrPaise: number;
      revenueMtdPaise: number;
      revenueYtdPaise: number;
      failedPayments: number;
      churnCancels: number;
    };
    series: {
      revenueDaily: Array<{ date: string; amountPaise: number; count: number }>;
      signupsDaily: Array<{ date: string; count: number }>;
      planMix: Array<{ tier: string; count: number }>;
      paymentOutcomes: Array<{ status: string; count: number }>;
      subsByTier: Array<{ tier: string; count: number }>;
    };
    lists: {
      recentPayments: Array<{
        id: string;
        plan: string;
        amountPaise: number;
        paidAt?: string;
        userName?: string;
        userEmail?: string;
      }>;
      expiringSoon: Array<{
        id: string;
        tier: string;
        currentPeriodEnd: string | null;
        userName?: string;
        userEmail?: string;
      }>;
      haltedSubs: Array<{
        id: string;
        tier: string;
        updatedAt?: string;
        userName?: string;
        userEmail?: string;
      }>;
    };
  }>(`/api/v1/admin/metrics?days=${days}`);
}

export async function fetchAdminUsers(params: {
  q?: string;
  plan?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.plan) search.set('plan', params.plan);
  if (params.role) search.set('role', params.role);
  if (params.status) search.set('status', params.status);
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 20));
  return request<{
    items: Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      plan: string;
      planExpiresAt: string | null;
      extensionConnectedAt: string | null;
      createdAt?: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`/api/v1/admin/users?${search}`);
}

export async function fetchAdminUser(id: string) {
  return request<Record<string, unknown>>(`/api/v1/admin/users/${id}`);
}

export async function patchAdminUser(
  id: string,
  body: { name?: string; role?: string; status?: string }
) {
  return request(`/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function setAdminUserPlan(
  id: string,
  body: { action: 'grant' | 'extend' | 'revoke'; plan?: PaidPlan; days?: number }
) {
  return request(`/api/v1/admin/users/${id}/plan`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchAdminSubscriptions(params: {
  status?: string;
  tier?: string;
  page?: number;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.tier) search.set('tier', params.tier);
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 20));
  return request<{
    items: Array<{
      id: string;
      userId: string;
      userName?: string;
      userEmail?: string;
      tier: string;
      status: string;
      source: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      razorpaySubscriptionId?: string;
      createdAt?: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`/api/v1/admin/subscriptions?${search}`);
}

export async function cancelAdminSubscription(id: string, immediate = false) {
  return request(
    `/api/v1/admin/subscriptions/${id}/cancel?immediate=${immediate ? '1' : '0'}`,
    { method: 'POST', body: '{}' }
  );
}

export async function extendAdminSubscription(id: string, days: number) {
  return request(`/api/v1/admin/subscriptions/${id}/extend`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

export async function fetchAdminPayments(params: {
  status?: string;
  plan?: string;
  page?: number;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.plan) search.set('plan', params.plan);
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 20));
  return request<{
    items: Array<{
      id: string;
      userId: string;
      userName?: string;
      userEmail?: string;
      plan: string;
      amountPaise: number;
      currency: string;
      status: string;
      type: string;
      invoiceNumber?: string;
      razorpayPaymentId?: string;
      createdAt?: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`/api/v1/admin/payments?${search}`);
}

export async function reconcileAdminPayment(id: string) {
  return request(`/api/v1/admin/payments/${id}/reconcile`, {
    method: 'POST',
    body: '{}',
  });
}

export async function fetchAdminPlans() {
  return request<
    Array<{
      tier: string;
      name: string;
      description: string;
      amountPaise: number;
      limits: {
        monthlyApplies: number;
        monthlyScans: number;
        appliesPerHour: number;
        appliesPerDay: number;
      };
      razorpayPlanId: string | null;
      active: boolean;
    }>
  >('/api/v1/admin/plans');
}

export async function updateAdminPlan(
  tier: string,
  body: Record<string, unknown>
) {
  return request(`/api/v1/admin/plans/${tier}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function fetchAdminAudit(page = 1, limit = 40) {
  return request<{
    items: Array<{
      id: string;
      action: string;
      targetType: string;
      targetId?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      ip?: string;
      adminName?: string;
      adminEmail?: string;
      createdAt?: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`/api/v1/admin/audit?page=${page}&limit=${limit}`);
}

export async function fetchInvoiceBlob(
  paymentId: string,
  mode: 'inline' | 'attachment' = 'attachment'
): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const qs = mode === 'inline' ? '?inline=1' : '';
  const res = await fetch(
    `${API_BASE}/api/v1/billing/invoices/${paymentId}${qs}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!res.ok) {
    throw new Error('Failed to load invoice');
  }
  return res.blob();
}

export async function downloadInvoice(paymentId: string): Promise<void> {
  const blob = await fetchInvoiceBlob(paymentId, 'attachment');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cosmo-invoice-${paymentId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function previewInvoice(paymentId: string): Promise<string> {
  const blob = await fetchInvoiceBlob(paymentId, 'inline');
  return URL.createObjectURL(blob);
}
