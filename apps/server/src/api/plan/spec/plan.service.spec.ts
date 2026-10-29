import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { SportType, ZoneBase } from '@prisma/client';
import { WorkoutService } from '../../workout/workout.service';
import { EnduranceWorkoutCodec } from '../../workout/codecs/endurance-workout.codec';
import { FreeformWorkoutCodec } from '../../workout/codecs/freeform-workout.codec';
import { StrengthWorkoutCodec } from '../../workout/codecs/strength-workout.codec';
import { WorkoutCodecRegistry } from '../../workout/workout-codec.registry';
import { WorkoutDefinitionService } from '../../workout/workout-definition.service';
import { PlanWriteSupport } from '../application/plan-write.support';
import { ActivityReadService } from '../../activity/activity-read.service';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { WorkoutPersistenceService } from '../workout-persistence.service';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';
import { WorkoutPrescriptionService } from '@/api/workout/workout-prescription.service';

type PlanWritePrivate = {
  replaceWorkoutDefinition(
    tx: unknown,
    workoutId: string,
    definition: ReturnType<WorkoutDefinitionService['resolve']>,
    plannedSessionRpe?: number | null,
  ): Promise<void>;
  replaceWorkoutSteps(
    tx: unknown,
    workoutId: string,
    text: string,
    blocksInput?: unknown,
  ): Promise<void>;
  createWorkoutPlanSteps(
    tx: unknown,
    workoutId: string,
    steps: unknown[],
    parentId?: string | null,
  ): Promise<void>;
};

function asWritePrivate(service: PlanWriteSupport): PlanWritePrivate {
  return service as unknown as PlanWritePrivate;
}

function createWorkoutDependencies() {
  const workoutService = new WorkoutService({} as never);
  const definitionService = new WorkoutDefinitionService(
    new WorkoutCodecRegistry(
      new EnduranceWorkoutCodec(workoutService),
      new StrengthWorkoutCodec(),
      new FreeformWorkoutCodec(),
    ),
  );
  return {
    workoutService,
    definitionService,
    persistenceService: new WorkoutPersistenceService(
      new PlanWorkoutRepository({} as never),
    ),
  };
}

function createPlanPorts(prisma: unknown) {
  return [
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
    new PlanActivityLinkRepository(prisma as never),
    new ActivityReadService(prisma as never),
    new PlanWorkoutMutabilityPolicy(),
    new WorkoutPrescriptionService(),
  ] as const;
}

