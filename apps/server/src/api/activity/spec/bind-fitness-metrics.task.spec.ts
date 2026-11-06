import { describe, expect, it, jest } from '@jest/globals';
import { $Enums } from '@prisma/client';

jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));

import { BindFitnessMetricsTask } from '../metrics/tasks/bind-fitness-metrics.task';
import type { MetricsContext } from '../metrics/context';

const activity = {
  id: 42,
  userId: 'user-1',
  sportType: $Enums.SportType.RUN,
  startTime: new Date('2026-08-02T23:00:00.000Z'),
};

function context(): MetricsContext {
  return {
    inputs: {
      activity: activity as MetricsContext['inputs']['activity'],
      userId: activity.userId,
      sportType: activity.sportType,
      startTime: activity.startTime,
    },
    cache: {},
    outputs: {},
    errors: {},
  };
}

describe('BindFitnessMetricsTask', () => {
  it('binds the AUTO/MANUAL profile effective at activity time to the snapshot', async () => {
    const prisma = {
      activityFitnessMetricsSnapshot: {
        upsert: jest.fn(async () => ({ id: 'snapshot-1' })),
      },
    };
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        ftp: 285,
        cp: 300,
        wPrime: 18_000,
        cs: 4.2,
        dPrime: 220,
        maxHeartRate: 194,
        restingHeartRate: 48,
        lthr: 173,
      })),
      getEffectiveUserFitnessMetric: jest.fn(async () => null),
    };
    const task = new BindFitnessMetricsTask(
      prisma as never,
      userService as never,
    );

    const prepared = await task.pre(context());

    expect(userService.getComposedUserProfile).toHaveBeenCalledWith(
      activity.userId,
      activity.sportType,
      activity.startTime,
    );
    expect(prepared.cache.fitnessMetrics).toMatchObject({
      FTP: { value: 285, value2: null },
      CP: { value: 300, value2: 18_000 },
      CS: { value: 4.2, value2: 220 },
      MAX_HR: { value: 194, value2: null },
      RESTING_HR: { value: 48, value2: null },
      LTHR: { value: 173, value2: null },
    });

    await task.post(prepared);

    expect(prisma.activityFitnessMetricsSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          ftpValue: 285,
          cpValue: 300,
          cpValue2: 18_000,
          csValue: 4.2,
          csValue2: 220,
          maxHrValue: 194,
          restHrValue: 48,
          lthrValue: 173,
        }),
        create: expect.objectContaining({
          maxHrValue: 194,
          restHrValue: 48,
          lthrValue: 173,
        }),
      }),
    );
  });

  it('preserves frozen VO2 when a dimension-limited replay skips Vo2MaxTask', async () => {
    const prisma = {
      activityVO2Max: {
        findUnique: jest.fn(async () => ({
          vo2maxVdotByRace: 49,
          vo2maxVdotByHr: 47,
          vo2maxVdotByFactor: 51,
          vo2maxCorrectionFactor: 1,
        })),
      },
      activityFitnessMetricsSnapshot: {
        upsert: jest.fn(async () => ({ id: 'snapshot-1' })),
      },
    };
    const task = new BindFitnessMetricsTask(prisma as never, {} as never);
    const ctx = context();
    ctx.cache = {
      fitnessMetrics: {},
      resolvedFitnessContext: {
        analysisConfig: {
          defaultVdotSource: 'FACTOR',
          vo2maxCorrectionFactor: 1,
          loadSources: ['POWER', 'HEART_RATE', 'PACE', 'SESSIONRPE'],
          fingerprint: 'config-1',
        },
        calculationFingerprint: 'calculation-1',
        provenanceFingerprint: 'provenance-1',
        inputFingerprints: {
          overall: 'input-1',
          dimensions: {},
        },
        contextFingerprint: 'context-1',
        zones: [],
        bodyMetrics: [],
      } as never,
    };

    await task.post(ctx);

    expect(prisma.activityVO2Max.findUnique).toHaveBeenCalledWith({
      where: { activityId: activity.id },
      select: {
        vo2maxVdotByRace: true,
        vo2maxVdotByHr: true,
        vo2maxVdotByFactor: true,
        vo2maxCorrectionFactor: true,
      },
    });
    expect(prisma.activityFitnessMetricsSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ resolvedVo2maxValue: 47 }),
      }),
    );
  });
});
