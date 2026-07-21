import type { PlanTier } from './models';

export const PLAN_LIMITS = {
  free: { monthlyApplies: 50, monthlyScans: 500 },
  pro: { monthlyApplies: 300, monthlyScans: 1500 },
  max: { monthlyApplies: 1000, monthlyScans: 5000 },
} as const satisfies Record<
  PlanTier,
  { monthlyApplies: number; monthlyScans: number }
>;

export function getEffectivePlan(
  plan: PlanTier | null | undefined,
  planExpiresAt: Date | string | null | undefined,
  now: Date = new Date()
): PlanTier {
  const tier = plan ?? 'free';
  if (tier === 'free') return 'free';
  if (!planExpiresAt) return 'free';
  const expires =
    planExpiresAt instanceof Date ? planExpiresAt : new Date(planExpiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) {
    return 'free';
  }
  return tier;
}

export function getPlanAppliesLimit(
  plan: PlanTier | null | undefined,
  planExpiresAt: Date | string | null | undefined,
  now: Date = new Date()
): number {
  return PLAN_LIMITS[getEffectivePlan(plan, planExpiresAt, now)].monthlyApplies;
}

/** Calendar month bounds in Asia/Kolkata (IST). */
export function getIstMonthBounds(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const mm = String(month).padStart(2, '0');

  const periodStart = new Date(`${year}-${mm}-01T00:00:00+05:30`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMm = String(nextMonth).padStart(2, '0');
  const periodEnd = new Date(`${nextYear}-${nextMm}-01T00:00:00+05:30`);

  return { periodStart, periodEnd };
}
