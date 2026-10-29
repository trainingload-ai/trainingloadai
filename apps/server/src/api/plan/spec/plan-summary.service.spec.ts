import { describe, expect, it, jest } from '@jest/globals';
import { PlanWorkoutActivityLinkRole, SportType } from '@prisma/client';
import { PlanSummaryService } from '../plan-summary.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';

function createService(args?: {
  plan?: Record<string, unknown> | null;
  workouts?: Array<Record<string, unknown>>;
  actualMap?: Map<number, { actualLoad: number | null }>;
}) {
  const prisma = {
    plan: {
      findUnique: jest.fn(async () => args?.plan ?? null),
    },
    planWorkout: {
      findMany: jest.fn(async () => args?.workouts ?? []),
    },
  };
  const loadReadout = {
    batchGetActualLoad: jest.fn(
      async () => args?.actualMap ?? new Map<number, { actualLoad: number | null }>(),
    ),
  };
  const service = new PlanSummaryService(
    prisma as never,
    loadReadout as never,
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
  );
  return { service, prisma, loadReadout };
}

const primaryLink = (activityId: number, overrides: Record<string, unknown> = {}) => ({
  role: PlanWorkoutActivityLinkRole.PRIMARY,
  unlinkedAt: null,
  activityId,
  ...overrides,
});

describe('PlanSummaryService.rollupForWorkouts', () => {
  it('uses only done workouts for list load compliance and completion rate', () => {
    const { service } = createService();
    const actualMap = new Map<number, { actualLoad: number | null }>([
      [101, { actualLoad: 42 }],
      [102, { actualLoad: 70 }],
      [103, { actualLoad: 999 }],
    ]);

    const rollup = service.rollupForWorkouts(
      [
        {
          status: 'DONE',
          sportType: SportType.RUN,
          estimatedLoad: 40,
          links: [primaryLink(101)],
        },
        {
          status: 'PLANNED',
          sportType: SportType.RUN,
          estimatedLoad: 50,
          links: [primaryLink(102)],
        },
        {
          status: 'DONE',
          sportType: SportType.CYCLING,
          estimatedLoad: 60,
          links: [primaryLink(103, { unlinkedAt: new Date() })],
        },
      ],
      actualMap,
    );

    expect(rollup).toEqual({
      workoutCount: 3,
      doneCount: 2,
      estimatedLoadTotal: 100,
      actualLoadTotal: 42,
      sessionCompletionRate: 67,
      complianceRate: 42,
    });
  });

  it('ignores secondary links and returns null compliance without done estimated load', () => {
    const { service } = createService();
    const actualMap = new Map<number, { actualLoad: number | null }>([
      [101, { actualLoad: 42 }],
    ]);

    const rollup = service.rollupForWorkouts(
      [
        {
          status: 'DONE',
          sportType: SportType.RUN,
          estimatedLoad: null,
          links: [
            primaryLink(101, {
              role: 'SECONDARY',
            }),
          ],
        },
      ],
      actualMap,
    );

    expect(rollup).toEqual({
      workoutCount: 1,
      doneCount: 1,
      estimatedLoadTotal: 0,
      actualLoadTotal: 0,
      sessionCompletionRate: 100,
      complianceRate: null,
    });
  });
});

