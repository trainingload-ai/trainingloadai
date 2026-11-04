import { describe, expect, it, jest } from '@jest/globals';
import {
  projectCanonicalStrengthExercises,
  replaceCanonicalStrengthRows,
} from '../canonical-strength.materializer';
import type { CanonicalStrengthSet } from '../canonical-activity.types';

const phases: CanonicalStrengthSet[] = [
  {
    sequenceIndex: 0,
    setType: 'ACTIVE',
    startTime: '2026-11-03T19:31:22.000Z',
    durationSeconds: 63.201,
    repetitions: 30,
    weightKg: 0,
    exercises: [{ category: 'unknown' }],
  },
  {
    sequenceIndex: 1,
    setType: 'REST',
    durationSeconds: 248.969,
    exercises: [],
  },
  {
    sequenceIndex: 2,
    setType: 'ACTIVE',
    startTime: '2026-11-03T19:36:34.000Z',
    durationSeconds: 43.995,
    repetitions: 10,
    weightKg: 40,
    exercises: [
      {
        category: 'deadlift',
        categorySubtype: 25,
        name: 'straightLegDeadlift',
      },
      { category: 'deadlift', categorySubtype: 0, name: 'barbellDeadlift' },
    ],
  },
  {
    sequenceIndex: 3,
    setType: 'REST',
    durationSeconds: 78.569,
    exercises: [],
  },
  {
    sequenceIndex: 4,
    setType: 'ACTIVE',
    startTime: '2026-11-03T19:40:49.000Z',
    durationSeconds: 48.067,
    repetitions: 10,
    weightKg: 40,
    exercises: [
      {
        category: 'deadlift',
        categorySubtype: 25,
        name: 'straightLegDeadlift',
      },
      { category: 'deadlift', categorySubtype: 0, name: 'barbellDeadlift' },
    ],
  },
];

describe('canonical FIT strength projection', () => {
  it('keeps active-set facts, pairs rest, and groups equal device labels', () => {
    const projected = projectCanonicalStrengthExercises(phases);

    expect(projected).toHaveLength(2);
    expect(projected[0]).toMatchObject({
      name: 'Unrecognized exercise',
      exerciseCode: null,
      sets: [
        expect.objectContaining({
          sourceSequenceIndex: 0,
          completedReps: 30,
          completedDurationSeconds: 63,
          restAfterSeconds: 249,
          loadType: 'OPEN',
        }),
      ],
    });
    expect(projected[1]).toMatchObject({
      name: 'Straight leg deadlift / Barbell deadlift',
      sets: [
        expect.objectContaining({
          sourceSequenceIndex: 2,
          completedReps: 10,
          restAfterSeconds: 79,
          loadType: 'ABSOLUTE',
          loadValue: 40,
          loadUnit: 'KG',
        }),
        expect.objectContaining({
          sourceSequenceIndex: 4,
          completedReps: 10,
          restAfterSeconds: null,
        }),
      ],
    });
  });

  it('replaces only FIT-owned rows and persists the projection', async () => {
    const createMany = jest.fn(async () => ({ count: 1 }));
    const tx = {
      activityStrengthExercise: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn(async () => null),
        create: jest
          .fn()
          .mockImplementation(
            async ({ data }: { data: { orderIndex: number } }) => ({
              id: `exercise-${data.orderIndex}`,
            }),
          ),
      },
      activityStrengthSet: { createMany },
    };

    await replaceCanonicalStrengthRows(tx as never, 42, phases);

    expect(tx.activityStrengthExercise.deleteMany).toHaveBeenCalledWith({
      where: {
        activityId: 42,
        sets: { some: { source: 'FIT' }, every: { source: 'FIT' } },
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          source: 'FIT',
          setType: 'WORK',
          completedAt: new Date('2026-11-03T19:32:25.201Z'),
        }),
      ]),
    });
  });
});
