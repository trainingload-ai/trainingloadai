import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import {
  PlanLoadSource,
  PlanStatus,
  PlanWorkoutStatus,
  SportType,
  UserFitnessMetricType,
  WorkoutPlanStepDurationType,
  WorkoutPlanStepIntensity,
  WorkoutPlanStepTargetType,
  WorkoutPlanValueUnit,
} from '@prisma/client';

jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));

import { PlanLoadEstimatorService } from '../plan-load-estimator.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';

function buildEstimator(
  prisma: unknown,
  userService: unknown,
  workoutService: unknown,
  ..._legacyPlaceholders: unknown[]
) {
  return new PlanLoadEstimatorService(
    prisma as never,
    userService as never,
    workoutService as never,
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
  );
}

const createService = () =>
  buildEstimator(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

const baseThresholds = {
  ftp: null,
  cp: null,
  maxHeartRate: null,
  lthr: null,
  runThresholdPaceSecPerKm: null,
  swimThresholdPaceSecPer100m: null,
};

const timeStep = (overrides: Record<string, unknown> = {}) => ({
  id: 'step-1',
  parentId: null,
  orderIndex: 0,
  stepType: 'WORK',
  intensity: WorkoutPlanStepIntensity.ACTIVE,
  durationType: WorkoutPlanStepDurationType.TIME,
  durationValue: 1800,
  durationUnit: WorkoutPlanValueUnit.SECONDS,
  targetType: null,
  targetValueLow: null,
  targetValueHigh: null,
  targetUnit: null,
  ...overrides,
});

describe('PlanLoadEstimatorService.estimate', () => {
  it('estimates power-targeted bike load from midpoint power and FTP', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.CYCLING,
      thresholds: { ...baseThresholds, ftp: 250 },
      steps: [
        timeStep({
          targetType: WorkoutPlanStepTargetType.POWER,
          targetValueLow: 200,
          targetValueHigh: 240,
          targetUnit: WorkoutPlanValueUnit.WATTS,
        }) as never,
      ],
    });

    expect(result.estimatedLoad).toBe(38.7);
    expect(result.estimatedLoadSource).toBe(PlanLoadSource.POWER);
    expect(result.estimatedLoadInputs.bySteps[0]).toMatchObject({
      bucket: 'POWER',
      ifValue: 0.88,
      durationSec: 1800,
      partialEstimate: false,
    });
  });

  it('falls back to intensity when a target threshold is missing', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.CYCLING,
      thresholds: baseThresholds,
      steps: [
        timeStep({
          durationValue: 3600,
          intensity: WorkoutPlanStepIntensity.INTERVAL,
          targetType: WorkoutPlanStepTargetType.POWER,
          targetValueLow: 250,
          targetUnit: WorkoutPlanValueUnit.WATTS,
        }) as never,
      ],
    });

    expect(result.estimatedLoad).toBe(90.3);
    expect(result.estimatedLoadSource).toBe(PlanLoadSource.RPE);
    expect(result.estimatedLoadInputs.bySteps[0]).toMatchObject({
      bucket: 'RPE',
      ifValue: 0.95,
      partialEstimate: true,
      reason: 'missing_threshold_power',
    });
  });

  it('uses the template planned session RPE when it is available', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.RUN,
      thresholds: baseThresholds,
      plannedSessionRpe: 4,
      steps: [timeStep() as never],
    });

    expect(result.estimatedLoad).toBe(20);
    expect(result.estimatedLoadSource).toBe(PlanLoadSource.SESSION_RPE);
    expect(result.estimatedLoadInputs.sessionRpe).toEqual({
      formulaVersion: 1,
      durationMinutes: 30,
      rating: 4,
      rawAu: 120,
      normalizedLoad: 20,
    });
  });

  it('uses run pace targets to estimate distance steps', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.RUN,
      thresholds: { ...baseThresholds, runThresholdPaceSecPerKm: 240 },
      steps: [
        timeStep({
          durationType: WorkoutPlanStepDurationType.DISTANCE,
          durationValue: 1000,
          durationUnit: WorkoutPlanValueUnit.METERS,
          targetType: WorkoutPlanStepTargetType.SPEED,
          targetValueLow: 300,
          targetUnit: WorkoutPlanValueUnit.SECONDS,
        }) as never,
      ],
    });

    expect(result.estimatedLoad).toBe(5.3);
    expect(result.estimatedLoadSource).toBe(PlanLoadSource.PACE);
    expect(result.estimatedLoadInputs.bySteps[0]).toMatchObject({
      bucket: 'PACE',
      ifValue: 0.8,
      durationSec: 300,
      partialEstimate: true,
    });
  });

  it('applies repeat-count containers to child step contribution', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.RUN,
      thresholds: { ...baseThresholds, lthr: 170 },
      steps: [
        timeStep({
          id: 'repeat-1',
          stepType: 'REPEAT',
          durationType: WorkoutPlanStepDurationType.REPEAT_COUNT,
          durationValue: 3,
          durationUnit: WorkoutPlanValueUnit.COUNT,
        }) as never,
        timeStep({
          id: 'child-1',
          parentId: 'repeat-1',
          durationValue: 600,
          targetType: WorkoutPlanStepTargetType.HEART_RATE,
          targetValueLow: 150,
          targetUnit: WorkoutPlanValueUnit.BPM,
        }) as never,
      ],
    });

    expect(result.estimatedLoad).toBe(38.9);
    expect(result.estimatedLoadSource).toBe(PlanLoadSource.HR);
    expect(result.estimatedLoadInputs.bySteps[0]).toMatchObject({
      stepId: 'child-1',
      parentId: 'repeat-1',
      bucket: 'HR',
      durationSec: 1800,
    });
  });

  it('uses an estimated LTHR from MAXHR for bpm-targeted load', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.RUN,
      thresholds: { ...baseThresholds, maxHeartRate: 190 },
      steps: [
        timeStep({
          durationValue: 3600,
          targetType: WorkoutPlanStepTargetType.HEART_RATE,
          targetValueLow: 150,
          targetUnit: WorkoutPlanValueUnit.BPM,
        }) as never,
      ],
    });

    expect(result.estimatedLoadSource).toBe(PlanLoadSource.HR);
    expect(result.estimatedLoadInputs.bySteps[0]).toMatchObject({
      bucket: 'HR',
      partialEstimate: false,
      thresholdSource: 'ESTIMATED_MAX_HR',
    });
    expect(result.estimatedLoadInputs.bySteps[0].ifValue).toBeCloseTo(
      150 / 167,
      6,
    );
  });

  it('returns NONE when no step can contribute load', () => {
    const service = createService();

    const result = service.estimate({
      sport: SportType.RUN,
      thresholds: baseThresholds,
      steps: [
        timeStep({
          durationType: WorkoutPlanStepDurationType.OPEN,
          durationValue: null,
        }) as never,
      ],
    });

    expect(result).toMatchObject({
      estimatedLoad: null,
      estimatedLoadSource: PlanLoadSource.NONE,
      estimatedLoadInputs: {
        bySteps: [],
        empty: true,
      },
    });
  });
});

