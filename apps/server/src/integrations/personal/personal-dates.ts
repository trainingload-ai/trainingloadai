import { healthLocalDayBounds } from '@/health-data/health-local-day';
import { PersonalProviderError } from './personal-errors';

export function validTimezone(value: unknown): string {
  if (typeof value !== 'string')
    throw new PersonalProviderError(
      'PROVIDER_TIMEZONE_REQUIRED',
      undefined,
      400,
    );
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch {
    throw new PersonalProviderError(
      'PROVIDER_TIMEZONE_INVALID',
      undefined,
      400,
    );
  }
}
export function localToday(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function dateLabel(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new PersonalProviderError('PROVIDER_DATE_INVALID', undefined, 400);
  return value;
}
export function addDays(value: string, days: number) {
  const d = new Date(`${dateLabel(value)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dateRange(
  start: string,
  end: string,
  maxDays = 3660,
): string[] {
  dateLabel(start);
  dateLabel(end);
  const count = (Date.parse(end) - Date.parse(start)) / 86400_000 + 1;
  if (count < 1 || count > maxDays)
    throw new PersonalProviderError(
      'PROVIDER_DATE_RANGE_INVALID',
      undefined,
      400,
    );
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
/** A local day label is encoded as UTC midnight; its interval uses the account zone. */
export function healthDay(day: string, timezone: string) {
  const bounds = healthLocalDayBounds(dateLabel(day), validTimezone(timezone));
  return {
    localDate: bounds.date,
    startTime: bounds.start,
    endTime: bounds.end,
  };
}
