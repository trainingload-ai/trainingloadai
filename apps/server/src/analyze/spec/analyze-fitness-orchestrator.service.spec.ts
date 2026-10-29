import { describe, expect, it, jest } from '@jest/globals';
import { MetricSource, SportType } from '@prisma/client';
import {
  AnalyzeFitnessOrchestratorService,
  UserFitnessRefreshError,
} from '../analyze-fitness-orchestrator.service';

describe('AnalyzeFitnessOrchestratorService refresh failures', () => {
  function createService() {
    return new AnalyzeFitnessOrchestratorService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('runs every PRE task and propagates real task failures', async () => {
    const service = createService();
    const failure = new Error('database unavailable');
    jest
      .spyOn(service, 'recalculateUserCPAndFTP')
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    jest.spyOn(service, 'recalculateUserCS').mockResolvedValue(undefined);
    jest.spyOn(service, 'recalculateUserTP').mockResolvedValue(undefined);
    jest.spyOn(service, 'recalculateUserLTHR').mockResolvedValue(undefined);
    jest
      .spyOn(service, 'observeMaxHrFromActivitiesAndUpdate')
      .mockResolvedValue(undefined);

    const result = service.refreshUserFitnessProfilePre('user-1', [
      SportType.RUN,
      SportType.CYCLING,
    ]);

    await expect(result).rejects.toMatchObject({
      name: 'UserFitnessRefreshError',
      stage: 'PRE',
      userId: 'user-1',
      failures: [{ task: 'CP_FTP:RUN', error: failure }],
    } satisfies Partial<UserFitnessRefreshError>);
    expect(service.recalculateUserCPAndFTP).toHaveBeenCalledTimes(2);
    expect(service.recalculateUserCS).toHaveBeenCalledTimes(2);
    expect(service.recalculateUserTP).toHaveBeenCalledTimes(1);
    expect(service.recalculateUserLTHR).toHaveBeenCalledTimes(1);
    expect(service.observeMaxHrFromActivitiesAndUpdate).toHaveBeenCalledTimes(
      1,
    );
  });

  it('promotes a corroborated passive LTHR estimate to AUTO', async () => {
    const findMany = jest.fn(async () => [
      {
        id: 'obs-1',
        activityId: 101,
        candidateBpm: 173,
        observedAt: new Date('2026-08-03T06:00:00.000Z'),
        protocol: 'OBSERVED',
        algorithmVersion: 1,
      },
      {
        id: 'obs-2',
        activityId: 102,
        candidateBpm: 175,
        observedAt: new Date('2026-08-06T06:00:00.000Z'),
        protocol: 'OBSERVED',
        algorithmVersion: 1,
      },
    ]);
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const getEffectiveUserFitnessMetric = jest.fn(
      async (_userId: string, type: string) =>
        type === 'MAX_HR' ? { value: 190 } : { value: 55 },
    );
    const getUserFitnessMetric = jest.fn(async () => ({ value: 171 }));
    const service = new AnalyzeFitnessOrchestratorService(
      { activityLthrObservation: { findMany } } as never,
      {
        upsertFitnessMetric,
        getEffectiveUserFitnessMetric,
        getUserFitnessMetric,
      } as never,
      {} as never,
      {} as never,
    );
    const calculationDate = new Date('2026-08-07T00:00:00.000Z');

    await service.recalculateUserLTHR('user-1', calculationDate, [
      SportType.RUN,
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(upsertFitnessMetric).toHaveBeenCalledWith(
      'user-1',
      'LTHR',
      175,
      SportType.RUN,
      undefined,
      MetricSource.AUTO,
      calculationDate,
      expect.objectContaining({
        originPayload: expect.objectContaining({
          method: 'PASSIVE_30M_TAIL20',
          tier: 'CORROBORATED',
          supportCount: 2,
        }),
      }),
    );
  });

  it('keeps one passive LTHR observation on the ESTIMATED track', async () => {
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      {
        activityLthrObservation: {
          findMany: jest.fn(async () => [
            {
              id: 'obs-1',
              activityId: 101,
              candidateBpm: 174,
              observedAt: new Date('2026-08-06T06:00:00.000Z'),
              protocol: 'OBSERVED',
              algorithmVersion: 1,
            },
          ]),
        },
      } as never,
      {
        upsertFitnessMetric,
        getEffectiveUserFitnessMetric: jest.fn(
          async (_userId: string, type: string) =>
            type === 'MAX_HR' ? { value: 190 } : { value: 55 },
        ),
        getUserFitnessMetric: jest.fn(async () => null),
      } as never,
      {} as never,
      {} as never,
    );
    const calculationDate = new Date('2026-08-07T00:00:00.000Z');

    await service.recalculateUserLTHR('user-1', calculationDate, [
      SportType.RUN,
    ]);

    expect(upsertFitnessMetric).toHaveBeenCalledWith(
      'user-1',
      'LTHR',
      174,
      SportType.RUN,
      undefined,
      MetricSource.ESTIMATED,
      calculationDate,
      expect.objectContaining({
        originPayload: expect.objectContaining({
          tier: 'SINGLE_HIGH_QUALITY',
        }),
      }),
    );
  });

  it('excludes power peaks whose original source has no measured power', async () => {
    const findMany = jest.fn(async () =>
      [1, 5, 10, 60, 300, 1200].map((scaleValue) => ({
        scaleValue,
        value: 100,
        activity: {
          activitySources: [
            { metadata: { datasetQuality: { powerCoverage: 0 } } },
          ],
        },
      })),
    );
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      { activityPeakMetric: { findMany } } as never,
      { upsertFitnessMetric } as never,
      {} as never,
      {} as never,
    );

    await service.recalculateUserCPAndFTP(
      'user-no-power',
      SportType.CYCLING,
      new Date('2026-08-13T00:00:00.000Z'),
    );

    expect(upsertFitnessMetric).not.toHaveBeenCalled();
  });

  it('publishes a CP model as one atomic batch instead of parallel metric transactions', async () => {
    const durations = [30, 60, 180, 600, 1200, 3600];
    const powers = [800, 650, 500, 430, 330, 280];
    const findMany = jest.fn(async () =>
      durations.map((scaleValue, index) => ({
        scaleValue,
        value: powers[index],
        activity: {
          activitySources: [
            { metadata: { datasetQuality: { powerCoverage: 1 } } },
          ],
        },
      })),
    );
    const upsertAutoFitnessMetrics = jest.fn(async () => []);
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      { activityPeakMetric: { findMany } } as never,
      { upsertAutoFitnessMetrics, upsertFitnessMetric } as never,
      {} as never,
      {} as never,
    );
    const calculationDate = new Date('2026-10-13T00:00:00.000Z');

    await service.recalculateUserCPAndFTP(
      'user-power-model',
      SportType.CYCLING,
      calculationDate,
    );

    expect(upsertAutoFitnessMetrics).toHaveBeenCalledTimes(1);
    expect(upsertAutoFitnessMetrics).toHaveBeenCalledWith(
      'user-power-model',
      SportType.CYCLING,
      [
        { type: 'CP', value: 401 },
        { type: 'FTP', value: 381 },
        { type: 'P_MAX', value: 800 },
        { type: 'W_PRIME', value: 84_655 },
      ],
      calculationDate,
    );
    expect(upsertFitnessMetric).not.toHaveBeenCalled();
  });

  it('selects only intrinsically valid 5K speed peaks and converts pace units once', async () => {
    const findFirst = jest.fn(async () => ({
      activityId: 2191,
      value: 3.6189290882778584,
    }));
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      { activityPeakMetric: { findFirst } } as never,
      { upsertFitnessMetric } as never,
      {} as never,
      {} as never,
    );
    const calculationDate = new Date('2026-08-24T00:00:00.000Z');

    await service.recalculateUserTP('user-run', calculationDate);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ value: { gt: 0, lte: 12 } }),
        orderBy: { value: 'desc' },
      }),
    );
    const expectedPace = 1000 / 3.6189290882778584 + 20;
    expect(upsertFitnessMetric).toHaveBeenCalledWith(
      'user-run',
      'TP',
      1000 / expectedPace,
      SportType.RUN,
      expectedPace,
      'AUTO',
      calculationDate,
    );
  });

  it('propagates POST aggregation failures', async () => {
    const service = createService();
    const failure = new Error('write failed');
    jest.spyOn(service, 'updateGlobalMetrics').mockRejectedValue(failure);

    await expect(
      service.refreshUserFitnessProfilePost('user-2'),
    ).rejects.toMatchObject({
      name: 'UserFitnessRefreshError',
      stage: 'POST',
      failures: [{ task: 'GLOBAL_VO2_MAX', error: failure }],
    } satisfies Partial<UserFitnessRefreshError>);
  });

  it('writes the corrected effective VO2 max even for a legacy HEARTRATE preference', async () => {
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      {
        activity: {
          findMany: jest.fn(async () => [
            {
              startTime: new Date(),
              vo2max: {
                vo2maxVdotByHr: 50,
                vo2maxVdotByFactor: 48,
                vo2maxVdotByRace: null,
              },
            },
          ]),
        },
      } as never,
      { upsertFitnessMetric } as never,
      {} as never,
      {
        profiles: () => ({
          findUnique: jest.fn(async () => ({
            defaultVdotSource: 'HEARTRATE',
            vo2maxCorrectionFactor: 0.9,
          })),
        }),
      } as never,
    );

    await service.updateGlobalMetrics('user-1');

    expect(upsertFitnessMetric).toHaveBeenCalledWith(
      'user-1',
      'VO2_MAX',
      45,
      SportType.UNKNOWN,
      undefined,
      'AUTO',
      expect.any(Date),
    );
  });

  it('rejects a constant walking-speed curve mislabeled as RUN', async () => {
    const findMany = jest.fn(async () => [
      { activityId: 101, scaleValue: 400, value: 1.12 },
      { activityId: 101, scaleValue: 800, value: 1.12 },
      { activityId: 101, scaleValue: 1000, value: 1.12 },
      { activityId: 101, scaleValue: 1500, value: 1.12 },
    ]);
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      { activityPeakMetric: { findMany } } as never,
      { upsertFitnessMetric } as never,
      {} as never,
      {} as never,
    );

    await service.recalculateUserCS(
      'user-walk',
      SportType.RUN,
      new Date('2026-08-12T00:00:00.000Z'),
    );

    expect(upsertFitnessMetric).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          activity: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { sportDefinitionCode: null },
                  {
                    sportDefinitionCode: {
                      notIn: ['WALKING', 'HIKING'],
                    },
                  },
                ]),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('accepts a well-fitted three-point maximal RUN curve', async () => {
    const findMany = jest.fn(async () => [
      { activityId: 201, scaleValue: 800, value: 4 },
      { activityId: 202, scaleValue: 1500, value: 3.75 },
      { activityId: 203, scaleValue: 3000, value: 3.5 },
    ]);
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      { activityPeakMetric: { findMany } } as never,
      { upsertFitnessMetric } as never,
      {} as never,
      {} as never,
    );
    const calculationDate = new Date('2026-08-12T00:00:00.000Z');

    await service.recalculateUserCS('user-run', SportType.RUN, calculationDate);

    expect(upsertFitnessMetric).toHaveBeenCalledTimes(1);
    expect(upsertFitnessMetric).toHaveBeenCalledWith(
      'user-run',
      'CS',
      expect.any(Number),
      SportType.RUN,
      expect.any(Number),
      'AUTO',
      calculationDate,
    );
  });

  it('rejects repeated walking-speed activities even when labeled RUN', async () => {
    const findMany = jest.fn(async () => [
      { activityId: 301, scaleValue: 400, value: 1.2 },
      { activityId: 302, scaleValue: 800, value: 1.15 },
      { activityId: 303, scaleValue: 1000, value: 1.13 },
    ]);
    const upsertFitnessMetric = jest.fn(async () => undefined);
    const service = new AnalyzeFitnessOrchestratorService(
      { activityPeakMetric: { findMany } } as never,
      { upsertFitnessMetric } as never,
      {} as never,
      {} as never,
    );

    await service.recalculateUserCS(
      'user-repeat-walk',
      SportType.RUN,
      new Date('2026-08-12T00:00:00.000Z'),
    );

    expect(upsertFitnessMetric).not.toHaveBeenCalled();
  });
});
