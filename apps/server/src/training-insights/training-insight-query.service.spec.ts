import { describe, expect, it, jest } from '@jest/globals';
import { TrainingInsightQueryService } from './training-insight-query.service';

describe('TrainingInsightQueryService timezone boundaries', () => {
  it('queries and labels date-only load ranges in the athlete timezone', async () => {
    const listRange = jest.fn(async () => [
      {
        date: new Date('2026-01-02T00:00:00.000Z'),
        dailyValue: 42,
        runningValue: 42,
        cyclingValue: 0,
        swimmingValue: 0,
        ATL: 38,
        CTL: 35,
        TSB: -3,
      },
    ]);
    const service = new TrainingInsightQueryService(
      { listRange } as never,
      {} as never,
      {} as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'Asia/Shanghai' })),
        }),
      } as never,
    );

    await expect(
      service.getTrainingLoad({
        userId: 'user-1',
        from: '2026-01-02',
        to: '2026-01-02',
      }),
    ).resolves.toMatchObject({
      timezone: 'Asia/Shanghai',
      range: { from: '2026-01-02', to: '2026-01-02' },
      series: [{ date: '2026-01-02', load: 42 }],
    });
    expect(listRange).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-01-01T16:00:00.000Z'),
      new Date('2026-01-02T15:59:59.999Z'),
      { orderBy: 'asc' },
    );
  });

  it('uses UTC when no valid athlete timezone is stored', async () => {
    const service = new TrainingInsightQueryService(
      { listRange: jest.fn(async () => []) } as never,
      {} as never,
      {} as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'invalid-zone' })),
        }),
      } as never,
    );

    await expect(
      service.getTrainingLoad({
        userId: 'user-1',
        from: '2026-01-02',
        to: '2026-01-02',
      }),
    ).resolves.toMatchObject({ timezone: 'UTC', series: [] });
  });

  it('compares bounded periods with explicit deltas and a null percentage baseline', async () => {
    const listRange = jest.fn(async (_userId: string, from: Date) =>
      from.toISOString().startsWith('2026-02')
        ? [
            {
              date: new Date('2026-02-01T00:00:00.000Z'),
              dailyValue: 30,
              ATL: 20,
              CTL: 18,
              TSB: -2,
            },
            {
              date: new Date('2026-02-02T00:00:00.000Z'),
              dailyValue: 20,
              ATL: 21,
              CTL: 18,
              TSB: -3,
            },
          ]
        : [],
    );
    const service = new TrainingInsightQueryService(
      { listRange } as never,
      {} as never,
      {} as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'UTC' })),
        }),
      } as never,
    );

    await expect(
      service.comparePeriods({
        userId: 'user-1',
        periodA: { from: '2026-02-01', to: '2026-02-02' },
        periodB: { from: '2026-01-01', to: '2026-01-02' },
      }),
    ).resolves.toMatchObject({
      periodA: { days: 2, totalLoad: 50, averageDailyLoad: 25, activeDays: 2 },
      periodB: { days: 2, totalLoad: 0, averageDailyLoad: 0, activeDays: 0 },
      delta: {
        totalLoad: 50,
        averageDailyLoad: 25,
        activeDays: 2,
        totalLoadPercent: null,
      },
    });
  });

  it('returns a sport attribution breakdown without manufacturing unknown load', async () => {
    const service = new TrainingInsightQueryService(
      {
        listRange: jest.fn(async () => [
          {
            date: new Date('2026-03-01T00:00:00.000Z'),
            dailyValue: 100,
            runningValue: 50,
            cyclingValue: 30,
            swimmingValue: 0,
          },
          {
            date: new Date('2026-03-02T00:00:00.000Z'),
            dailyValue: 20,
            runningValue: 0,
            cyclingValue: 0,
            swimmingValue: 10,
          },
        ]),
      } as never,
      {} as never,
      {} as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'UTC' })),
        }),
      } as never,
    );

    await expect(
      service.getBreakdown({
        userId: 'user-1',
        from: '2026-03-01',
        to: '2026-03-02',
      }),
    ).resolves.toMatchObject({
      totalLoad: 120,
      activeDays: 2,
      items: [
        { sportType: 'RUN', load: 50, sharePercent: 41.7, activeDays: 1 },
        {
          sportType: 'CYCLING',
          load: 30,
          sharePercent: 25,
          activeDays: 1,
        },
        { sportType: 'SWIM', load: 10, sharePercent: 8.3, activeDays: 1 },
      ],
      other: { load: 30, sharePercent: 25 },
    });
  });

  it('classifies readiness as observational load signals with freshness status', async () => {
    const rows = Array.from({ length: 14 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 3, index + 1)),
      dailyValue: index < 7 ? 10 : 20,
      runningValue: index < 7 ? 10 : 20,
      cyclingValue: 0,
      swimmingValue: 0,
      ATL: 52,
      CTL: 40,
      TSB: -12,
    }));
    const service = new TrainingInsightQueryService(
      { listRange: jest.fn(async () => rows) } as never,
      { getRecentActivitiesForAi: jest.fn(async () => []) } as never,
      { listWorkoutsForMcp: jest.fn(async () => []) } as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'UTC' })),
        }),
      } as never,
    );

    await expect(
      service.getReadiness({ userId: 'user-1', asOf: '2026-04-14' }),
    ).resolves.toMatchObject({
      asOf: '2026-04-14',
      dataStatus: 'CURRENT',
      freshnessDays: 0,
      signals: {
        atl: 52,
        ctl: 40,
        tsb: -12,
        acuteChronicRatio: 1.3,
        ratioBand: 'BALANCED',
        formBand: 'NEGATIVE',
        last7Load: 140,
        previous7Load: 70,
        activeDaysLast7: 7,
      },
      advisory: expect.stringContaining('not a medical assessment'),
    });
  });

  it('aggregates activity statistics with explicit metric coverage', async () => {
    const getStatisticsRowsForMcp = jest.fn(async () => [
      {
        id: 1,
        startTime: new Date('2026-05-01T01:00:00.000Z'),
        sportType: 'RUN',
        timerTime: 3_600,
        elapsedTime: 3_700,
        distance: 10_000,
        actualLoad: 70,
      },
      {
        id: 2,
        startTime: new Date('2026-05-02T01:00:00.000Z'),
        sportType: 'CYCLING',
        timerTime: null,
        elapsedTime: 1_800,
        distance: null,
        actualLoad: null,
      },
    ]);
    const service = new TrainingInsightQueryService(
      {} as never,
      { getStatisticsRowsForMcp } as never,
      {} as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'Asia/Shanghai' })),
        }),
      } as never,
    );

    await expect(
      service.getActivityStatistics({
        userId: 'user-1',
        from: '2026-05-01',
        to: '2026-05-02',
      }),
    ).resolves.toMatchObject({
      timezone: 'Asia/Shanghai',
      totals: {
        activityCount: 2,
        activeDays: 2,
        durationMinutes: 90,
        distanceKm: 10,
        trainingLoad: 70,
        coverage: {
          durationPercent: 100,
          distancePercent: 50,
          trainingLoadPercent: 50,
        },
      },
      bySport: [
        { sportType: 'RUN', activityCount: 1 },
        { sportType: 'CYCLING', activityCount: 1 },
      ],
      truncated: false,
    });
    expect(getStatisticsRowsForMcp).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        from: new Date('2026-04-30T16:00:00.000Z'),
        to: new Date('2026-05-02T15:59:59.999Z'),
        limit: 1_000,
      }),
    );
  });

  it('keeps missing consistency dates missing and breaks active-day streaks', async () => {
    const service = new TrainingInsightQueryService(
      {
        listRange: jest.fn(async () => [
          { date: new Date('2026-10-01T00:00:00.000Z'), dailyValue: 10 },
          { date: new Date('2026-10-02T00:00:00.000Z'), dailyValue: 20 },
          { date: new Date('2026-10-04T00:00:00.000Z'), dailyValue: 30 },
          { date: new Date('2026-10-05T00:00:00.000Z'), dailyValue: 0 },
        ]),
      } as never,
      {} as never,
      {} as never,
      {
        bodyMetrics: () => ({
          findFirst: jest.fn(async () => ({ value: 'UTC' })),
        }),
      } as never,
    );

    await expect(
      service.getConsistency({
        userId: 'user-1',
        days: 14,
        asOf: '2026-10-05',
      }),
    ).resolves.toMatchObject({
      range: { from: '2026-09-22', to: '2026-10-05', days: 14 },
      storedDays: 4,
      coveragePercent: 28.6,
      activeDays: 3,
      longestActiveDayStreak: 2,
      currentActiveDayStreak: 0,
      dailyLoadMean: 15,
      dailyLoadStandardDeviation: 11.2,
      loadVariabilityCoefficient: 0.75,
      weekly: [
        {
          weekStart: '2026-09-28',
          load: 60,
          activeDays: 3,
          storedDays: 3,
        },
        {
          weekStart: '2026-10-05',
          load: 0,
          activeDays: 0,
          storedDays: 1,
        },
      ],
      countingRule: expect.stringContaining('Missing PMC dates'),
    });
  });
});
