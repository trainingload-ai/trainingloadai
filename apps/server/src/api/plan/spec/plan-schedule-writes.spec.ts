import { describe, expect, it } from '@jest/globals';
import { PlanWriteSupport } from '../application/plan-write.support';
import { WorkoutService } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';
import type { ScheduleConstraints } from '@shared/plan-calendar';

const constraints: ScheduleConstraints = {
  version: 1,
  revision: 1,
  calendarTimeZone: 'Asia/Shanghai',
  fixedRestWeekdays: [3, 5],
  unavailableDates: [],
  availableDateOverrides: [],
  effectiveFrom: '2026-11-16',
  confirmation: { source: 'USER', reference: 'message-1' },
};
const dto = (dayIndex: number) => ({
  weekIndex: 1,
  dayIndex,
  sportType: 'RUN' as const,
  definition: {
    kind: 'FREEFORM' as const,
    version: 1 as const,
    source: 'STRUCTURE' as const,
    structure: {
      kind: 'FREEFORM' as const,
      version: 1 as const,
      text: 'Easy session',
      durationSeconds: 1800,
    },
  },
});

/** The in-memory database boundary rolls back transactions; all write and calendar logic is real. */
function setup(status = 'DRAFT', useConstraints = true) {
  let plan: any = {
    id: 'p',
    userId: 'u',
    title: 'Base',
    sourceType: 'MANUAL',
    periodWeeks: 1,
    status,
    startDate: status === 'DRAFT' ? null : new Date('2099-11-22T00:00:00Z'),
    generationMetadata: useConstraints
      ? { scheduleConstraints: constraints }
      : {},
  };
  let rows: any[] = [
    {
      id: 'a',
      userId: 'u',
      planId: 'p',
      dayOffset: 3,
      sessionIndex: 1,
      status: 'PLANNED',
      structureKind: 'FREEFORM',
      sportType: 'RUN',
      text: 'Easy session',
      links: [],
      scheduledDate:
        status === 'DRAFT' ? null : new Date('2099-11-25T00:00:00Z'),
      plannedDurationSeconds: 1800,
    },
  ];
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([key, value]) =>
      typeof value === 'object' && value !== null ? true : row[key] === value,
    );
  const hydrate = (row: any) =>
    row ? { ...row, plan: { ...plan }, links: row.links ?? [] } : null;
  const workouts = {
    findMany: async ({ where }: any) =>
      rows.filter((row) => matches(row, where)).map(hydrate),
    findFirst: async ({ where }: any) =>
      hydrate(rows.find((row) => matches(row, where))),
    findUnique: async ({ where }: any) =>
      hydrate(rows.find((row) => row.id === where.id)),
    create: async ({ data }: any) => {
      const row = { id: `new-${rows.length}`, links: [], ...data };
      rows.push(row);
      return hydrate(row);
    },
    update: async ({ where, data }: any) => {
      const row = rows.find((row) => row.id === where.id);
      Object.assign(row, data);
      return hydrate(row);
    },
    updateExternalMappings: async () => undefined,
    deleteExercises: async () => undefined,
  };
  const workoutService = new WorkoutService({} as never);
  const service = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
  Object.assign(service, {
    prisma: {
      $transaction: async (run: any) => {
        const saved = structuredClone({ plan, rows });
        try {
          return await run({});
        } catch (e) {
          plan = saved.plan;
          rows = saved.rows;
          throw e;
        }
      },
    },
    plans: {
      findFirst: async () => null,
      findUnique: async () => ({ ...plan, workouts: rows }),
      update: async ({ data }: any) => {
        Object.assign(plan, data);
        return { ...plan };
      },
    },
    workouts,
    workoutService,
    workoutDefinitionService: new WorkoutDefinitionService(
      new WorkoutCodecRegistry(
        new EnduranceWorkoutCodec(workoutService),
        new StrengthWorkoutCodec(),
        new FreeformWorkoutCodec(),
      ),
    ),
    links: {
      findFirst: async () => null,
      deleteSteps: async () => undefined,
      updateManyMappings: async () => undefined,
    },
    userService: { getPreferredTimezone: async () => 'Asia/Shanghai' },
    workoutMutability: new PlanWorkoutMutabilityPolicy(),
    planLoadEstimator: {
      applyForPlan: async () => undefined,
      applyForWorkout: async () => undefined,
    },
    coachContext: {
      ensureContext: async () => undefined,
      appendEvent: async () => undefined,
    },
    logger: { warn: () => undefined },
  });
  return { service, plan: () => plan, rows: () => rows };
}