describe('PlanLoadEstimatorService.loadThresholdsForUser', () => {
  it('converts run threshold speed from m/s to sec/km', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        ftp: 280,
        cp: 270,
        lthr: 172,
        tp: 4,
      })),
      getEffectiveUserFitnessMetric: jest.fn(),
    };
    const service = buildEstimator(
      {} as never,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const thresholds = await service.loadThresholdsForUser(
      'user-1',
      SportType.RUN,
    );

    expect(userService.getComposedUserProfile).toHaveBeenCalledWith(
      'user-1',
      SportType.RUN,
    );
    expect(thresholds).toEqual({
      ftp: 280,
      cp: 270,
      maxHeartRate: null,
      lthr: 172,
      runThresholdPaceSecPerKm: 250,
      swimThresholdPaceSecPer100m: null,
    });
  });

  it('uses the effective swim TP selected across MANUAL/AUTO', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({})),
      getEffectiveUserFitnessMetric: jest.fn(
        async (_userId: string, type: UserFitnessMetricType) =>
          type === UserFitnessMetricType.TP ? { value: 96 } : { value: 1.25 },
      ),
    };
    const service = buildEstimator(
      {} as never,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const thresholds = await service.loadThresholdsForUser(
      'user-1',
      SportType.SWIM,
    );

    expect(thresholds.swimThresholdPaceSecPer100m).toBe(96);
    expect(userService.getEffectiveUserFitnessMetric).toHaveBeenCalledTimes(2);
    expect(userService.getEffectiveUserFitnessMetric).toHaveBeenCalledWith(
      'user-1',
      UserFitnessMetricType.TP,
      undefined,
      SportType.SWIM,
    );
  });

  it('falls back to the effective swim CS and converts m/s to sec/100m', async () => {
    const getEffectiveUserFitnessMetric = jest.fn(
      async (_userId: string, type: UserFitnessMetricType) =>
        type === UserFitnessMetricType.CS ? { value: 1.25 } : null,
    );
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({})),
      getEffectiveUserFitnessMetric,
    };
    const service = buildEstimator(
      {} as never,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const thresholds = await service.loadThresholdsForUser(
      'user-1',
      SportType.SWIM,
    );

    expect(thresholds.swimThresholdPaceSecPer100m).toBe(80);
    expect(userService.getEffectiveUserFitnessMetric).toHaveBeenCalledWith(
      'user-1',
      UserFitnessMetricType.CS,
      undefined,
      SportType.SWIM,
    );
  });
});

