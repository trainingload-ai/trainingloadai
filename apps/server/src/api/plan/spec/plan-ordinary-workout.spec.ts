import { FreeformWorkoutCodec } from '../../workout/codecs/freeform-workout.codec';
import { WorkoutCodecRegistry } from '../../workout/workout-codec.registry';
import { WorkoutDefinitionService } from '../../workout/workout-definition.service';
import { normalizePlanWorkoutRow } from '../application/plan-row.mapper';
import { PlanDeliveryReadService } from '../application/plan-delivery-read.service';

const definitions = new WorkoutDefinitionService(
  new WorkoutCodecRegistry(
    undefined as never,
    undefined as never,
    new FreeformWorkoutCodec(),
  ),
);

describe('ordinary calendar workout read contract', () => {
  it.each([1800, null])(
    'preserves duration %s without reporting intervals or intensity',
    async (duration) => {
      const row = {
        id: 'ordinary',
        userId: 'user',
        planId: 'plan',
        dayOffset: 0,
        name: 'Run',
        text: 'Run',
        sportType: 'RUN',
        sportDefinitionCode: 'ROAD_RUNNING',
        structureKind: 'FREEFORM',
        dslVersion: 1,
        plannedDurationSeconds: duration,
        revision: 1,
        status: 'PLANNED',
        scheduledDate: new Date('2026-07-06'),
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-01'),
        steps: [],
        strengthExercises: [],
      };
      const mapped = normalizePlanWorkoutRow(row, {
        workoutService: { buildPlanBlocksFromWorkoutSteps: () => [] } as never,
        workoutPersistence: undefined as never,
        workoutDefinitionService: definitions,
      });
      expect(mapped.summary).toEqual({
        kind: 'FREEFORM',
        durationSeconds: duration,
        hardSession: null,
      });
      expect(mapped.structure).toMatchObject({
        kind: 'FREEFORM',
        text: 'Run',
        durationSeconds: duration,
      });
      const delivery = new PlanDeliveryReadService(
        { findFirst: async () => row } as never,
        {
          resolveWorkout: async (_user: string, value: unknown) => value,
        } as never,
        undefined as never,
        undefined as never,
        definitions,
      );
      expect(
        (await delivery.snapshot('user', 'ordinary'))?.structure,
      ).toMatchObject({
        kind: 'FREEFORM',
        durationSeconds: duration,
      });
    },
  );

  it('keeps legacy freeform definitions valid with unknown duration', () => {
    expect(
      definitions.resolve({
        kind: 'FREEFORM',
        version: 1,
        source: 'TEXT',
        text: 'Easy swim',
      }).summary,
    ).toEqual({ kind: 'FREEFORM', durationSeconds: null, hardSession: null });
  });

  it.each([0, -1, 1.5, 2147483648, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid supplied duration %s',
    (durationSeconds) => {
      expect(() =>
        definitions.resolve({
          kind: 'FREEFORM',
          version: 1,
          source: 'STRUCTURE',
          structure: {
            kind: 'FREEFORM',
            version: 1,
            text: 'Run',
            durationSeconds,
          },
        }),
      ).toThrow();
    },
  );
});
