/**
 * 健康领域的本地自然日辅助函数。
 *
 * 数据库中作为每日键使用的 `Date` 表示 `YYYY-MM-DD` 的 UTC 零点；它是日期标识，
 * 不是用户所在地零点对应的真实时刻。本地日真实边界会根据 IANA 时区另行计算，
 * 因此受夏令时影响的自然日可能短于或长于 24 小时。
 */
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezonePlugin = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function addDateKey(dateKey: string, days: number) {
  return dayjs
    .utc(`${dateKey}T00:00:00.000Z`)
    .add(days, 'day')
    .format('YYYY-MM-DD');
}

/** 返回合法且规范化的 IANA 时区；无效或缺失时回退到 `UTC`。 */
export function normalizeHealthTimezone(value?: string | null) {
  const candidate = value?.trim() || 'UTC';
  try {
    return Intl.DateTimeFormat('en-US', {
      timeZone: candidate,
    }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** 将绝对时刻格式化为指定时区下的 `YYYY-MM-DD` 日期键。 */
export function healthLocalDateKey(timestamp: Date, timezone?: string | null) {
  return dayjs(timestamp)
    .tz(normalizeHealthTimezone(timezone))
    .format('YYYY-MM-DD');
}

/**
 * 将本地自然日解析为绝对时间的半开区间 `[start, end)`。
 *
 * `date` 是 UTC 零点表示的数据库日期键；`start` 和 `end` 是相邻两个本地零点的
 * 真实时刻，因此会正确处理夏令时变化。
 */
export function healthLocalDayBounds(
  dateKey: string,
  timezone?: string | null,
) {
  if (!DATE_KEY.test(dateKey))
    throw new Error(`Invalid local date: ${dateKey}`);
  const zone = normalizeHealthTimezone(timezone);
  const start = dayjs.tz(dateKey, zone).startOf('day');
  const nextDateKey = addDateKey(dateKey, 1);
  return {
    date: new Date(`${dateKey}T00:00:00.000Z`),
    timezone: zone,
    start: start.toDate(),
    end: dayjs.tz(nextDateKey, zone).startOf('day').toDate(),
  };
}

/**
 * 返回半开区间 `[startTime, endTime)` 覆盖到的全部本地日期。恰好落在零点的
 * 结束时刻不属于以该零点开始的新日期区间。
 */
export function healthLocalDateKeysForInterval(args: {
  startTime: Date;
  endTime: Date;
  timezone?: string | null;
}) {
  const startMs = args.startTime.valueOf();
  const endMs = args.endTime.valueOf();
  const lastIncluded = new Date(Math.max(startMs, endMs - 1));
  const firstKey = healthLocalDateKey(args.startTime, args.timezone);
  const lastKey = healthLocalDateKey(lastIncluded, args.timezone);
  const keys: string[] = [];
  let cursor = firstKey;
  while (cursor <= lastKey) {
    keys.push(cursor);
    cursor = addDateKey(cursor, 1);
  }
  return keys;
}

/**
 * 返回 `[windowStart, windowEnd)` 对 `[startTime, endTime)` 的覆盖比例。
 * 零时长点只能是完全位于窗口内或完全位于窗口外。
 */
export function intervalOverlapRatio(args: {
  startTime: Date;
  endTime: Date;
  windowStart: Date;
  windowEnd: Date;
}) {
  const start = args.startTime.valueOf();
  const end = args.endTime.valueOf();
  if (end <= start) {
    return start >= args.windowStart.valueOf() &&
      start < args.windowEnd.valueOf()
      ? 1
      : 0;
  }
  const overlap = Math.max(
    0,
    Math.min(end, args.windowEnd.valueOf()) -
      Math.max(start, args.windowStart.valueOf()),
  );
  return overlap / (end - start);
}
