import type { PlanTier } from '@atlas/shared';
import { fetchBillingMe } from './apiClient';

export type ApplyQuotaSnapshot = {
  plan: PlanTier;
  monthUsed: number;
  monthLimit: number;
  monthRemaining: number;
  hourUsed: number;
  hourLimit: number;
  hourRemaining: number;
  dayUsed: number;
  dayLimit: number;
  dayRemaining: number;
};

type CacheEntry = {
  quota: ApplyQuotaSnapshot;
  at: number;
};

const CACHE_MS = 15_000;
let cache: CacheEntry | null = null;

function toSnapshot(data: {
  plan: PlanTier;
  appliesUsed: number;
  appliesLimit: number;
  appliesHourUsed: number;
  appliesHourLimit: number;
  appliesDayUsed: number;
  appliesDayLimit: number;
}): ApplyQuotaSnapshot {
  const monthUsed = Math.max(0, data.appliesUsed);
  const monthLimit = Math.max(0, data.appliesLimit);
  const hourUsed = Math.max(0, data.appliesHourUsed);
  const hourLimit = Math.max(0, data.appliesHourLimit);
  const dayUsed = Math.max(0, data.appliesDayUsed);
  const dayLimit = Math.max(0, data.appliesDayLimit);

  return {
    plan: data.plan,
    monthUsed,
    monthLimit,
    monthRemaining: Math.max(0, monthLimit - monthUsed),
    hourUsed,
    hourLimit,
    hourRemaining: Math.max(0, hourLimit - hourUsed),
    dayUsed,
    dayLimit,
    dayRemaining: Math.max(0, dayLimit - dayUsed),
  };
}

export async function getApplyQuotaSnapshot(
  force = false
): Promise<ApplyQuotaSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.quota;
  }

  const result = await fetchBillingMe();
  if (!result.success) {
    if (cache) return cache.quota;
    throw new Error(result.message || 'Could not load apply limits');
  }

  const quota = toSnapshot(result.data);
  cache = { quota, at: Date.now() };
  return quota;
}

export function noteLocalApplySuccess(): void {
  if (!cache) return;
  const q = cache.quota;
  cache = {
    at: cache.at,
    quota: {
      ...q,
      monthUsed: q.monthUsed + 1,
      monthRemaining: Math.max(0, q.monthRemaining - 1),
      hourUsed: q.hourUsed + 1,
      hourRemaining: Math.max(0, q.hourRemaining - 1),
      dayUsed: q.dayUsed + 1,
      dayRemaining: Math.max(0, q.dayRemaining - 1),
    },
  };
}

export function rollbackLocalApplySuccess(): void {
  if (!cache) return;
  const q = cache.quota;
  cache = {
    at: cache.at,
    quota: {
      ...q,
      monthUsed: Math.max(0, q.monthUsed - 1),
      monthRemaining: Math.min(q.monthLimit, q.monthRemaining + 1),
      hourUsed: Math.max(0, q.hourUsed - 1),
      hourRemaining: Math.min(q.hourLimit, q.hourRemaining + 1),
      dayUsed: Math.max(0, q.dayUsed - 1),
      dayRemaining: Math.min(q.dayLimit, q.dayRemaining + 1),
    },
  };
}

export function clearApplyQuotaCache(): void {
  cache = null;
}

export type ApplyQuotaBlockReason = 'hour' | 'day' | 'month';

export function getApplyQuotaBlock(
  quota: ApplyQuotaSnapshot
): ApplyQuotaBlockReason | null {
  if (quota.hourRemaining <= 0) return 'hour';
  if (quota.dayRemaining <= 0) return 'day';
  if (quota.monthRemaining <= 0) return 'month';
  return null;
}

export function quotaBlockMessage(
  quota: ApplyQuotaSnapshot,
  reason: ApplyQuotaBlockReason
): string {
  switch (reason) {
    case 'hour':
      return `Hourly safety limit reached (${quota.hourUsed}/${quota.hourLimit} this hour on ${quota.plan}).`;
    case 'day':
      return `Daily safety limit reached (${quota.dayUsed}/${quota.dayLimit} today on ${quota.plan}).`;
    case 'month':
      return `Monthly apply limit reached (${quota.monthUsed}/${quota.monthLimit} this month). Upgrade in Atlas to continue.`;
  }
}