describe('PlanService workout zone snapshot persistence', () => {
  const createService = (
    userServiceOverrides: Record<string, unknown> = {},
  ) => {
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        maxHeartRate: 200,
        restingHeartRate: 60,
        lthr: 172,
        ftp: 250,
        cp: 275,
        cs: 4.2,
      })),
      getHeartRateZoneSetting: jest.fn(async () => ({
        benchmark: ZoneBase.HRR,
        zones: [
          { order: 1, name: 'Z1', min: 100, max: 120 },
          { order: 2, name: 'Z2', min: 121, max: 140 },
        ],
      })),
      getPowerZoneSettingResolved: jest.fn(async () => ({
        benchmark: ZoneBase.FTP,
        zones: [
          { order: 1, name: 'Z1', min: 0, max: 150 },
          { order: 2, name: 'Z2', min: 151, max: 190 },
          { order: 3, name: 'Z3', min: 191, max: 230 },
          { order: 4, name: 'Z4', min: 231, max: 270 },
        ],
      })),
      getPaceZoneSettingResolved: jest.fn(async () => ({
        benchmark: ZoneBase.CS,
        zones: [
          { order: 1, name: 'Z1', min: 0.3, max: 0.34 },
          { order: 2, name: 'Z2', min: 0.24, max: 0.28 },
        ],
      })),
      ...userServiceOverrides,
    };
    const workout = createWorkoutDependencies();
    const service = new PlanWriteSupport(
      {} as never,
      workout.workoutService,
      userService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workout.definitionService,
      workout.persistenceService,
      ...createPlanPorts({}),
    );
    return { service, userService };
  };

  const createTx = () => {
    const createdRows: Array<Record<string, unknown>> = [];
    const tx = {
      planWorkout: {
        update: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => data,
        ),
        findUnique: jest.fn(async () => ({
          sportType: SportType.RUN,
          plan: { userId: 'user-1' },
        })),
      },
      planWorkoutExercise: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      planWorkoutStep: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(
          async ({ data }: { data: Array<Record<string, unknown>> }) => {
            createdRows.push(...data);
            return { count: data.length };
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdRows.push(data);
          return { id: `step-${createdRows.length}` };
        }),
      },
    };
    return { tx, createdRows };
  };

  it('persists the complete endurance duration including warm-up and cool-down', async () => {
    const { service } = createService();
    const { tx } = createTx();
    const definition = createWorkoutDependencies().definitionService.resolve({
      kind: 'ENDURANCE',
      version: 1,
      source: 'TEXT',
      text: 'warmup 5m\nwork 20m\ncooldown 5m',
    });

    await asWritePrivate(service).replaceWorkoutDefinition(
      tx,
      'workout-duration',
      definition,
      3,
    );

    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-duration' },
      data: expect.objectContaining({
        plannedDurationSeconds: 30 * 60,
        plannedSessionRpe: 3,
      }),
    });
  });

  it('materializes heart-rate zone basis when saving pure DSL zone targets', async () => {
    const { service } = createService();
    const { tx, createdRows } = createTx();

    await asWritePrivate(service).replaceWorkoutSteps(
      tx,
      'workout-1',
      'work 25m hr z2',
    );

    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({
      workoutId: 'workout-1',
      targetType: 'HEART_RATE',
      targetUnit: 'BPM',
      targetValueLow: 121,
      targetValueHigh: 140,
      targetZoneIndex: 2,
      targetZoneSystem: ZoneBase.HRR,
      targetZoneBasis: {
        zoneType: 'HEART_RATE',
        sportType: SportType.RUN,
        benchmark: ZoneBase.HRR,
        benchmarkValue: 140,
        benchmarkUnit: 'bpm',
        benchmarkSource: 'PROFILE',
        inputs: {
          maxHeartRate: 200,
          restingHeartRate: 60,
        },
        targetLow: 121,
        targetHigh: 140,
        targetUnit: 'bpm',
      },
    });
  });

  it('materializes power and pace zone basis when saving DSL zone targets', async () => {
    const { service } = createService();
    const { tx, createdRows } = createTx();

    await asWritePrivate(service).replaceWorkoutSteps(
      tx,
      'workout-2',
      ['work 10m power z4', 'work 10m pace z2'].join('\n'),
    );

    expect(createdRows).toHaveLength(2);
    expect(createdRows[0]).toMatchObject({
      targetType: 'POWER',
      targetUnit: 'WATTS',
      targetValueLow: 231,
      targetValueHigh: 270,
      targetZoneIndex: 4,
      targetZoneSystem: ZoneBase.FTP,
      targetZoneBasis: {
        zoneType: 'POWER',
        benchmark: ZoneBase.FTP,
        benchmarkValue: 250,
        benchmarkUnit: 'W',
        targetLow: 231,
        targetHigh: 270,
        targetUnit: 'W',
      },
    });
    expect(createdRows[1]).toMatchObject({
      targetType: 'SPEED',
      targetUnit: 'SECONDS',
      targetValueLow: 240,
      targetValueHigh: 280,
      targetZoneIndex: 2,
      targetZoneSystem: ZoneBase.CS,
      targetZoneBasis: {
        zoneType: 'PACE',
        benchmark: ZoneBase.CS,
        benchmarkValue: 4.2,
        benchmarkUnit: 'm/s',
        targetLow: 240,
        targetHigh: 280,
        targetUnit: 'sec/km',
      },
    });
  });

  it('falls back to current user zones when supplied zone basis is not parseable', async () => {
    const { service } = createService();
    const { tx, createdRows } = createTx();
    const blocks = [
      {
        type: 'work',
        steps: [
          {
            duration: 1500,
            durationMeta: { kind: 'TIME', value: 1500, unit: 'SECONDS' },
            primaryTargetMeta: {
              kind: 'HEART_RATE_ZONE',
              zoneIndex: 2,
              zoneLabel: 'Z2',
              zoneSystem: 'HEART_RATE',
              zoneSource: 'TRAININGLOAD',
              zoneBasis: 'not-json',
              unit: 'zone',
            },
          },
        ],
      },
    ];

    await asWritePrivate(service).replaceWorkoutSteps(
      tx,
      'workout-3',
      'work 25m hr z2',
      blocks,
    );

    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({
      targetType: 'HEART_RATE',
      targetUnit: 'BPM',
      targetValueLow: 121,
      targetValueHigh: 140,
      targetZoneIndex: 2,
      targetZoneSystem: ZoneBase.HRR,
      targetZoneBasis: {
        zoneType: 'HEART_RATE',
        benchmark: ZoneBase.HRR,
        targetLow: 121,
        targetHigh: 140,
        targetUnit: 'bpm',
      },
    });
    expect(createdRows[0].targetZoneBasis).not.toBe('not-json');
  });

  it('keeps the semantic zone target when the current athlete zone cannot be resolved', async () => {
    const { service } = createService({
      getHeartRateZoneSetting: jest.fn(async () => {
        throw new Error('zone setting unavailable');
      }),
    });
    const { tx, createdRows } = createTx();

    await expect(
      asWritePrivate(service).replaceWorkoutSteps(
        tx,
        'workout-unresolved-zone',
        'work 25m hr z2',
        [
          {
            type: 'work',
            steps: [
              {
                duration: 1500,
                durationMeta: { kind: 'TIME', value: 1500, unit: 'SECONDS' },
                primaryTargetMeta: {
                  kind: 'HEART_RATE_ZONE',
                  value: 999,
                  valueHigh: 1_099,
                  zoneIndex: 2,
                  zoneLabel: '旧 Z2',
                  zoneSystem: 'OLD',
                  zoneSource: 'OLD',
                  unit: 'bpm',
                },
              },
            ],
          },
        ],
      ),
    ).resolves.toBeUndefined();
    expect(createdRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: 'HEART_RATE',
          targetZoneIndex: 2,
          targetResolutionMode: 'DYNAMIC_ZONE',
          targetValueLow: null,
          targetValueHigh: null,
          targetZoneFingerprint: null,
        }),
      ]),
    );
  });

  it('batches sibling leaf steps while preserving repeat parent ids', async () => {
    const { service } = createService();
    const createMany = jest.fn(
      async ({ data }: { data: Array<Record<string, unknown>> }) => ({
        count: data.length,
      }),
    );
    const create = jest.fn(async () => ({ id: 'repeat-step-1' }));
    const tx = { planWorkoutStep: { create, createMany } };
    const leaf = {
      orderIndex: 0,
      stepType: 'WARMUP',
      durationType: 'TIME',
      durationValue: 600,
    };
    const repeatChild = {
      orderIndex: 0,
      stepType: 'WORK',
      durationType: 'TIME',
      durationValue: 120,
    };
    const repeat = {
      orderIndex: 1,
      stepType: 'REPEAT',
      durationType: 'REPETITIONS',
      durationValue: 4,
      children: [repeatChild],
    };

    await asWritePrivate(service).createWorkoutPlanSteps(tx, 'workout-tree', [
      leaf,
      repeat,
    ]);

    expect(createMany).toHaveBeenNthCalledWith(1, {
      data: [
        expect.objectContaining({
          workoutId: 'workout-tree',
          parentId: null,
          orderIndex: 0,
        }),
      ],
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workoutId: 'workout-tree',
        parentId: null,
        orderIndex: 1,
        stepType: 'REPEAT',
      }),
    });
    expect(createMany).toHaveBeenNthCalledWith(2, {
      data: [
        expect.objectContaining({
          workoutId: 'workout-tree',
          parentId: 'repeat-step-1',
          orderIndex: 0,
        }),
      ],
    });
  });
});

