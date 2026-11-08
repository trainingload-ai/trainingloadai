import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { PeakType, ScaleType, SportType } from '@prisma/client';
import { calculateCp } from '@/algorithm/fitness-cp';
import { FitnessTimelineObservationService } from '../fitness-timeline-observation.service';

jest.mock('@/algorithm/fitness-cp', () => {
  const actual = jest.requireActual<typeof import('@/algorithm/fitness-cp')>(
    '@/algorithm/fitness-cp',
  );
  return {
    ...actual,
    calculateCp: jest.fn((...args: Parameters<typeof actual.calculateCp>) =>
      actual.calculateCp(...args),
    ),
  };
});

const actualCp = jest.requireActual<typeof import('@/algorithm/fitness-cp')>(
  '@/algorithm/fitness-cp',
);

afterEach(() => {
  jest.mocked(calculateCp).mockReset();
  jest.mocked(calculateCp).mockImplementation(actualCp.calculateCp);
});

function fixture(lthrRows: object[] = []) {
  const activityPeakMetric = {
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => ({
      activityId: 42,
      scaleValue: 5,
      value: 184,
    })),
  };
  const prisma = {
    activityPeakMetric,
    activityLthrObservation: { findMany: jest.fn(async () => lthrRows) },
    activity: { findMany: jest.fn(async () => []) },
  };
  const analysisConfigs = {
    listVersions: jest.fn(async () => []),
    resolveFromVersionsOrDefault: jest.fn(() => ({
      defaultVdotSource: 'FACTOR',
      vo2maxCorrectionFactor: 1,
    })),
  };
  return {
    service: new FitnessTimelineObservationService(
      prisma as never,
      analysisConfigs as never,
    ),
    activityPeakMetric,
    prisma,
  };
}

