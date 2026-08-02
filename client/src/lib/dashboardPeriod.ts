import { getIstMonthBounds } from '@cosmo/shared';

export const DASH_PERIODS = ['This month', 'Last month', 'This year'] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number];

function istYear(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'year')?.value);
}

/** Inclusive `from`, exclusive `to` (ISO), matching applications API date filters. */
export function dashPeriodRange(
  period: DashPeriod,
  now: Date = new Date()
): { from: string; to: string } {
  if (period === 'This month') {
    const { periodStart, periodEnd } = getIstMonthBounds(now);
    return { from: periodStart.toISOString(), to: periodEnd.toISOString() };
  }

  if (period === 'Last month') {
    const { periodStart } = getIstMonthBounds(now);
    const anchor = new Date(periodStart.getTime() - 12 * 60 * 60 * 1000);
    const { periodStart: from, periodEnd: to } = getIstMonthBounds(anchor);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const year = istYear(now);
  const from = new Date(`${year}-01-01T00:00:00+05:30`);
  const to = new Date(`${year + 1}-01-01T00:00:00+05:30`);
  return { from: from.toISOString(), to: to.toISOString() };
}
