import { describe, expect, it, jest } from '@jest/globals';
import { WorkoutPersistenceService } from '@/api/plan/workout-persistence.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { PlanRepository } from '@/api/plan/persistence/plan.repository';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '@/api/plan/persistence/plan-activity-link.repository';
import { CoachContextRepository } from '@/api/plan/persistence/coach-context.repository';
import { PMC_INVALIDATE_EVENT } from '@/training-load/events/pmc.events';
import { StrengthActivityService } from '../strength-activity.service';

function createPlanQuery(prisma: object) {
  return new PlanQueryService(
    prisma as never,
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
    new PlanActivityLinkRepository(prisma as never),
    new CoachContextRepository(prisma as never),
    {} as never,
  );
}

function createService(prisma: object, events?: object) {
  return new StrengthActivityService(
    prisma as never,
    new WorkoutPersistenceService(new PlanWorkoutRepository({} as never)),
    createPlanQuery(prisma),
    events as never,
  );
}

describe('StrengthActivityService', () => {
  it('starts a free strength activity without creating a plan link', async () => {
    const prisma = {
      activity: {
        create: jest.fn(async () => ({ id: 43, hashId: 'free-strength' })),
      },
    };
    const service = createService(prisma);

    const result = await service.start('user-1', {
      startedAt: '2026-07-17T10:00:00.000Z',
      timezone: 'Asia/Shanghai',
    });

    expect(result).toEqual({
      activityId: 43,
      activityHashId: 'free-strength',
      workoutId: null,
      created: true,
    });
    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        sportDefinitionCode: 'STRENGTH_TRAINING',
        processingStatus: 'MATERIALIZED',
      }),
    });
  });

  it('starts a planned strength workout as an in-progress activity with materialized sets', async () => {
    const createSet = jest.fn(async () => ({}));
    const tx = {
      activity: {
        create: jest.fn(async () => ({ id: 42, hashId: 'strength-activity' })),
      },
      planWorkoutActivityLink: { create: jest.fn(async () => ({})) },
      planWorkout: { update: jest.fn(async () => ({})) },
      activityStrengthExercise: {
        create: jest.fn(async () => ({ id: 'actual-exercise-1' })),
      },
      activityStrengthSet: { create: createSet },
    };
    const prisma = {
      planWorkout: {
        findFirst: jest.fn(async () => ({
          id: 'workout-1',
          planId: 'plan-1',
          structureKind: 'STRENGTH',
          status: 'PLANNED',
          name: 'Lower body',
          notes: null,
          plan: { id: 'plan-1', status: 'ACTIVE' },
          strengthExercises: [
            {
              id: 'planned-exercise-1',
              name: 'Back Squat',
              exerciseCode: 'back-squat',
              equipmentCode: 'BARBELL',
              notes: null,
              setGroups: [
                {
                  id: 'planned-group-1',
                  setType: 'WORK',
                  setCount: 2,
                  loadType: 'ABSOLUTE',
                  loadValue: 80,
                  loadUnit: 'KG',
                  bodyweightOffsetDirection: null,
                },
              ],
            },
          ],
        })),
        update: tx.planWorkout.update,
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => null),
        create: tx.planWorkoutActivityLink.create,
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.startPlanned('user-1', {
      planId: 'plan-1',
      workoutId: 'workout-1',
      startedAt: '2026-07-17T10:00:00.000Z',
      timezone: 'Asia/Shanghai',
    });

    expect(result).toEqual({
      activityId: 42,
      activityHashId: 'strength-activity',
      workoutId: 'workout-1',
      created: true,
    });
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: { status: 'IN_PROGRESS', completedAt: null, skippedAt: null },
    });
    expect(createSet).toHaveBeenCalledTimes(2);
    expect(createSet).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        plannedSetGroupId: 'planned-group-1',
        setIndex: 0,
        loadType: 'ABSOLUTE',
        loadValue: 80,
        loadUnit: 'KG',
      }),
    });
  });

  it('appends an exercise without replacing a linked planned workout', async () => {
    const createExercise = jest.fn(async () => ({ id: 'exercise-2' }));
    const createSet = jest.fn(async () => ({}));
    const tx = {
      activityStrengthExercise: {
        findFirst: jest.fn(async () => ({ orderIndex: 0 })),
        create: createExercise,
      },
      activityStrengthSet: { create: createSet },
    };
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 43,
          hashId: 'free-strength',
          userId: 'user-1',
          status: 'PADDING',
          strengthExercises: [],
        })),
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => ({
          id: 'link-1',
          planWorkout: {
            id: 'workout-1',
            plannedDurationSeconds: null,
            plannedSessionRpe: null,
            strengthExercises: [],
          },
        })),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.addExercise('free-strength', 'user-1', {
      name: 'Back Squat',
      sets: [
        {
          setIndex: 0,
          setType: 'WORK',
          load: { kind: 'ABSOLUTE', value: 0, unit: 'KG' },
          source: 'APP',
        },
      ],
    });

    expect(createExercise).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityId: 43,
        orderIndex: 1,
        name: 'Back Squat',
      }),
    });
    expect(createSet).toHaveBeenCalledWith({
      data: expect.objectContaining({
        exerciseId: 'exercise-2',
        setIndex: 0,
        loadType: 'ABSOLUTE',
        loadValue: 0,
        loadUnit: 'KG',
      }),
    });
    expect(result.planned?.workoutId).toBe('workout-1');
  });

  it('rejects adding an exercise to a finished strength activity', async () => {
    const transaction = jest.fn();
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 43,
          hashId: 'finished-strength',
          userId: 'user-1',
          status: 'FINISHED',
          strengthExercises: [],
        })),
      },
      $transaction: transaction,
    };
    const service = createService(prisma);

    await expect(
      service.addExercise('finished-strength', 'user-1', {
        name: 'Back Squat',
        sets: [
          {
            setIndex: 0,
            setType: 'WORK',
            load: { kind: 'OPEN' },
            source: 'APP',
          },
        ],
      }),
    ).rejects.toThrow('A completed strength activity cannot be edited');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('removes an owned exercise from an in-progress strength activity', async () => {
    const deleteExercise = jest.fn(async () => ({}));
    let activityLoadCount = 0;
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => {
          activityLoadCount += 1;
          return activityLoadCount === 1
            ? {
                id: 43,
                hashId: 'free-strength',
                userId: 'user-1',
                status: 'PADDING',
                strengthExercises: [{ id: 'exercise-2', sets: [] }],
              }
            : {
                id: 43,
                hashId: 'free-strength',
                userId: 'user-1',
                status: 'PADDING',
                strengthExercises: [],
              };
        }),
      },
      activityStrengthExercise: {
        delete: deleteExercise,
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => null),
      },
    };
    const service = createService(prisma);

    const result = await service.removeExercise(
      'free-strength',
      'exercise-2',
      'user-1',
    );

    expect(deleteExercise).toHaveBeenCalledWith({
      where: { id: 'exercise-2' },
    });
    expect(result.summary.exerciseCount).toBe(0);
  });

  it('rejects removing an exercise that does not belong to the activity', async () => {
    const deleteExercise = jest.fn();
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 43,
          hashId: 'free-strength',
          userId: 'user-1',
          status: 'PADDING',
          strengthExercises: [{ id: 'exercise-1', sets: [] }],
        })),
      },
      activityStrengthExercise: {
        delete: deleteExercise,
      },
    };
    const service = createService(prisma);

    await expect(
      service.removeExercise('free-strength', 'exercise-2', 'user-1'),
    ).rejects.toThrow('Activity not found or access denied');
    expect(deleteExercise).not.toHaveBeenCalled();
  });

  it('allows the internal import path to materialize a finished activity', async () => {
    const deleteMany = jest.fn(async () => ({}));
    const tx = {
      activityStrengthExercise: { deleteMany },
    };
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 44,
          hashId: 'imported-strength',
          userId: 'user-1',
          status: 'FINISHED',
          strengthExercises: [],
        })),
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => null),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.replaceImported(
      'imported-strength',
      'user-1',
      { exercises: [] },
    );

    expect(deleteMany).toHaveBeenCalledWith({ where: { activityId: 44 } });
    expect(result.activityHashId).toBe('imported-strength');
  });

  it('finishes a strength activity and completes its linked plan workout', async () => {
    const tx = {
      activity: { update: jest.fn(async () => ({})) },
      planWorkout: { update: jest.fn(async () => ({})) },
      planWorkoutActivityLink: { update: jest.fn(async () => ({})) },
    };
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          hashId: 'strength-activity',
          userId: 'user-1',
          state: 1,
          startTime: new Date(Date.now() - 1_000),
          planWorkoutLinks: [
            {
              id: 'link-1',
              planWorkoutId: 'workout-1',
              planWorkout: { id: 'workout-1', structureKind: 'STRENGTH' },
            },
          ],
        })),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const emitAsync = jest.fn(async () => []);
    const service = createService(prisma, { emitAsync });

    const result = await service.finish('strength-activity', 'user-1', {
      durationSeconds: 1800,
      sessionRpe: 7,
    });

    expect(result).toMatchObject({
      activityId: 42,
      activityHashId: 'strength-activity',
      workoutId: 'workout-1',
      durationSeconds: 1800,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        timerTime: 1800,
        elapsedTime: 1800,
        sessionRpe: 7,
        status: 'FINISHED',
        processingStatus: 'READY',
      }),
    });
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: expect.objectContaining({ status: 'DONE' }),
    });
    expect(emitAsync).toHaveBeenCalledWith(
      PMC_INVALIDATE_EVENT,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('finishes a free strength activity without updating a plan workout', async () => {
    const tx = {
      activity: { update: jest.fn(async () => ({})) },
      planWorkout: { update: jest.fn(async () => ({})) },
      planWorkoutActivityLink: { update: jest.fn(async () => ({})) },
    };
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 43,
          hashId: 'free-strength',
          userId: 'user-1',
          state: 1,
          sportDefinitionCode: 'STRENGTH_TRAINING',
          startTime: new Date(Date.now() - 1_000),
          planWorkoutLinks: [],
        })),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.finish('free-strength', 'user-1', {
      durationSeconds: 1200,
      sessionRpe: 6,
    });

    expect(result).toMatchObject({
      activityHashId: 'free-strength',
      workoutId: null,
      durationSeconds: 1200,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 43 },
      data: expect.objectContaining({ processingStatus: 'READY' }),
    });
    expect(tx.planWorkout.update).not.toHaveBeenCalled();
    expect(tx.planWorkoutActivityLink.update).not.toHaveBeenCalled();
  });

  it('returns actual strength summaries and the linked planned prescription', async () => {
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          hashId: 'activity-hash',
          userId: 'user-1',
          strengthExercises: [
            {
              id: 'actual-exercise-1',
              orderIndex: 0,
              name: 'Back Squat',
              sets: [
                {
                  id: 'actual-set-1',
                  setIndex: 0,
                  setType: 'WORK',
                  completedReps: 5,
                  completedDurationSeconds: null,
                  loadType: 'ABSOLUTE',
                  loadValue: 80,
                  loadUnit: 'KG',
                  bodyweightOffsetDirection: null,
                  actualRpe: 8,
                  actualRir: null,
                  completedAt: new Date('2026-07-16T12:00:00Z'),
                  source: 'APP',
                },
                {
                  id: 'actual-set-2',
                  setIndex: 1,
                  setType: 'WORK',
                  completedReps: 6,
                  completedDurationSeconds: null,
                  loadType: 'BODYWEIGHT_OFFSET',
                  loadValue: 10,
                  loadUnit: 'LB',
                  bodyweightOffsetDirection: 'ADDED',
                  actualRpe: null,
                  actualRir: 2,
                  completedAt: new Date('2026-07-16T12:05:00Z'),
                  source: 'MANUAL',
                },
              ],
            },
          ],
        })),
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => ({
          planWorkout: {
            id: 'workout-1',
            plannedDurationSeconds: 2700,
            plannedSessionRpe: 7,
            strengthExercises: [
              {
                id: 'planned-exercise-1',
                orderIndex: 0,
                name: 'Back Squat',
                setGroups: [
                  {
                    id: 'planned-group-1',
                    orderIndex: 0,
                    setType: 'WORK',
                    setCount: 3,
                    prescriptionType: 'REPS',
                    repsMin: 5,
                    repsMax: 5,
                    durationSeconds: null,
                    amrap: false,
                    loadType: 'OPEN',
                    loadValue: null,
                    loadUnit: null,
                    bodyweightOffsetDirection: null,
                    targetRpe: 7,
                    targetRir: null,
                    restSeconds: 180,
                  },
                ],
              },
            ],
          },
        })),
      },
    };
    const service = createService(prisma);

    const result = await service.get('activity-hash', 'user-1');

    expect(result.summary).toEqual({
      kind: 'STRENGTH_ACTUAL',
      exerciseCount: 1,
      setCount: 2,
      completedSetCount: 2,
      workingSetCount: 2,
      completedReps: 11,
      timedSetSeconds: 0,
      volumeLoadKg: 400,
      volumeLoadLb: 60,
    });
    expect(result.planned).toMatchObject({
      workoutId: 'workout-1',
      structure: {
        kind: 'STRENGTH',
        durationSeconds: 2700,
        plannedSessionRpe: 7,
      },
      summary: {
        kind: 'STRENGTH',
        exerciseCount: 1,
        workingSetCount: 3,
      },
    });
  });

  it('rejects set completion when the activity is not owned by the user', async () => {
    const prisma = {
      activityStrengthSet: {
        findUnique: jest.fn(async () => ({
          id: 'set-1',
          exercise: {
            activity: { hashId: 'activity-hash', userId: 'someone-else' },
          },
        })),
        update: jest.fn(),
      },
    };
    const service = createService(prisma);

    await expect(
      service.completeSet('activity-hash', 'set-1', 'user-1', {
        completed: true,
      }),
    ).rejects.toThrow('Activity not found or access denied');
    expect(prisma.activityStrengthSet.update).not.toHaveBeenCalled();
  });

  it('rejects changing a set after the strength activity is finished', async () => {
    const update = jest.fn();
    const prisma = {
      activityStrengthSet: {
        findUnique: jest.fn(async () => ({
          id: 'set-1',
          exercise: {
            activity: {
              hashId: 'activity-hash',
              userId: 'user-1',
              status: 'FINISHED',
            },
          },
        })),
        update,
      },
    };
    const service = createService(prisma);

    await expect(
      service.completeSet('activity-hash', 'set-1', 'user-1', {
        completed: false,
      }),
    ).rejects.toThrow('A completed strength activity cannot be edited');
    expect(update).not.toHaveBeenCalled();
  });

  it('matches provider actual sets to planned group ids by exercise and order', async () => {
    const createSet = jest.fn(async () => ({}));
    const tx = {
      activityStrengthExercise: {
        deleteMany: jest.fn(async () => ({})),
        create: jest.fn(async () => ({ id: 'actual-exercise-1' })),
      },
      activityStrengthSet: { create: createSet },
    };
    const plannedWorkout = {
      id: 'workout-1',
      plannedDurationSeconds: 1800,
      plannedSessionRpe: 6,
      strengthExercises: [
        {
          id: 'planned-exercise-1',
          orderIndex: 0,
          name: 'Back Squat',
          setGroups: [
            {
              id: 'planned-group-1',
              orderIndex: 0,
              setType: 'WORK',
              setCount: 1,
              prescriptionType: 'REPS',
              repsMin: 5,
              repsMax: 5,
              durationSeconds: null,
              amrap: false,
              loadType: 'ABSOLUTE',
              loadValue: 80,
              loadUnit: 'KG',
              bodyweightOffsetDirection: null,
              targetRpe: null,
              targetRir: null,
              restSeconds: 180,
            },
          ],
        },
      ],
    };
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          hashId: 'activity-hash',
          userId: 'user-1',
          status: 'PADDING',
          strengthExercises: [],
        })),
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => ({ planWorkout: plannedWorkout })),
      },
      planWorkoutSetGroup: {
        findMany: jest.fn(async () => [{ id: 'planned-group-1' }]),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    await service.replace('activity-hash', 'user-1', {
      exercises: [
        {
          name: 'Back Squat',
          sets: [
            {
              setIndex: 0,
              setType: 'WORK',
              completedReps: 5,
              load: { kind: 'ABSOLUTE', value: 80, unit: 'KG' },
              source: 'APP',
            },
          ],
        },
      ],
    });

    expect(createSet).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plannedSetGroupId: 'planned-group-1',
        setIndex: 0,
        completedReps: 5,
        source: 'APP',
      }),
    });
  });
});