describe('FitnessTimelineObservationService', () => {
  it('initializes MAX_HR from a five-second endurance-sport observation', async () => {
    const { service, activityPeakMetric } = fixture();
    const observations = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-01T11:00:00.000Z'),
      eligibleActivityIds: [42],
      profile: {},
      currentMaxHr: null,
      currentRestingHr: null,
    });

    expect(observations).toEqual([
      expect.objectContaining({ metric: 'MAX_HR', value: 184 }),
    ]);
    expect(activityPeakMetric.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scaleValue: 5,
          activity: {
            sportType: {
              in: [SportType.RUN, SportType.CYCLING, SportType.SWIM],
            },
          },
        }),
      }),
    );
  });

  it('does not publish a single uncorroborated LTHR observation', async () => {
    const { service } = fixture([
      {
        id: 'lthr-1',
        activityId: 42,
        candidateBpm: 170,
        observedAt: new Date('2026-01-01T10:00:00.000Z'),
        protocol: 'OBSERVED',
        qualityWeight: 1,
        sport: SportType.RUN,
      },
    ]);
    const observations = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-01T11:00:00.000Z'),
      eligibleActivityIds: [42],
      profile: {},
      currentMaxHr: 200,
      currentRestingHr: 60,
    });

    expect(observations.some((row) => row.metric === 'LTHR')).toBe(false);
  });

  it('preloads replay evidence once and performs change-point calculations without more database reads', async () => {
    const { service, activityPeakMetric, prisma } = fixture();
    activityPeakMetric.findMany.mockResolvedValueOnce([
      {
        activityId: 42,
        sport: SportType.RUN,
        type: 'hr',
        scaleType: 'TIME',
        scaleValue: 5,
        value: 184,
        activity: {
          sportType: SportType.RUN,
          sportDefinitionCode: 'RUNNING',
          startTime: new Date('2026-01-01T10:00:00.000Z'),
          activitySources: [],
        },
      },
    ] as never);
    const prepared = await service.prepare('user-1', [42]);
    jest.clearAllMocks();

    const observations = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-01T11:00:00.000Z'),
      eligibleActivityIds: [42],
      profile: {},
      currentMaxHr: null,
      currentRestingHr: null,
      prepared,
    });

    expect(observations).toEqual([
      expect.objectContaining({ metric: 'MAX_HR', value: 184 }),
    ]);
    expect(activityPeakMetric.findMany).not.toHaveBeenCalled();
    expect(activityPeakMetric.findFirst).not.toHaveBeenCalled();
    expect(prisma.activityLthrObservation.findMany).not.toHaveBeenCalled();
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
  });

  it('uses each activity frozen VO2 value instead of reinterpreting it with current preferences', async () => {
    const { service, prisma } = fixture();
    prisma.activity.findMany.mockResolvedValueOnce([
      {
        id: 42,
        startTime: new Date('2026-01-01T10:00:00.000Z'),
        sportType: SportType.RUN,
        vo2max: {
          vo2maxVdotByFactor: 39,
          vo2maxVdotByHr: 41,
          vo2maxVdotByRace: 43,
        },
        fitnessMetricsSnapshot: {
          resolutionVersion: 4,
          resolvedVo2maxValue: 52,
        },
      },
    ] as never);
    const prepared = await service.prepare('user-1', [42]);

    const observations = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-01T10:00:00.000Z'),
      eligibleActivityIds: [42],
      profile: {
        defaultVdotSource: 'STANDARD',
        vo2maxCorrectionFactor: 0.5,
      } as never,
      prepared,
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'VO2_MAX', value: 52 }),
      ]),
    );
  });

  it('produces a causal rolling VO2 timeline at each activity end', async () => {
    const { service, prisma } = fixture();
    prisma.activity.findMany.mockResolvedValueOnce([
      {
        id: 41,
        startTime: new Date('2026-01-01T10:00:00.000Z'),
        sportType: SportType.RUN,
        vo2max: {},
        fitnessMetricsSnapshot: {
          resolutionVersion: 4,
          resolvedVo2maxValue: 40,
        },
      },
      {
        id: 42,
        startTime: new Date('2026-01-11T10:00:00.000Z'),
        sportType: SportType.RUN,
        vo2max: {},
        fitnessMetricsSnapshot: {
          resolutionVersion: 4,
          resolvedVo2maxValue: 50,
        },
      },
    ] as never);
    const prepared = await service.prepare('user-1', [41, 42]);

    const first = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-01T11:00:00.000Z'),
      eligibleActivityIds: [41],
      profile: {},
      prepared,
    });
    const second = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-11T11:00:00.000Z'),
      eligibleActivityIds: [41, 42],
      profile: {},
      prepared,
    });

    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'VO2_MAX',
          value: 40,
          sourceActivityIds: [41],
        }),
      ]),
    );
    const secondVo2 = second.find((row) => row.metric === 'VO2_MAX');
    expect(secondVo2?.sourceActivityIds).toEqual([41, 42]);
    expect(secondVo2?.value).toBeGreaterThan(45);
    expect(secondVo2?.value).toBeLessThan(50);
  });

  it('uses the best in-window CS point even when an older 180-day TP point is faster', async () => {
    const { service, activityPeakMetric } = fixture();
    const effectiveAt = new Date('2026-04-11T12:00:00.000Z');
    const paceRow = (
      activityId: number,
      distance: number,
      speed: number,
      startTime: string,
    ) => ({
      activityId,
      sport: SportType.RUN,
      type: PeakType.pace,
      scaleType: ScaleType.DISTANCE,
      scaleValue: distance,
      value: speed,
      activity: {
        sportType: SportType.RUN,
        sportDefinitionCode: 'RUNNING',
        startTime: new Date(startTime),
        activitySources: [],
      },
    });
    activityPeakMetric.findMany.mockResolvedValueOnce([
      // 100 days old and faster: valid for TP's 180-day window, invalid for
      // CS's 90-day window. It must not shadow activity 1.
      paceRow(4, 1000, 5.5, '2026-01-01T10:00:00.000Z'),
      paceRow(1, 1000, 5, '2026-04-01T10:00:00.000Z'),
      paceRow(2, 2000, 2000 / 450, '2026-04-02T10:00:00.000Z'),
      paceRow(3, 3000, 3000 / 700, '2026-04-03T10:00:00.000Z'),
    ] as never);
    const prepared = await service.prepare('user-1', [1, 2, 3, 4]);

    const observations = await service.calculate({
      userId: 'user-1',
      effectiveAt,
      eligibleActivityIds: [1, 2, 3, 4],
      profile: {},
      currentMaxHr: null,
      currentRestingHr: null,
      prepared,
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'CS',
          sport: SportType.RUN,
          sourceActivityIds: [1, 2, 3],
        }),
      ]),
    );
  });

  function powerPeaks(points: Array<{ seconds: number; value: number }>) {
    return points.map((point) => ({
      activityId: 7,
      sport: SportType.RUN,
      type: PeakType.power,
      scaleType: ScaleType.TIME,
      scaleValue: point.seconds,
      value: point.value,
      activity: {
        sportType: SportType.RUN,
        sportDefinitionCode: 'RUNNING',
        startTime: new Date('2026-01-01T10:00:00.000Z'),
        activitySources: [],
      },
    }));
  }

  async function observePower(
    points: Array<{ seconds: number; value: number }>,
  ) {
    const { service, activityPeakMetric } = fixture();
    activityPeakMetric.findMany.mockResolvedValueOnce(
      powerPeaks(points) as never,
    );
    const prepared = await service.prepare('user-1', [7]);
    const observations = await service.calculate({
      userId: 'user-1',
      effectiveAt: new Date('2026-01-01T11:00:00.000Z'),
      eligibleActivityIds: [7],
      profile: {},
      currentMaxHr: null,
      currentRestingHr: null,
      prepared,
    });
    return observations.filter((row) =>
      ['CP', 'FTP', 'W_PRIME', 'P_MAX'].includes(row.metric),
    );
  }

  const modeledCurve = [
    { seconds: 30, value: 800 },
    { seconds: 60, value: 650 },
    { seconds: 180, value: 500 },
    { seconds: 600, value: 430 },
    { seconds: 1200, value: 330 },
    { seconds: 3600, value: 280 },
  ];

  it('publishes an in-range power model', async () => {
    const observations = await observePower(modeledCurve);

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'CP',
          sport: SportType.RUN,
          value: 401,
        }),
        expect.objectContaining({
          metric: 'FTP',
          sport: SportType.RUN,
          value: 381,
        }),
        expect.objectContaining({
          metric: 'P_MAX',
          sport: SportType.RUN,
          value: 800,
        }),
        expect.objectContaining({
          metric: 'W_PRIME',
          sport: SportType.RUN,
          value: 84655,
        }),
      ]),
    );
  });

  it('does not emit a power model whose W′ or Pmax is outside product bounds', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.mocked(calculateCp).mockReturnValue({
      valid: true,
      reason: undefined,
      cp: 280,
      ftp: 266,
      wPrime: 124430,
      pMax: 4200,
      iterations: 1,
      converged: true,
    });

    const observations = await observePower(modeledCurve);

    expect(observations).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("W'=124430"));
    warn.mockRestore();
  });

  it('does not emit a power model that breaks the CP/FTP relationship', async () => {
    jest.mocked(calculateCp).mockReturnValue({
      valid: true,
      reason: undefined,
      cp: 250,
      ftp: 80,
      wPrime: 20000,
      pMax: 800,
      iterations: 1,
      converged: true,
    });

    const observations = await observePower(modeledCurve);

    expect(observations).toEqual([]);
  });
});
