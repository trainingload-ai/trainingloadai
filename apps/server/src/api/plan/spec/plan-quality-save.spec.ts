import { describe, expect, it, jest } from '@jest/globals';
import { PlanWriteSupport } from '../application/plan-write.support';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { PlanLoadEstimatorService } from '../application/plan-load-estimator.service';

const planLoadEstimator = new PlanLoadEstimatorService(
  {} as never,
  { getComposedUserProfile: async () => ({}) } as never,
  new WorkoutService({} as never),
  {} as never,
  {} as never,
);

function setup() {
  const service = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
  const codec = new EnduranceWorkoutCodec(new WorkoutService({} as never));
  const create = jest.fn(async () => ({ id: 'p' }));
  const transaction = jest.fn(async (run: (tx: object) => Promise<unknown>) =>
    run({}),
  );
  Object.assign(service, {
    prisma: { $transaction: transaction },
    planLoadEstimator,
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
  it('rejects a Wednesday exceeding the dynamic daily ceiling before writing and preserves a valid 75-minute Saturday', async () => {
    const s = setup();
    const contract = { startDate: '2026-11-30', maxDailyMinutes: 90, maxMinutesByIsoWeekday: { 3: 45, 6: 90 } };
    s.dto.generationMetadata = { qualityContract: contract };
    s.dto.workouts = [{ weekIndex: 1, dayIndex: 3, sportType: 'RUN', text: 'warmup 10m\nrepeat 4 {\n  work 6m\n  recovery 3m\n}\ncooldown 10m' }];
    await expect(s.service.createPlan('u', s.dto)).rejects.toMatchObject({ response: {
      code: 'PLAN_QUALITY_INVALID', issues: expect.arrayContaining([expect.objectContaining({ code: 'DAILY_TIME_BUDGET' })]),
    } });
    expect(s.create).not.toHaveBeenCalled();
    s.dto.workouts = [{ weekIndex: 1, dayIndex: 6, sportType: 'RUN', text: 'work 75m' }];
    await s.service.createPlan('u', s.dto);
    expect(s.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      generationMetadata: expect.objectContaining({ qualityContract: contract }),
    }) }), expect.anything());
  });
  it('validates persisted mixed plans with the correct strength codec, not the endurance parser', async () => {
    const service = Object.create(PlanWriteSupport.prototype);
    Object.assign(service, {
      planLoadEstimator,
      normalizePlanRow: (p: unknown) => p,
      workoutDefinitionService: new WorkoutDefinitionService(
        new WorkoutCodecRegistry(
          new EnduranceWorkoutCodec(new WorkoutService({} as never)),
          new StrengthWorkoutCodec(),
          new FreeformWorkoutCodec(),
        ),
      ),
    });
    const report = await service.validateStoredPlanQuality('u', {
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
    }, {});
    expect(report.valid).toBe(true);
    expect(report.weeks[0].totalDurationSeconds).toBe(4500);
  });
  it('rejects a confirmed rest-day conflict when saving a dated draft', async () => {
    const s = setup();
    s.dto.generationMetadata = {
      qualityContract: { startDate: '2026-11-22' },
      scheduleConstraints: {
        version: 1,
        revision: 1,
        calendarTimeZone: 'Asia/Shanghai',
        fixedRestWeekdays: [7],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2026-11-16',
        confirmation: { source: 'USER', reference: 'message-1' },
      },
    };
    await expect(s.service.createPlan('u', s.dto)).rejects.toMatchObject({
      status: 422,
    });
    expect(s.transaction).not.toHaveBeenCalled();
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
  it('rechecks persisted week and phase targets before writing a draft', async () => {
    const s = setup();
    const planAssessment = {
      assessmentId: 'ddf48599-cdcb-4d58-b44c-a3c6e37cdf35',
      weekTargets: [1, 2].map((weekIndex) => ({
        weekIndex, phase: 'BUILD', focus: 'Aerobic work',
        trainingDays: { min: 1, max: 1 }, durationMinutes: { min: 20, max: 35 },
      })),
      phases: [{ name: 'Build', startWeek: 1, endWeek: 2, purpose: 'Build consistently', durationMinutes: { min: 40, max: 55 } }],
    };
    s.dto.generationMetadata = { planAssessment };

    await expect(s.service.createPlan('u', s.dto)).rejects.toMatchObject({
      response: { issues: [expect.objectContaining({
        code: 'PHASE_TARGET_DURATION', target: { scope: 'BLOCK', firstWeek: 1, lastWeek: 2 },
      })] },
    });
    expect(s.transaction).not.toHaveBeenCalled();
    planAssessment.phases[0].durationMinutes.max = 65;
    await expect(s.service.createPlan('u', s.dto)).resolves.toBeDefined();
    expect(s.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ generationMetadata: expect.objectContaining({ planAssessment }) }),
    }), expect.anything());
  });
  it('saves equal-duration recovery only when prescribed effort lowers the estimated load', async () => {
    const s = setup();
    s.dto.generationMetadata = { qualityContract: { weekPhases: ['BUILD', 'RECOVERY'] } };
    s.dto.workouts[0].plannedSessionRpe = 6;
    s.dto.workouts[1].plannedSessionRpe = 3;
    await s.service.createPlan('u', s.dto);
    expect(s.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        generationMetadata: expect.objectContaining({ qualityReport: expect.objectContaining({
          weeks: [
            expect.objectContaining({ totalEstimatedLoad: 30 }),
            expect.objectContaining({ totalEstimatedLoad: 15 }),
          ],
        }) }),
      }) }),
      expect.anything(),
    );
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
