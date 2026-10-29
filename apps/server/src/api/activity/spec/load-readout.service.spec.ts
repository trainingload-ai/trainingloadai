import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
import { LoadReadoutService } from '../load-readout.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';

type ActivityRow = ReturnType<typeof activity>;

function createService(args?: {
  profileByUserId?: Record<string, { loadSources?: string | null } | null>;
  activity?: ActivityRow | null;
  activities?: ActivityRow[];
}) {
  const prisma = {
    userProfile: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        return args?.profileByUserId?.[where.userId] ?? null;
      }),
    },
    activity: {
      findFirst: jest.fn(async () => args?.activity ?? null),
      findMany: jest.fn(async () => args?.activities ?? []),
    },
  };
  const activityRead = {
    findFirst: prisma.activity.findFirst,
    findMany: prisma.activity.findMany,
  };
  const users = {
    profiles: () => prisma.userProfile,
  };
  const service = new LoadReadoutService(
    prisma as never,
    activityRead as never,
    users as never,
  );
  return { service, prisma };
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    userId: 'user-1',
    sportType: SportType.RUN,
    sportDefinitionCode: 'ROAD_RUNNING',
    sessionRpe: null,
    timerTime: 3600,
    elapsedTime: 3600,
    coggan: null,
    trimp: null,
    bikeScore: null,
    govss: null,
    swimScore: null,
    fitnessMetricsSnapshot: { csValue: 3.2 },
    ...overrides,
  };
}

describe('LoadReadoutService.getUserLoadSources', () => {
  it('parses valid load source priority tokens case-insensitively', async () => {
    const { service, prisma } = createService({
      profileByUserId: {
        'user-1': { loadSources: ' sessionrpe, pace, power, nope ' },
      },
    });

    await expect(service.getUserLoadSources('user-1')).resolves.toEqual([
      'SESSIONRPE',
      'PACE',
      'POWER',
    ]);
    expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('falls back to default sources when no valid profile preference exists', async () => {
    const { service } = createService({
      profileByUserId: {
        'user-1': { loadSources: 'bad, worse' },
      },
    });

    await expect(service.getUserLoadSources('user-1')).resolves.toEqual([
      'POWER',
      'HEART_RATE',
      'PACE',
      'SESSIONRPE',
    ]);
  });

  it('falls back to default sources if profile lookup fails', async () => {
    const { service, prisma } = createService();
    prisma.userProfile.findUnique.mockRejectedValueOnce(new Error('db down'));

    await expect(service.getUserLoadSources('user-1')).resolves.toEqual([
      'POWER',
      'HEART_RATE',
      'PACE',
      'SESSIONRPE',
    ]);
  });
});

describe('LoadReadoutService.getActualLoadForActivity', () => {
  it('picks the first positive source from the user priority list', async () => {
    const { service } = createService({
      profileByUserId: {
        'user-1': { loadSources: 'HEART_RATE,POWER,PACE' },
      },
      activity: activity({
        coggan: { bikeStress: 80 },
        trimp: { trimp100: 55 },
        govss: { govss: 60 },
      }),
    });

    await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
      actualLoad: 55,
      actualLoadSource: 'HEART_RATE',
    });
  });

  it('uses session RPE when it is prioritized over metric tracks', async () => {
    const { service } = createService({
      profileByUserId: {
        'user-1': { loadSources: 'SESSIONRPE,POWER' },
      },
      activity: activity({
        sessionRpe: 8,
        coggan: { bikeStress: 80 },
      }),
    });

    await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
      actualLoad: 80,
      actualLoadSource: 'SESSIONRPE',
    });
  });

  it.each([
    [SportType.RUN, { govss: { govss: 42 }, bikeScore: { bikeScore: 99 } }, 42],
    [SportType.CYCLING, { bikeScore: { bikeScore: 88 } }, 88],
    [SportType.SWIM, { swimScore: { swimScore: 33 } }, 33],
  ])(
    'uses sport-specific PACE load for %s',
    async (sportType, metrics, load) => {
      const { service } = createService({
        profileByUserId: {
          'user-1': { loadSources: 'PACE' },
        },
        activity: activity({
          sportType,
          ...metrics,
        }),
      });

      await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
        actualLoad: load,
        actualLoadSource: 'PACE',
      });
    },
  );

  it.each(['WALKING', 'HIKING'])(
    'does not expose running GOVSS as PACE load for %s',
    async (sportDefinitionCode) => {
      const { service } = createService({
        profileByUserId: {
          'user-1': { loadSources: 'PACE' },
        },
        activity: activity({
          sportDefinitionCode,
          govss: { govss: 132 },
        }),
      });

      await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
        actualLoad: null,
        actualLoadSource: null,
      });
    },
  );

  it('trusts an already persisted GOVSS even when the snapshot CS is stale', async () => {
    const { service } = createService({
      profileByUserId: {
        'user-1': { loadSources: 'PACE' },
      },
      activity: activity({
        govss: { govss: 132 },
        fitnessMetricsSnapshot: { csValue: 1 },
      }),
    });

    await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
      actualLoad: 132,
      actualLoadSource: 'PACE',
    });
  });

  it('uses persisted GOVSS when it was computed from TP and CS is absent', async () => {
    const { service } = createService({
      activity: activity({
        sessionRpe: 2,
        timerTime: 1259,
        elapsedTime: 1259,
        govss: { govss: 132 },
        fitnessMetricsSnapshot: { csValue: null },
      }),
    });

    await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
      actualLoad: 132,
      actualLoadSource: 'PACE',
    });
  });

  it('does not expose estimated cycling power as formal load', async () => {
    const { service } = createService({
      activity: activity({
        sportType: SportType.CYCLING,
        sessionRpe: 5,
        timerTime: 3600,
        elapsedTime: 3600,
        coggan: { bikeStress: 105 },
        bikeScore: { bikeScore: 115 },
        activitySources: [
          { metadata: { datasetQuality: { powerCoverage: 0 } } },
        ],
      }),
    });

    await expect(service.getActualLoadForActivity(101)).resolves.toEqual({
      actualLoad: 50,
      actualLoadSource: 'SESSIONRPE',
    });
  });

  it('returns null readout for missing activities or non-positive metrics', async () => {
    const missing = createService();
    await expect(
      missing.service.getActualLoadForActivity(404),
    ).resolves.toEqual({
      actualLoad: null,
      actualLoadSource: null,
    });

    const noPositive = createService({
      profileByUserId: {
        'user-1': { loadSources: 'POWER,HEART_RATE,PACE,SESSIONRPE' },
      },
      activity: activity({
        sessionRpe: -1,
        coggan: { bikeStress: 0 },
        trimp: { trimp100: null },
        govss: { govss: -5 },
      }),
    });
    await expect(
      noPositive.service.getActualLoadForActivity(101),
    ).resolves.toEqual({
      actualLoad: null,
      actualLoadSource: null,
    });
  });
});