describe('PlanLoadEstimatorService.applyForWorkout', () => {
  it('clears estimates for draft plans without reading thresholds', async () => {
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'workout-1',
          sportType: SportType.RUN,
          plan: { userId: 'user-1', status: PlanStatus.DRAFT },
          steps: [],
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const service = buildEstimator(
      tx as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const loadThresholdsSpy = jest.spyOn(service, 'loadThresholdsForUser');

    const result = await service.applyForWorkout('workout-1');

    expect(result).toBeNull();
    expect(loadThresholdsSpy).not.toHaveBeenCalled();
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: {
        estimatedLoad: null,
        estimatedLoadSource: null,
        estimatedLoadInputs: undefined,
        estimatedLoadComputedAt: null,
      },
    });
  });

  it('skips completed plans without updating persisted estimates', async () => {
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'workout-1',
          sportType: SportType.RUN,
          plan: { userId: 'user-1', status: PlanStatus.COMPLETED },
          steps: [],
        })),
        update: jest.fn(),
      },
    };
    const service = buildEstimator(
      tx as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.applyForWorkout('workout-1');

    expect(result).toBeNull();
    expect(tx.planWorkout.update).not.toHaveBeenCalled();
  });

  it('estimates active workouts from persisted steps and writes the snapshot', async () => {
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'workout-1',
          sportType: SportType.CYCLING,
          plan: { userId: 'user-1', status: PlanStatus.ACTIVE },
          steps: [
            timeStep({
              targetType: WorkoutPlanStepTargetType.POWER,
              targetValueLow: 200,
              targetValueHigh: 240,
              targetUnit: WorkoutPlanValueUnit.WATTS,
            }),
          ],
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        ftp: 250,
        cp: null,
        lthr: null,
      })),
      getUserFitnessMetric: jest.fn(),
    };
    const service = buildEstimator(
      tx as never,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.applyForWorkout('workout-1');

    expect(result?.estimatedLoad).toBe(38.7);
    expect(result?.estimatedLoadSource).toBe(PlanLoadSource.POWER);
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: {
        estimatedLoad: 38.7,
        estimatedLoadSource: PlanLoadSource.POWER,
        estimatedLoadInputs: expect.objectContaining({
          empty: false,
          thresholds: expect.objectContaining({ ftp: 250 }),
        }),
        estimatedLoadComputedAt: expect.any(Date),
      },
    });
  });

  it('estimates strength workouts from planned duration and session RPE', async () => {
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'strength-1',
          userId: 'user-1',
          sportType: SportType.UNKNOWN,
          structureKind: 'STRENGTH',
          plannedDurationSeconds: 50 * 60,
          plannedSessionRpe: 6,
          plan: { userId: 'user-1', status: PlanStatus.ACTIVE },
          steps: [],
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const userService = {
      getComposedUserProfile: jest.fn(),
    };
    const service = buildEstimator(
      tx as never,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.applyForWorkout('strength-1');

    expect(result).toMatchObject({
      estimatedLoad: 50,
      estimatedLoadSource: PlanLoadSource.SESSION_RPE,
      estimatedLoadInputs: {
        empty: false,
        strength: {
          formulaVersion: 1,
          durationMinutes: 50,
          sessionRpeRating: 6,
          rawAu: 300,
          normalizedLoad: 50,
        },
      },
    });
    expect(userService.getComposedUserProfile).not.toHaveBeenCalled();
  });
});

