let stepSequence = 0;
import { describe, expect, it, jest } from '@jest/globals';
import {
  BodyMetricType,
  PlanWorkoutActivityLinkRole,
  PlanWorkoutActivityLinkSource,
  PlanWorkoutStatus,
  SportType,
  WorkoutPlanStepDurationType,
  WorkoutPlanValueUnit,
} from '@prisma/client';
import { PlanLinkMatcherService } from '../plan-link-matcher.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { ActivityReadService } from '../../activity/activity-read.service';
import { UserQueryService } from '../../user/user-query.service';
import { UserIdentityRepository } from '../../user/persistence/user-identity.repository';

type LinkWhere = {
  activityId?: number;
  planWorkoutId?: string;
};

function createPrisma() {
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: 'locked-target' }]),
    planWorkout: {
      findFirst: jest.fn(async () => ({ id: 'current-workout' })),
      findUnique: jest.fn(async () => ({
        status: PlanWorkoutStatus.PLANNED,
        plan: { status: 'ACTIVE' },
      })),
      update: jest.fn(async () => ({})),
    },
    planWorkoutActivityLink: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'link-1',
        ...data,
      })),
    },
  };

  const prisma = {
    activity: {
      findUnique:
        jest.fn<
          (args: { where: Record<string, unknown> }) => Promise<unknown>
        >(),
    },
    planWorkoutActivityLink: {
      findFirst: jest.fn<(args: { where: LinkWhere }) => Promise<unknown>>(),
    },
    plan: {
      findFirst:
        jest.fn<
          (args: { where: Record<string, unknown> }) => Promise<unknown>
        >(),
    },
    userBodyMetric: {
      findFirst:
        jest.fn<
          (args: { where: Record<string, unknown> }) => Promise<unknown>
        >(),
    },
    planWorkout: {
      findMany:
        jest.fn<
          (args: { where: Record<string, unknown> }) => Promise<unknown[]>
        >(),
    },
    planWorkoutStep: {
      findMany:
        jest.fn<
          (args: {
            where: { workoutId: string };
            select?: Record<string, unknown>;
          }) => Promise<unknown[]>
        >(),
    },
    $transaction: jest.fn(async (callback: (txArg: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  // Adapt the existing scenario fixtures to the day-wide transactional read boundary.
  const stepRows = async (workoutId: string) =>
    (
      (await prisma.planWorkoutStep.findMany({ where: { workoutId } })) ?? []
    ).map((step, index) => ({
      id: String(index),
      parentId: null,
      stepType: 'WORK',
      ...(step as object),
    }));
  const activityRows = async () => {
    const row = (await prisma.activity.findUnique({ where: {} })) as Record<
      string,
      unknown
    > | null;
    if (!row) return [];
    const existing =
      (await prisma.planWorkoutActivityLink.findFirst({
        where: { activityId: Number(row.id) },
      })) ?? (await tx.planWorkoutActivityLink.findFirst());
    return [
      {
        ...row,
        workoutMatchState: null,
        planWorkoutLinks: existing
          ? [{ ...existing, source: 'MANUAL', planWorkout: { plan: null } }]
          : [],
      },
    ];
  };
  Object.assign(prisma.activity, { findFirst: prisma.activity.findUnique });
  Object.assign(prisma, {
    planActivityMatchState: { upsert: jest.fn(async () => ({})) },
  });
  Object.assign(tx, {
    activity: { findMany: jest.fn(activityRows) },
    plan: {
      findMany: jest.fn(async () => {
        const row = await prisma.plan.findFirst({ where: {} });
        return row ? [row] : [];
      }),
    },
    planActivityMatchState: { upsert: jest.fn(async () => ({})) },
  });
  Object.assign(tx.planWorkout, {
    findMany: jest.fn(async () => {
      if (!(await tx.planWorkout.findFirst())) return [];
      const state = await tx.planWorkout.findUnique();
      return Promise.all(
        ((await prisma.planWorkout.findMany({ where: {} })) ?? []).map(
          async (row) => {
            const workout = row as {
              id: string;
              sportType?: string;
              structureKind?: string;
            };
            const occupied = await prisma.planWorkoutActivityLink.findFirst({
              where: { planWorkoutId: workout.id },
            });
            return {
              sportType: 'RUN',
              plan: null,
              status: state.status,
              ...workout,
              steps: await stepRows(workout.id),
              links: occupied
                ? [{ ...occupied, activityId: -1, source: 'MANUAL' }]
                : [],
            };
          },
        ),
      );
    }),
  });
  return { prisma, tx };
}

function createService(prisma: ReturnType<typeof createPrisma>['prisma']) {
  return new PlanLinkMatcherService(
    prisma as never,
    undefined as never,
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
    new PlanActivityLinkRepository(prisma as never),
    new ActivityReadService(prisma as never),
    new UserQueryService(new UserIdentityRepository(prisma as never)),
  );
}

describe('PlanLinkMatcherService.sumExpectedDurationSeconds', () => {
  it('does not treat a mixed prescription as a complete timed duration', async () => {
    const { prisma } = createPrisma();
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 1200,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.DISTANCE,
        durationValue: 5000,
        durationUnit: WorkoutPlanValueUnit.METERS,
      },
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 600,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 0,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    const service = createService(prisma);

    await expect(
      service.sumExpectedDurationSeconds('workout-1'),
    ).resolves.toBeNull();
    expect(prisma.planWorkoutStep.findMany).toHaveBeenCalledWith({
      where: { workoutId: 'workout-1' },
    });
  });

  it('returns null when no TIME step contributes duration', async () => {
    const { prisma } = createPrisma();
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.DISTANCE,
        durationValue: 5000,
        durationUnit: WorkoutPlanValueUnit.METERS,
      },
    ]);
    const service = createService(prisma);

    await expect(service.sumExpectedDurationSeconds('workout-1')).resolves.toBe(
      null,
    );
  });
});

