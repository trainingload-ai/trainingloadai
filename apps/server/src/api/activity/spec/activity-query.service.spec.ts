import { describe, expect, it, jest } from '@jest/globals';
import { $Enums } from '@prisma/client';
import { ActivityQueryService } from '../activity-query.service';

function createService(overrides?: {
  activities?: Array<Record<string, unknown>>;
  count?: number;
  mirrors?: Array<{
    mirror: Record<string, unknown>;
    sortTime: Date | null;
  }>;
  loads?: Map<
    number,
    { actualLoad: number | null; actualLoadSource?: string | null }
  >;
  thumbUrls?: Map<number, { lightUrl: string | null; darkUrl: string | null }>;
}) {
  const activities = overrides?.activities ?? [];
  const prisma = {
    activity: {
      count: jest.fn(async () => overrides?.count ?? activities.length),
      findMany: jest.fn(async (_args: unknown) => activities),
      findFirst: jest.fn(
        async (_args: unknown): Promise<Record<string, unknown> | null> => null,
      ),
    },
  };
  const users = {
    bodyMetrics: () => ({ findFirst: jest.fn(async () => null) }),
  };
  const planQuery = { findActiveDateRange: jest.fn(async () => null) };
  const loadReadout = {
    batchGetActualLoad: jest.fn(
      async () => overrides?.loads ?? new Map([[7, { actualLoad: 51 }]]),
    ),
    getActualLoadForActivity: jest.fn(async () => ({
      actualLoad: 51,
      actualLoadSource: 'TRIMP',
    })),
  };
  const thumbJobs = {
    getSucceededThumbUrlVariantMap: jest.fn(
      async () => overrides?.thumbUrls ?? new Map(),
    ),
  };
  const mapDerivation = {
    ensureThumbsBestEffort: jest.fn(async () => undefined),
  };
  const externalActivityMirrors = {
    listForUser: jest.fn(async () => []),
    listTimelineCandidates: jest.fn(async () => overrides?.mirrors ?? []),
  };
  const service = new ActivityQueryService(
    prisma as never,
    users as never,
    { t: jest.fn((key: string) => key) } as never,
    planQuery as never,
    loadReadout as never,
    thumbJobs as never,
    mapDerivation as never,
    { read: jest.fn(async () => null) } as never,
    externalActivityMirrors as never,
  );
  return { service, prisma, mapDerivation, externalActivityMirrors };
}

