import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import { BodyMetricType } from '@prisma/client';
import type { ResolvedBodyMetricValue } from '@/analyze/resolved-fitness-context';

dayjs.extend(utc);
dayjs.extend(timezone);

function validTimezone(value: unknown): string | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return null;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return null;
  }
}

export function resolveActivityAnalysisTimezone(args: {
  activityTimezone?: string | null;
  bodyMetrics?: readonly Pick<ResolvedBodyMetricValue, 'type' | 'value'>[];
}) {
  return (
    validTimezone(args.activityTimezone) ??
    validTimezone(
      args.bodyMetrics?.find((row) => row.type === BodyMetricType.TIMEZONE)
        ?.value,
    ) ??
    'UTC'
  );
}

export function activityLocalDate(startTime: Date, timezoneName: string) {
  return dayjs(startTime).tz(timezoneName).format('YYYY-MM-DD');
}

/** Store a calendar date as UTC midnight; it is a date key, not an instant. */
export function localDateKeyToUtcDate(localDate: string) {
  const parsed = dayjs.utc(`${localDate}T00:00:00.000Z`);
  if (!parsed.isValid()) throw new Error('INVALID_PMC_LOCAL_DATE');
  return parsed.toDate();
}
