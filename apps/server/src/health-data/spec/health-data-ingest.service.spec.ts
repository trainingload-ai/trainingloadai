import { describe, expect, it, jest } from '@jest/globals';
import {
  consolidateHealthCandidates,
  HealthDataIngestService,
} from '../health-data-ingest.service';
import { HealthDataRepository } from '../persistence/health-data.repository';

function createService() {
  const prisma = {
    $executeRawUnsafe: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    externalHealthSample: {
      upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    userDailyHealthMetric: {
      upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      deleteMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };
  (prisma as unknown as { $transaction: unknown }).$transaction = jest.fn(
    async (callback: (client: never) => unknown) => callback(prisma as never),
  );
  return {
    prisma,
    service: new HealthDataIngestService(
      prisma as never,
      new HealthDataRepository(prisma as never),
    ),
  };
}

describe('HealthDataIngestService', () => {
  it('keeps only the highest-quality semantic source within one provider', () => {
    const result = consolidateHealthCandidates([
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:hrv:raw',
        startTime: new Date('2026-06-20T00:00:00.000Z'),
        endTime: new Date('2026-06-20T08:00:00.000Z'),
        value: 80,
        unit: 'ms',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'AVG',
        metadata: { qualityRank: 0, sampleCount: 100 },
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:hrv:nightly-summary',
        startTime: new Date('2026-06-20T00:00:00.000Z'),
        endTime: new Date('2026-06-20T08:00:00.000Z'),
        value: 45,
        unit: 'ms',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'AVG',
        metadata: { qualityRank: 10, sampleCount: 1 },
      },
    ]);

    expect(result).toMatchObject({
      value: 45,
      qualityRank: 10,
      lowerQualityCandidateCount: 1,
      candidateCount: 1,
    });
  });

  it('does not double-count partially overlapping SUM intervals', () => {
    const result = consolidateHealthCandidates([
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:steps:a',
        startTime: new Date('2026-06-20T00:00:00.000Z'),
        endTime: new Date('2026-06-20T04:00:00.000Z'),
        value: 400,
        unit: 'count',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'SUM',
        metadata: { sampleCount: 4 },
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:steps:b',
        startTime: new Date('2026-06-20T02:00:00.000Z'),
        endTime: new Date('2026-06-20T06:00:00.000Z'),
        value: 500,
        unit: 'count',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'SUM',
        metadata: { sampleCount: 5 },
      },
    ]);

    expect(result).toMatchObject({
      value: 700,
      overlapCandidateCount: 1,
      candidateCount: 2,
      sampleCount: 7,
    });
  });

  it('discounts overlapping coverage when combining weighted averages', () => {
    const result = consolidateHealthCandidates([
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:hr:a',
        startTime: new Date('2026-06-20T00:00:00.000Z'),
        endTime: new Date('2026-06-20T04:00:00.000Z'),
        value: 60,
        unit: 'bpm',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'AVG',
        metadata: { sampleCount: 4 },
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:hr:b',
        startTime: new Date('2026-06-20T02:00:00.000Z'),
        endTime: new Date('2026-06-20T06:00:00.000Z'),
        value: 80,
        unit: 'bpm',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'AVG',
        metadata: { sampleCount: 4 },
      },
    ]);

    expect(result).toMatchObject({
      overlapCandidateCount: 1,
      candidateCount: 2,
      sampleCount: 6,
    });
    expect(result?.value).toBeCloseTo(73.333333, 5);
  });

  it('isolates incompatible unit or aggregation groups deterministically', () => {
    const result = consolidateHealthCandidates([
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:steps:count',
        startTime: new Date('2026-06-20T00:00:00.000Z'),
        endTime: new Date('2026-06-20T01:00:00.000Z'),
        value: 100,
        unit: 'count',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'SUM',
        metadata: { sampleCount: 10 },
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:steps:invalid-unit',
        startTime: new Date('2026-06-20T01:00:00.000Z'),
        endTime: new Date('2026-06-20T02:00:00.000Z'),
        value: 999,
        unit: 'm',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'SUM',
        metadata: { sampleCount: 2 },
      },
    ]);

    expect(result).toMatchObject({
      value: 100,
      unit: 'count',
      incompatibleCandidateCount: 1,
      candidateCount: 1,
    });
  });

  it('uses observation end time before source update time for LATEST', () => {
    const result = consolidateHealthCandidates([
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:body-battery:older-observation',
        startTime: new Date('2026-06-20T08:00:00.000Z'),
        endTime: new Date('2026-06-20T08:00:00.000Z'),
        sourceUpdatedAt: new Date('2026-06-21T12:00:00.000Z'),
        value: 30,
        unit: 'score',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'LATEST',
        metadata: null,
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:body-battery:newer-observation',
        startTime: new Date('2026-06-20T18:00:00.000Z'),
        endTime: new Date('2026-06-20T18:00:00.000Z'),
        sourceUpdatedAt: new Date('2026-06-20T19:00:00.000Z'),
        value: 70,
        unit: 'score',
        timezone: null,
        sourceName: 'Garmin',
        sourcePriority: 55,
        sourceNamespace: 'garmin',
        aggregation: 'LATEST',
        metadata: null,
      },
    ]);

    expect(result?.value).toBe(70);
  });

  it('stores the external candidate and selects it when no daily metric exists', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.upsert.mockResolvedValueOnce({});
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      {
        provider: 'MANUAL',
        externalId: 'polar:daily:user:20260703:STEP_COUNT',
        startTime: new Date('2026-07-03T00:00:00.000Z'),
        endTime: new Date('2026-07-04T00:00:00.000Z'),
        value: 12345,
        unit: 'count',
        timezone: null,
        sourceName: 'Polar',
        sourcePriority: 70,
        sourceNamespace: 'polar:api',
        aggregation: 'SUM',
        metadata: null,
      },
    ]);
    prisma.userDailyHealthMetric.upsert.mockResolvedValueOnce({
      id: 'daily-metric-1',
    });

    await expect(
      service.ingestCandidate({
        userId: 'user-1',
        candidate: {
          provider: 'MANUAL',
          metricType: 'STEP_COUNT',
          externalId: 'polar:daily:user:20260703:STEP_COUNT',
          localDate: new Date('2026-07-03T00:00:00.000Z'),
          startTime: new Date('2026-07-03T00:00:00.000Z'),
          endTime: new Date('2026-07-04T00:00:00.000Z'),
          value: 12345,
          unit: 'count',
          sourceObjectId: 'source-1',
          snapshotId: 'snapshot-1',
          sourceNamespace: 'polar:api',
          sourcePriority: 70,
          aggregation: 'SUM',
          sourceName: 'Polar',
          metadata: { providerField: 'steps' },
        },
      }),
    ).resolves.toEqual({ projected: true, selected: true });

    expect(prisma.externalHealthSample.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: 'MANUAL',
          metricType: 'STEP_COUNT',
          value: 12345,
          sourcePriority: 70,
          sourceObjectId: 'source-1',
          snapshotId: 'snapshot-1',
          sourceNamespace: 'polar:api',
          aggregation: 'SUM',
        }),
      }),
    );
    expect(prisma.userDailyHealthMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          selectedProvider: 'MANUAL',
          value: 12345,
        }),
      }),
    );
    expect(prisma.externalHealthSample.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        localDate: new Date('2026-07-03T00:00:00.000Z'),
        metricType: 'STEP_COUNT',
        deletedAt: null,
        projectToDaily: true,
      },
      data: { dailyMetricId: 'daily-metric-1' },
    });
  });

  it('keeps the selected provider when the incoming provider has lower priority', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.upsert.mockResolvedValueOnce({});
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      {
        provider: 'MANUAL',
        externalId: 'apple:20260703:STEP_COUNT',
        startTime: new Date('2026-07-03T00:00:00.000Z'),
        endTime: new Date('2026-07-04T00:00:00.000Z'),
        value: 10000,
        unit: 'count',
        timezone: null,
        sourceName: 'Apple Health',
        sourcePriority: 80,
        sourceNamespace: 'apple-health',
        aggregation: 'SUM',
        metadata: null,
      },
      {
        provider: 'HEALTH_CONNECT',
        externalId: 'coros:daily:user:20260703:STEP_COUNT',
        startTime: new Date('2026-07-03T00:00:00.000Z'),
        endTime: new Date('2026-07-04T00:00:00.000Z'),
        value: 9000,
        unit: 'count',
        timezone: null,
        sourceName: 'HEALTH_CONNECT',
        sourcePriority: 40,
        sourceNamespace: 'coros',
        aggregation: 'SUM',
        metadata: null,
      },
    ]);
    prisma.userDailyHealthMetric.upsert.mockResolvedValueOnce({});

    await expect(
      service.ingestCandidate({
        userId: 'user-1',
        candidate: {
          provider: 'HEALTH_CONNECT',
          metricType: 'STEP_COUNT',
          externalId: 'coros:daily:user:20260703:STEP_COUNT',
          localDate: new Date('2026-07-03T00:00:00.000Z'),
          startTime: new Date('2026-07-03T00:00:00.000Z'),
          endTime: new Date('2026-07-04T00:00:00.000Z'),
          value: 9000,
          unit: 'count',
          sourceName: 'HEALTH_CONNECT',
        },
      }),
    ).resolves.toEqual({ projected: true, selected: false });

    expect(prisma.userDailyHealthMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          selectedProvider: 'MANUAL',
          value: 10000,
          sourceBreakdown: expect.objectContaining({
            MANUAL: expect.objectContaining({ value: 10000 }),
            HEALTH_CONNECT: expect.objectContaining({ value: 9000, priority: 40 }),
          }),
        }),
      }),
    );
  });

  it('merges complementary same-provider chunks before selecting the provider', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:chunk:1',
        startTime: new Date('2026-06-20T00:00:00.000Z'),
        endTime: new Date('2026-06-20T01:00:00.000Z'),
        value: 190,
        unit: 'count',
        timezone: 'Asia/Shanghai',
        sourceName: 'Garmin 24x7 FIT',
        sourcePriority: 55,
        sourceNamespace: 'garmin:china:export',
        aggregation: 'SUM',
        metadata: { sampleCount: 3 },
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:chunk:2',
        startTime: new Date('2026-06-20T01:00:00.000Z'),
        endTime: new Date('2026-06-20T05:00:00.000Z'),
        value: 4922,
        unit: 'count',
        timezone: 'Asia/Shanghai',
        sourceName: 'Garmin 24x7 FIT',
        sourcePriority: 55,
        sourceNamespace: 'garmin:china:export',
        aggregation: 'SUM',
        metadata: { sampleCount: 10 },
      },
      {
        provider: 'INTERVALS_ICU',
        externalId: 'garmin:chunk:2:duplicate',
        startTime: new Date('2026-06-20T01:00:00.000Z'),
        endTime: new Date('2026-06-20T05:00:00.000Z'),
        value: 4922,
        unit: 'count',
        timezone: 'Asia/Shanghai',
        sourceName: 'Garmin 24x7 FIT',
        sourcePriority: 55,
        sourceNamespace: 'garmin:china:export',
        aggregation: 'SUM',
        metadata: { sampleCount: 10 },
      },
    ]);
    prisma.userDailyHealthMetric.upsert.mockResolvedValueOnce({});

    await service.rebuildDailyMetric({
      userId: 'user-1',
      localDate: new Date('2026-06-20T00:00:00.000Z'),
      metricType: 'STEP_COUNT',
    });

    expect(prisma.externalHealthSample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectToDaily: true }),
      }),
    );

    expect(prisma.userDailyHealthMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          selectedProvider: 'INTERVALS_ICU',
          value: 5112,
          sourceBreakdown: expect.objectContaining({
            INTERVALS_ICU: expect.objectContaining({
              candidateCount: 2,
              duplicateCandidateCount: 1,
              sampleCount: 13,
            }),
          }),
        }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock',
      'health-daily-user|user-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock',
      'health-daily|user-1|2026-06-20|STEP_COUNT',
    );
  });

  it('atomically removes a missing authoritative candidate and reselects another provider', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.findMany
      .mockResolvedValueOnce([{ externalId: 'apple:steps' }])
      .mockResolvedValueOnce([
        {
          provider: 'INTERVALS_ICU',
          externalId: 'garmin:steps',
          startTime: new Date('2026-06-20T00:00:00.000Z'),
          endTime: new Date('2026-06-21T00:00:00.000Z'),
          value: 5000,
          unit: 'count',
          timezone: 'Asia/Shanghai',
          sourceName: 'Garmin',
          sourcePriority: 55,
          sourceNamespace: 'garmin:china:export',
          aggregation: 'SUM',
          metadata: { sampleCount: 10 },
        },
      ]);
    prisma.externalHealthSample.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.userDailyHealthMetric.upsert.mockResolvedValueOnce({});

    await service.replaceProviderDailyCandidates({
      userId: 'user-1',
      provider: 'MANUAL',
      connectionId: 'connection-1',
      localDate: new Date('2026-06-20T00:00:00.000Z'),
      managedMetricTypes: ['STEP_COUNT'],
      candidates: [],
    });

    expect(prisma.externalHealthSample.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'MANUAL',
          connectionId: 'connection-1',
          metricType: { in: ['STEP_COUNT'] },
        }),
        data: { deletedAt: expect.any(Date) },
      }),
    );
    expect(prisma.userDailyHealthMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          selectedProvider: 'INTERVALS_ICU',
          value: 5000,
        }),
      }),
    );
  });

  it('unlinks deleted and raw-only sources before attaching valid sources', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      {
        provider: 'MANUAL',
        externalId: 'polar:steps',
        startTime: new Date('2026-07-03T00:00:00.000Z'),
        endTime: new Date('2026-07-04T00:00:00.000Z'),
        value: 5000,
        unit: 'count',
        timezone: null,
        sourceName: 'Polar',
        sourcePriority: 70,
        sourceNamespace: 'polar:api',
        aggregation: 'LATEST',
        metadata: null,
      },
    ]);
    prisma.userDailyHealthMetric.upsert.mockResolvedValueOnce({
      id: 'daily-metric-1',
    });

    await service.rebuildDailyMetric({
      userId: 'user-1',
      localDate: new Date('2026-07-03T00:00:00.000Z'),
      metricType: 'STEP_COUNT',
    });

    expect(prisma.externalHealthSample.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        localDate: new Date('2026-07-03T00:00:00.000Z'),
        metricType: 'STEP_COUNT',
        OR: [{ projectToDaily: false }, { deletedAt: { not: null } }],
      },
      data: { dailyMetricId: null },
    });
  });

  it('persists raw-only eligibility and does not create a daily metric', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.upsert.mockResolvedValueOnce({
      id: 'raw-sample-1',
      dailyMetricId: null,
    });

    await expect(
      service.ingestCandidate({
        userId: 'user-1',
        candidate: {
          provider: 'INTERVALS_ICU',
          metricType: 'STEP_COUNT',
          externalId: 'suunto:raw-steps:1',
          localDate: new Date('2026-07-03T00:00:00.000Z'),
          startTime: new Date('2026-07-03T08:00:00.000Z'),
          endTime: new Date('2026-07-03T08:00:00.000Z'),
          value: 123,
          unit: 'count',
          projectToDaily: false,
        },
      }),
    ).resolves.toEqual({ projected: false, selected: false });

    expect(prisma.externalHealthSample.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ projectToDaily: false }),
        update: expect.objectContaining({ projectToDaily: false }),
      }),
    );
    expect(prisma.userDailyHealthMetric.upsert).not.toHaveBeenCalled();
  });

  it('ingests independent health candidates with at most four workers', async () => {
    const { prisma, service } = createService();
    let active = 0;
    let peak = 0;
    prisma.externalHealthSample.upsert.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { id: 'sample', dailyMetricId: null };
    });
    const localDate = new Date('2026-07-03T00:00:00.000Z');

    await expect(
      service.ingestCandidates({
        userId: 'user-1',
        candidates: Array.from({ length: 7 }, (_, index) => ({
          provider: 'INTERVALS_ICU' as const,
          metricType: 'HEART_RATE_SAMPLE_BPM',
          externalId: `suunto:heart-rate:${index}`,
          localDate,
          startTime: new Date(`2026-07-03T08:0${index}:00.000Z`),
          endTime: new Date(`2026-07-03T08:0${index}:00.000Z`),
          value: 120 + index,
          unit: 'bpm',
          projectToDaily: false,
        })),
      }),
    ).resolves.toMatchObject({ sampleCount: 7, projectedCount: 0 });

    expect(peak).toBe(4);
    expect(prisma.externalHealthSample.upsert).toHaveBeenCalledTimes(7);
  });

  it('tombstones raw points missing from an authoritative provider day', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.findMany.mockResolvedValueOnce([
      { externalId: 'polar:continuous-hr:user:2026-07-03:08:00:00:0' },
    ]);
    prisma.externalHealthSample.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.replaceProviderRawCandidates({
        userId: 'user-1',
        provider: 'MANUAL',
        connectionId: 'connection-1',
        localDate: new Date('2026-07-03T00:00:00.000Z'),
        managedMetricTypes: ['HEART_RATE_SAMPLE_BPM'],
        candidates: [],
      }),
    ).resolves.toMatchObject({
      sampleCount: 0,
      previousCount: 1,
      deletedCount: 1,
      rebuiltCount: 0,
    });

    expect(prisma.externalHealthSample.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: 'MANUAL',
        connectionId: 'connection-1',
        localDate: new Date('2026-07-03T00:00:00.000Z'),
        metricType: { in: ['HEART_RATE_SAMPLE_BPM'] },
        projectToDaily: false,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('cleans and rebuilds the old day when a scoped source moves dates', async () => {
    const { prisma, service } = createService();
    prisma.externalHealthSample.findMany
      .mockResolvedValueOnce([
        { externalId: 'suunto:sleep:1:SLEEP_SCORE', dailyMetricId: 'old-day' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.externalHealthSample.upsert.mockResolvedValueOnce({
      id: 'sample-1',
      dailyMetricId: 'old-day',
    });
    prisma.externalHealthSample.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.userDailyHealthMetric.findMany.mockResolvedValueOnce([
      {
        date: new Date('2026-06-20T00:00:00.000Z'),
        metricType: 'SLEEP_SCORE',
      },
    ]);
    prisma.userDailyHealthMetric.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await service.replaceProviderDailyCandidates({
      userId: 'user-1',
      provider: 'INTERVALS_ICU',
      localDate: new Date('2026-06-21T00:00:00.000Z'),
      managedMetricTypes: ['SLEEP_SCORE'],
      externalIdPrefix: 'suunto:sleep:1:',
      candidates: [
        {
          provider: 'INTERVALS_ICU',
          metricType: 'SLEEP_SCORE',
          externalId: 'suunto:sleep:1:SLEEP_SCORE',
          localDate: new Date('2026-06-21T00:00:00.000Z'),
          startTime: new Date('2026-06-20T22:00:00.000Z'),
          endTime: new Date('2026-06-21T06:00:00.000Z'),
          value: 80,
          unit: 'score',
        },
      ],
    });

    expect(prisma.externalHealthSample.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.not.objectContaining({
          localDate: expect.anything(),
        }),
      }),
    );
    expect(prisma.userDailyHealthMetric.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        date: new Date('2026-06-20T00:00:00.000Z'),
        metricType: 'SLEEP_SCORE',
      },
    });
  });
});
