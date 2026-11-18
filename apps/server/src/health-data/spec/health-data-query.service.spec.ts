import { describe, expect, it, jest } from '@jest/globals';
import { HealthDataQueryService } from '../health-data-query.service';
import { HealthDataRepository } from '../persistence/health-data.repository';

function createService() {
  const prisma = {
    $transaction: async (read: (client: unknown) => unknown) => read(prisma),
    userDailyHealthMetric: {
      findMany:
        jest.fn<(args: { where: { date: Date } }) => Promise<unknown>>(),
    },
    externalHealthSample: {
      findMany: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue([]),
    },
    canonicalHealthSession: {
      findMany: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue([]),
    },
  };
  const seriesStorage = {
    readMetricRows:
      jest.fn<(args: { localDates: Date[] }) => Promise<unknown>>(),
  };
  return {
    prisma,
    seriesStorage,
    service: new HealthDataQueryService(
      seriesStorage as never,
      new HealthDataRepository(prisma as never),
      { todayYmd: jest.fn(async () => '2026-07-18') } as never,
    ),
  };
}

describe('HealthDataQueryService provider selection', () => {
  it('does not resurrect a stale selected daily value after its source is withdrawn', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockResolvedValue([
      {
        id: 'old-projection',
        date: new Date('2026-07-18'),
        metricType: 'SLEEP_ASLEEP_SECONDS',
        value: 10800,
        unit: 's',
        selectedProvider: 'GARMIN',
        sources: [],
      },
    ]);
    prisma.canonicalHealthSession.findMany.mockResolvedValue([]);
    expect(
      (await service.getCoachingFacts('user-1', '2026-07-18')).observations,
    ).toEqual([]);
  });
  it('withholds an old canonical sleep value while its correction snapshot is pending', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockResolvedValue([]);
    prisma.canonicalHealthSession.findMany.mockResolvedValue([
      {
        id: 'sleep',
        calendarDate: new Date('2026-07-18'),
        startTime: new Date('2026-07-17T23:00Z'),
        endTime: new Date('2026-07-18T06:00Z'),
        durationSeconds: 25200,
        selectedProvider: 'GARMIN',
        selectedSource: {
          snapshotId: 'snapshot',
          snapshot: { manifest: { status: 'PENDING' } },
          summary: { validation: 'revised' },
        },
      },
    ]);
    const result = await service.getCoachingFacts('user-1', '2026-07-18');
    expect(result.sleepSessions).toEqual([]);
    expect(result.pending).toEqual([
      expect.objectContaining({
        key: 'sleep',
        reason: 'NORMALIZATION_OR_SESSION_PROJECTION_PENDING',
      }),
    ]);
  });
  it('keeps a revised sleep status distinct even when the duration is unchanged', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockResolvedValue([]);
    const session = {
      id: 'sleep',
      calendarDate: new Date('2026-07-18'),
      startTime: new Date('2026-07-17T23:00Z'),
      endTime: new Date('2026-07-18T06:00Z'),
      durationSeconds: 25200,
      selectedProvider: 'GARMIN',
      selectedSource: { summary: { validation: 'first-observation' } },
    };
    Object.assign(session, { summary: session.selectedSource.summary });
    Object.assign(session.selectedSource, {
      startTime: session.startTime,
      endTime: session.endTime,
      durationSeconds: session.durationSeconds,
    });
    prisma.canonicalHealthSession.findMany.mockResolvedValue([session]);
    const before = await service.getCoachingFacts(
      'user-1',
      '2026-07-18',
      new Date('2026-07-18T07:00Z'),
    );
    session.selectedSource.summary.validation = 'revised-observation';
    const after = await service.getCoachingFacts(
      'user-1',
      '2026-07-18',
      new Date('2026-07-18T08:00Z'),
    );
    expect(before.sleepSessions[0].value).toBe(after.sleepSessions[0].value);
    expect(before.sleepSessions[0].sourceStatus).not.toBe(
      after.sleepSessions[0].sourceStatus,
    );
    expect(after.sleepSessions[0].readiness.completePeriod).toBe('UNVERIFIED');
  });

  it('accepts a completed daily projection after relation-only writes advance audit time', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockResolvedValue([
      {
        id: 'daily',
        date: new Date('2026-07-18'),
        metricType: 'SLEEP_ASLEEP_SECONDS',
        value: 10800,
        unit: 's',
        selectedProvider: 'GARMIN',
        computedAt: new Date('2026-07-18T07:00Z'),
        sources: [
          {
            id: 'sample',
            provider: 'GARMIN',
            externalId: 'sleep',
            startTime: new Date('2026-07-18T00:00Z'),
            endTime: new Date('2026-07-18T03:00Z'),
            value: 10800,
            unit: 's',
            updatedAt: new Date('2026-07-18T07:00:01Z'),
          },
        ],
      },
    ]);
    prisma.canonicalHealthSession.findMany.mockResolvedValue([]);
    const result = await service.getCoachingFacts('user-1', '2026-07-18');
    expect(result.observations[0].value).toBe(10800);
    expect(result.pending).toEqual([]);
  });
  it('withholds a legacy row when its accepted source is ineligible', async () => {
    const { prisma, service } = createService();
    const date = new Date('2026-07-18');
    prisma.userDailyHealthMetric.findMany.mockResolvedValue([
      {
        id: 'old-projection',
        date,
        metricType: 'STEP_COUNT',
        value: 9999,
        unit: 'count',
        selectedProvider: 'COROS',
        sourceBreakdown: { GARMIN: { value: 3600, unit: 'count' } },
        sources: [
          {
            id: 'garmin',
            provider: 'GARMIN',
            externalId: 'dailies',
            startTime: date,
            endTime: date,
            value: 3600,
            unit: 'count',
            aggregation: 'LATEST',
          },
        ],
      },
    ]);
    prisma.canonicalHealthSession.findMany.mockResolvedValue([]);

    const result = await service.getCoachingFacts('user-1', '2026-07-18');

    expect(result.observations).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it('uses the athlete-local date when endDate is omitted', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockResolvedValue([]);

    const result = await service.getOverview('user-1', 7);

    expect(result.endDate).toBe('2026-07-18');
  });

  it('reads intraday Parquet only from the selected provider', async () => {
    const { prisma, seriesStorage, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockImplementation(async (args) =>
      args.where.date.toISOString().startsWith('2026-07-18')
        ? [
            {
              metricType: 'STRESS_LEVEL_AVG',
              selectedProvider: 'GARMIN',
              value: 42,
              unit: 'score',
            },
          ]
        : [],
    );
    seriesStorage.readMetricRows.mockImplementation(async (args) =>
      args.localDates[0].toISOString().startsWith('2026-07-18')
        ? [
            {
              timestampUtcMs: Date.parse('2026-07-18T01:00:00.000Z'),
              value: 42,
              status: 'valid',
              sourceMessage: 'stressLevelMesgs',
              sourceIndex: 0,
            },
          ]
        : [],
    );
    prisma.externalHealthSample.findMany.mockResolvedValue([]);

    const result = await service.getIntraday('user-1', 'stress', '2026-07-18');

    expect(seriesStorage.readMetricRows).toHaveBeenLastCalledWith({
      userId: 'user-1',
      metricCode: 'stress_level',
      localDates: [new Date('2026-07-18T00:00:00.000Z')],
      provider: 'GARMIN',
    });
    expect(result.current).toEqual([
      expect.objectContaining({ value: 42, provider: 'GARMIN' }),
    ]);
  });

  it('does not mix RMSSD and SDNN or providers in the HRV fallback', async () => {
    const { prisma, seriesStorage, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockImplementation(async (args) =>
      args.where.date.toISOString().startsWith('2026-07-18')
        ? [
            {
              metricType: 'HRV_SDNN_MS',
              selectedProvider: 'APPLE_HEALTH',
              value: 51,
              unit: 'ms',
            },
          ]
        : [],
    );
    seriesStorage.readMetricRows.mockResolvedValue([]);
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      {
        startTime: new Date('2026-07-18T00:00:00.000Z'),
        endTime: new Date('2026-07-19T00:00:00.000Z'),
        value: 51,
        provider: 'APPLE_HEALTH',
      },
    ]);

    await service.getIntraday('user-1', 'hrv', '2026-07-18');

    expect(prisma.externalHealthSample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metricType: 'HRV_SDNN_MS',
          provider: 'APPLE_HEALTH',
          projectToDaily: true,
          OR: [
            { snapshotId: null },
            {
              snapshot: {
                manifest: { path: ['status'], equals: 'READY' },
              },
            },
          ],
        }),
      }),
    );
  });

  it('filters sleep sessions by the provider selected for that date', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockImplementation(async (args) =>
      args.where.date.toISOString().startsWith('2026-07-18')
        ? [
            {
              metricType: 'SLEEP_ASLEEP_SECONDS',
              selectedProvider: 'APPLE_HEALTH',
              value: 28_800,
              unit: 's',
            },
          ]
        : [],
    );
    prisma.canonicalHealthSession.findMany.mockResolvedValue([
      {
        calendarDate: new Date('2026-07-18T00:00:00.000Z'),
        startTime: new Date('2026-07-17T22:00:00.000Z'),
        endTime: new Date('2026-07-18T06:00:00.000Z'),
        durationSeconds: 28_800,
        score: 80,
        selectedProvider: 'GARMIN',
        sources: [
          {
            startTime: new Date('2026-07-17T22:00:00.000Z'),
            endTime: new Date('2026-07-18T06:00:00.000Z'),
            durationSeconds: 28_800,
            score: 80,
            provider: 'GARMIN',
            segments: [],
          },
        ],
      },
    ]);
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      {
        startTime: new Date('2026-07-17T22:00:00.000Z'),
        endTime: new Date('2026-07-18T06:00:00.000Z'),
        value: 28_800,
        provider: 'APPLE_HEALTH',
      },
    ]);

    const result = await service.getIntraday('user-1', 'sleep', '2026-07-18');

    expect(result.current).toEqual([
      expect.objectContaining({ provider: 'APPLE_HEALTH', stage: 'sleep' }),
    ]);
    expect(result.current).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: 'GARMIN' })]),
    );
  });

  it('uses the canonical selected source when one provider has multiple devices', async () => {
    const { prisma, service } = createService();
    prisma.userDailyHealthMetric.findMany.mockImplementation(async (args) =>
      args.where.date.toISOString().startsWith('2026-07-18')
        ? [
            {
              metricType: 'SLEEP_ASLEEP_SECONDS',
              selectedProvider: 'APPLE_HEALTH',
              value: 28_800,
              unit: 's',
            },
          ]
        : [],
    );
    prisma.canonicalHealthSession.findMany.mockResolvedValue([
      {
        calendarDate: new Date('2026-07-18T00:00:00.000Z'),
        startTime: new Date('2026-07-17T22:00:00.000Z'),
        endTime: new Date('2026-07-18T06:00:00.000Z'),
        durationSeconds: 28_800,
        score: null,
        selectedProvider: 'APPLE_HEALTH',
        selectedSourceId: 'watch-source',
        sources: [
          {
            id: 'phone-source',
            provider: 'APPLE_HEALTH',
            startTime: new Date('2026-07-17T22:30:00.000Z'),
            endTime: new Date('2026-07-18T05:30:00.000Z'),
            durationSeconds: 25_200,
            score: null,
            segments: [],
          },
          {
            id: 'watch-source',
            provider: 'APPLE_HEALTH',
            startTime: new Date('2026-07-17T22:00:00.000Z'),
            endTime: new Date('2026-07-18T06:00:00.000Z'),
            durationSeconds: 28_800,
            score: null,
            segments: [],
          },
        ],
      },
    ]);

    const result = await service.getIntraday('user-1', 'sleep', '2026-07-18');

    expect(result.current).toEqual([
      expect.objectContaining({
        time: '2026-07-17T22:00:00.000Z',
        value: 28_800,
        provider: 'APPLE_HEALTH',
      }),
    ]);
  });
});
