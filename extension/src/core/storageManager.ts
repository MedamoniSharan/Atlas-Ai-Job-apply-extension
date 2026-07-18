import type { JobPreferences } from '@atlas/shared';
import { DEFAULT_JOB_PREFERENCES } from './defaults';

const DEFAULT_API = 'http://localhost:4000';

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

export type ApplyDayStats = {
  date: string;
  count: number;
};

const KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  apiBaseUrl: 'apiBaseUrl',
  queue: 'eventQueue',
  preferences: 'preferences',
  applyQueue: 'applyQueue',
  applyDayStats: 'applyDayStats',
} as const;

export async function getAuthState(): Promise<AuthState> {
  const data = await chrome.storage.local.get([
    KEYS.accessToken,
    KEYS.refreshToken,
    KEYS.apiBaseUrl,
  ]);
  return {
    accessToken: (data[KEYS.accessToken] as string) ?? null,
    refreshToken: (data[KEYS.refreshToken] as string) ?? null,
    apiBaseUrl: (data[KEYS.apiBaseUrl] as string) ?? DEFAULT_API,
  };
}

export async function setAuthState(
  partial: Partial<AuthState>
): Promise<void> {
  await chrome.storage.local.set(partial);
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([
    KEYS.accessToken,
    KEYS.refreshToken,
  ]);
}

export async function getCachedPreferences(): Promise<JobPreferences> {
  const data = await chrome.storage.local.get(KEYS.preferences);
  return {
    ...DEFAULT_JOB_PREFERENCES,
    ...((data[KEYS.preferences] as JobPreferences | undefined) ?? {}),
  };
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

export async function getApplyDayStats(): Promise<ApplyDayStats> {
  const today = new Date().toISOString().slice(0, 10);
  const data = await chrome.storage.local.get(KEYS.applyDayStats);
  const stats = data[KEYS.applyDayStats] as ApplyDayStats | undefined;
  if (!stats || stats.date !== today) {
    return { date: today, count: 0 };
  }
  return stats;
}

export async function setApplyDayStats(stats: ApplyDayStats): Promise<void> {
  await chrome.storage.local.set({ [KEYS.applyDayStats]: stats });
}

export { KEYS, DEFAULT_API };