describe('ActivityQueryService', () => {
  it('returns one server-ordered timeline across formal activities and mirrors', async () => {
    const { service } = createService({
      activities: [
        {
          id: 7,
          hashId: 'activity-7',
          activityName: 'Morning ride',
          sportType: $Enums.SportType.CYCLING,
          startTime: new Date('2026-08-20T01:00:00.000Z'),
          elapsedTime: 3600,
          activitySources: [],
          thirdPartyMappings: [],
          planWorkoutLinks: [],
          vo2max: null,
        },
      ],
      mirrors: [
        {
          sortTime: new Date('2026-08-20T02:00:00.000Z'),
          mirror: {
            id: 'mirror-1',
            kind: 'external_activity_mirror',
            title: 'Restricted run',
            startTime: '2026-08-20T02:00:00.000Z',
            discoveredVia: 'intervals_icu',
            originProvider: 'unknown',
            status: 'BLOCKED',
            reason: 'ORIGIN_CONNECTION_REQUIRED',
            action: 'MANAGE_CONNECTION',
          },
        },
      ],
    });

    const result = await service.getActivityTimeline({
      userId: 'user-1',
      limit: 20,
    });

    expect(result.items.map((item) => item.kind)).toEqual([
      'external_activity_mirror',
      'activity',
    ]);
    expect(result.totalActivities).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it('uses the last server item as an opaque cursor and excludes mirrors for sport filters', async () => {
    const { service, externalActivityMirrors } = createService({
      activities: [
        {
          id: 9,
          hashId: 'activity-9',
          activityName: 'Run',
          sportType: $Enums.SportType.RUN,
          startTime: new Date('2026-08-20T03:00:00.000Z'),
          activitySources: [],
          thirdPartyMappings: [],
          planWorkoutLinks: [],
          vo2max: null,
        },
        {
          id: 8,
          hashId: 'activity-8',
          activityName: 'Earlier run',
          sportType: $Enums.SportType.RUN,
          startTime: new Date('2026-08-20T02:00:00.000Z'),
          activitySources: [],
          thirdPartyMappings: [],
          planWorkoutLinks: [],
          vo2max: null,
        },
      ],
    });

    const firstPage = await service.getActivityTimeline({
      userId: 'user-1',
      filters: { sportType: 'RUN' },
      limit: 1,
    });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(
      externalActivityMirrors.listTimelineCandidates,
    ).not.toHaveBeenCalled();
  });

  it('keeps list filtering, readout enrichment and thumbnail backfill together', async () => {
    const startTime = new Date('2026-08-20T01:00:00.000Z');
    const { service, prisma, mapDerivation } = createService({
      activities: [
        {
          id: 7,
          hashId: 'activity-7',
          activityName: 'Morning ride',
          sportType: $Enums.SportType.CYCLING,
          sportDefinitionCode: null,
          subSport: null,
          startTime,
          endTime: new Date('2026-08-20T02:00:00.000Z'),
          elapsedTime: 3600,
          distance: 30_000,
          timezone: 'Asia/Shanghai',
          activitySources: [],
          thirdPartyMappings: [],
          planWorkoutLinks: [],
          vo2max: null,
        },
      ],
    });

    const result = await service.getActivities(
      'user-1',
      { thirdPartyProvider: 'manual' },
      {},
      2,
      10,
    );

    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    const query = prisma.activity.findMany.mock.calls[0][0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    expect(query.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ activitySources: expect.any(Object) }),
          ]),
        }),
      ]),
    );
    expect(result).toMatchObject({
      total: 1,
      activities: [
        {
          id: 7,
          hashId: 'activity-7',
          load: 51,
          mapThumbnailUrl: null,
        },
      ],
    });
    expect(mapDerivation.ensureThumbsBestEffort).toHaveBeenCalledWith(
      [7],
      'user-1',
    );
  });

  it('does not materialize missing thumbnails for a read-only Demo feed', async () => {
    const { service, mapDerivation } = createService({
      activities: [
        {
          id: 7,
          hashId: 'activity-7',
          activityName: 'Public Demo ride',
          sportType: $Enums.SportType.CYCLING,
          startTime: new Date('2026-08-20T01:00:00.000Z'),
          elapsedTime: 3600,
          activitySources: [],
          thirdPartyMappings: [],
          planWorkoutLinks: [],
          vo2max: null,
        },
      ],
    });

    const result = await service.getActivityTimeline({
      userId: 'demo-owner',
      limit: 20,
      readOnly: true,
    });

    expect(result.items).toHaveLength(1);
    expect(mapDerivation.ensureThumbsBestEffort).not.toHaveBeenCalled();
  });

  it('orders AI search candidates by derived load', async () => {
    const rows = [
      {
        id: 1,
        startTime: new Date('2026-08-01T00:00:00.000Z'),
        trimp: { trimp100: 30 },
        coggan: null,
      },
      {
        id: 2,
        startTime: new Date('2026-08-02T00:00:00.000Z'),
        trimp: null,
        coggan: { bikeStress: 80 },
      },
      {
        id: 3,
        startTime: new Date('2026-08-03T00:00:00.000Z'),
        trimp: null,
        coggan: null,
      },
    ];
    const { service, prisma } = createService({
      activities: rows,
      loads: new Map([
        [1, { actualLoad: 30 }],
        [2, { actualLoad: 80 }],
        [3, { actualLoad: 50 }],
      ]),
    });

    const result = await service.searchActivitiesForAi({
      userId: 'user-1',
      limit: 1,
      offset: 1,
      sortBy: 'load',
      order: 'desc',
    });

    expect(result.map((row) => row.id)).toEqual([3]);
    expect(result.map((row) => row.aiLoad)).toEqual([50]);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2_001 }),
    );
    expect(prisma.activity.findMany.mock.calls[0][0]).not.toHaveProperty(
      'skip',
    );
  });

  it('enriches recent AI activities with the same resolved load as the feed', async () => {
    const { service } = createService({
      activities: [
        {
          id: 2415,
          hashId: 'activity-2415',
          sportType: $Enums.SportType.RUN,
          trimp: { trimp100: 0 },
          coggan: { bikeStress: 0 },
          vo2max: null,
        },
      ],
      loads: new Map([[2415, { actualLoad: 51.6, actualLoadSource: 'PACE' }]]),
    });

    const rows = await service.getRecentActivitiesForAi({
      userId: 'user-1',
      limit: 10,
    });

    expect(rows[0]).toMatchObject({
      aiLoad: 51.6,
      aiLoadSource: 'PACE',
    });
  });

  it('uses the same pace load as the activity screen and preserves unknown loads', async () => {
    const { service } = createService({
      activities: [{ id: 2415, trimp: null, coggan: null }, { id: 2416 }],
      loads: new Map([
        [2415, { actualLoad: 1.7499, actualLoadSource: 'PACE' }],
      ]),
    });
    const rows = await service.searchActivitiesForAi({
      userId: 'user-1',
      limit: 2,
    });
    expect(rows[0]).toMatchObject({ aiLoad: 1.7499, aiLoadSource: 'PACE' });
    expect(rows[1]).toMatchObject({ aiLoad: null, aiLoadSource: null });
  });

  it('loads peak interval relations on the hash-id detail path', async () => {
    const { service, prisma } = createService();
    prisma.activity.findFirst.mockResolvedValueOnce({
      id: 144,
      hashId: 'activity-144',
      userId: 'user-1',
      sportDefinitionCode: null,
      subSport: null,
      avgSpeed: 2.55,
      laps: [],
      activityPeakMetrics: [{ type: 'power', scaleValue: 300 }],
      activityPerformanceTTs: [],
    });

    const result = await service.getActivityByIdentifier(
      'activity-144',
      'user-1',
    );

    expect(prisma.activity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          laps: true,
          activityPeakMetrics: expect.any(Object),
          activityPerformanceTTs: expect.any(Object),
        }),
      }),
    );
    expect(result).toMatchObject({
      averageSpeed: 2.55,
      activityPeakMetrics: [{ type: 'power', scaleValue: 300 }],
    });
  });
});
