import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  WorkoutService,
  type PlanBlock,
  type WorkoutPlanStepDraft,
} from '@/api/workout/workout.service';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { Prisma, SportType, type PlanWorkoutStatus } from '@prisma/client';
import type { PlanDb } from '../persistence/plan-db';
import { PlanWorkoutMutabilityPolicy } from './plan-workout-mutability.policy';
import { UserService } from '@/api/user/user.service';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import { PlanWorkoutTargetResolver } from './plan-workout-target-resolver.service';

const WORKOUT_TREE_INCLUDE = {
  plan: {
    include: {
      supersededBy: { select: { status: true, startDate: true } },
    },
  },
  steps: {
    where: { parentId: null },
    orderBy: { orderIndex: 'asc' as const },
    include: {
      children: { orderBy: { orderIndex: 'asc' as const } },
    },
  },
} satisfies Prisma.PlanWorkoutInclude;

/**
 * 第三方计划同步用的 Plan 表门面。Intervals.icu 等不要直查 plan*。
 */
@Injectable()
export class PlanExternalSyncService {
  private readonly logger = new Logger(PlanExternalSyncService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutService: WorkoutService,
    private readonly planLoadEstimator: PlanLoadEstimatorService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly links: PlanActivityLinkRepository,
    private readonly mutability: PlanWorkoutMutabilityPolicy,
    private readonly users: UserService,
    @Optional()
    private readonly workoutTargetResolver?: PlanWorkoutTargetResolver,
  ) {}

  runTransaction<T>(fn: (tx: PlanDb) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }

