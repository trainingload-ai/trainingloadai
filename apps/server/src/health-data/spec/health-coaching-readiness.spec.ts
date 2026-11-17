import { coachingHealthReadiness } from '../health-coaching-readiness';
const now = new Date('2026-11-18T06:00:00Z');
const sleep = {
  key: 'sleep',
  date: '2026-11-18',
  provider: 'GARMIN',
  metric: 'SLEEP_ASLEEP_SECONDS',
  value: 10800,
  unit: 's',
};

describe('Health observations used by coaching', () => {
  it('keeps 3h→5h→7h as revisions without calling a partial report a complete night', () => {
    for (const hours of [3, 5, 7]) {
      const fact = coachingHealthReadiness(
        { ...sleep, value: hours * 3600 },
        now,
      );
      expect(fact.value).toBe(hours * 3600);
      expect(fact.readiness.reportedValue).toBe('ELIGIBLE');
      expect(fact.readiness.completePeriod).toBe('UNVERIFIED');
      expect(fact.readiness.permitsCompleteNightClaim).toBe(false);
    }
  });
  it('does not turn unknown validation or a long silence into completion', () => {
    for (const sourceStatus of ['MANUAL', 'AUTO', 'FINAL', null])
      expect(
        coachingHealthReadiness(
          { ...sleep, sourceStatus },
          new Date('2026-11-20T12:00Z'),
        ).readiness.completePeriod,
      ).toBe('UNVERIFIED');
  });
  it('keeps an ongoing night-shift or nap interval in progress', () => {
    expect(
      coachingHealthReadiness(
        {
          ...sleep,
          range: { start: '2026-11-18T04:00Z', end: '2026-11-18T09:00Z' },
        },
        now,
      ).readiness.reportedValue,
    ).toBe('IN_PROGRESS');
  });
  it('does not let stages or scores upgrade the total sleep claim', () => {
    for (const metric of [
      'SLEEP_SCORE',
      'SLEEP_DEEP_SECONDS',
      'SLEEP_REM_SECONDS',
    ])
      expect(
        coachingHealthReadiness({ ...sleep, metric }, now).readiness
          .completePeriod,
      ).toBe('UNVERIFIED');
  });
  it('keeps cumulative steps partial without blocking a resting heart measurement', () => {
    expect(
      coachingHealthReadiness({ ...sleep, metric: 'STEP_COUNT' }, now).readiness
        .completePeriod,
    ).toBe('PARTIAL_DAY');
    expect(
      coachingHealthReadiness(
        { ...sleep, metric: 'RESTING_HEART_RATE_BPM' },
        now,
      ).readiness.reportedValue,
    ).toBe('ELIGIBLE');
  });
});
