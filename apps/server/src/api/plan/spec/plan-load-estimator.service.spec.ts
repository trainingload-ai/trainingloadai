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
import { WorkoutService } from '@/api/workout/workout.service';
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
          type === UserFitnessMetricType.TP
            ? { value: 100 / 96 }
            : { value: 1.25 },
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

  it('persists the same measured load as the preview when a session RPE is also present', async () => {
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'workout-1',
          sportType: SportType.CYCLING,
          plannedSessionRpe: 3,
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
      new WorkoutService({} as never),
      {} as never,
      {} as never,
    );

    const result = await service.applyForWorkout('workout-1');
    const [preview] = await service.estimateForViewerWorkouts('user-1', [
      { sportType: 'CYCLING', text: 'work 30m power 220W', plannedSessionRpe: 3 },
    ]);

    expect(result?.estimatedLoad).toBe(38.7);
    expect(result?.estimatedLoadSource).toBe(PlanLoadSource.POWER);
    expect(preview).toMatchObject({ estimatedLoad: 38.7, estimatedLoadSource: PlanLoadSource.POWER });
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
  it.each([8, 12, 24].flatMap((weeks) =>
    (['RUN', 'CYCLING', 'SWIM', 'STRENGTH', 'MIXED'] as const).map((sport) => [weeks, sport] as const),
  ))('evaluates %d %s weeks against the same assessed schedule and estimates', async (weeks, sport) => {
    const service = buildEstimator({}, {
      getComposedUserProfile: async () => ({ ftp: 250, lthr: 170 }),
      getEffectiveUserFitnessMetric: async () => null,
    }, new WorkoutService({} as never));
    const targets = Array.from({ length: weeks }, (_, index) => ({
      weekIndex: index + 1,
      phase: index % 4 === 3 ? 'RECOVERY' as const : 'BUILD' as const,
      focus: index % 4 === 3 ? 'Reduce the work duration' : 'Build consistent work',
      trainingDays: { min: 1, max: 1 },
      durationMinutes: { min: 25, max: 100 },
    }));
    const scheduled = targets.flatMap(({ weekIndex, phase }) => {
      const minutes = phase === 'RECOVERY' ? 25 : 40;
      const disciplines = sport === 'MIXED' ? ['RUN', 'STRENGTH', 'SWIM'] : [sport];
      return disciplines.map((discipline, index) => ({
        weekIndex,
        dayIndex: 1,
        sessionIndex: index + 1,
        sportType: discipline === 'STRENGTH' ? 'UNKNOWN' : discipline,
        structureKind: discipline === 'STRENGTH' ? 'STRENGTH' : 'ENDURANCE',
        text: discipline === 'CYCLING' ? `work ${minutes}m power 200W` : `work ${minutes}m`,
        durationSeconds: minutes * 60,
        plannedSessionRpe: 6,
      }));
    });
    for (const target of targets) target.durationMinutes.max = sport === 'MIXED' ? 120 : 40;
    const contract = { weekPhases: targets.map((week) => week.phase) };
    const report = await service.assessPlanQualityForViewer('athlete', weeks, scheduled, contract, undefined, { weekTargets: targets });
    expect(report.valid).toBe(true);
    expect(report.weeks).toHaveLength(weeks);
    expect(report.issues.filter((issue) => issue.code.startsWith('RECOVERY_'))).toEqual([]);
    const expected = sport === 'CYCLING' ? [42.7, 26.7] : sport === 'MIXED' ? [120, 75] : [40, 25];
    expect(report.weeks.slice(-2).map((week) => week.totalEstimatedLoad)).toEqual(expected);
  });

  it('replays the two archived weeks with a shorter taper but increased prescribed effort', async () => {
    const service = buildEstimator({}, { getComposedUserProfile: async () => ({}) }, new WorkoutService({} as never));
    const build = [[35 * 60, 4], [38 * 60 + 20, 5], [80 * 60, 5]];
    const taper = [[30 * 60, 4], [32 * 60, 5], [75 * 60, 7]];
    const report = await service.assessPlanQualityForViewer('athlete', 2, [build, taper].flatMap((week, weekIndex) =>
      week.map(([durationSeconds, plannedSessionRpe], index) => ({
        weekIndex: weekIndex + 1, dayIndex: [1, 3, 6][index], sportType: 'RUN',
        durationSeconds, text: `work ${durationSeconds}s`, plannedSessionRpe,
      }))), { weekPhases: ['BUILD', 'TAPER'] });

    expect(report.weeks.map((week) => week.totalEstimatedLoad)).toEqual([121.9, 134.2]);
    expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'RECOVERY_NOT_REDUCED', target: { scope: 'WEEK', weekIndex: 2 },
    })]));
    expect('workoutLoadEstimates' in report && report.workoutLoadEstimates?.at(-1)).toMatchObject({
      durationSeconds: 4500, plannedSessionRpe: 7, estimatedLoad: 87.5, source: PlanLoadSource.SESSION_RPE,
    });
  });

  it('uses whole-session RPE when only the warm-up has a power target', async () => {
    const service = buildEstimator({}, { getComposedUserProfile: async () => ({ ftp: 250 }) }, new WorkoutService({} as never));
    const [estimate] = await service.estimateForViewerWorkouts('athlete', [
      { sportType: 'CYCLING', text: 'warmup 10m power 140W\nwork 20m', plannedSessionRpe: 4 },
    ]);
    expect(estimate).toMatchObject({ estimatedLoad: 20, estimatedLoadSource: PlanLoadSource.SESSION_RPE });
  });

  it('counts a distance workout against time limits only when its prescribed pace supports a duration', async () => {
    const service = buildEstimator({}, { getComposedUserProfile: async () => ({ tp: 4 }) }, new WorkoutService({} as never));
    const run = { weekIndex: 1, dayIndex: 1, sportType: 'RUN', durationSeconds: null };
    const assessment = async (text: string) => service.assessPlanQualityForViewer('athlete', 1, [{ ...run, text }], { maxDailyMinutes: 45 });
    const supported = await assessment('work 11km pace 5:00-5:00');
    expect(supported.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DAILY_TIME_BUDGET' })]));
    expect(supported.weeks[0]?.totalDurationSeconds).toBe(3300);
    const unknown = await assessment('work 10km');
    expect(unknown.valid).toBe(true);
    expect(unknown.weeks[0]?.totalDurationSeconds).toBeNull();
    const bounded = await service.assessPlanQualityForViewer('athlete', 1, [
      { ...run, text: 'work 10km' },
    ], { maxDailyMinutes: 45 }, undefined, {
      weekTargets: [{ weekIndex: 1, phase: 'RACE', focus: 'Goal test', trainingDays: { min: 1, max: 1 }, durationMinutes: { min: 10, max: 45 } }],
    });
    expect(bounded.valid).toBe(false);
    expect(bounded.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNBOUNDED_DISTANCE_SESSION' })]));
  });

  it('evaluates recovery using the actual measured target when a session also supplies an RPE', async () => {
    const service = buildEstimator(
      {}, { getComposedUserProfile: async () => ({ ftp: 300 }) }, new WorkoutService({} as never),
    );
    const report = await service.assessPlanQualityForViewer('athlete', 2, [
      { weekIndex: 1, dayIndex: 1, sportType: 'CYCLING', durationSeconds: 3600, text: 'work 60m power 300W' },
      { weekIndex: 2, dayIndex: 1, sportType: 'CYCLING', durationSeconds: 3600, text: 'work 60m power 300W', plannedSessionRpe: 3 },
    ], { weekPhases: ['BUILD', 'RECOVERY'] });
    expect(report.valid).toBe(false);
    expect(report.weeks.map((week) => week.totalEstimatedLoad)).toEqual([100, 100]);
  });
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