describe('PlanService plan status transitions', () => {
  const now = new Date('2026-06-29T08:30:00.000Z');

  const createPlanRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    userId: 'user-1',
    title: '10K plan',
    description: null,
    goal: '10K',
    sourceType: 'MANUAL',
    status: 'ACTIVE',
    periodWeeks: 4,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-28T00:00:00.000Z'),
    activatedAt: new Date('2026-06-01T00:00:00.000Z'),
    pausedAt: null,
    completedAt: null,
    cancelledAt: null,
    currentWeekIndex: 4,
    currentDayIndex: 1,
    createdAt: new Date('2026-05-20T00:00:00.000Z'),
    updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    workouts: [],
    ...overrides,
  });

  const createService = (plan: Record<string, unknown>) => {
    const updatedRows: Array<Record<string, unknown>> = [];
    const planDelegate = {
      findUnique: jest.fn(async () => plan),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const updated = createPlanRow({
          ...plan,
          ...data,
          updatedAt: now,
        });
        updatedRows.push(updated);
        return updated;
      }),
    };
    const prisma = {
      plan: planDelegate,
      $transaction: jest.fn(
        async (callback: (txArg: { plan: typeof planDelegate }) => unknown) =>
          callback({ plan: planDelegate }),
      ),
    };
    const coachContext = {
      appendEvent: jest.fn(async () => undefined),
      finalizeContext: jest.fn(async () => undefined),
    };
    const loadReadout = {
      batchGetActualLoad: jest.fn(async () => new Map()),
    };
    const workoutDependencies = createWorkoutDependencies();
    const service = new PlanWriteSupport(
      prisma as never,
      workoutDependencies.workoutService,
      { getPreferredTimezone: jest.fn(async () => 'UTC') } as never,
      {} as never,
      {} as never,
      {} as never,
      loadReadout as never,
      {} as never,
      coachContext as never,
      workoutDependencies.definitionService,
      workoutDependencies.persistenceService,
      ...createPlanPorts(prisma),
    );
    return { service, prisma, coachContext, loadReadout, updatedRows };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pauses an active plan and records an adaptation event', async () => {
    const { service, prisma, coachContext, loadReadout } =
      createService(createPlanRow());

    const result = await service.pausePlan('user-1', 'plan-1', 'rest week', {
      source: 'manual',
      action: 'coach_pause',
      toolCallId: 'tool-1',
    });

    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        status: 'PAUSED',
        pausedAt: now,
        currentWeekIndex: null,
        currentDayIndex: null,
      },
      include: expect.any(Object),
    });
    expect(loadReadout.batchGetActualLoad).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).toHaveBeenCalledWith({
      tx: expect.any(Object),
      userId: 'user-1',
      planId: 'plan-1',
      type: 'ADAPTATION_APPLIED',
      source: 'manual',
      payload: {
        action: 'coach_pause',
        reason: 'rest week',
        toolCallId: 'tool-1',
        decisionId: null,
        branchId: null,
        commitId: null,
      },
    });
    expect(result.plan).toMatchObject({
      id: 'plan-1',
      status: 'PAUSED',
      currentWeekIndex: null,
      currentDayIndex: null,
    });
  });

  it('rejects pausing a non-active plan', async () => {
    const { service, prisma, coachContext } = createService(
      createPlanRow({ status: 'DRAFT' }),
    );

    await expect(service.pausePlan('user-1', 'plan-1')).rejects.toThrow(
      'Only active plans can be paused',
    );

    expect(prisma.plan.update).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).not.toHaveBeenCalled();
  });

  it('completes an active plan at the requested date and finalizes context', async () => {
    const { service, prisma, coachContext } = createService(createPlanRow());
    const completedAt = '2026-06-30T12:00:00.000Z';

    const result = await service.completePlan(
      'user-1',
      'plan-1',
      completedAt,
      'race finished',
      { source: 'ai' },
    );

    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(completedAt),
        endDate: new Date(completedAt),
        currentWeekIndex: null,
        currentDayIndex: null,
      },
      include: expect.any(Object),
    });
    expect(coachContext.finalizeContext).toHaveBeenCalledWith({
      tx: expect.any(Object),
      userId: 'user-1',
      planId: 'plan-1',
      planStatus: 'COMPLETED',
      source: 'ai',
      reason: 'race finished',
      occurredAt: new Date(completedAt),
    });
    expect(result.plan).toMatchObject({
      status: 'COMPLETED',
      endDate: '2026-06-30',
      currentWeekIndex: null,
      currentDayIndex: null,
    });
  });

  it('cancels a mutable plan and finalizes context', async () => {
    const { service, prisma, coachContext } = createService(
      createPlanRow({ status: 'PAUSED' }),
    );

    const result = await service.cancelPlan(
      'user-1',
      'plan-1',
      'changed goal',
      {
        source: 'manual',
      },
    );

    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        endDate: now,
        currentWeekIndex: null,
        currentDayIndex: null,
        scheduledActivationAt: null,
      },
      include: expect.any(Object),
    });
    expect(coachContext.finalizeContext).toHaveBeenCalledWith({
      tx: expect.any(Object),
      userId: 'user-1',
      planId: 'plan-1',
      planStatus: 'CANCELLED',
      source: 'manual',
      reason: 'changed goal',
      occurredAt: now,
    });
    expect(result.plan).toMatchObject({
      status: 'CANCELLED',
      endDate: '2026-06-29',
      currentWeekIndex: null,
      currentDayIndex: null,
    });
  });

  it.each(['COMPLETED', 'CANCELLED'])(
    'rejects cancelling a terminal %s plan',
    async (status) => {
      const { service, prisma, coachContext } = createService(
        createPlanRow({ status }),
      );

      await expect(service.cancelPlan('user-1', 'plan-1')).rejects.toThrow(
        'Plan cannot be cancelled',
      );

      expect(prisma.plan.update).not.toHaveBeenCalled();
      expect(coachContext.finalizeContext).not.toHaveBeenCalled();
    },
  );
});

