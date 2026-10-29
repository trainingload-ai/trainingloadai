import { describe, expect, it } from '@jest/globals';
import {
  healthLocalDateKey,
  healthLocalDateKeysForInterval,
  healthLocalDayBounds,
  intervalOverlapRatio,
} from '../health-local-day';

describe('health local day', () => {
  it('uses the requested timezone instead of UTC calendar dates', () => {
    expect(
      healthLocalDateKey(new Date('2026-07-18T18:00:00.000Z'), 'Asia/Shanghai'),
    ).toBe('2026-07-19');
    expect(healthLocalDayBounds('2026-07-19', 'Asia/Shanghai')).toMatchObject({
      start: new Date('2026-07-18T16:00:00.000Z'),
      end: new Date('2026-07-19T16:00:00.000Z'),
    });
  });

  it('uses real DST day bounds', () => {
    const spring = healthLocalDayBounds('2026-03-08', 'America/New_York');
    expect(spring.end.valueOf() - spring.start.valueOf()).toBe(23 * 3600_000);
    const fall = healthLocalDayBounds('2026-11-01', 'America/New_York');
    expect(fall.end.valueOf() - fall.start.valueOf()).toBe(25 * 3600_000);
  });

  it('enumerates every local day touched by a long interval', () => {
    expect(
      healthLocalDateKeysForInterval({
        startTime: new Date('2026-07-18T15:00:00.000Z'),
        endTime: new Date('2026-07-20T17:00:00.000Z'),
        timezone: 'Asia/Shanghai',
      }),
    ).toEqual(['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21']);
  });

  it('calculates proportional interval contribution to a local day', () => {
    expect(
      intervalOverlapRatio({
        startTime: new Date('2026-07-18T15:00:00.000Z'),
        endTime: new Date('2026-07-18T17:00:00.000Z'),
        windowStart: new Date('2026-07-18T16:00:00.000Z'),
        windowEnd: new Date('2026-07-19T16:00:00.000Z'),
      }),
    ).toBe(0.5);
  });
});
