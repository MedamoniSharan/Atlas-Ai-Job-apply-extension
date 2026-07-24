import type { PlanTier } from '@cosmo/shared';
import { fetchBillingMe } from './apiClient';
import {
  clearApplyQuotaCache,
  getApplyQuotaSnapshot,
  noteLocalApplySuccess,
} from './applySafetyQuota';

export type PlanApplyQuota = {
  plan: PlanTier;
  used: number;
  limit: number;
  remaining: number;
};

/** Monthly apply quota from billing /me (legacy shape). */
export async function getPlanApplyQuota(
  force = false
): Promise<PlanApplyQuota> {
  const snapshot = await getApplyQuotaSnapshot(force);
  return {
    plan: snapshot.plan,
    used: snapshot.monthUsed,
    limit: snapshot.monthLimit,
    remaining: snapshot.monthRemaining,
  };
}

export function noteLocalApply(): void {
  noteLocalApplySuccess();
}

export function clearPlanApplyQuotaCache(): void {
  clearApplyQuotaCache();
}

export { getApplyQuotaSnapshot, getApplyQuotaBlock, quotaBlockMessage } from './applySafetyQuota';