describe('PlanSummaryService.summarize', () => {
  it('summarizes totals, weeks, and sport buckets using primary actual load', async () => {
    const workouts = [
      {
        id: 'w1',
        status: 'DONE',
        sportType: SportType.RUN,
        dayOffset: 0,
        estimatedLoad: 40.2,
        links: [primaryLink(101)],
      },
      {
        id: 'w2',
        status: 'PLANNED',
        sportType: SportType.CYCLING,
        dayOffset: 1,
        estimatedLoad: 55.8,
        links: [primaryLink(102)],
      },
      {
        id: 'w3',
        status: 'DONE',
        sportType: SportType.SWIM,
        dayOffset: 7,
        estimatedLoad: 30,
        links: [primaryLink(103)],
      },
      {
        id: 'w4',
        status: 'SKIPPED',
        sportType: SportType.UNKNOWN,
        dayOffset: 8,
        estimatedLoad: 20,
        links: [],
      },
    ];
    const actualMap = new Map<number, { actualLoad: number | null }>([
      [101, { actualLoad: 44 }],
      [102, { actualLoad: 80 }],
      [103, { actualLoad: 24 }],
    ]);
    const { service, prisma, loadReadout } = createService({
      plan: {
        id: 'plan-1',
        userId: 'user-1',
        status: 'ACTIVE',
        periodWeeks: 3,
      },
      workouts,
      actualMap,
    });

    const summary = await service.summarize('user-1', 'plan-1');

    expect(prisma.plan.findUnique).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      select: {
        id: true,
        userId: true,
        status: true,
        periodWeeks: true,
      },
    });
    expect(loadReadout.batchGetActualLoad).toHaveBeenCalledWith([
      101, 102, 103,
    ]);
    expect(summary.totals).toMatchObject({
      workoutCount: 4,
      doneCount: 2,
      plannedCount: 1,
      skippedCount: 1,
      estimatedLoad: 70.2,
      actualLoad: 68,
      completionRate: 50,
      complianceRate: 97,
    });
    expect(summary.weeks).toEqual([
      expect.objectContaining({
        weekIndex: 1,
        workoutCount: 2,
        doneCount: 1,
        plannedCount: 1,
        estimatedLoad: 96,
        actualLoad: 124,
        complianceRate: 109,
      }),
      expect.objectContaining({
        weekIndex: 2,
        workoutCount: 2,
        doneCount: 1,
        skippedCount: 1,
        estimatedLoad: 50,
        actualLoad: 24,
        complianceRate: 80,
      }),
      expect.objectContaining({
        weekIndex: 3,
        workoutCount: 0,
        estimatedLoad: 0,
        actualLoad: 0,
      }),
    ]);
    expect(summary.bySport).toEqual([
      expect.objectContaining({
        sport: 'RUN',
        workoutCount: 1,
        doneCount: 1,
        estimatedLoad: 40,
        actualLoad: 44,
        complianceRate: 109,
      }),
      expect.objectContaining({
        sport: 'CYCLING',
        workoutCount: 1,
        doneCount: 0,
        estimatedLoad: 56,
        actualLoad: 80,
        complianceRate: 0,
      }),
      expect.objectContaining({
        sport: 'SWIM',
        workoutCount: 1,
        doneCount: 1,
        estimatedLoad: 30,
        actualLoad: 24,
        complianceRate: 80,
      }),
      expect.objectContaining({
        sport: 'OTHER',
        workoutCount: 1,
        doneCount: 0,
        estimatedLoad: 20,
        actualLoad: 0,
        complianceRate: 0,
      }),
    ]);
  });

  it('does not call load readout when the plan has no primary links', async () => {
    const { service, loadReadout } = createService({
      plan: {
        id: 'plan-1',
        userId: 'user-1',
        status: 'DRAFT',
        periodWeeks: 1,
      },
      workouts: [
        {
          id: 'w1',
          status: 'PLANNED',
          sportType: SportType.RUN,
          dayOffset: 0,
          estimatedLoad: 30,
          links: [],
        },
      ],
    });

    const summary = await service.summarize('user-1', 'plan-1');

    expect(loadReadout.batchGetActualLoad).not.toHaveBeenCalled();
    expect(summary.totals).toMatchObject({
      workoutCount: 1,
      doneCount: 0,
      plannedCount: 1,
      actualLoad: 0,
      complianceRate: null,
    });
  });

  it('throws when the plan does not belong to the user', async () => {
    const { service } = createService({
      plan: {
        id: 'plan-1',
        userId: 'other-user',
        status: 'ACTIVE',
        periodWeeks: 4,
      },
    });

    await expect(service.summarize('user-1', 'plan-1')).rejects.toThrow(
      'Plan not found',
    );
  });
});
