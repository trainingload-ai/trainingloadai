import {
  healthLocalDateKey,
  healthLocalDayBounds,
} from '@/health-data/health-local-day';
import type { ReviewDigestType } from './review-types';

export function reviewDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function reviewDateFromKey(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

export function shiftReviewDate(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

export function reviewLocalDates(
  periodStart: Date,
  periodEnd: Date,
  timezone: string,
) {
  return {
    from: reviewDateFromKey(healthLocalDateKey(periodStart, timezone)),
    through: reviewDateFromKey(
      healthLocalDateKey(new Date(periodEnd.getTime() - 1), timezone),
    ),
  };
}

export function completedReviewWindow(
  type: ReviewDigestType,
  now: Date,
  timezone: string,
) {
  const localDay = reviewDateFromKey(healthLocalDateKey(now, timezone));
  const end =
    type === 'MONTHLY'
      ? shiftReviewDate(localDay, 1 - localDay.getUTCDate())
      : type === 'WEEKLY'
        ? shiftReviewDate(localDay, -((localDay.getUTCDay() + 6) % 7))
        : localDay;
  const start =
    type === 'MONTHLY'
      ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
      : shiftReviewDate(end, type === 'DAILY' ? -1 : -7);
  return {
    periodStart: healthLocalDayBounds(reviewDateKey(start), timezone).start,
    periodEnd: healthLocalDayBounds(reviewDateKey(end), timezone).start,
  };
}
