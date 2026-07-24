import type { OnboardingStatus } from '@cosmo/shared';
import { fetchOnboardingStatus } from '../lib/api';

export const ONBOARDING_QUERY_KEY = ['onboarding'] as const;

export async function loadOnboardingStatus(): Promise<OnboardingStatus> {
  const res = await fetchOnboardingStatus();
  if (!res.success) throw new Error(res.message);
  return res.data;
}
