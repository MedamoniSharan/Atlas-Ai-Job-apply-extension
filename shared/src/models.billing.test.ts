import { describe, expect, it } from 'vitest';
import {
  PLAN_PRICES_PAISE,
  yearlyChargePaise,
  yearlyPerMonthRupees,
} from './models';

describe('yearly billing amounts', () => {
  it('matches UI per-month × 12 for Pro', () => {
    const monthlyRupees = Math.round(PLAN_PRICES_PAISE.pro / 100);
    const perMonth = yearlyPerMonthRupees(monthlyRupees);
    expect(perMonth).toBe(Math.round(monthlyRupees * 0.85));
    expect(yearlyChargePaise(PLAN_PRICES_PAISE.pro)).toBe(perMonth * 12 * 100);
  });

  it('matches UI per-month × 12 for Max', () => {
    const monthlyRupees = Math.round(PLAN_PRICES_PAISE.max / 100);
    const perMonth = yearlyPerMonthRupees(monthlyRupees);
    expect(yearlyChargePaise(PLAN_PRICES_PAISE.max)).toBe(perMonth * 12 * 100);
  });

  it('returns 0 for free/zero', () => {
    expect(yearlyPerMonthRupees(0)).toBe(0);
    expect(yearlyChargePaise(0)).toBe(0);
  });
});
