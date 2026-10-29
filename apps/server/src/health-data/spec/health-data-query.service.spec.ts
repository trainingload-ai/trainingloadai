import { describe, expect, it, jest } from '@jest/globals';
import { HealthDataQueryService } from '../health-data-query.service';
import { HealthDataRepository } from '../persistence/health-data.repository';

function createService() {
  const prisma = {
    userDailyHealthMetric: {
      findMany:
        jest.fn<(args: { where: { date: Date } }) => Promise<unknown>>(),
    },
    externalHealthSample: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    canonicalHealthSession: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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
