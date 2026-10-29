import { describe, expect, it, jest } from '@jest/globals';
import { PlanWriteSupport } from '../application/plan-write.support';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';

function setup() {
  const service = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
  const codec = new EnduranceWorkoutCodec(new WorkoutService({} as never));
  const create = jest.fn(async () => ({ id: 'p' }));
  const transaction = jest.fn(async (run: (tx: object) => Promise<unknown>) =>
    run({}),
  );
  Object.assign(service, {
    prisma: { $transaction: transaction },
    logger: { error: jest.fn() },
    resolveWorkoutDefinitionInput: (w: { text: string }) => ({
      kind: 'ENDURANCE',
      text: w.text,
      summary: codec.summarize(codec.parseText(w.text, 1)),
    }),
    plans: { create, findUnique: async () => ({ id: 'p' }) },
    createWorkoutsForPlan: async () => undefined,
    buildPlanInclude: () => ({}),
    attachActualLoadToWorkouts: async () => undefined,
    normalizePlanRow: (p: unknown) => p,
  });
  const dto = {
    title: 'Base',
    periodWeeks: 2,
    workouts: [1, 2].map((weekIndex) => ({
      weekIndex,
      dayIndex: 1,
      sportType: 'RUN',
      text: 'warmup 5m\nwork 20m\ncooldown 5m',
    })),
  } as Parameters<PlanWriteSupport['createPlan']>[1];
  return { service, create, transaction, dto };
}
describe('plan save server quality boundary', () => {
  it('validates persisted mixed plans with the correct strength codec, not the endurance parser', () => {
    const service = Object.create(PlanWriteSupport.prototype);
    Object.assign(service, {
      normalizePlanRow: (p: unknown) => p,
      workoutDefinitionService: new WorkoutDefinitionService(
        new WorkoutCodecRegistry(
          new EnduranceWorkoutCodec(new WorkoutService({} as never)),
          new StrengthWorkoutCodec(),
          new FreeformWorkoutCodec(),
        ),
      ),
    });
    const report = service.validateStoredPlanQuality({
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 1,
          structureKind: 'ENDURANCE',
          sportType: 'RUN',
          text: 'work 30m',
        },
        {
          weekIndex: 1,
          dayIndex: 2,
          structureKind: 'STRENGTH',
          sportType: 'UNKNOWN',
          text: 'duration 45m\nsession rpe 6\nexercise "Squat" {\nwork 3x5 open rpe 7 rest 3m\n}',
        },
      ],
    });
    expect(report.valid).toBe(true);
    expect(report.weeks[0].totalDurationSeconds).toBe(4500);
  });
  it('blocks fake recovery before opening a write transaction', async () => {
    const s = setup();
    s.dto.generationMetadata = {
      qualityContract: { weekPhases: ['BUILD', 'RECOVERY'] },
      qualityReport: { valid: true },
    };
    await expect(s.service.createPlan('u', s.dto)).rejects.toThrow();
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('recomputes the duration report and retains the agreed contract instead of trusting a client report', async () => {
    const s = setup();
    s.dto.generationMetadata = {
      qualityContract: { maxDailyMinutes: 60 },
      qualityReport: { valid: true, weeks: [] },
    };
    await s.service.createPlan('u', s.dto);
    expect(s.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationMetadata: expect.objectContaining({
            qualityContract: { maxDailyMinutes: 60 },
            qualityReport: expect.objectContaining({
              weeks: expect.arrayContaining([
                expect.objectContaining({ totalDurationSeconds: 1800 }),
              ]),
            }),
          }),
        }),
      }),
      expect.anything(),
    );
  });
  it('rejects malformed contracts as a validation error before writes', async () => {
    const s = setup();
    s.dto.generationMetadata = { qualityContract: { maxDailyMinutes: -1 } };
    await expect(s.service.createPlan('u', s.dto)).rejects.toMatchObject({
      status: 422,
    });
    expect(s.create).not.toHaveBeenCalled();
  });
});
