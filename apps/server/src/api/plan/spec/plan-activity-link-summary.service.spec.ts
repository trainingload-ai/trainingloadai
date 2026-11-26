import { PlanCalendarValidationService } from '../application/plan-calendar-validation.service';
import { PlanCalendarRepository } from '../persistence/plan-calendar.repository';
import { describe, expect, it, jest } from '@jest/globals';
import { PlanWriteSupport } from '../application/plan-write.support';
import { ActivityReadService } from '../../activity/activity-read.service';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';
import { WorkoutPrescriptionService } from '@/api/workout/workout-prescription.service';

function createService(
  prisma: Record<string, unknown>,
  extras: Record<string, unknown> = {},
) {
  return new PlanWriteSupport(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    (extras.planLinkMatcher ?? {}) as never,
    {} as never,
    (extras.loadReadout ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
    new PlanActivityLinkRepository(prisma as never),
    new ActivityReadService(prisma as never),
    new PlanWorkoutMutabilityPolicy(),
    new WorkoutPrescriptionService(),
    new PlanCalendarValidationService(new PlanCalendarRepository()),
  );
}

describe('PlanActivityLinkService activity link summary', () => {
  it('manually links an independent workout without creating a training plan', async () => {
    const workout = {
      id: 'independent',
      userId: 'user-1',
      planId: null,
      plan: null,
      name: 'Ordinary run',
      sportType: 'RUN',
      status: 'PLANNED',
    };
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 'locked' }]),
      planActivityMatchState: { upsert: jest.fn(async () => ({})) },
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-07-06T08:00:00Z'),
        })),
      },
      planWorkout: {
        findUnique: jest.fn(async () => workout),
        update: jest.fn(async () => ({ ...workout, status: 'DONE' })),
      },
      planWorkoutActivityLink: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: { data: object }) => ({
          ...data,
          planWorkout: workout,
        })),
      },
    };
    const service = createService({
      $transaction: (run: (tx: object) => unknown) => run(tx),
    });
    await expect(
      service.replaceActivityPlanLinkByHash('user-1', 'activity', {
        workoutId: 'independent',
      }),
    ).resolves.toMatchObject({
      linkedPlanWorkout: {
        planId: null,
        workoutId: 'independent',
        status: 'DONE',
        source: 'MANUAL',
      },
    });
    expect(tx.planWorkoutActivityLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: null,
          planWorkoutId: 'independent',
          autoMarkedWorkoutDone: true,
        }),
      }),
    );
  });

  it('offers same-day independent candidates even without an active plan', async () => {
    const service = createService({
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-07-06T08:00:00Z'),
          sportType: 'RUN',
          timezone: 'UTC',
        })),
      },
      plan: { findMany: jest.fn(async () => []) },
      planWorkout: {
        findMany: jest.fn(async () => [
          {
            id: 'independent',
            planId: null,
            name: 'Ordinary run',
            sportType: 'RUN',
            structureKind: 'FREEFORM',
            plannedDurationSeconds: 1800,
            sessionIndex: 1,
          },
        ]),
      },
      planWorkoutActivityLink: { findFirst: jest.fn(async () => null) },
    });
    Object.assign(service, {
      userService: { getPreferredTimezone: async () => 'UTC' },
    });
    await expect(
      service.listActivityPlanCandidatesByHash('user-1', 'activity'),
    ).resolves.toMatchObject({
      candidates: [
        { workoutId: 'independent', planId: null, expectedDurationSec: 1800 },
      ],
    });
  });

  it('returns planned targets, completion state, and actual load', async () => {
    const service = createService(
      {
        activity: { findFirst: jest.fn(async () => ({ id: 42 })) },
        planWorkoutActivityLink: {
          findFirst: jest.fn(async () => ({
            source: 'AUTO',
            planWorkout: {
              id: 'workout-1',
              planId: 'plan-1',
              plan: { title: '10K Plan' },
              name: 'Tempo',
              notes: 'Stay controlled',
              sportType: 'RUN',
              structureKind: 'ENDURANCE',
              status: 'DONE',
              completedAt: new Date('2026-07-17T12:00:00.000Z'),
              scheduledDate: new Date('2026-07-17T00:00:00.000Z'),
              plannedDurationSeconds: null,
              estimatedLoad: 50,
            },
          })),
        },
      },
      {
        planLinkMatcher: {
          sumExpectedDurationSeconds: jest.fn(async () => 3000),
        },
        loadReadout: {
          batchGetActualLoad: jest.fn(
            async () =>
              new Map([[42, { actualLoad: 55, actualLoadSource: 'GOVSS' }]]),
          ),
        },
      },
    );

    const result = await service.getActivityPlanLinkByHash(
      'user-1',
      'activity-1',
    );

    expect(result.linkedPlanWorkout).toMatchObject({
      planTitle: '10K Plan',
      workoutId: 'workout-1',
      status: 'DONE',
      expectedDurationSec: 3000,
      plannedLoad: 50,
      actualLoad: 55,
      actualLoadSource: 'GOVSS',
      source: 'AUTO',
    });
  });

  it('does not allow a manually edited link to replace an AUTO binding', async () => {
    const updateMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 'locked' }]),
      planActivityMatchState: { upsert: jest.fn(async () => ({})) },
      activity: {
        findFirst: jest.fn(async () => ({ id: 42, startTime: new Date() })),
      },
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'workout-2',
          userId: 'user-1',
          planId: 'plan-1',
          name: 'Intervals',
          sportType: 'RUN',
          plan: { userId: 'user-1', status: 'ACTIVE' },
        })),
      },
      planWorkoutActivityLink: {
        findMany: jest.fn(async () => [
          {
            id: 'link-1',
            planWorkoutId: 'workout-1',
            autoMarkedWorkoutDone: true,
            source: 'AUTO',
          },
        ]),
        updateMany,
      },
    };
    const service = createService({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    });

    await expect(
      service.replaceActivityPlanLinkByHash('user-1', 'activity-1', {
        workoutId: 'workout-2',
      }),
    ).rejects.toBeDefined();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('keeps repeated recorded-workout binding idempotent', async () => {
    const create = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 'locked' }]),
      planActivityMatchState: { upsert: jest.fn(async () => ({})) },
      activity: {
        findFirst: jest.fn(async () => ({ id: 42, startTime: new Date() })),
      },
      planWorkout: {
        findUnique: jest.fn(async () => ({
          id: 'workout-1',
          userId: 'user-1',
          planId: 'plan-1',
          name: 'Tempo',
          sportType: 'RUN',
          plan: { userId: 'user-1', status: 'ACTIVE' },
        })),
      },
      planWorkoutActivityLink: {
        findMany: jest.fn(async () => [
          {
            id: 'link-1',
            planWorkoutId: 'workout-1',
            autoMarkedWorkoutDone: true,
            source: 'AUTO',
          },
        ]),
        create,
      },
    };
    const service = createService({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    });

    await expect(
      service.bindRecordedActivityToWorkout(
        'user-1',
        'activity-1',
        'workout-1',
      ),
    ).resolves.toMatchObject({
      linkedPlanWorkout: {
        workoutId: 'workout-1',
        source: 'AUTO',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('allows recorded-workout binding to resolve an activity still being analyzed', async () => {
    const findFirst = jest.fn(async () => null);
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 'locked' }]),
      planActivityMatchState: { upsert: jest.fn(async () => ({})) },
      activity: { findFirst },
    };
    const service = createService({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    });

    await expect(
      service.bindRecordedActivityToWorkout(
        'user-1',
        'activity-processing',
        'workout-1',
      ),
    ).rejects.toBeDefined();

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        hashId: 'activity-processing',
        userId: 'user-1',
        state: 1,
        mergedIntoActivityId: null,
      },
      select: { id: true, startTime: true, sportType: true, timezone: true },
    });
  });

  it('does not allow an AUTO binding to be removed', async () => {
    const updateMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 'locked' }]),
      planActivityMatchState: { upsert: jest.fn(async () => ({})) },
      activity: { findFirst: jest.fn(async () => ({ id: 42 })) },
      planWorkoutActivityLink: {
        findMany: jest.fn(async () => [
          {
            planWorkoutId: 'workout-1',
            autoMarkedWorkoutDone: true,
            source: 'AUTO',
          },
        ]),
        updateMany,
      },
    };
    const service = createService({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    });

    await expect(
      service.removeActivityPlanLinkByHash('user-1', 'activity-1'),
    ).rejects.toBeDefined();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