describe('PlanService workout status transitions', () => {
  const now = new Date('2026-06-29T09:15:00.000Z');

  const createWorkoutRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'workout-1',
    planId: 'plan-1',
    dayOffset: 0,
    sessionIndex: 1,
    scheduledDate: new Date('2026-06-29T00:00:00.000Z'),
    sportType: SportType.RUN,
    status: 'PLANNED',
    name: 'Easy run',
    text: 'work 30m hr <150bpm',
    notes: null,
    completedAt: null,
    skippedAt: null,
    estimatedLoad: null,
    estimatedLoadSource: null,
    estimatedLoadInputs: null,
    estimatedLoadComputedAt: null,
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
    updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    steps: [],
    links: [],
    plan: {
      id: 'plan-1',
      userId: 'user-1',
      status: 'ACTIVE',
      startDate: new Date('2026-06-29T00:00:00.000Z'),
    },
    ...overrides,
  });

  const createService = (workout: Record<string, unknown>) => {
    const findActiveLink = jest.fn(async () => null);
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => workout),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
          createWorkoutRow({
            ...workout,
            ...data,
            plan: workout.plan,
            updatedAt: now,
          }),
        ),
      },
      planWorkoutActivityLink: {
        findFirst: findActiveLink,
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      planWorkoutExternalMapping: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      planWorkout: {
        findUnique: jest.fn(async () => workout),
      },
      planWorkoutActivityLink: {
        findFirst: findActiveLink,
      },
      $transaction: jest.fn(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const coachContext = {
      appendEvent: jest.fn(async () => undefined),
    };
    const loadReadout = {
      batchGetActualLoad: jest.fn(async () => new Map()),
    };
    const workoutDependencies = createWorkoutDependencies();
    const service = new PlanWriteSupport(
      prisma as never,
      workoutDependencies.workoutService,
      { getPreferredTimezone: jest.fn(async () => 'UTC') } as never,
      {} as never,
      {} as never,
      {} as never,
      loadReadout as never,
      {} as never,
      coachContext as never,
      workoutDependencies.definitionService,
      workoutDependencies.persistenceService,
      ...createPlanPorts(prisma),
    );
    return { service, prisma, tx, coachContext, loadReadout };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks a planned workout done and emits completion context events', async () => {
    const { service, tx, coachContext } = createService(createWorkoutRow());

    const result = await service.updateWorkoutStatus(
      'user-1',
      'plan-1',
      'workout-1',
      'DONE',
      {
        source: 'manual',
        action: 'quick_done',
        decisionId: 'decision-1',
      },
    );

    expect(tx.planWorkout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workout-1' },
        data: expect.objectContaining({
          status: 'DONE',
          completedAt: now,
          skippedAt: null,
          revision: { increment: 1 },
        }),
      }),
    );
    expect(coachContext.appendEvent).toHaveBeenNthCalledWith(1, {
      tx: expect.any(Object),
      userId: 'user-1',
      planId: 'plan-1',
      type: 'ADAPTATION_APPLIED',
      source: 'manual',
      payload: {
        action: 'quick_done',
        reason: null,
        toolCallId: null,
        decisionId: 'decision-1',
        branchId: null,
        commitId: null,
        workoutId: 'workout-1',
        fromStatus: 'PLANNED',
        toStatus: 'DONE',
      },
    });
    expect(coachContext.appendEvent).toHaveBeenNthCalledWith(2, {
      tx: expect.any(Object),
      userId: 'user-1',
      planId: 'plan-1',
      type: 'WORKOUT_COMPLETED',
      source: 'manual',
      decisionId: 'decision-1',
      branchId: null,
      commitId: null,
      payload: {
        workoutId: 'workout-1',
        completionMode: 'status_update',
        status: 'DONE',
      },
    });
    expect(result.workout).toMatchObject({
      id: 'workout-1',
      status: 'DONE',
      completedAt: now,
      skippedAt: null,
    });
  });

  it('blocks skipping a workout that still has an active primary activity link', async () => {
    const { service, prisma, coachContext } = createService(createWorkoutRow());
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValueOnce({
      id: 'link-1',
    });

    await expect(
      service.updateWorkoutStatus('user-1', 'plan-1', 'workout-1', 'SKIPPED'),
    ).rejects.toThrow('This workout is linked to an activity');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(coachContext.appendEvent).not.toHaveBeenCalled();
  });

  it('does not allow a completed workout to be moved back to planned', async () => {
    const { service, tx, coachContext } = createService(
      createWorkoutRow({
        status: 'DONE',
        completedAt: new Date('2026-06-29T08:00:00.000Z'),
      }),
    );

    await expect(
      service.updateWorkoutStatus('user-1', 'plan-1', 'workout-1', 'PLANNED'),
    ).rejects.toThrow('Only planned workouts can be changed');

    expect(tx.planWorkout.update).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).not.toHaveBeenCalled();
  });
});

