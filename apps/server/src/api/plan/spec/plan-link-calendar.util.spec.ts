import { describe, expect, it } from '@jest/globals';
import {
  activityCalendarYmdInZone,
  activityLocalTimingInZone,
  normalizePlanLinkTimeZone,
  resolveActivityCalendarDayStr,
  scheduledDateFromCalendar,
} from '../plan-link-calendar.util';

describe('plan-link-calendar util', () => {
  it('normalizes valid IANA time zones and falls back to UTC', () => {
    expect(normalizePlanLinkTimeZone(' Asia/Shanghai ')).toBe('Asia/Shanghai');
    expect(normalizePlanLinkTimeZone('Mars/Base')).toBe('UTC');
    expect(normalizePlanLinkTimeZone(null)).toBe('UTC');
  });

  it('projects a UTC activity instant into the requested calendar time zone', () => {
    const startTime = new Date('2026-06-29T01:30:00.000Z');

    expect(activityCalendarYmdInZone(startTime, 'Asia/Shanghai')).toBe(
      '2026-06-29',
    );
    expect(activityCalendarYmdInZone(startTime, 'America/Los_Angeles')).toBe(
      '2026-06-28',
    );
  });

  it('projects a UTC activity instant into authoritative local clock facts', () => {
    expect(
      activityLocalTimingInZone('2026-08-12T06:25:42.000Z', 'Asia/Shanghai'),
    ).toEqual({
      localDate: '2026-08-12',
      localTime: '14:25',
      localHour: 14,
      dayPeriod: 'afternoon',
    });
    expect(
      activityLocalTimingInZone('2026-08-12T06:25:42.000Z', 'UTC'),
    ).toEqual({
      localDate: '2026-08-12',
      localTime: '06:25',
      localHour: 6,
      dayPeriod: 'morning',
    });
    expect(activityLocalTimingInZone('bad-date', 'Asia/Shanghai')).toBeNull();
  });

  it('resolves activity day using activity, then client, then user timezone', () => {
    const startTime = '2026-06-29T01:30:00.000Z';

    expect(
      resolveActivityCalendarDayStr(
        startTime,
        'Asia/Shanghai',
        'America/Los_Angeles',
        'UTC',
      ),
    ).toBe('2026-06-29');

    expect(
      resolveActivityCalendarDayStr(
        startTime,
        null,
        'America/Los_Angeles',
        'Asia/Shanghai',
      ),
    ).toBe('2026-06-28');

    expect(
      resolveActivityCalendarDayStr(startTime, null, null, 'Asia/Shanghai'),
    ).toBe('2026-06-29');
  });

  it('skips invalid timezone strings and rejects invalid dates', () => {
    expect(
      resolveActivityCalendarDayStr(
        '2026-06-29T01:30:00.000Z',
        'bad/activity-zone',
        'America/Los_Angeles',
        'Asia/Shanghai',
      ),
    ).toBe('2026-06-28');

    expect(
      resolveActivityCalendarDayStr(
        '2026-06-28T16:30:00.000Z',
        'bad/activity-zone',
        'bad/client-zone',
        'Asia/Shanghai',
      ),
    ).toBe('2026-06-29');

    expect(
      resolveActivityCalendarDayStr('not-a-date', 'Asia/Shanghai', null, null),
    ).toBeNull();
  });

  it('converts a calendar date string into the UTC date column value', () => {
    expect(scheduledDateFromCalendar('2026-06-29').toISOString()).toBe(
      '2026-06-29T00:00:00.000Z',
    );
  });
});