describe('plan calendar write boundaries', () => {
  it('rejects Sunday activation when a Monday draft would put sessions on Wednesday rest', async () => {
    const s = setup();
    await expect(
      s.service.activatePlan('u', 'p', '2026-11-22'),
    ).rejects.toMatchObject({
      response: {
        code: 'PLAN_SCHEDULE_INVALID',
        issues: [{ code: 'FIXED_REST_DAY', date: '2026-11-25' }],
      },
    });
    expect(s.plan().status).toBe('DRAFT');
    expect(s.rows()[0].scheduledDate).toBeNull();
  });
  it('keeps unknown historical weekday constraints unknown and allows the legacy activation', async () => {
    const s = setup('DRAFT', false);
    const result = await s.service.activatePlan('u', 'p', '2026-11-22');
    expect(result.plan?.startDate).toBe('2026-11-22');
    expect(result.plan?.workouts[0].scheduledDate).toBe('2026-11-25');
  });
  it('rolls back a single edit that moves onto a fixed rest day', async () => {
    const s = setup('ACTIVE');
    // 2099-11-22 is Sunday; day 4 falls on Wednesday.
    s.rows()[0].dayOffset = 1;
    s.rows()[0].scheduledDate = new Date('2099-11-23T00:00:00Z');
    await expect(
      s.service.updateWorkout('u', 'p', 'a', dto(4)),
    ).rejects.toMatchObject({ response: { code: 'PLAN_SCHEDULE_INVALID' } });
    expect(s.rows()[0].dayOffset).toBe(1);
  });
  it('checks combined daily duration after a batch rather than rejecting an intermediate exchange', async () => {
    const s = setup('ACTIVE');
    s.plan().generationMetadata.qualityContract = { maxDailyMinutes: 30 };
    s.rows()[0].dayOffset = 1;
    s.rows()[0].scheduledDate = new Date('2099-11-23T00:00:00Z');
    s.rows().push({
      ...s.rows()[0],
      id: 'b',
      dayOffset: 2,
      scheduledDate: new Date('2099-11-24T00:00:00Z'),
    });
    const result = await s.service.updateWorkouts('u', 'p', [
      { workoutId: 'a', dto: dto(3) },
      { workoutId: 'b', dto: dto(2) },
    ]);
    expect(result.after.map((w) => w?.scheduledDate)).toEqual([
      '2099-11-24',
      '2099-11-23',
    ]);
    await expect(
      s.service.updateWorkouts('u', 'p', [
        { workoutId: 'a', dto: { ...dto(2), sessionIndex: 2 } },
      ]),
    ).rejects.toMatchObject({
      response: { issues: [{ code: 'DAILY_TIME_BUDGET', date: '2099-11-23' }] },
    });
    expect(s.rows()[0].dayOffset).toBe(2);
  });
  it('atomically replaces only allowedDays with confirmed rules, retaining other limits and history', async () => {
    const s = setup();
    s.plan().generationMetadata.qualityContract = {
      allowedDays: [1],
      maxDailyMinutes: 60,
      requiredSports: ['RUN'],
    };
    const result = await s.service.updatePlan('u', 'p', {
      scheduleConstraints: { ...constraints, revision: 2 },
      qualityContractTransition: {
        mode: 'REPLACE_ALLOWED_DAYS',
        allowedDays: null,
      },
    });
    expect(result.plan?.generationMetadata).toMatchObject({
      scheduleConstraints: { revision: 2 },
      qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
      scheduleConstraintHistory: [{ qualityContract: { allowedDays: [1] } }],
    });
    expect(
      (result.plan?.generationMetadata as any).qualityContract.allowedDays,
    ).toBeUndefined();
  });
  it('resumes without moving completed or historical dates and rejects a new origin', async () => {
    const s = setup('PAUSED');
    s.rows()[0].status = 'DONE';
    const result = await s.service.activatePlan('u', 'p');
    expect(result.plan?.startDate).toBe('2099-11-22');
    expect(result.plan?.workouts[0].scheduledDate).toBe('2099-11-25');
    const other = setup('PAUSED');
    await expect(
      other.service.activatePlan('u', 'p', '2099-11-23'),
    ).rejects.toThrow('Resuming a plan cannot change its start date');
  });
});