describe('PlanService workout editing', () => {
  const now = new Date('2026-06-29T10:00:00.000Z');
  const planStartDate = new Date('2026-06-29T00:00:00.000Z');

  const createWorkoutRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'workout-1',
    userId: 'user-1',
    planId: 'plan-1',
    dayOffset: 0,
    sessionIndex: 1,
    scheduledDate: planStartDate,
    sportType: SportType.RUN,
    status: 'PLANNED',
    name: 'Easy run',
    text: 'work 30m hr <150bpm',
    notes: null,
    completedAt: null,
    skippedAt: null,
    movedFromWorkoutId: null,
    movedBy: null,
    estimatedLoad: null,
    estimatedLoadSource: null,
    estimatedLoadInputs: null,
    estimatedLoadComputedAt: null,
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
    updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    steps: [],
    links: [],
    strengthExercises: [],
    plan: {
      id: 'plan-1',
      userId: 'user-1',
      status: 'ACTIVE',
      startDate: planStartDate,
      periodWeeks: 8,
    },
    ...overrides,
  });

  const createDto = (overrides: Record<string, unknown> = {}) => ({
    weekIndex: 1,
    dayIndex: 1,
    sessionIndex: 1,
    sportType: SportType.RUN,
    name: 'Edited run',
    text: 'work 40m hr <150bpm',
    notes: 'Keep it easy',
    ...overrides,
  });

  const createService = (workout: Record<string, unknown>) => {
    const store = new Map<string, ReturnType<typeof createWorkoutRow>>();
    const seed = createWorkoutRow(workout);
    store.set(seed.id, seed);
    let cloneSeq = 0;
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return store.get(where.id) ?? null;
        }),
        findMany: jest.fn(
          async ({
            where,
            select,
          }: {
            where?: { planId?: string; dayOffset?: number };
            select?: Record<string, boolean>;
          }) => {
            const rows = [...store.values()].filter((row) => {
              if (where?.planId && row.planId !== where.planId) return false;
              if (
                where?.dayOffset != null &&
                row.dayOffset !== where.dayOffset
              ) {
                return false;
              }
              return true;
            });
            if (!select) return rows;
            return rows.map((row) => {
              const picked: Record<string, unknown> = {};
              for (const key of Object.keys(select)) {
                picked[key] = (row as Record<string, unknown>)[key];
              }
              return picked;
            });
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          cloneSeq += 1;
          const created = createWorkoutRow({
            ...data,
            id: String(data.id ?? `workout-clone-${cloneSeq}`),
            plan: store.get(seed.id)?.plan,
            steps: [],
            links: [],
            strengthExercises: [],
            createdAt: now,
            updatedAt: now,
          });
          store.set(created.id, created);
          return created;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const current = store.get(where.id);
            if (!current) return null;
            const next = createWorkoutRow({
              ...current,
              ...data,
              plan: current.plan,
              updatedAt: now,
            });
            store.set(where.id, next);
            return next;
          },
        ),
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => null),
      },
      planWorkoutStep: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(
          async ({ data }: { data: Array<Record<string, unknown>> }) => ({
            count: data.length,
          }),
        ),
        create: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: `step-${data.orderIndex ?? 0}`,
            ...data,
          }),
        ),
      },
      planWorkoutExercise: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      planWorkoutExternalMapping: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const coachContext = {
      appendEvent: jest.fn(async () => undefined),
    };
    const loadReadout = {
      batchGetActualLoad: jest.fn(async () => new Map()),
    };
    const planLoadEstimator = {
      applyForWorkout: jest.fn(async () => null),
    };
    const workoutDependencies = createWorkoutDependencies();
    const service = new PlanWriteSupport(
      prisma as never,
      workoutDependencies.workoutService,
      { getPreferredTimezone: jest.fn(async () => 'UTC') } as never,
      {} as never,
      {} as never,
      planLoadEstimator as never,
      loadReadout as never,
      {} as never,
      coachContext as never,
      workoutDependencies.definitionService,
      workoutDependencies.persistenceService,
      ...createPlanPorts(prisma),
    );
    return {
      service,
      prisma,
      tx,
      coachContext,
      loadReadout,
      planLoadEstimator,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('normalizes a family sport code while updating workout fields and metadata', async () => {
    const { service, tx, coachContext, planLoadEstimator } =
      createService(createWorkoutRow());
    const dto = createDto({ sportDefinitionCode: 'RUN' });

    const result = await service.updateWorkout(
      'user-1',
      'plan-1',
      'workout-1',
      dto as never,
      { source: 'manual', action: 'edit_workout', toolCallId: 'tool-1' },
    );

    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: {
        dayOffset: 0,
        sessionIndex: 1,
        scheduledDate: planStartDate,
        sportType: SportType.RUN,
        sportDefinitionCode: 'ROAD_RUNNING',
        name: 'Edited run',
        text: 'work 40m hr <150bpm',
        notes: 'Keep it easy',
        structureKind: 'ENDURANCE',
        dslVersion: 1,
        revision: { increment: 1 },
      },
    });
    expect(tx.planWorkoutStep.deleteMany).toHaveBeenCalledWith({
      where: { workoutId: 'workout-1' },
    });
    expect(tx.planWorkoutStep.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workoutId: 'workout-1',
          durationType: 'TIME',
          durationValue: 2400,
          targetType: 'HEART_RATE',
          targetValueHigh: 150,
        }),
      ],
    });
    expect(planLoadEstimator.applyForWorkout).toHaveBeenCalledWith(
      'workout-1',
      { tx },
    );
    expect(coachContext.appendEvent).toHaveBeenCalledWith({
      tx,
      userId: 'user-1',
      planId: 'plan-1',
      type: 'ADAPTATION_APPLIED',
      source: 'manual',
      payload: {
        action: 'edit_workout',
        reason: null,
        toolCallId: 'tool-1',
        decisionId: null,
        branchId: null,
        commitId: null,
        workoutId: 'workout-1',
        clonedWorkoutId: null,
        movedSchedule: false,
        weekIndex: 1,
        dayIndex: 1,
        sessionIndex: 1,
        sportType: SportType.RUN,
        sportDefinitionCode: 'ROAD_RUNNING',
      },
    });
    expect(result.workout).toMatchObject({
      id: 'workout-1',
      name: 'Edited run',
      text: 'work 40m hr <150bpm',
      status: 'PLANNED',
    });
  });

  it('copies postponed workouts onto the target day and leaves the original as moved', async () => {
    const { service, tx, coachContext } = createService(createWorkoutRow());
    const dto = createDto({
      weekIndex: 1,
      dayIndex: 3,
      reason: 'postpone',
    });

    const result = await service.updateWorkout(
      'user-1',
      'plan-1',
      'workout-1',
      dto as never,
    );

    expect(tx.planWorkoutActivityLink.findFirst).toHaveBeenCalledWith({
      where: {
        planWorkoutId: 'workout-1',
        unlinkedAt: null,
      },
      select: { id: true },
    });
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: {
        status: 'MOVED',
        movedBy: 'USER',
        revision: { increment: 1 },
      },
    });
    expect(tx.planWorkout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dayOffset: 2,
        scheduledDate: new Date('2026-07-01T00:00:00.000Z'),
        status: 'PLANNED',
        movedFromWorkoutId: 'workout-1',
        movedBy: 'USER',
      }),
    });
    expect(coachContext.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: 'postpone',
          movedSchedule: true,
          weekIndex: 1,
          dayIndex: 3,
          clonedWorkoutId: 'workout-clone-1',
        }),
      }),
    );
    expect(result.workout).toMatchObject({
      id: 'workout-1',
      dayOffset: 0,
      status: 'MOVED',
      movedBy: 'USER',
    });
  });

  it('rejects postponing a moved workout instead of relocating it in place', async () => {
    const { service, tx } = createService(
      createWorkoutRow({ status: 'MOVED' }),
    );

    await expect(
      service.updateWorkout(
        'user-1',
        'plan-1',
        'workout-1',
        createDto({
          weekIndex: 1,
          dayIndex: 3,
          reason: 'postpone',
        }) as never,
      ),
    ).rejects.toThrow('Only planned workouts can be changed');

    expect(tx.planWorkout.create).not.toHaveBeenCalled();
    expect(tx.planWorkout.update).not.toHaveBeenCalled();
  });

  it('records coach postpone as movedBy COACH', async () => {
    const { service, tx } = createService(createWorkoutRow());
    await service.updateWorkout(
      'user-1',
      'plan-1',
      'workout-1',
      createDto({
        weekIndex: 1,
        dayIndex: 3,
        reason: 'postpone',
      }) as never,
      { source: 'ai', action: 'plan_workout_postpone' },
    );
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: {
        status: 'MOVED',
        movedBy: 'COACH',
        revision: { increment: 1 },
      },
    });
    expect(tx.planWorkout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movedFromWorkoutId: 'workout-1',
        movedBy: 'COACH',
        status: 'PLANNED',
      }),
    });
  });

  it('blocks schedule changes while a primary activity link is active', async () => {
    const { service, tx, coachContext, planLoadEstimator } =
      createService(createWorkoutRow());
    tx.planWorkoutActivityLink.findFirst.mockResolvedValueOnce({
      id: 'link-1',
    });

    await expect(
      service.updateWorkout(
        'user-1',
        'plan-1',
        'workout-1',
        createDto({ dayIndex: 2 }) as never,
      ),
    ).rejects.toThrow('This workout is linked to an activity');

    expect(tx.planWorkout.update).not.toHaveBeenCalled();
    expect(tx.planWorkoutStep.deleteMany).not.toHaveBeenCalled();
    expect(planLoadEstimator.applyForWorkout).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).not.toHaveBeenCalled();
  });

  it('skips load recalculation for draft workouts', async () => {
    const { service, planLoadEstimator } = createService(
      createWorkoutRow({
        plan: {
          id: 'plan-1',
          userId: 'user-1',
          status: 'DRAFT',
          startDate: null,
        },
      }),
    );

    await service.updateWorkout(
      'user-1',
      'plan-1',
      'workout-1',
      createDto() as never,
    );

    expect(planLoadEstimator.applyForWorkout).not.toHaveBeenCalled();
  });
});

