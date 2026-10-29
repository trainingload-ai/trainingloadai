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
    planWorkout: {
      findUnique: jest.fn(async () => ({
        status: PlanWorkoutStatus.PLANNED,
        plan: { status: 'ACTIVE' },
      })),
      update: jest.fn(async () => ({})),
    },
    planWorkoutActivityLink: {
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
  it('sums only positive TIME step durations', async () => {
    const { prisma } = createPrisma();
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 1200,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
      {
        durationType: WorkoutPlanStepDurationType.DISTANCE,
        durationValue: 5000,
        durationUnit: WorkoutPlanValueUnit.METERS,
      },
      {
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 600,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
      {
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 0,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    const service = createService(prisma);

    await expect(service.sumExpectedDurationSeconds('workout-1')).resolves.toBe(
      1800,
    );
    expect(prisma.planWorkoutStep.findMany).toHaveBeenCalledWith({
      where: { workoutId: 'workout-1' },
      select: {
        durationType: true,
        durationValue: true,
        durationUnit: true,
      },
    });
  });

  it('returns null when no TIME step contributes duration', async () => {
    const { prisma } = createPrisma();
    prisma.planWorkoutStep.findMany.mockResolvedValue([
      {
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
            durationType: WorkoutPlanStepDurationType.TIME,
            durationValue: durationByWorkoutId[where.workoutId],
            durationUnit: WorkoutPlanValueUnit.SECONDS,
          },
        ];
      },
    );
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.planWorkout.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan-1',
        scheduledDate: new Date('2026-06-30T00:00:00.000Z'),
        sportType: SportType.RUN,
        status: {
          in: [PlanWorkoutStatus.PLANNED, PlanWorkoutStatus.IN_PROGRESS],
        },
      },
      select: {
        id: true,
        planId: true,
        structureKind: true,
        sportDefinitionCode: true,
        plannedDurationSeconds: true,
      },
    });
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
        source: PlanWorkoutActivityLinkSource.AUTO,
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

    expect(prisma.plan.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('matches STRENGTH_TRAINING by structure and sport code even without duration', async () => {
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

    expect(prisma.planWorkout.findMany).toHaveBeenCalledWith({
      where: {
        planId: 'plan-1',
        scheduledDate: new Date('2026-06-29T00:00:00.000Z'),
        structureKind: 'STRENGTH',
        sportDefinitionCode: 'STRENGTH_TRAINING',
        status: {
          in: [PlanWorkoutStatus.PLANNED, PlanWorkoutStatus.IN_PROGRESS],
        },
      },
      select: {
        id: true,
        planId: true,
        structureKind: true,
        sportDefinitionCode: true,
        plannedDurationSeconds: true,
      },
    });
    expect(tx.planWorkoutActivityLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planWorkoutId: 'strength-1',
        activityId: 202,
        source: PlanWorkoutActivityLinkSource.AUTO,
      }),
    });
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
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 1800,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.planWorkoutActivityLink.findFirst).toHaveBeenCalledWith({
      where: {
        planWorkoutId: 'workout-1',
        unlinkedAt: null,
        role: PlanWorkoutActivityLinkRole.PRIMARY,
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
        durationType: WorkoutPlanStepDurationType.TIME,
        durationValue: 4000,
        durationUnit: WorkoutPlanValueUnit.SECONDS,
      },
    ]);
    const service = createService(prisma);

    await service.tryAutoLinkForActivity(101);

    expect(prisma.$transaction).not.toHaveBeenCalled();
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
