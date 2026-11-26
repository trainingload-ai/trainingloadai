import { median } from '@/athlete-state/domain/robust-baseline';
import type { CoachingHealthObservation } from '@/health-data/health-coaching-readiness';
import type { ReviewDigestType } from './review-types';
import {
  reviewDateKey,
  reviewLocalDates,
  shiftReviewDate,
} from './review-date-window';

const metrics = [
  'SLEEP_ASLEEP_SECONDS',
  'HRV_RMSSD_MS',
  'HRV_SDNN_MS',
  'RESTING_HEART_RATE_BPM',
] as const;

type RecoveryMetric = (typeof metrics)[number];

export type ReviewRecoveryRow = {
  metric: RecoveryMetric;
  statistic: 'observed' | 'mean' | 'median';
  value: number | null;
  samples: number;
  days: number;
  baseline: { value: number; samples: number; days: number } | null;
};

export const DAILY_RECOVERY_BASELINE_DAYS = 28;

function dateCount(from: Date, through: Date) {
  return Math.max(
    0,
    Math.round((through.getTime() - from.getTime()) / 86400000) + 1,
  );
}

export function reviewRecoveryWindow(args: {
  type: ReviewDigestType;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
}) {
  const reviewed = reviewLocalDates(
    args.periodStart,
    args.periodEnd,
    args.timezone,
  );
  const through =
    args.type === 'DAILY'
      ? shiftReviewDate(reviewed.through, 1)
      : reviewed.through;
  const from = args.type === 'DAILY' ? through : reviewed.from;
  const days = dateCount(from, through);
  const baselineFrom =
    args.type === 'MONTHLY' && from.getUTCDate() === 1
      ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1))
      : shiftReviewDate(
          from,
          -(args.type === 'DAILY' ? DAILY_RECOVERY_BASELINE_DAYS : days),
        );
  const baselineDays = dateCount(baselineFrom, shiftReviewDate(from, -1));
  return {
    from: reviewDateKey(from),
    through: reviewDateKey(through),
    baselineFrom: reviewDateKey(baselineFrom),
    days,
    baselineDays,
    queryDays: days + baselineDays,
  };
}

type RecoveryObservation = CoachingHealthObservation & {
  readiness: {
    reportedValue: 'IN_PROGRESS' | 'SOURCE_REPORTED_ONLY' | 'ELIGIBLE';
  };
};

export function summarizeReviewRecovery(
  type: ReviewDigestType,
  window: ReturnType<typeof reviewRecoveryWindow>,
  observations: RecoveryObservation[],
): ReviewRecoveryRow[] {
  return metrics.flatMap((metric) => {
    const readings = observations.filter(
      (row) =>
        row.metric === metric &&
        row.date >= window.baselineFrom &&
        row.date <= window.through &&
        row.readiness.reportedValue !== 'IN_PROGRESS' &&
        Number.isFinite(row.value) &&
        row.value > 0,
    );
    const current = readings.filter((row) => row.date >= window.from);
    if (!current.length) return [];
    const currentProviders = new Set(current.map((row) => row.provider));
    const oneProvider = currentProviders.size === 1;
    const baseline = readings.filter(
      (row) =>
        row.date < window.from &&
        currentProviders.has(row.provider) &&
        row.readiness.reportedValue === 'ELIGIBLE',
    );
    const statistic =
      type === 'DAILY'
        ? 'observed'
        : metric === 'SLEEP_ASLEEP_SECONDS'
          ? 'mean'
          : 'median';
    const summarize = (values: RecoveryObservation[]) =>
      statistic === 'mean'
        ? values.reduce((sum, row) => sum + row.value, 0) / values.length
        : median(values.map((row) => row.value));
    const minimumBaseline =
      type === 'DAILY' ? 7 : Math.ceil(window.baselineDays / 2);
    const comparable =
      oneProvider &&
      current.every((row) => row.readiness.reportedValue === 'ELIGIBLE') &&
      current.length >= Math.ceil(window.days / 2) &&
      baseline.length >= minimumBaseline;
    const baselineValue = comparable ? summarize(baseline) : null;
    return [
      {
        metric,
        statistic,
        value: oneProvider ? summarize(current) : null,
        samples: current.length,
        days: window.days,
        baseline:
          baselineValue === null
            ? null
            : {
                value: baselineValue,
                samples: baseline.length,
                days: window.baselineDays,
              },
      },
    ];
  });
}