describe('PlanService workout activity links', () => {
  const now = new Date('2026-06-29T11:00:00.000Z');
  const activityStart = new Date('2026-06-29T10:30:00.000Z');

  const createWorkoutRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'workout-1',
    planId: 'plan-1',
    userId: 'user-1',
    status: 'PLANNED',
    plan: {
      id: 'plan-1',
      userId: 'user-1',
      status: 'ACTIVE',
    },
    ...overrides,
  });

  const createService = (
    workout: Record<string, unknown> = createWorkoutRow(),
    activity: Record<string, unknown> | null = {
      id: 101,
      userId: 'user-1',
      startTime: activityStart,
    },
  ) => {
    let workoutStatus = String(workout.status ?? 'PLANNED');
    const tx = {
      planWorkout: {
        findUnique: jest.fn(async () => ({
          status: workoutStatus,
          plan: {
            status:
              workout.plan &&
              typeof workout.plan === 'object' &&
              'status' in workout.plan
                ? workout.plan.status
                : 'ACTIVE',
          },
        })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          workoutStatus = String(data.status ?? workoutStatus);
          return { id: 'workout-1', ...data };
        }),
      },
      planWorkoutActivityLink: {
        create: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'link-1',
            ...data,
            linkedAt: now,
            unlinkedAt: null,
          }),
        ),
        update: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'link-1',
            ...data,
          }),
        ),
        findFirst: jest.fn(async () => null),
      },
    };
    const prisma = {
      planWorkout: {
        findUnique: jest.fn(async () => workout),
      },
      activity: {
        findFirst: jest.fn(async () => activity),
      },
      planWorkoutActivityLink: {
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async () => ({
          id: 'link-1',
          planId: 'plan-1',
          planWorkoutId: 'workout-1',
          autoMarkedWorkoutDone: true,
        })),
      },
      $transaction: jest.fn(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const coachContext = {
      appendEvent: jest.fn(async () => undefined),
    };
    const workoutDependencies = createWorkoutDependencies();
    const service = new PlanWriteSupport(
      prisma as never,
      workoutDependencies.workoutService,
      { getPreferredTimezone: jest.fn(async () => 'UTC') } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      coachContext as never,
      workoutDependencies.definitionService,
      workoutDependencies.persistenceService,
      ...createPlanPorts(prisma),
    );
    return { service, prisma, tx, coachContext };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('links a primary activity, auto-marks the workout done, and emits link/completion events', async () => {
    const { service, tx, coachContext } = createService();

    const result = await service.linkWorkoutActivity(
      'user-1',
      'plan-1',
      'workout-1',
      {
        activityId: 101,
        source: 'MANUAL',
        role: 'PRIMARY',
      },
      { source: 'manual', decisionId: 'decision-1' },
    );

    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: {
        status: 'DONE',
        completedAt: activityStart,
      },
    });
    expect(tx.planWorkoutActivityLink.create).toHaveBeenCalledWith({
      data: {
        planId: 'plan-1',
        planWorkoutId: 'workout-1',
        activityId: 101,
        source: 'MANUAL',
        role: 'PRIMARY',
        autoMarkedWorkoutDone: true,
      },
    });
    expect(coachContext.appendEvent).toHaveBeenNthCalledWith(1, {
      tx,
      userId: 'user-1',
      planId: 'plan-1',
      type: 'WORKOUT_LINKED',
      source: 'manual',
      decisionId: 'decision-1',
      branchId: null,
      commitId: null,
      payload: {
        action: 'link_workout_activity',
        reason: null,
        toolCallId: null,
        decisionId: 'decision-1',
        branchId: null,
        commitId: null,
        workoutId: 'workout-1',
        activityId: 101,
        sourceType: 'MANUAL',
        role: 'PRIMARY',
        autoMarkedWorkoutDone: true,
      },
    });
    expect(coachContext.appendEvent).toHaveBeenNthCalledWith(2, {
      tx,
      userId: 'user-1',
      planId: 'plan-1',
      type: 'WORKOUT_COMPLETED',
      source: 'manual',
      decisionId: 'decision-1',
      branchId: null,
      commitId: null,
      payload: {
        action: 'auto_mark_done_on_link',
        workoutId: 'workout-1',
        activityId: 101,
      },
    });
    expect(result.link).toMatchObject({
      planWorkoutId: 'workout-1',
      activityId: 101,
      autoMarkedWorkoutDone: true,
    });
  });

  it('returns an existing active link without creating a duplicate', async () => {
    const { service, prisma, tx, coachContext } = createService();
    prisma.planWorkoutActivityLink.findFirst.mockResolvedValueOnce({
      id: 'existing-link',
      planWorkoutId: 'workout-1',
      activityId: 101,
      unlinkedAt: null,
    });

    const result = await service.linkWorkoutActivity(
      'user-1',
      'plan-1',
      'workout-1',
      { activityId: 101 },
    );

    expect(result.link).toMatchObject({ id: 'existing-link' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.planWorkoutActivityLink.create).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).not.toHaveBeenCalled();
  });

  it('does not auto-mark secondary links as done', async () => {
    const { service, tx, coachContext } = createService();

    await service.linkWorkoutActivity('user-1', 'plan-1', 'workout-1', {
      activityId: 101,
      role: 'SECONDARY',
    });

    expect(tx.planWorkout.update).not.toHaveBeenCalled();
    expect(tx.planWorkoutActivityLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'SECONDARY',
        autoMarkedWorkoutDone: false,
      }),
    });
    expect(coachContext.appendEvent).toHaveBeenCalledTimes(1);
    expect(coachContext.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          role: 'SECONDARY',
          autoMarkedWorkoutDone: false,
        }),
      }),
    );
  });

  it('unlinks an auto-marked primary link and reverts orphan done workout to planned', async () => {
    const { service, prisma, tx } = createService(
      createWorkoutRow({ status: 'DONE' }),
    );
    tx.planWorkout.findUnique.mockResolvedValueOnce({
      status: 'DONE',
      plan: { status: 'ACTIVE' },
    });

    const result = await service.unlinkWorkoutActivity(
      'user-1',
      'plan-1',
      'workout-1',
      'link-1',
    );

    expect(prisma.planWorkoutActivityLink.findUnique).toHaveBeenCalledWith({
      where: { id: 'link-1' },
    });
    expect(tx.planWorkoutActivityLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { unlinkedAt: now },
    });
    expect(tx.planWorkoutActivityLink.findFirst).toHaveBeenCalledWith({
      where: {
        planWorkoutId: 'workout-1',
        unlinkedAt: null,
        role: 'PRIMARY',
      },
      select: { id: true },
    });
    expect(tx.planWorkout.update).toHaveBeenCalledWith({
      where: { id: 'workout-1' },
      data: { status: 'PLANNED', completedAt: null },
    });
    expect(result).toEqual({ success: true });
  });

  it('keeps a done workout done when unlinking a manually completed link', async () => {
    const { service, prisma, tx } = createService(
      createWorkoutRow({ status: 'DONE' }),
    );
    prisma.planWorkoutActivityLink.findUnique.mockResolvedValueOnce({
      id: 'link-1',
      planId: 'plan-1',
      planWorkoutId: 'workout-1',
      autoMarkedWorkoutDone: false,
    });

    await service.unlinkWorkoutActivity(
      'user-1',
      'plan-1',
      'workout-1',
      'link-1',
    );

    expect(tx.planWorkoutActivityLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { unlinkedAt: now },
    });
    expect(tx.planWorkoutActivityLink.findFirst).not.toHaveBeenCalled();
    expect(tx.planWorkout.update).not.toHaveBeenCalled();
  });
});