describe('PlanLoadEstimatorService.applyForPlan', () => {
  it.each([PlanStatus.DRAFT, PlanStatus.COMPLETED, PlanStatus.CANCELLED])(
    'skips %s plans without querying workouts',
    async (status) => {
      const tx = {
        plan: {
          findUnique: jest.fn(async () => ({
            id: 'plan-1',
            userId: 'user-1',
            status,
          })),
        },
        planWorkout: {
          findMany: jest.fn(),
        },
      };
      const service = buildEstimator(
        tx as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const count = await service.applyForPlan('plan-1');

      expect(count).toBe(0);
      expect(tx.plan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        select: { id: true, userId: true, status: true },
      });
      expect(tx.planWorkout.findMany).not.toHaveBeenCalled();
    },
  );

  it('recalculates only active plan workout statuses and returns successful count', async () => {
    const tx = {
      plan: {
        findUnique: jest.fn(async () => ({
          id: 'plan-1',
          userId: 'user-1',
          status: PlanStatus.ACTIVE,
        })),
      },
      planWorkout: {
        findMany: jest.fn(async () => [
          { id: 'workout-1' },
          { id: 'workout-2' },
          { id: 'workout-3' },
        ]),
      },
    };
    const service = buildEstimator(
      tx as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const applyForWorkoutSpy = jest
      .spyOn(service, 'applyForWorkout')
      .mockResolvedValueOnce({
        estimatedLoad: 20,
        estimatedLoadSource: PlanLoadSource.RPE,
        estimatedLoadInputs: {
          thresholds: baseThresholds,
          bySteps: [],
          empty: false,
        },
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        estimatedLoad: 35,
        estimatedLoadSource: PlanLoadSource.POWER,
        estimatedLoadInputs: {
          thresholds: { ...baseThresholds, ftp: 250 },
          bySteps: [],
          empty: false,
        },
      });

    const count = await service.applyForPlan('plan-1');

    expect(count).toBe(2);
    expect(tx.planWorkout.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan-1',
        status: {
          in: [
            PlanWorkoutStatus.PLANNED,
            PlanWorkoutStatus.IN_PROGRESS,
            PlanWorkoutStatus.MOVED,
          ],
        },
      },
      select: { id: true },
    });
    expect(applyForWorkoutSpy).toHaveBeenNthCalledWith(1, 'workout-1', { tx });
    expect(applyForWorkoutSpy).toHaveBeenNthCalledWith(2, 'workout-2', { tx });
    expect(applyForWorkoutSpy).toHaveBeenNthCalledWith(3, 'workout-3', { tx });
  });

  it('continues recalculating remaining workouts when one workout fails', async () => {
    const tx = {
      plan: {
        findUnique: jest.fn(async () => ({
          id: 'plan-1',
          userId: 'user-1',
          status: PlanStatus.ACTIVE,
        })),
      },
      planWorkout: {
        findMany: jest.fn(async () => [
          { id: 'workout-1' },
          { id: 'workout-2' },
          { id: 'workout-3' },
        ]),
      },
    };
    const service = buildEstimator(
      tx as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service, 'applyForWorkout')
      .mockResolvedValueOnce({
        estimatedLoad: 20,
        estimatedLoadSource: PlanLoadSource.RPE,
        estimatedLoadInputs: {
          thresholds: baseThresholds,
          bySteps: [],
          empty: false,
        },
      })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        estimatedLoad: 35,
        estimatedLoadSource: PlanLoadSource.POWER,
        estimatedLoadInputs: {
          thresholds: { ...baseThresholds, ftp: 250 },
          bySteps: [],
          empty: false,
        },
      });

    const count = await service.applyForPlan('plan-1');

    expect(count).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      '[PlanLoadEstimator] applyForWorkout(workout-2) failed: boom',
    );
  });
});

