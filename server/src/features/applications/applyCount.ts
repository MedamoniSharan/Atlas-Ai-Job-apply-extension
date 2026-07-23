import { FilterQuery } from 'mongoose';
import { getIstDayBounds, getIstMonthBounds } from '@atlas/shared';
import { IApplication } from './application.model';

/** Non-skipped applies that count toward plan / safety caps. */
export function appliedCountFilter(
  userId: string,
  range?: { from: Date; to: Date }
): FilterQuery<IApplication> {
  const base: FilterQuery<IApplication> = {
    userId,
    'metadata.skipped': { $ne: true },
    $or: [{ status: 'applied' }, { 'metadata.source': 'auto_apply' }],
  };

  if (!range) return base;

  return {
    ...base,
    $and: [
      {
        $or: [
          { appliedAt: { $gte: range.from, $lt: range.to } },
          {
            appliedAt: { $exists: false },
            createdAt: { $gte: range.from, $lt: range.to },
          },
        ],
      },
    ],
  };
}

export function hourRange(now = new Date()) {
  return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now };
}

export function dayRange(now = new Date()) {
  const { dayStart, dayEnd } = getIstDayBounds(now);
  return { from: dayStart, to: dayEnd };
}

export function monthRange(now = new Date()) {
  const { periodStart, periodEnd } = getIstMonthBounds(now);
  return { from: periodStart, to: periodEnd };
}
