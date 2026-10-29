import { describe, expect, it, jest } from '@jest/globals';
import {
  SportType,
  WorkoutPlanStepTargetType,
  WorkoutPlanValueUnit,
} from '@prisma/client';
import { WorkoutPrescriptionService } from '@/api/workout/workout-prescription.service';
import { PlanWorkoutTargetResolver } from '../application/plan-workout-target-resolver.service';

function createResolver(zones: Array<Record<string, unknown>>) {
  const users = {
    getComposedUserProfile: jest.fn(async () => ({ tp: 4 })),
    getPaceZoneSettingResolved: jest.fn(async () => ({
      benchmark: 'TP',
      zones,
    })),
  };
  return {
    resolver: new PlanWorkoutTargetResolver(
      users as never,
      new WorkoutPrescriptionService(),
    ),
    users,
  };
}

const dynamicPaceStep = {
  id: 'step-1',
  targetResolutionMode: 'DYNAMIC_ZONE',
  targetType: WorkoutPlanStepTargetType.SPEED,
  targetZoneIndex: 4,
  targetZoneLabel: '旧 Z4',
  targetValueLow: 999,
  targetValueHigh: 1_099,
  targetUnit: WorkoutPlanValueUnit.SECONDS,
  targetZoneSystem: 'OLD',
  targetZoneSource: 'OLD',
  targetZoneBasis: { targetLow: 999, targetHigh: 1_099 },
  targetZoneSystemKey: 'old-system',
  targetZoneFingerprint: 'old-fingerprint',
  intensity: 'INTERVAL',
  intensityIntent: { family: 'THRESHOLD' },
};

describe('PlanWorkoutTargetResolver', () => {
  it('uses the current zone range instead of the persisted projection', async () => {
    const { resolver } = createResolver([
      { order: 1, name: 'Z1', min: 0.5, max: 0.4 },
      { order: 2, name: 'Z2', min: 0.4, max: 0.35 },
      { order: 3, name: 'Z3', min: 0.35, max: 0.3 },
      { order: 4, name: 'Threshold', min: 0.3, max: 0.25 },
    ]);

    const workout = await resolver.resolveWorkout('user-1', {
      sportType: SportType.RUN,
      steps: [dynamicPaceStep],
    });

    expect(workout.steps[0]).toMatchObject({
      targetZoneIndex: 4,
      targetZoneLabel: 'Threshold',
      targetValueLow: 300,
      targetValueHigh: 250,
      targetUnit: WorkoutPlanValueUnit.SECONDS,
      targetResolutionMode: 'DYNAMIC_ZONE',
    });
    expect(workout.steps[0].targetZoneFingerprint).not.toBe('old-fingerprint');
  });

  it('returns an unavailable dynamic target instead of falling back to stale values', async () => {
    const { resolver } = createResolver([
      { order: 1, name: 'Z1', min: 0.5, max: 0.4 },
      { order: 2, name: 'Z2', min: 0.4, max: 0.35 },
    ]);

    const workout = await resolver.resolveWorkout('user-1', {
      sportType: SportType.RUN,
      steps: [dynamicPaceStep],
    });

    expect(workout.steps[0]).toMatchObject({
      targetZoneIndex: 4,
      targetZoneLabel: 'Z4',
      targetValueLow: null,
      targetValueHigh: null,
      targetUnit: null,
      targetZoneSystemKey: null,
      targetZoneFingerprint: null,
    });
  });

  it('loads one zone setting for a batch of workouts in the same sport', async () => {
    const { resolver, users } = createResolver([
      { order: 4, name: 'Threshold', min: 0.3, max: 0.25 },
    ]);

    await resolver.resolveWorkouts('user-1', [
      { sportType: SportType.RUN, steps: [dynamicPaceStep] },
      {
        sportType: SportType.RUN,
        steps: [{ ...dynamicPaceStep, id: 'step-2' }],
      },
    ]);

    expect(users.getPaceZoneSettingResolved).toHaveBeenCalledTimes(1);
  });

  it('keeps the frozen projection for completed workouts', async () => {
    const { resolver, users } = createResolver([
      { order: 4, name: 'Threshold', min: 0.3, max: 0.25 },
    ]);

    const workout = await resolver.resolveWorkout('user-1', {
      sportType: SportType.RUN,
      status: 'DONE',
      steps: [dynamicPaceStep],
    });

    expect(workout.steps[0].targetValueLow).toBe(999);
    expect(users.getPaceZoneSettingResolved).not.toHaveBeenCalled();
  });
});
