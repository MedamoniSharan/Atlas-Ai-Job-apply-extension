import type { PlanTier } from '@atlas/shared';
import { fetchBillingMe } from './apiClient';

export type PlanApplyQuota = {
  plan: PlanTier;
  used: number;
  limit: number;
  remaining: number;
};

type CacheEntry = {
  quota: PlanApplyQuota;
  at: number;
};

const CACHE_MS = 15_000;
let cache: CacheEntry | null = null;

function toQuota(data: {
  plan: PlanTier;
  appliesUsed: number;
  appliesLimit: number;
}): PlanApplyQuota {
  const used = Math.max(0, data.appliesUsed);
  const limit = Math.max(0, data.appliesLimit);
  return {
    plan: data.plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

/** Monthly apply quota from the user's plan (billing /me). */
export async function getPlanApplyQuota(
  force = false
): Promise<PlanApplyQuota> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.quota;
  }

  const result = await fetchBillingMe();
  if (!result.success) {
    if (cache) return cache.quota;
    throw new Error(result.message || 'Could not load plan apply limits');
  }

  const quota = toQuota(result.data);
  cache = { quota, at: Date.now() };
  return quota;
}

/** Bump local cache after a successful apply so we don't overshoot before re-fetch. */
export function noteLocalApply(): void {
  if (!cache) return;
  const used = cache.quota.used + 1;
  cache = {
    at: cache.at,
    quota: {
      ...cache.quota,
      used,
      remaining: Math.max(0, cache.quota.limit - used),
    },
  };
}

export function clearPlanApplyQuotaCache(): void {
  cache = null;
}
