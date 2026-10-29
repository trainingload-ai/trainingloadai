/**
 * 对齐 Activity.startTime（UTC 瞬间）与 PlanWorkout.scheduledDate（DATE）时的「日历日」。
 * 与 activity.service planLinkUiVisible：activity TZ → client TZ → user TZ → UTC。
 *
 * 使用 dayjs.utc + timezone（与 server 内 analyze/ai 等模块一致），避免各处 Intl 行为差异。
 */
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

export function normalizePlanLinkTimeZone(raw?: string | null): string {
  const fallback = 'UTC';
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  if (!candidate) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return fallback;
  }
}

function firstValidPlanLinkTimeZone(
  ...values: Array<string | null | undefined>
): string {
  for (const raw of values) {
    const candidate = typeof raw === 'string' ? raw.trim() : '';
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
      return candidate;
    } catch {
      continue;
    }
  }
  return 'UTC';
}

/** 将「UTC 瞬间」投影到指定 IANA 时区下的日历日 YYYY-MM-DD */
export function activityCalendarYmdInZone(
  startTime: Date,
  timeZone: string,
): string | null {
  try {
    const tz = normalizePlanLinkTimeZone(timeZone);
    const d = dayjs.utc(startTime).tz(tz);
    if (!d.isValid()) return null;
    return d.format('YYYY-MM-DD');
  } catch {
    return null;
  }
}

export type LocalActivityTiming = {
  localDate: string;
  localTime: string;
  localHour: number;
  dayPeriod: 'night' | 'morning' | 'afternoon' | 'evening';
};

/** 将活动的 UTC 瞬间投影为明确的本地时钟事实，避免下游再次猜测 ISO 时间。 */
export function activityLocalTimingInZone(
  input: Date | string,
  timeZone: string,
): LocalActivityTiming | null {
  const startTime = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(startTime.getTime())) return null;
  try {
    const zone = normalizePlanLinkTimeZone(timeZone);
    const local = dayjs.utc(startTime).tz(zone);
    if (!local.isValid()) return null;
    const localHour = local.hour();
    return {
      localDate: local.format('YYYY-MM-DD'),
      localTime: local.format('HH:mm'),
      localHour,
      dayPeriod:
        localHour < 5
          ? 'night'
          : localHour < 12
            ? 'morning'
            : localHour < 18
              ? 'afternoon'
              : localHour < 22
                ? 'evening'
                : 'night',
    };
  } catch {
    return null;
  }
}

/**
 * 解析活动日历日，优先考虑活动时区，再考虑用户时区，最后考虑客户端时区
 * @param startTime 活动开始时间
 * @param activityTimezone 活动时区
 * @param clientCalendarTimeZone 客户端日历时区
 * @param userTimezone 用户时区
 * @returns 活动日历日，或 null
 */
export function resolveActivityCalendarDayStr(
  startTime: Date | string,
  activityTimezone: string | null | undefined,
  clientCalendarTimeZone: string | null | undefined,
  userTimezone: string | null | undefined,
): string | null {
  const st = startTime instanceof Date ? startTime : new Date(startTime);
  if (Number.isNaN(st.getTime())) return null;
  const tz = firstValidPlanLinkTimeZone(
    activityTimezone,
    clientCalendarTimeZone,
    userTimezone,
  );
  return activityCalendarYmdInZone(st, tz);
}

/** DATE 列查询：日历字符串 → UTC 当日零点（与 Prisma DATE 对齐） */
export function scheduledDateFromCalendar(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