describe('PlanLoadEstimatorService.estimateForViewerWorkouts', () => {
  const hrDraft = {
    stepType: 'WORK' as const,
    orderIndex: 0,
    intensity: 'ACTIVE' as const,
    durationType: 'TIME' as const,
    durationValue: 2400,
    durationUnit: 'SECONDS' as const,
    targetType: 'HEART_RATE' as const,
    targetValueLow: 150,
    targetValueHigh: null,
    targetUnit: 'BPM' as const,
  };

  it('estimates endurance from DSL text with viewer thresholds', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        ftp: null,
        cp: null,
        lthr: 170,
      })),
      getEffectiveUserFitnessMetric: jest.fn(),
    };
    const parsePlanText = jest.fn(() => [{ type: 'work' }]);
    const buildWorkoutPlanSteps = jest.fn(() => [hrDraft]);
    const service = buildEstimator(
      {} as never,
      userService as never,
      { parsePlanText, buildWorkoutPlanSteps } as never,
      {} as never,
      {} as never,
    );

    const [result] = await service.estimateForViewerWorkouts('user-b', [
      {
        sportType: 'RUN',
        structureKind: 'ENDURANCE',
        text: '40min Z2',
      },
    ]);

    expect(parsePlanText).toHaveBeenCalledWith('40min Z2');
    expect(buildWorkoutPlanSteps).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      estimatedLoad: 51.9,
      estimatedLoadSource: PlanLoadSource.HR,
    });
  });

  it('estimates strength from duration and session RPE', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({})),
      getEffectiveUserFitnessMetric: jest.fn(),
    };
    const parsePlanText = jest.fn();
    const service = buildEstimator(
      {} as never,
      userService as never,
      { parsePlanText, buildWorkoutPlanSteps: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    const [result] = await service.estimateForViewerWorkouts('user-b', [
      {
        sportType: 'STRETCHING',
        structureKind: 'STRENGTH',
        durationSeconds: 50 * 60,
        plannedSessionRpe: 6,
      },
    ]);

    expect(result).toEqual({
      estimatedLoad: 50,
      estimatedLoadSource: PlanLoadSource.SESSION_RPE,
    });
    expect(parsePlanText).not.toHaveBeenCalled();
  });

  it('loads thresholds once per sport for mixed workouts', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        lthr: 170,
      })),
      getEffectiveUserFitnessMetric: jest.fn(),
    };
    const parsePlanText = jest.fn(() => [{ type: 'work' }]);
    const service = buildEstimator(
      {} as never,
      userService as never,
      {
        parsePlanText,
        buildWorkoutPlanSteps: jest.fn(() => [hrDraft]),
      } as never,
      {} as never,
      {} as never,
    );

    const results = await service.estimateForViewerWorkouts('user-b', [
      { sportType: 'RUN', structureKind: 'ENDURANCE', text: '40min Z2' },
      { sportType: 'RUN', structureKind: 'ENDURANCE', text: '20min Z2' },
      {
        sportType: 'STRETCHING',
        structureKind: 'STRENGTH',
        durationSeconds: 50 * 60,
        plannedSessionRpe: 6,
      },
    ]);

    expect(userService.getComposedUserProfile).toHaveBeenCalledTimes(2);
    expect(userService.getComposedUserProfile).toHaveBeenCalledWith(
      'user-b',
      SportType.RUN,
    );
    expect(userService.getComposedUserProfile).toHaveBeenCalledWith(
      'user-b',
      SportType.STRETCHING,
    );
    expect(parsePlanText).toHaveBeenCalledTimes(2);
    expect(results[0]?.estimatedLoadSource).toBe(PlanLoadSource.HR);
    expect(results[2]).toEqual({
      estimatedLoad: 50,
      estimatedLoadSource: PlanLoadSource.SESSION_RPE,
    });
  });

  it('returns NONE when endurance DSL cannot be parsed', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({ lthr: 170 })),
      getEffectiveUserFitnessMetric: jest.fn(),
    };
    const service = buildEstimator(
      {} as never,
      userService as never,
      {
        parsePlanText: jest.fn(() => {
          throw new Error('bad dsl');
        }),
        buildWorkoutPlanSteps: jest.fn(),
      } as never,
      {} as never,
      {} as never,
    );

    const [result] = await service.estimateForViewerWorkouts('user-b', [
      { sportType: 'RUN', structureKind: 'ENDURANCE', text: '???' },
    ]);

    expect(result).toEqual({
      estimatedLoad: null,
      estimatedLoadSource: PlanLoadSource.NONE,
    });
  });
});