describe('LoadReadoutService.batchGetActualLoad', () => {
  it('loads user preferences once per user and returns readouts by activity id', async () => {
    const { service, prisma } = createService({
      profileByUserId: {
        'user-1': { loadSources: 'PACE,POWER' },
        'user-2': { loadSources: 'HEART_RATE,SESSIONRPE' },
      },
      activities: [
        activity({
          id: 101,
          userId: 'user-1',
          sportType: SportType.RUN,
          coggan: { bikeStress: 80 },
          govss: { govss: 45 },
        }),
        activity({
          id: 102,
          userId: 'user-1',
          sportType: SportType.CYCLING,
          coggan: { bikeStress: 90 },
          bikeScore: { bikeScore: 50 },
        }),
        activity({
          id: 201,
          userId: 'user-2',
          sportType: SportType.RUN,
          sessionRpe: 6,
          timerTime: 1800,
          elapsedTime: 1800,
          trimp: { trimp100: 70 },
        }),
      ],
    });

    const readouts = await service.batchGetActualLoad([101, 102, 201]);

    expect(prisma.activity.findMany).toHaveBeenCalledWith({
      where: readyActivityWhere({ id: { in: [101, 102, 201] } }),
      select: expect.any(Object),
    });
    expect(prisma.userProfile.findUnique).toHaveBeenCalledTimes(2);
    expect(readouts.get(101)).toEqual({
      actualLoad: 45,
      actualLoadSource: 'PACE',
    });
    expect(readouts.get(102)).toEqual({
      actualLoad: 50,
      actualLoadSource: 'PACE',
    });
    expect(readouts.get(201)).toEqual({
      actualLoad: 70,
      actualLoadSource: 'HEART_RATE',
    });
  });

  it('returns an empty map without querying when activity id list is empty', async () => {
    const { service, prisma } = createService();

    const readouts = await service.batchGetActualLoad([]);

    expect(readouts.size).toBe(0);
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });
});
