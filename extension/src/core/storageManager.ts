import type { JobPreferences } from '@cosmo/shared';
import { resolveJobPreferences } from './defaults';
import {
  PRODUCTION_API_BASE,
  migrateApiBaseIfNeeded,
  resolveApiBase,
} from './allowedApiBases';

export const DEFAULT_API = PRODUCTION_API_BASE;

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  apiBaseUrl: string;
};

export type ApplyQueueItem = {
  url: string;
  title: string;
  company: string;
  externalJobId?: string;
  location?: string;
  companyLogo?: string;
  description?: string;
  experience?: string;
  salary?: string;
  skills?: string[];
  rating?: string;
  reviews?: string;
  postedAt?: string;
  openings?: string;
  applicants?: string;
  highlights?: string[];
  role?: string;
  industry?: string;
  department?: string;
  employmentType?: string;
  roleCategory?: string;
  education?: string;
  aboutCompany?: string;
};

const KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  apiBaseUrl: 'apiBaseUrl',
  queue: 'eventQueue',
  preferences: 'preferences',
  applyQueue: 'applyQueue',
} as const;

export async function getAuthState(): Promise<AuthState> {
  const data = await chrome.storage.local.get([
    KEYS.accessToken,
    KEYS.refreshToken,
    KEYS.apiBaseUrl,
  ]);
  const apiBaseUrl = migrateApiBaseIfNeeded(
    (data[KEYS.apiBaseUrl] as string | undefined) ?? undefined
  );
  if (apiBaseUrl !== data[KEYS.apiBaseUrl]) {
    await chrome.storage.local.set({ [KEYS.apiBaseUrl]: apiBaseUrl });
  }
  return {
    accessToken: (data[KEYS.accessToken] as string) ?? null,
    refreshToken: (data[KEYS.refreshToken] as string) ?? null,
    apiBaseUrl,
  };
}

export async function setAuthState(
  partial: Partial<AuthState>
): Promise<void> {
  const next: Partial<AuthState> = { ...partial };
  if (partial.apiBaseUrl !== undefined) {
    next.apiBaseUrl = resolveApiBase(partial.apiBaseUrl, DEFAULT_API);
  }
  await chrome.storage.local.set(next);
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([
    KEYS.accessToken,
    KEYS.refreshToken,
  ]);
}

export async function getCachedPreferences(): Promise<JobPreferences> {
  const data = await chrome.storage.local.get(KEYS.preferences);
  return resolveJobPreferences(
    data[KEYS.preferences] as JobPreferences | undefined
  );
}

export async function setCachedPreferences(
  prefs: JobPreferences
): Promise<void> {
  await chrome.storage.local.set({ [KEYS.preferences]: prefs });
}

export async function getApplyQueue(): Promise<ApplyQueueItem[]> {
  const data = await chrome.storage.local.get(KEYS.applyQueue);
  return (data[KEYS.applyQueue] as ApplyQueueItem[] | undefined) ?? [];
}

export async function setApplyQueue(items: ApplyQueueItem[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.applyQueue]: items });
}

export { KEYS };