  findActivePausedPlans(userId: string) {
    return this.plans.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      select: { id: true },
    });
  }

  findImportCandidateWorkouts(args: {
    userId: string;
    planIds: string[];
    scheduledDate: Date;
    sportType: SportType;
  }) {
    return this.workouts.findMany({
      where: {
        userId: args.userId,
        planId: { in: args.planIds },
        scheduledDate: args.scheduledDate,
        sportType: args.sportType,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      include: {
        ...WORKOUT_TREE_INCLUDE,
        links: {
          where: {
            unlinkedAt: null,
            role: 'PRIMARY',
          },
        },
      },
      orderBy: [{ sessionIndex: 'asc' }],
    });
  }

  async findExportWindowWorkouts(args: {
    userId: string;
    start: Date;
    end: Date;
  }) {
    const rows = await this.workouts.findMany({
      where: {
        userId: args.userId,
        scheduledDate: {
          gte: args.start,
          lte: args.end,
        },
        status: { in: ['PLANNED', 'IN_PROGRESS', 'MOVED'] },
        OR: [
          { planId: null },
          {
            plan: {
              is: { status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] } },
            },
          },
        ],
      },
      include: WORKOUT_TREE_INCLUDE,
      orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
    });
    const visible = rows.filter((workout) => {
      if (!workout.plan) return true;
      const date = workout.scheduledDate?.toISOString().slice(0, 10);
      if (!date) return false;
      if (workout.plan.status === 'SCHEDULED') {
        const starts = workout.plan.startDate?.toISOString().slice(0, 10);
        return Boolean(starts && date >= starts);
      }
      const cutoff =
        workout.plan.supersededBy?.status === 'SCHEDULED'
          ? workout.plan.supersededBy.startDate?.toISOString().slice(0, 10)
          : null;
      return !cutoff || date < cutoff;
    });
    return this.workoutTargetResolver
      ? this.workoutTargetResolver.resolveWorkouts(args.userId, visible)
      : visible;
  }

  async findLocalWorkout(userId: string, workoutId: string) {
    const workout = await this.workouts.findFirst({
      where: { id: workoutId, userId },
      include: WORKOUT_TREE_INCLUDE,
    });
    if (!workout || !this.workoutTargetResolver) return workout;
    return this.workoutTargetResolver.resolveWorkout(userId, workout);
  }

  findMapping<T extends Prisma.PlanWorkoutExternalMappingFindFirstArgs>(
    args?: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingFindFirstArgs
    >,
  ) {
    return this.links.findMapping(args);
  }

  findMappingUnique<T extends Prisma.PlanWorkoutExternalMappingFindUniqueArgs>(
    args: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingFindUniqueArgs
    >,
  ) {
    return this.links.findMappingUnique(args);
  }

  findMappings<T extends Prisma.PlanWorkoutExternalMappingFindManyArgs>(
    args?: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingFindManyArgs
    >,
  ) {
    return this.links.findMappings(args);
  }

  createMapping<T extends Prisma.PlanWorkoutExternalMappingCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingCreateArgs>,
  ) {
    return this.links.createMapping(args);
  }

  updateMapping<T extends Prisma.PlanWorkoutExternalMappingUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingUpdateArgs>,
  ) {
    return this.links.updateMapping(args);
  }

  updateManyMappings<T extends Prisma.PlanWorkoutExternalMappingUpdateManyArgs>(
    args: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingUpdateManyArgs
    >,
  ) {
    return this.links.updateManyMappings(args);
  }

  async nextSessionIndex(
    tx: PlanDb,
    planId: string,
    dayOffset: number,
    preferred = 1,
    excludeWorkoutId?: string | null,
  ) {
    const rows = await this.workouts.findMany(
      {
        where: {
          planId,
          dayOffset,
          ...(excludeWorkoutId ? { id: { not: excludeWorkoutId } } : {}),
        },
        select: { sessionIndex: true },
      },
      tx,
    );
    return this.pickNextSessionIndex(rows, preferred);
  }

  async nextIndependentSessionIndex(
    tx: PlanDb,
    userId: string,
    scheduledDate: Date,
    preferred = 1,
    excludeWorkoutId?: string | null,
  ) {
    const rows = await this.workouts.findMany(
      {
        where: {
          userId,
          planId: null,
          scheduledDate,
          ...(excludeWorkoutId ? { id: { not: excludeWorkoutId } } : {}),
        },
        select: { sessionIndex: true },
      },
      tx,
    );
    return this.pickNextSessionIndex(rows, preferred);
  }

  async createIndependentWorkout(args: {
    userId: string;
    scheduledDate: Date;
    sportType: SportType;
    sportDefinitionCode?: string | null;
    name?: string | null;
    text?: string | null;
    notes?: string | null;
    blocks: PlanBlock[];
  }) {
    return this.runTransaction(async (tx) => {
      const sessionIndex = await this.nextIndependentSessionIndex(
        tx,
        args.userId,
        args.scheduledDate,
      );
      const created = await this.workouts.create(
        {
          data: {
            userId: args.userId,
            planId: null,
            dayOffset: 0,
            sessionIndex,
            scheduledDate: args.scheduledDate,
            sportType: args.sportType,
            sportDefinitionCode: args.sportDefinitionCode,
            name: args.name,
            text: args.text,
            notes: args.notes,
            status: 'PLANNED',
          },
        },
        tx,
      );
      await this.replaceWorkoutSteps(tx, created.id, args.blocks);
      await this.estimateWorkoutLoad(created.id, tx);
      return { ...created, planId: null };
    });
  }

  async updateImportedWorkout(args: {
    userId: string;
    workoutId: string;
    preferredSessionIndex: number;
    scheduledDate: Date;
    targetPlanId: string | null;
    targetPlanStartDate: Date | null;
    sportType: SportType;
    sportDefinitionCode?: string | null;
    name?: string | null;
    text?: string | null;
    notes?: string | null;
    status: PlanWorkoutStatus | string;
    blocks: PlanBlock[];
    dayOffset: number;
  }) {
    return this.runTransaction(async (tx) => {
      const current = await this.workouts.findUnique(
        {
          where: { id: args.workoutId },
          include: {
            plan: { include: { supersededBy: true } },
            links: { where: { unlinkedAt: null }, select: { id: true } },
          },
        },
        tx,
      );
      if (!current || current.userId !== args.userId) {
        throw new Error('Imported workout not found');
      }
      if (current.plan) {
        const timezone = await this.users.getPreferredTimezone(args.userId, tx);
        this.mutability.assertMutable(
          {
            planStatus: current.plan.status,
            workoutStatus: current.status,
            scheduledDateYmd:
              current.scheduledDate?.toISOString().slice(0, 10) ?? null,
            athleteTodayYmd:
              activityCalendarYmdInZone(new Date(), timezone) ??
              new Date().toISOString().slice(0, 10),
            activeActivityLinkCount: current.links.length,
            pendingSupersessionYmd:
              current.plan.supersededBy?.status === 'SCHEDULED'
                ? (current.plan.supersededBy.startDate
                    ?.toISOString()
                    .slice(0, 10) ?? null)
                : null,
          },
          'PRESCRIPTION',
        );
      }
      if (args.targetPlanId) {
        const targetPlan = await this.plans.findUnique(
          {
            where: { id: args.targetPlanId },
            include: {
              supersededBy: {
                select: { status: true, startDate: true },
              },
            },
          },
          tx,
        );
        if (!targetPlan || targetPlan.userId !== args.userId) {
          throw new Error('Import target plan not found');
        }
        const timezone = await this.users.getPreferredTimezone(args.userId, tx);
        this.mutability.assertMutable(
          {
            planStatus: targetPlan.status,
            workoutStatus: current.status,
            scheduledDateYmd: args.scheduledDate.toISOString().slice(0, 10),
            athleteTodayYmd:
              activityCalendarYmdInZone(new Date(), timezone) ??
              new Date().toISOString().slice(0, 10),
            activeActivityLinkCount: current.links.length,
            pendingSupersessionYmd:
              targetPlan.supersededBy?.status === 'SCHEDULED'
                ? (targetPlan.supersededBy.startDate
                    ?.toISOString()
                    .slice(0, 10) ?? null)
                : null,
          },
          'SCHEDULE',
        );
      }
      const sessionIndex = args.targetPlanId
        ? await this.nextSessionIndex(
            tx,
            args.targetPlanId,
            args.dayOffset,
            args.preferredSessionIndex,
            args.workoutId,
          )
        : await this.nextIndependentSessionIndex(
            tx,
            args.userId,
            args.scheduledDate,
            args.preferredSessionIndex,
            args.workoutId,
          );
      const updated = await this.workouts.update(
        {
          where: { id: args.workoutId },
          data: {
            userId: args.userId,
            planId: args.targetPlanId,
            dayOffset: args.dayOffset,
            sessionIndex,
            scheduledDate: args.scheduledDate,
            sportType: args.sportType,
            sportDefinitionCode: args.sportDefinitionCode,
            name: args.name,
            text: args.text,
            notes: args.notes,
            status: args.status as PlanWorkoutStatus,
            revision: { increment: 1 },
          },
        },
        tx,
      );
      await this.replaceWorkoutSteps(tx, updated.id, args.blocks);
      await this.estimateWorkoutLoad(updated.id, tx);
      return { ...updated, planId: args.targetPlanId };
    });
  }

  async replaceWorkoutSteps(
    tx: PlanDb,
    workoutId: string,
    blocks: PlanBlock[],
  ) {
    await this.links.deleteSteps({ where: { workoutId } }, tx);
    const drafts = this.workoutService.buildWorkoutPlanSteps(blocks);
    const createDraft = async (
      draft: WorkoutPlanStepDraft,
      parentId: string | null,
    ) => {
      const created = await this.links.createStep(
        {
          data: {
            workoutId,
            parentId,
            orderIndex: draft.orderIndex,
            stepType: draft.stepType,
            name: draft.name ?? null,
            notes: draft.notes ?? null,
            intensity: draft.intensity ?? null,
            durationType: draft.durationType,
            durationValue: draft.durationValue ?? null,
            durationUnit: draft.durationUnit ?? null,
            targetType: draft.targetType ?? null,
            targetValueLow: draft.targetValueLow ?? null,
            targetValueHigh: draft.targetValueHigh ?? null,
            targetUnit: draft.targetUnit ?? null,
            targetZoneIndex: draft.targetZoneIndex ?? null,
            targetZoneLabel: draft.targetZoneLabel ?? null,
            targetZoneSystem: draft.targetZoneSystem ?? null,
            targetZoneSource: draft.targetZoneSource ?? null,
            targetZoneBasis: (draft.targetZoneBasis ?? null) as
              | Prisma.InputJsonValue
              | Prisma.NullableJsonNullValueInput,
            intensityIntent: (draft.intensityIntent ?? null) as
              | Prisma.InputJsonValue
              | Prisma.NullableJsonNullValueInput,
            targetResolutionMode:
              draft.targetResolutionMode ?? 'LEGACY_SNAPSHOT',
            targetZoneSystemKey: draft.targetZoneSystemKey ?? null,
            targetZoneFingerprint: draft.targetZoneFingerprint ?? null,
          },
        },
        tx,
      );
      for (const child of draft.children ?? []) {
        await createDraft(child, created.id);
      }
    };
    for (const draft of drafts) {
      await createDraft(draft, null);
    }
  }

  private pickNextSessionIndex(
    rows: Array<{ sessionIndex?: number | null }>,
    preferred: number,
  ) {
    const used = new Set(rows.map((row) => row.sessionIndex ?? 1));
    if (!used.has(preferred)) return preferred;
    let next = 1;
    while (used.has(next)) next += 1;
    return next;
  }

  private async estimateWorkoutLoad(workoutId: string, tx: PlanDb) {
    try {
      await this.planLoadEstimator.applyForWorkout(workoutId, { tx });
    } catch (error) {
      this.logger.warn(
        `[PlanExternalSync] estimate load failed workoutId=${workoutId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