describe('PlanLinkMatcherService.tryAutoLinkForActivity', () => {
  it('uses the prescribed duration of an ordinary FREEFORM course', async () => {
    const { prisma } = createPrisma();
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      startTime: new Date('2026-06-29T10:00:00Z'),
      timerTime: 1800,
      state: 1,
      timezone: 'UTC',
    });
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValue(null);
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([
      {
        id: 'ordinary',
        planId: 'plan-1',
        structureKind: 'FREEFORM',
        plannedDurationSeconds: 1800,
      },
    ]);
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 1800,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    await createService(prisma).tryAutoLinkForActivity(101);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('leaves equal-scoring workouts unlinked instead of choosing database order', async () => {
    const { prisma } = createPrisma();
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      startTime: new Date('2026-06-29T10:00:00Z'),
      timerTime: 1800,
      state: 1,
      timezone: 'UTC',
    });
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValue(null);
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([
      { id: 'first', planId: 'plan-1' },
      { id: 'second', planId: 'plan-1' },
    ]);
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 1800,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    await createService(prisma).tryAutoLinkForActivity(101);
    expect(prisma.planWorkoutActivityLink.findFirst).toHaveBeenCalled();
  });

  it.each(['activity-linked', 'workout-changed', 'already-done'])(
    'revalidates the selected course after locking: %s',
    async (change) => {
      const { prisma, tx } = createPrisma();
      prisma.activity.findUnique.mockResolvedValue({
        id: 101,
        userId: 'user-1',
        sportType: SportType.RUN,
        startTime: new Date('2026-06-29T10:00:00Z'),
        timerTime: 1800,
        state: 1,
        timezone: 'UTC',
      });
      prisma.planWorkoutActivityLink.findFirst.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
      prisma.userBodyMetric.findFirst.mockResolvedValue(null);
      prisma.planWorkout.findMany.mockResolvedValue([
        { id: 'candidate', planId: 'plan-1' },
      ]);
      prisma.planWorkoutStep.findMany.mockResolvedValue([
        {
          id: String(++stepSequence),
          parentId: null,
          stepType: 'WORK',
          durationType: WorkoutPlanStepDurationType.TIME,
          durationValue: 1800,
          durationUnit: WorkoutPlanValueUnit.SECONDS,
        },
      ]);
      if (change === 'activity-linked')
        tx.planWorkoutActivityLink.findFirst.mockResolvedValue({
          id: 'new-link',
        } as never);
      if (change === 'workout-changed')
        tx.planWorkout.findFirst.mockResolvedValue(null as never);
      if (change === 'already-done')
        tx.planWorkout.findUnique.mockResolvedValue({
          status: PlanWorkoutStatus.DONE,
          plan: { status: 'ACTIVE' },
        });
      await createService(prisma).tryAutoLinkForActivity(101);
      expect(tx.planWorkoutActivityLink.create).not.toHaveBeenCalled();
    },
  );

  it('links the closest eligible workout by activity day and auto-marks it done', async () => {
    const { prisma, tx } = createPrisma();
    const activityStart = new Date('2026-06-29T23:30:00.000Z');
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      sportDefinitionCode: 'ROAD_RUNNING',
      startTime: activityStart,
      timerTime: 1800,
      elapsedTime: 1810,
      state: 1,
      timezone: 'Asia/Shanghai',
    });
    prisma.planWorkoutActivityLink.findFirst.mockImplementation(
      async ({ where }: { where: LinkWhere }) => {
        if (where.activityId === 101) return null;
        if (where.planWorkoutId) return null;
        return null;
      },
    );
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue({
      value: 'America/Los_Angeles',
    });
    prisma.planWorkout.findMany.mockResolvedValue([
      { id: 'workout-far', planId: 'plan-1' },
      { id: 'workout-best', planId: 'plan-1' },
      { id: 'workout-too-long', planId: 'plan-1' },
    ]);
    prisma.planWorkoutStep.findMany.mockImplementation(
      async ({ where }: { where: { workoutId: string } }) => {
        const durationByWorkoutId: Record<string, number> = {
          'workout-far': 3000,
          'workout-best': 1700,
          'workout-too-long': 4000,
        };
        return [
          {
            id: String(++stepSequence),
            parentId: null,
            stepType: 'WORK',
            durationType: WorkoutPlanStepDurationType.TIME,
            durationValue: durationByWorkoutId[where.workoutId],
            durationUnit: WorkoutPlanValueUnit.SECONDS,
          },
        ];
      },
    );
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.planWorkout.findMany).toHaveBeenCalled();
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-best' },
      data: {
        status: PlanWorkoutStatus.DONE,
        completedAt: activityStart,
      },
    });
    expect(tx.planWorkoutActivityLink.create).toHaveBeenCalledWith({
      data: {
        planId: 'plan-1',
        planWorkoutId: 'workout-best',
        activityId: 101,
        source: PlanWorkoutActivityLinkSource.AUTO_MATCH,
        role: PlanWorkoutActivityLinkRole.PRIMARY,
        autoMarkedWorkoutDone: true,
      },
    });
  });

  it('skips matching when the activity already has an active link', async () => {
    const { prisma } = createPrisma();
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      startTime: new Date('2026-06-29T10:00:00.000Z'),
      timerTime: 1800,
      elapsedTime: null,
      state: 1,
      timezone: 'UTC',
    });
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValueOnce({
      id: 'existing-link',
    });
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.planWorkoutActivityLink.findFirst).toHaveBeenCalled();
    expect(prisma.planWorkoutActivityLink.findFirst).toHaveBeenCalled();
  });

  it('requires evidence before associating a strength course without duration', async () => {
    const { prisma, tx } = createPrisma();
    const activityStart = new Date('2026-06-29T10:00:00.000Z');
    prisma.activity.findUnique.mockResolvedValue({
      id: 202,
      userId: 'user-1',
      sportType: SportType.UNKNOWN,
      sportDefinitionCode: 'STRENGTH_TRAINING',
      startTime: activityStart,
      timerTime: null,
      elapsedTime: null,
      state: 1,
      timezone: 'UTC',
    });
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValue(null);
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([
      {
        id: 'strength-1',
        planId: 'plan-1',
        structureKind: 'STRENGTH',
        sportDefinitionCode: 'STRENGTH_TRAINING',
        plannedDurationSeconds: null,
      },
    ]);
    prisma.planWorkoutStep.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(202);

    expect(tx.planWorkoutActivityLink.create).not.toHaveBeenCalled();
  });

  it('skips candidates that already have an active primary link', async () => {
    const { prisma } = createPrisma();
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      startTime: new Date('2026-06-29T10:00:00.000Z'),
      timerTime: 1800,
      elapsedTime: null,
      state: 1,
      timezone: 'UTC',
    });
    prisma.planWorkoutActivityLink.findFirst.mockImplementation(
      async ({ where }: { where: LinkWhere }) => {
        if (where.activityId === 101) return null;
        if (where.planWorkoutId === 'workout-1') return { id: 'taken-link' };
        return null;
      },
    );
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([
      { id: 'workout-1', planId: 'plan-1' },
    ]);
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 1800,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.planWorkoutActivityLink.findFirst).toHaveBeenCalled();
  });

  it('does not match workouts outside the duration tolerance', async () => {
    const { prisma } = createPrisma();
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      startTime: new Date('2026-06-29T10:00:00.000Z'),
      timerTime: 1800,
      elapsedTime: null,
      state: 1,
      timezone: 'UTC',
    });
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValue(null);
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([
      { id: 'workout-too-long', planId: 'plan-1' },
    ]);
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        id: String(++stepSequence),
        parentId: null,
        stepType: 'WORK',
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 4000,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.planWorkoutActivityLink.findFirst).toHaveBeenCalled();
  });

  it('queries user timezone with the TIMEZONE body metric type', async () => {
    const { prisma } = createPrisma();
    prisma.activity.findUnique.mockResolvedValue({
      id: 101,
      userId: 'user-1',
      sportType: SportType.RUN,
      startTime: new Date('2026-06-29T10:00:00.000Z'),
      timerTime: 1800,
      elapsedTime: null,
      state: 1,
      timezone: null,
    });
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValue(null);
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
    prisma.userBodyMetric.findFirst.mockResolvedValue({ value: 'UTC' });
    prisma.planWorkout.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.userBodyMetric.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
  });
});
