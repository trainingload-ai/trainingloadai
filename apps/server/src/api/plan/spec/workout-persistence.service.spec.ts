import { describe, expect, it, jest } from '@jest/globals';
import type { StrengthWorkoutIrV1 } from '../../../../../../packages/shared/strength-workout-ir';
import { WorkoutPersistenceService } from '../workout-persistence.service';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';

const workout: StrengthWorkoutIrV1 = {
  kind: 'STRENGTH',
  version: 1,
  durationSeconds: 3000,
  plannedSessionRpe: 7,
  exercises: [
    {
      exerciseCode: 'BACK_SQUAT',
      name: 'Back Squat',
      equipmentCode: 'BARBELL',
      setGroups: [
        {
          setType: 'WARMUP',
          setCount: 2,
          prescription: {
            kind: 'REPS',
            repsMin: 5,
            repsMax: 5,
            amrap: false,
          },
          load: { kind: 'PERCENT_1RM', value: 50 },
          restSeconds: 60,
        },
        {
          setType: 'WORK',
          setCount: 3,
          prescription: {
            kind: 'REPS',
            repsMin: 5,
            repsMax: 6,
            amrap: false,
          },
          load: { kind: 'ABSOLUTE', value: 80, unit: 'KG' },
          effort: { kind: 'RPE', value: 7.5 },
          restSeconds: 180,
        },
      ],
    },
    {
      name: 'Pull Up',
      setGroups: [
        {
          setType: 'WORK',
          setCount: 3,
          prescription: {
            kind: 'REPS',
            repsMin: 6,
            repsMax: 8,
            amrap: false,
          },
          load: {
            kind: 'BODYWEIGHT_OFFSET',
            direction: 'ASSISTED',
            value: 10,
            unit: 'KG',
          },
          effort: { kind: 'RIR', value: 2 },
          restSeconds: 90,
        },
      ],
    },
  ],
};

describe('WorkoutPersistenceService', () => {
  it('replaces strength children in stable order and reconstructs the IR', async () => {
    const exercises: Array<Record<string, unknown>> = [];
    const groups: Array<Record<string, unknown>> = [];
    const tx = {
      planWorkoutExercise: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `exercise-${exercises.length + 1}`, ...data };
          exercises.push(row);
          return row;
        }),
      },
      planWorkoutSetGroup: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `group-${groups.length + 1}`, ...data };
          groups.push(row);
          return row;
        }),
      },
    };
    const service = new WorkoutPersistenceService(
      new PlanWorkoutRepository(tx as never),
    );

    await service.replaceStrength(tx as never, 'workout-1', workout);

    expect(tx.planWorkoutExercise.deleteMany).toHaveBeenCalledWith({
      where: { workoutId: 'workout-1' },
    });
    expect(
      exercises.map(({ orderIndex, name }) => ({ orderIndex, name })),
    ).toEqual([
      { orderIndex: 0, name: 'Back Squat' },
      { orderIndex: 1, name: 'Pull Up' },
    ]);
    expect(groups[1]).toMatchObject({
      exerciseId: 'exercise-1',
      orderIndex: 1,
      prescriptionType: 'REPS',
      repsMin: 5,
      repsMax: 6,
      loadType: 'ABSOLUTE',
      loadValue: 80,
      loadUnit: 'KG',
      targetRpe: 7.5,
      targetRir: null,
    });
    expect(groups[2]).toMatchObject({
      loadType: 'BODYWEIGHT_OFFSET',
      bodyweightOffsetDirection: 'ASSISTED',
      targetRir: 2,
    });

    const hydrated = service.buildStrengthStructure(
      exercises.map((exercise) => ({
        ...exercise,
        setGroups: groups.filter((group) => group.exerciseId === exercise.id),
      })) as never,
      {
        durationSeconds: workout.durationSeconds,
        plannedSessionRpe: workout.plannedSessionRpe,
      },
    );

    expect(hydrated).toMatchObject({
      kind: 'STRENGTH',
      version: 1,
      durationSeconds: 3000,
      plannedSessionRpe: 7,
      exercises: [
        {
          exerciseCode: 'BACK_SQUAT',
          name: 'Back Squat',
          setGroups: [
            { setType: 'WARMUP', load: { kind: 'PERCENT_1RM', value: 50 } },
            {
              setType: 'WORK',
              prescription: { kind: 'REPS', repsMin: 5, repsMax: 6 },
              load: { kind: 'ABSOLUTE', value: 80, unit: 'KG' },
              effort: { kind: 'RPE', value: 7.5 },
            },
          ],
        },
        {
          name: 'Pull Up',
          setGroups: [
            {
              load: {
                kind: 'BODYWEIGHT_OFFSET',
                direction: 'ASSISTED',
                value: 10,
                unit: 'KG',
              },
              effort: { kind: 'RIR', value: 2 },
            },
          ],
        },
      ],
    });
  });
});
