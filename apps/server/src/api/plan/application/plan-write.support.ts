import {
  Injectable,
  Logger,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ZoneBase,
  PlanWorkoutActivityLinkRole,
  PlanWorkoutActivityLinkSource,
  Prisma,
  SportType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  assessPlanQuality,
  parsePlanQualityContract,
} from '@shared/plan-quality';
import { UserService } from '@/api/user/user.service';
import type { UserProfileResponse } from '@/api/user/user.interface';
import {
  WorkoutService,
  type PlanBlock,
  type WorkoutPlanStepDraft,
  type ZoneBasisSnapshot,
} from '../../workout/workout.service';
import { getExpressionSpeedUnitForSport } from '../../workout/workout-expression-codec';
import { CreatePlanDto, PlanWorkoutInputDto } from '../dto/create-plan.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';
import { LinkPlanWorkoutActivityDto } from '../dto/link-plan-workout-activity.dto';
import { ReplaceActivityPlanLinkDto } from '../dto/replace-activity-plan-link.dto';
import { UpdatePlanWorkoutDto } from '../dto/update-plan-workout.dto';
import { CreateScheduledWorkoutDto } from '../dto/create-scheduled-workout.dto';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { resolveLthrForCalculation } from '@shared/lthr';
import { I18nService } from 'nestjs-i18n';
import type { PlanStatus, PlanWorkoutStatus } from '../plan.constants';
import {
  PlanLinkMatcherService,
  markWorkoutDoneIfApplicable,
} from './plan-link-matcher.service';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import {
  PlanSummaryService,
  type PlanListRollup,
  type WorkoutRollupInput,
} from './plan-summary.service';
import { LoadReadoutService } from '../../activity/load-readout.service';
import {
  activityCalendarYmdInZone,
  resolveActivityCalendarDayStr,
  scheduledDateFromCalendar,
} from '../plan-link-calendar.util';
import { CoachContextService } from './coach-context.service';
import { normalizeSportDefinitionCode } from '@/sports/sport-catalog.types';
import type { EndurancePlanBlock } from '../../../../../../packages/shared/endurance-workout-ir';
import type {
  WorkoutDefinitionInput,
  WorkoutStructure,
} from '../../../../../../packages/shared/workout-structure';
import { ParseWorkoutDefinitionDto } from '../../workout/dto/parse-workout-definition.dto';
import {
  WorkoutDefinitionService,
  type ResolvedWorkoutDefinition,
} from '../../workout/workout-definition.service';
import { WorkoutDefinitionValidationError } from '../../workout/codecs/workout-codec';
import { WorkoutPersistenceService } from '../persistence/workout-persistence.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import type { PlanDb } from '../persistence/plan-db';
import { ActivityReadService } from '../../activity/activity-read.service';
import {
  PLAN_DRAFT_CHANGED_EVENT,
  PlanDraftChangedEvent,
} from '../events/plan.events';
import {
  clampCurrentIndexes,
  normalizePlanDate,
  normalizePlanRow as mapPlanRow,
  normalizePlanWorkoutRow as mapPlanWorkoutRow,
  planCapabilities,
  type PlanRowLike,
  type PlanRowMapperDeps,
  type PlanWorkoutRowLike,
} from './plan-row.mapper';
import {
  PlanWorkoutMutabilityPolicy,
  type WorkoutMutationKind,
} from './plan-workout-mutability.policy';
import { WorkoutPrescriptionService } from '../../workout/workout-prescription.service';
import { PlanWorkoutTargetResolver } from './plan-workout-target-resolver.service';

type Tx = PlanDb;

const PLAN_LIST_WORKOUT_SELECT = {
  planId: true,
  status: true,
  estimatedLoad: true,
  sportType: true,
  links: {
    where: { unlinkedAt: null },
    select: {
      role: true,
      unlinkedAt: true,
      activityId: true,
    },
  },
} satisfies Prisma.PlanWorkoutSelect;

type PlanListWorkoutRow = Prisma.PlanWorkoutGetPayload<{
  select: typeof PLAN_LIST_WORKOUT_SELECT;
}>;

type MutableActualLoadLink = {
  role?: string | null;
  unlinkedAt?: Date | null;
  activityId?: number | null;
  actualLoad?: number | null;
  actualLoadSource?: string | null;
};

function mutableWorkoutLinks(workout: unknown): MutableActualLoadLink[] | null {
  if (!workout || typeof workout !== 'object') return null;
  const links = (workout as { links?: unknown }).links;
  if (!Array.isArray(links)) return null;
  return links as MutableActualLoadLink[];
}

type PersistedWorkoutInput = PlanWorkoutInputDto & {
  id?: string;
};

type CoachEventSource = 'ai' | 'manual' | 'system';
type CoachEventMeta = {
  source?: CoachEventSource;
  action?: string;
  reason?: string | null;
  toolCallId?: string | null;
  decisionId?: string | null;
  branchId?: string | null;
  commitId?: string | null;
};

type ZoneSnapshotType = 'HEART_RATE' | 'POWER' | 'PACE';
type ResolvedZoneSetting = {
  benchmark?: ZoneBase | string | null;
  zones?: Array<{
    min?: number | null;
    max?: number | null;
    name?: string | null;
    order?: number | null;
  }>;
};

@Injectable()
export class PlanWriteSupport {
  private readonly logger = new Logger(PlanWriteSupport.name);
  constructor(
    private prisma: PrismaService,
    private workoutService: WorkoutService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly planLinkMatcher: PlanLinkMatcherService,
    private readonly planLoadEstimator: PlanLoadEstimatorService,
    private readonly loadReadout: LoadReadoutService,
    private readonly planSummary: PlanSummaryService,
    private readonly coachContext: CoachContextService,
    private readonly workoutDefinitionService: WorkoutDefinitionService,
    private readonly workoutPersistence: WorkoutPersistenceService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly links: PlanActivityLinkRepository,
    private readonly activityRead: ActivityReadService,
    private readonly workoutMutability: PlanWorkoutMutabilityPolicy,
    private readonly workoutPrescriptions: WorkoutPrescriptionService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional()
    private readonly workoutTargetResolver?: PlanWorkoutTargetResolver,
  ) {}

  private planRowMapperDeps(): PlanRowMapperDeps {
    return {
      workoutService: this.workoutService,
      workoutPersistence: this.workoutPersistence,
      workoutDefinitionService: this.workoutDefinitionService,
    };
  }

  /**
   * 把所有 workout 下未解绑的 PRIMARY link 批量补齐 actualLoad / actualLoadSource。
   * 直接在传入的 plan / workout 对象树上原地写字段，供 normalizePlanWorkoutRow 透传。
   */
  private async attachActualLoadToWorkouts(
    plan?: { workouts?: unknown } | null,
  ) {
    if (!plan || !Array.isArray(plan.workouts)) return;
    const ids: number[] = [];
    for (const workout of plan.workouts) {
      const links = mutableWorkoutLinks(workout);
      if (!links) continue;
      for (const link of links) {
        if (
          link.role === PlanWorkoutActivityLinkRole.PRIMARY &&
          link.unlinkedAt == null &&
          typeof link.activityId === 'number'
        ) {
          ids.push(link.activityId);
        }
      }
    }
    if (ids.length === 0) return;

    const map = await this.loadReadout.batchGetActualLoad(ids);
    for (const workout of plan.workouts) {
      const links = mutableWorkoutLinks(workout);
      if (!links) continue;
      for (const link of links) {
        if (
          link.role !== PlanWorkoutActivityLinkRole.PRIMARY ||
          link.unlinkedAt != null ||
          typeof link.activityId !== 'number'
        ) {
          continue;
        }
        const readout = map.get(link.activityId);
        if (readout) {
          link.actualLoad = readout.actualLoad;
          link.actualLoadSource = readout.actualLoadSource;
        }
      }
    }
  }

  /** 把单节 workout 行下 PRIMARY link 的 actualLoad 补齐 */
  private async attachActualLoadToWorkout(workout?: unknown) {
    const links = mutableWorkoutLinks(workout);
    if (!links) return;
    const ids = links
      .filter(
        (link): link is MutableActualLoadLink & { activityId: number } =>
          link.role === PlanWorkoutActivityLinkRole.PRIMARY &&
          link.unlinkedAt == null &&
          typeof link.activityId === 'number',
      )
      .map((link) => link.activityId);
    if (ids.length === 0) return;
    const map = await this.loadReadout.batchGetActualLoad(ids);
    for (const link of links) {
      if (
        link.role !== PlanWorkoutActivityLinkRole.PRIMARY ||
        link.unlinkedAt != null ||
        typeof link.activityId !== 'number'
      )
        continue;
      const readout = map.get(link.activityId);
      if (readout) {
        link.actualLoad = readout.actualLoad;
        link.actualLoadSource = readout.actualLoadSource;
      }
    }
  }

  private toDayOffset(weekIndex: number, dayIndex: number) {
    // 服务端对外使用 1-based week/day，数据库内部用从计划开始日算起的 0-based dayOffset。
    return (weekIndex - 1) * 7 + (dayIndex - 1);
  }

  private parseDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Invalid date',
      });
    }
    return date;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private mapPlanWorkoutToRollupInput(
    w: PlanListWorkoutRow,
  ): WorkoutRollupInput {
    return {
      status: String(w.status),
      sportType: w.sportType,
      estimatedLoad: w.estimatedLoad ?? null,
      links: Array.isArray(w.links)
        ? w.links.map((l) => ({
            role: String(l.role),
            unlinkedAt: l.unlinkedAt ?? null,
            activityId: l.activityId,
          }))
        : [],
    };
  }

  private computeListAggregates(rollups: PlanListRollup[]) {
    let totalWorkouts = 0;
    let totalDone = 0;
    let sumEstimatedDone = 0;
    let sumActualDone = 0;
    for (const r of rollups) {
      totalWorkouts += r.workoutCount;
      totalDone += r.doneCount;
      sumEstimatedDone += r.estimatedLoadTotal;
      sumActualDone += r.actualLoadTotal;
    }
    return {
      weightedSessionCompletionRate:
        totalWorkouts > 0 ? Math.round((totalDone / totalWorkouts) * 100) : 0,
      aggregateLoadCompliance:
        sumEstimatedDone > 0
          ? Math.round((sumActualDone / sumEstimatedDone) * 100)
          : null,
    };
  }

  private normalizePlanWorkoutRow(row: PlanWorkoutRowLike) {
    return mapPlanWorkoutRow(row, this.planRowMapperDeps());
  }

  private normalizePlanRow(plan: PlanRowLike | null) {
    return mapPlanRow(plan, this.planRowMapperDeps());
  }

  /**
   * API 返回前按用户当前区间解析动态目标。数据库中的数值只是创建时投影，
   * 真正的计划语义是 targetZoneIndex（例如 Z4）。
   */
  private async resolveWorkoutTargetsForRead<T>(
    userId: string,
    workout: T,
    db?: PlanDb,
  ): Promise<T> {
    if (!workout || !this.workoutTargetResolver) return workout;
    return this.workoutTargetResolver.resolveWorkout(
      userId,
      workout as never,
      db,
    ) as Promise<T>;
  }

  private async resolvePlanTargetsForRead<T>(
    userId: string,
    plan: T,
    db?: PlanDb,
  ): Promise<T> {
    if (!plan || !this.workoutTargetResolver) return plan;
    const planRow = plan as { status?: unknown; workouts?: unknown };
    if (
      ['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(
        String(planRow.status ?? ''),
      )
    ) {
      return plan;
    }
    const workouts = planRow.workouts;
    if (!Array.isArray(workouts) || workouts.length === 0) return plan;
    return {
      ...(plan as object),
      workouts: await this.workoutTargetResolver.resolveWorkouts(
        userId,
        workouts as never[],
        db,
      ),
    } as T;
  }

  /** 未解绑链接 + 关联活动摘要（计划页展示） */
  private buildWorkoutLinksInclude() {
    return {
      where: { unlinkedAt: null },
      orderBy: { linkedAt: 'asc' as const },
      include: {
        activity: {
          select: { hashId: true, activityName: true },
        },
      },
    };
  }

  private buildStrengthExercisesInclude() {
    return {
      orderBy: { orderIndex: 'asc' as const },
      include: {
        setGroups: {
          orderBy: { orderIndex: 'asc' as const },
        },
      },
    };
  }

  private buildPlanInclude(): Prisma.PlanInclude {
    // 计划详情默认加载顶层步骤、子步骤和未解绑活动链接，顺序保持可直接渲染。
    return {
      workouts: {
        orderBy: [
          { dayOffset: 'asc' as const },
          { sessionIndex: 'asc' as const },
        ],
        include: {
          steps: {
            where: { parentId: null },
            orderBy: { orderIndex: 'asc' as const },
            include: {
              children: {
                orderBy: { orderIndex: 'asc' as const },
              },
            },
          },
          strengthExercises: this.buildStrengthExercisesInclude(),
          links: this.buildWorkoutLinksInclude(),
        },
      },
    };
  }

  private buildScheduledWorkoutInclude() {
    return {
      steps: {
        where: { parentId: null },
        orderBy: { orderIndex: 'asc' as const },
        include: {
          children: {
            orderBy: { orderIndex: 'asc' as const },
          },
        },
      },
      strengthExercises: this.buildStrengthExercisesInclude(),
      links: this.buildWorkoutLinksInclude(),
      plan: {
        select: {
          id: true,
          status: true,
          title: true,
          startDate: true,
          supersededBy: {
            select: { status: true, startDate: true },
          },
        },
      },
    };
  }

  private dayOffsetFromScheduledDate(startDate: Date, scheduledDate: Date) {
    return Math.floor(
      (scheduledDate.getTime() - startDate.getTime()) / 86_400_000,
    );
  }

  private async nextIndependentSessionIndex(
    tx: Tx,
    userId: string,
    scheduledDate: Date,
  ) {
    const rows = await this.workouts.findMany(
      {
        where: {
          userId,
          planId: null,
          scheduledDate,
        },
        select: { sessionIndex: true },
      },
      tx,
    );
    const used = new Set(rows.map((row) => row.sessionIndex ?? 1));
    let next = 1;
    while (used.has(next)) next += 1;
    return next;
  }

  private async nextPlanSessionIndex(
    tx: Tx,
    planId: string,
    dayOffset: number,
  ) {
    const rows = await this.workouts.findMany(
      {
        where: { planId, dayOffset },
        select: { sessionIndex: true },
      },
      tx,
    );
    const used = new Set(rows.map((row) => row.sessionIndex ?? 1));
    let next = 1;
    while (used.has(next)) next += 1;
    return next;
  }

  async listScheduledWorkouts(
    userId: string,
    start?: string | null,
    end?: string | null,
  ) {
    const startKey = String(start ?? '').trim();
    const endKey = String(end ?? '').trim();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startKey) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endKey)
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Invalid scheduled workout date range',
      });
    }

    const range = {
      gte: scheduledDateFromCalendar(startKey),
      lte: scheduledDateFromCalendar(endKey),
    };
    const include = this.buildScheduledWorkoutInclude();

    const [inPlanRows, independentRows] = await Promise.all([
      this.workouts.findMany({
        where: {
          userId,
          scheduledDate: range,
          plan: { status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] } },
        },
        include,
        orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
      }),
      this.workouts.findMany({
        where: {
          userId,
          planId: null,
          scheduledDate: range,
        },
        include,
        orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
      }),
    ]);

    const visibleInPlanRows = inPlanRows.filter((row) => {
      const date = row.scheduledDate?.toISOString().slice(0, 10);
      const plan = row.plan;
      if (!date || !plan) return false;
      if (plan.status === 'SCHEDULED') {
        const starts = plan.startDate?.toISOString().slice(0, 10);
        return Boolean(starts && date >= starts);
      }
      const cutoff =
        plan.supersededBy?.status === 'SCHEDULED'
          ? plan.supersededBy.startDate?.toISOString().slice(0, 10)
          : null;
      return !cutoff || date < cutoff;
    });
    const [resolvedInPlanRows, resolvedIndependentRows] = await Promise.all([
      this.workoutTargetResolver
        ? this.workoutTargetResolver.resolveWorkouts(userId, visibleInPlanRows)
        : visibleInPlanRows,
      this.workoutTargetResolver
        ? this.workoutTargetResolver.resolveWorkouts(userId, independentRows)
        : independentRows,
    ]);

    return {
      inPlan: resolvedInPlanRows.map((row) =>
        this.normalizePlanWorkoutRow(row),
      ),
      independent: resolvedIndependentRows.map((row) =>
        this.normalizePlanWorkoutRow(row),
      ),
    };
  }

  async createIndependentWorkout(
    userId: string,
    dto: CreateScheduledWorkoutDto,
    _meta?: CoachEventMeta,
  ) {
    return this.prisma.$transaction((tx) =>
      this.createIndependentWorkoutInTransaction(userId, dto, tx),
    );
  }

  /** Capability-owned transactional entry used by audited Coach actions. */
  async createIndependentWorkoutInTransaction(
    userId: string,
    dto: CreateScheduledWorkoutDto,
    tx: Prisma.TransactionClient,
  ) {
    this.assertWorkoutDefinitionPresent(dto);
    const definition = this.resolveWorkoutDefinitionInput(dto);
    const scheduledDate = scheduledDateFromCalendar(dto.scheduledDate);
    const sessionIndex = await this.nextIndependentSessionIndex(
      tx,
      userId,
      scheduledDate,
    );
    const row = await this.workouts.create(
      {
        data: {
          userId,
          planId: null,
          dayOffset: 0,
          sessionIndex,
          scheduledDate,
          sportType: dto.sportType,
          sportDefinitionCode: normalizeSportDefinitionCode(
            dto.sportType,
            dto.sportDefinitionCode,
          ),
          name: dto.name ?? null,
          text: definition.text,
          notes: dto.notes ?? null,
          structureKind: definition.kind,
          dslVersion: definition.version,
          status: 'PLANNED',
        },
        include: this.buildScheduledWorkoutInclude(),
      },
      tx,
    );
    await this.replaceWorkoutDefinition(tx, row.id, definition);
    const full = await this.workouts.findUnique(
      {
        where: { id: row.id },
        include: this.buildScheduledWorkoutInclude(),
      },
      tx,
    );
    return { workout: this.normalizePlanWorkoutRow(full) };
  }

  async getIndependentWorkoutDetail(userId: string, workoutId: string) {
    const workout = await this.workouts.findUnique({
      where: { id: workoutId },
      include: {
        steps: {
          where: { parentId: null },
          orderBy: { orderIndex: 'asc' },
          include: {
            children: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        strengthExercises: this.buildStrengthExercisesInclude(),
        links: this.buildWorkoutLinksInclude(),
      },
    });

    if (!workout || workout.userId !== userId || workout.planId != null) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Workout not found',
      });
    }

    await this.attachActualLoadToWorkout(workout);
    const resolved = await this.resolveWorkoutTargetsForRead(userId, workout);

    return {
      workout: this.normalizePlanWorkoutRow(resolved),
    };
  }

  async deleteIndependentWorkout(userId: string, workoutId: string) {
    const workout = await this.workouts.findUnique({
      where: { id: workoutId },
      select: { id: true, userId: true, planId: true },
    });

    if (!workout || workout.userId !== userId || workout.planId != null) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Workout not found',
      });
    }

    await this.assertWorkoutHasNoActivityLink(workoutId);
    await this.workouts.delete({ where: { id: workoutId } });

    return { success: true as const };
  }

  async createPlanWorkout(
    userId: string,
    planId: string,
    dto: CreateScheduledWorkoutDto,
    meta?: CoachEventMeta,
  ) {
    this.assertWorkoutDefinitionPresent(dto);
    const definition = this.resolveWorkoutDefinitionInput(dto);

    const result = await this.prisma.$transaction(async (tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (
        plan.status !== 'ACTIVE' &&
        plan.status !== 'PAUSED' &&
        plan.status !== 'SCHEDULED'
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message:
            'Workout can only be added to active, paused, or scheduled plans',
        });
      }
      if (!plan.startDate) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan start date is required',
        });
      }

      const scheduledDate = scheduledDateFromCalendar(dto.scheduledDate);
      await this.assertNewWorkoutMutable(userId, plan, scheduledDate, tx);
      const dayOffset = this.dayOffsetFromScheduledDate(
        plan.startDate,
        scheduledDate,
      );
      const sessionIndex = await this.nextPlanSessionIndex(
        tx,
        planId,
        dayOffset,
      );
      const row = await this.workouts.create(
        {
          data: {
            userId,
            planId,
            dayOffset,
            sessionIndex,
            scheduledDate,
            sportType: dto.sportType,
            sportDefinitionCode: normalizeSportDefinitionCode(
              dto.sportType,
              dto.sportDefinitionCode,
            ),
            name: dto.name ?? null,
            text: definition.text,
            notes: dto.notes ?? null,
            structureKind: definition.kind,
            dslVersion: definition.version,
            status: 'PLANNED',
          },
        },
        tx,
      );
      await this.replaceWorkoutDefinition(tx, row.id, definition);
      await this.planLoadEstimator.applyForWorkout(row.id, { tx: tx });

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'workout_create',
          workoutId: row.id,
          scheduledDate: dto.scheduledDate,
        },
      });

      const full = await this.workouts.findUnique(
        {
          where: { id: row.id },
          include: this.buildScheduledWorkoutInclude(),
        },
        tx,
      );
      return full;
    });

    return {
      workout: this.normalizePlanWorkoutRow(result),
    };
  }

  async attachWorkoutToPlan(
    userId: string,
    planId: string,
    workoutId: string,
    meta?: CoachEventMeta,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (!plan.startDate) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan start date is required',
        });
      }

      const workout = await this.workouts.findFirst(
        {
          where: { id: workoutId, userId },
          include: { plan: true },
        },
        tx,
      );
      if (!workout) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout not found',
        });
      }
      if (workout.planId != null) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout already belongs to a plan',
        });
      }
      if (!workout.scheduledDate) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Independent workout is missing scheduled date',
        });
      }

      await this.assertWorkoutHasNoActivityLink(workoutId, tx);
      await this.assertNewWorkoutMutable(
        userId,
        plan,
        workout.scheduledDate,
        tx,
      );

      const dayOffset = this.dayOffsetFromScheduledDate(
        plan.startDate,
        workout.scheduledDate,
      );
      const sessionIndex = await this.nextPlanSessionIndex(
        tx,
        planId,
        dayOffset,
      );

      const row = await this.workouts.update(
        {
          where: { id: workoutId },
          data: {
            planId,
            dayOffset,
            sessionIndex,
            revision: { increment: 1 },
          },
          include: this.buildScheduledWorkoutInclude(),
        },
        tx,
      );

      await this.planLoadEstimator.applyForWorkout(workoutId, {
        tx: tx,
      });

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'workout_attach_to_plan',
          workoutId,
        },
      });

      return row;
    });

    return {
      workout: this.normalizePlanWorkoutRow(updated),
    };
  }

  /** 任意有效活动关联存在时不允许改期 / 跳过 / 删除该节课（需先在活动侧解绑）。 */
  private async assertWorkoutHasNoActivityLink(workoutId: string, tx?: PlanDb) {
    const link = await this.links.findFirst(
      {
        where: {
          planWorkoutId: workoutId,
          unlinkedAt: null,
        },
        select: { id: true },
      },
      tx,
    );
    if (link) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.WORKOUT_IMMUTABLE,
        message:
          'This workout is linked to an activity. Remove all active links before postponing, skipping, or deleting.',
      });
    }
  }

  private async markExternalMappings(
    tx: Tx,
    workoutIds: string[],
    syncState: 'LOCAL_CHANGED' | 'LOCAL_DELETED',
  ) {
    if (!workoutIds.length) return;
    await this.workouts.updateExternalMappings(
      {
        where: {
          planWorkoutId: { in: [...new Set(workoutIds)] },
          syncState: { notIn: ['LOCAL_DELETED', 'REMOTE_DELETED'] },
        },
        data: {
          syncState,
          lastError: null,
          ...(syncState === 'LOCAL_DELETED'
            ? { localDeletedAt: new Date() }
            : {}),
        },
      },
      tx,
    );
  }

  private assertMutablePlanStatus(status: PlanStatus) {
    if (
      status === 'DRAFT' ||
      status === 'SCHEDULED' ||
      status === 'ACTIVE' ||
      status === 'PAUSED'
    )
      return;
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.WORKOUT_IMMUTABLE,
      message: 'Plan is not editable',
    });
  }

  private async emitDraftChanged(
    userId: string,
    plan: { id?: string; status?: string } | null | undefined,
  ) {
    if (!this.events || !plan?.id || plan.status !== 'DRAFT') return;
    try {
      await this.events.emitAsync(
        PLAN_DRAFT_CHANGED_EVENT,
        new PlanDraftChangedEvent(userId, plan.id),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to emit plan.draftChanged ${plan.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async assertPlanOwnership(
    userId: string,
    planId: string,
    tx?: PlanDb,
  ) {
    const plan = await this.plans.findUnique(
      {
        where: { id: planId },
        include: {
          supersededBy: {
            select: { status: true, startDate: true },
          },
        },
      },
      tx,
    );
    if (!plan || plan.userId !== userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Plan not found',
      });
    }
    return plan;
  }

  private async assertWorkoutOwnership(
    userId: string,
    planId: string,
    workoutId: string,
    tx?: PlanDb,
  ) {
    const workout = await this.workouts.findUnique(
      {
        where: { id: workoutId },
        include: {
          plan: {
            include: {
              supersededBy: {
                select: { status: true, startDate: true },
              },
            },
          },
          links: this.buildWorkoutLinksInclude(),
        },
      },
      tx,
    );
    if (
      !workout ||
      workout.planId !== planId ||
      workout.plan?.userId !== userId
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Workout not found',
      });
    }
    return workout;
  }

  private async assertWorkoutMutable(
    userId: string,
    workout: Awaited<ReturnType<PlanWriteSupport['assertWorkoutOwnership']>>,
    kind: WorkoutMutationKind,
    tx?: PlanDb,
  ) {
    this.workoutMutability.assertMutable(
      await this.workoutMutabilityInput(userId, workout, tx),
      kind,
    );
  }

  private async workoutMutabilityInput(
    userId: string,
    workout: Awaited<ReturnType<PlanWriteSupport['assertWorkoutOwnership']>>,
    tx?: PlanDb,
  ) {
    const timezone = await this.userService.getPreferredTimezone(userId, tx);
    const athleteTodayYmd =
      activityCalendarYmdInZone(new Date(), timezone) ??
      new Date().toISOString().slice(0, 10);
    return {
      planStatus: workout.plan.status,
      workoutStatus: workout.status,
      scheduledDateYmd: workout.scheduledDate
        ? workout.scheduledDate.toISOString().slice(0, 10)
        : null,
      athleteTodayYmd,
      activeActivityLinkCount: workout.links.length,
      pendingSupersessionYmd:
        workout.plan.supersededBy?.status === 'SCHEDULED' &&
        workout.plan.supersededBy.startDate
          ? workout.plan.supersededBy.startDate.toISOString().slice(0, 10)
          : null,
    };
  }

  private async assertNewWorkoutMutable(
    userId: string,
    plan: Awaited<ReturnType<PlanWriteSupport['assertPlanOwnership']>>,
    scheduledDate: Date | null,
    tx?: PlanDb,
  ) {
    if (plan.startDate && scheduledDate) {
      const dayOffset = this.dayOffsetFromScheduledDate(
        plan.startDate,
        scheduledDate,
      );
      if (dayOffset < 0 || dayOffset >= plan.periodWeeks * 7) {
        throw new UnprocessableEntityException(
          'Workout lies outside the plan period',
        );
      }
    }
    const timezone = await this.userService.getPreferredTimezone(userId, tx);
    const athleteTodayYmd =
      activityCalendarYmdInZone(new Date(), timezone) ??
      new Date().toISOString().slice(0, 10);
    this.workoutMutability.assertMutable(
      {
        planStatus: plan.status,
        workoutStatus: 'PLANNED',
        scheduledDateYmd: scheduledDate?.toISOString().slice(0, 10) ?? null,
        athleteTodayYmd,
        activeActivityLinkCount: 0,
        pendingSupersessionYmd:
          plan.supersededBy?.status === 'SCHEDULED' &&
          plan.supersededBy.startDate
            ? plan.supersededBy.startDate.toISOString().slice(0, 10)
            : null,
      },
      'SCHEDULE',
    );
  }

  private validatePlanWorkouts(workouts: PersistedWorkoutInput[]) {
    // 同一天允许多节课，但 sessionIndex 必须唯一，避免覆盖同一日的第二练。
    if (!Array.isArray(workouts) || workouts.length === 0) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'At least one workout is required',
      });
    }

    const keys = new Set<string>();
    for (const [index, workout] of workouts.entries()) {
      if (
        !Number.isInteger(workout.weekIndex) ||
        workout.weekIndex < 1 ||
        workout.weekIndex > 520 ||
        !Number.isInteger(workout.dayIndex) ||
        workout.dayIndex < 1 ||
        workout.dayIndex > 7 ||
        !Number.isInteger(workout.sessionIndex ?? 1) ||
        (workout.sessionIndex ?? 1) < 1
      ) {
        throw new UnprocessableEntityException(
          'Invalid workout schedule position',
        );
      }
      if (
        !workout.definition &&
        (!workout.text || workout.text.trim().length === 0)
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `Workout ${index + 1} definition cannot be empty`,
        });
      }
      const sessionIndex = workout.sessionIndex ?? 1;
      const key = `${workout.weekIndex}-${workout.dayIndex}-${sessionIndex}`;
      if (keys.has(key)) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `Duplicate workout position: ${key}`,
        });
      }
      keys.add(key);
    }
  }

  private assertWorkoutDefinitionPresent(input: {
    text?: string;
    definition?: unknown;
  }) {
    if (input.definition) return;
    if (typeof input.text === 'string' && input.text.trim()) return;
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message: 'Workout definition cannot be empty',
    });
  }

  private resolveWorkoutDefinitionInput(input: {
    text?: string;
    structureKind?: string;
    blocks?: unknown;
    definition?: ParseWorkoutDefinitionDto;
  }): ResolvedWorkoutDefinition {
    try {
      if (input.definition) {
        const raw = input.definition;
        const definitionInput: WorkoutDefinitionInput =
          raw.source === 'STRUCTURE'
            ? {
                kind: raw.kind,
                version: raw.version ?? 1,
                source: 'STRUCTURE',
                structure: raw.structure as WorkoutStructure,
              }
            : {
                kind: raw.kind,
                version: raw.version ?? 1,
                source: 'TEXT',
                text: String(raw.text ?? ''),
              };
        return this.workoutDefinitionService.resolve(definitionInput);
      }

      const legacyBlocks = this.getLegacyBlocksInput(input.blocks);
      if (legacyBlocks) {
        return this.workoutDefinitionService.resolve({
          kind: 'ENDURANCE',
          version: 1,
          source: 'STRUCTURE',
          structure: {
            kind: 'ENDURANCE',
            version: 1,
            blocks: legacyBlocks as EndurancePlanBlock[],
          },
        });
      }

      return this.workoutDefinitionService.resolve({
        kind: (input.structureKind ?? 'ENDURANCE') as WorkoutStructure['kind'],
        version: 1,
        source: 'TEXT',
        text: String(input.text ?? ''),
      });
    } catch (error) {
      if (error instanceof WorkoutDefinitionValidationError) {
        throw new UnprocessableEntityException({
          code: 'WORKOUT_DEFINITION_INVALID',
          message: error.message,
          data: { issues: error.issues },
        });
      }
      throw error;
    }
  }

  private getLegacyBlocksInput(blocksInput?: unknown): PlanBlock[] | null {
    if (Array.isArray(blocksInput)) return blocksInput as PlanBlock[];
    if (typeof blocksInput === 'string' && blocksInput.trim().length > 0) {
      try {
        const parsed = JSON.parse(blocksInput);
        if (Array.isArray(parsed)) return parsed as PlanBlock[];
      } catch {
        return null;
      }
    }
    return null;
  }

  private getWorkoutBlocksForPersist(
    text: string,
    blocksInput?: unknown,
  ): PlanBlock[] {
    if (Array.isArray(blocksInput)) {
      return blocksInput as PlanBlock[];
    }
    if (typeof blocksInput === 'string' && blocksInput.trim().length > 0) {
      try {
        const parsed = JSON.parse(blocksInput);
        if (Array.isArray(parsed)) {
          return parsed as PlanBlock[];
        }
      } catch {
        // Fall back to DSL text below.
      }
    }
    return this.workoutService.parsePlanText(text);
  }

  private async replaceWorkoutDefinition(
    tx: Tx,
    workoutId: string,
    definition: ResolvedWorkoutDefinition,
    plannedSessionRpe?: number | null,
  ) {
    const strength =
      definition.structure.kind === 'STRENGTH' ? definition.structure : null;
    await this.workouts.update(
      {
        where: { id: workoutId },
        data: {
          text: definition.text,
          structureKind: definition.kind,
          dslVersion: definition.version,
          // Persist the duration of the complete workout definition. For an
          // endurance workout this includes warm-up, work/recovery repeats and
          // cool-down, so downstream execution/review comparisons do not
          // mistake the main set duration for the whole session duration.
          plannedDurationSeconds: definition.summary.durationSeconds,
          plannedSessionRpe:
            plannedSessionRpe ?? strength?.plannedSessionRpe ?? null,
        },
      },
      tx,
    );

    if (definition.structure.kind === 'ENDURANCE') {
      await this.workouts.deleteExercises(
        {
          where: { workoutId },
        },
        tx,
      );
      await this.replaceWorkoutSteps(
        tx,
        workoutId,
        definition.text,
        definition.structure.blocks,
      );
      return;
    }

    await this.links.deleteSteps({ where: { workoutId } }, tx);
    if (definition.structure.kind === 'STRENGTH') {
      await this.workoutPersistence.replaceStrength(
        tx,
        workoutId,
        definition.structure,
      );
      return;
    }
    await this.workouts.deleteExercises(
      {
        where: { workoutId },
      },
      tx,
    );
  }

  private async replaceWorkoutSteps(
    tx: Tx,
    workoutId: string,
    text: string,
    blocksInput?: unknown,
  ) {
    // 结构化编辑器会传 blocks；保留 text 作为 DSL 展示源，但 step 树以 blocks 为准，避免 zone provenance 丢失。
    const blocks = this.getWorkoutBlocksForPersist(text, blocksInput);
    const stepDrafts = this.assignNewPrescriptionModes(
      await this.attachZoneSnapshotsToStepDrafts(
        tx,
        workoutId,
        this.workoutService.buildWorkoutPlanSteps(blocks),
      ),
    );
    this.assertZoneTargetsValid(stepDrafts);
    await this.links.deleteSteps(
      {
        where: { workoutId },
      },
      tx,
    );
    await this.createWorkoutPlanSteps(tx, workoutId, stepDrafts);
  }

  private hasZoneDraftNeedingSnapshot(steps: WorkoutPlanStepDraft[]): boolean {
    for (const step of steps) {
      const hasZoneReference =
        typeof step.targetZoneIndex === 'number' && step.targetZoneIndex > 0;
      if (hasZoneReference) return true;
      if (
        step.children?.length &&
        this.hasZoneDraftNeedingSnapshot(step.children)
      ) {
        return true;
      }
    }
    return false;
  }

  private inferredIntensityIntent(
    step: WorkoutPlanStepDraft,
  ): NonNullable<WorkoutPlanStepDraft['intensityIntent']> {
    const intensity = String(step.intensity ?? '').toUpperCase();
    const family =
      intensity === 'RECOVERY' ||
      intensity === 'REST' ||
      intensity === 'WARMUP' ||
      intensity === 'COOLDOWN'
        ? 'RECOVERY'
        : intensity === 'ACTIVE'
          ? 'ENDURANCE'
          : 'OTHER';
    return {
      family,
      purpose: step.name ?? step.notes ?? undefined,
    };
  }

  private assignNewPrescriptionModes(
    steps: WorkoutPlanStepDraft[],
  ): WorkoutPlanStepDraft[] {
    return steps.map((step) => {
      const children = step.children?.length
        ? this.assignNewPrescriptionModes(step.children)
        : step.children;
      if (step.targetResolutionMode) return { ...step, children };
      const hasZoneReference =
        typeof step.targetZoneIndex === 'number' && step.targetZoneIndex > 0;
      const hasFixedTarget =
        step.targetType != null &&
        step.targetType !== 'OPEN' &&
        (step.targetValueLow != null || step.targetValueHigh != null);
      return {
        ...step,
        children,
        intensityIntent:
          step.intensityIntent ?? this.inferredIntensityIntent(step),
        targetResolutionMode: hasZoneReference
          ? 'DYNAMIC_ZONE'
          : hasFixedTarget
            ? 'FIXED_VALUE'
            : 'EFFORT_ONLY',
      };
    });
  }

  private clearUnavailableZoneProjections(
    steps: WorkoutPlanStepDraft[],
  ): WorkoutPlanStepDraft[] {
    return steps.map((step) => {
      const children = step.children?.length
        ? this.clearUnavailableZoneProjections(step.children)
        : step.children;
      const hasZoneReference =
        typeof step.targetZoneIndex === 'number' && step.targetZoneIndex > 0;
      if (!hasZoneReference) return { ...step, children };
      return {
        ...step,
        children,
        targetValueLow: null,
        targetValueHigh: null,
        targetUnit: null,
        targetZoneLabel: `Z${step.targetZoneIndex}`,
        targetZoneSystem: null,
        targetZoneSource: null,
        targetZoneBasis: null,
        targetResolutionMode: 'DYNAMIC_ZONE',
        targetZoneSystemKey: null,
        targetZoneFingerprint: null,
      };
    });
  }

  private assertZoneTargetsValid(steps: WorkoutPlanStepDraft[]): void {
    for (const step of steps) {
      const hasZoneReference =
        typeof step.targetZoneIndex === 'number' && step.targetZoneIndex > 0;
      if (
        hasZoneReference &&
        (step.targetResolutionMode !== 'DYNAMIC_ZONE' ||
          this.resolveDraftZoneType(step) == null)
      ) {
        throw new UnprocessableEntityException(
          'Workout zone target requires a supported target dimension',
        );
      }
      if (step.children?.length) {
        this.assertZoneTargetsValid(step.children);
      }
    }
  }

  private resolveDraftZoneType(
    step: WorkoutPlanStepDraft,
  ): ZoneSnapshotType | null {
    if (step.targetType === 'HEART_RATE') return 'HEART_RATE';
    if (step.targetType === 'POWER') return 'POWER';
    if (step.targetType === 'SPEED') return 'PACE';
    return null;
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  private compactZoneBasisSnapshot(
    snapshot: ZoneBasisSnapshot,
  ): ZoneBasisSnapshot {
    return Object.fromEntries(
      Object.entries(snapshot)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            !(value instanceof Date)
          ) {
            return [
              key,
              this.compactZoneBasisSnapshot(value as ZoneBasisSnapshot),
            ];
          }
          return [key, value];
        }),
    );
  }

  private pickZoneByIndex(
    setting: ResolvedZoneSetting | undefined,
    zoneIndex: number,
  ) {
    const zones = Array.isArray(setting?.zones) ? setting.zones : [];
    return (
      zones.find((zone, index) => (zone.order ?? index + 1) === zoneIndex) ??
      zones[zoneIndex - 1]
    );
  }

  private getZoneTargetRange(args: {
    zoneType: ZoneSnapshotType;
    sportType: SportType;
    zone: ReturnType<PlanWriteSupport['pickZoneByIndex']>;
  }): {
    low?: number;
    high?: number;
    targetUnit: string;
    dbUnit: string;
  } | null {
    const low = this.toFiniteNumber(args.zone?.min);
    const high = this.toFiniteNumber(args.zone?.max);
    if (low == null && high == null) return null;

    if (args.zoneType === 'HEART_RATE') {
      return {
        low,
        high,
        targetUnit: 'bpm',
        dbUnit: 'BPM',
      };
    }
    if (args.zoneType === 'POWER') {
      return {
        low,
        high,
        targetUnit: 'W',
        dbUnit: 'WATTS',
      };
    }

    const speedUnit = getExpressionSpeedUnitForSport(args.sportType);
    const scale = speedUnit === 'sec/100m' ? 100 : 1000;
    const project = (value: number | undefined) =>
      value == null
        ? undefined
        : Math.round(value * scale * 1_000_000) / 1_000_000;
    return {
      low: project(low),
      high: project(high),
      targetUnit: speedUnit,
      dbUnit: 'SECONDS',
    };
  }

  private buildZoneBasisSnapshot(args: {
    zoneType: ZoneSnapshotType;
    sportType: SportType;
    benchmark?: ZoneBase | string | null;
    profile?: UserProfileResponse;
    targetLow?: number;
    targetHigh?: number;
    targetUnit?: string;
  }): ZoneBasisSnapshot {
    const benchmark = args.benchmark ?? ZoneBase.CUSTOM;
    const pick = (value: unknown) => {
      const numericValue = this.toFiniteNumber(value);
      return numericValue != null && numericValue > 0
        ? numericValue
        : undefined;
    };
    const base: ZoneBasisSnapshot = {
      zoneType: args.zoneType,
      sportType: args.sportType,
      benchmark,
      targetLow: args.targetLow,
      targetHigh: args.targetHigh,
      targetUnit: args.targetUnit,
    };

    if (benchmark === ZoneBase.CUSTOM) {
      return this.compactZoneBasisSnapshot({
        ...base,
        benchmarkSource: 'CUSTOM',
      });
    }

    if (args.zoneType === 'HEART_RATE') {
      if (benchmark === ZoneBase.HRR) {
        const maxHeartRate = pick(args.profile?.maxHeartRate);
        const restingHeartRate = pick(args.profile?.restingHeartRate);
        const reserve =
          maxHeartRate != null && restingHeartRate != null
            ? maxHeartRate - restingHeartRate
            : undefined;
        return this.compactZoneBasisSnapshot({
          ...base,
          benchmarkValue: reserve != null && reserve > 0 ? reserve : undefined,
          benchmarkUnit: 'bpm',
          benchmarkSource:
            reserve != null && reserve > 0 ? 'PROFILE' : 'UNKNOWN',
          inputs: {
            maxHeartRate,
            restingHeartRate,
          },
        });
      }

      if (benchmark === ZoneBase.LTHR) {
        const resolvedLthr = resolveLthrForCalculation({
          lthr: pick(args.profile?.lthr),
          maxHeartRate: pick(args.profile?.maxHeartRate),
        });
        return this.compactZoneBasisSnapshot({
          ...base,
          benchmarkValue: resolvedLthr?.value,
          benchmarkUnit: 'bpm',
          benchmarkSource: resolvedLthr?.source ?? 'UNKNOWN',
          inputs: {
            lthr: pick(args.profile?.lthr),
            maxHeartRate: pick(args.profile?.maxHeartRate),
          },
        });
      }

      const value = pick(args.profile?.maxHeartRate);
      return this.compactZoneBasisSnapshot({
        ...base,
        benchmarkValue: value,
        benchmarkUnit: 'bpm',
        benchmarkSource: value != null ? 'PROFILE' : 'UNKNOWN',
        inputs: {
          maxHeartRate: value,
        },
      });
    }

    if (args.zoneType === 'POWER') {
      const key = benchmark === ZoneBase.CP ? 'cp' : 'ftp';
      const value = pick(args.profile?.[key]);
      return this.compactZoneBasisSnapshot({
        ...base,
        benchmarkValue: value,
        benchmarkUnit: 'W',
        benchmarkSource: value != null ? 'PROFILE' : 'UNKNOWN',
        inputs: {
          [key]: value,
        },
      });
    }

    const key =
      benchmark === ZoneBase.VO2MAX
        ? 'vo2max'
        : benchmark === ZoneBase.TP
          ? 'tp'
          : 'cs';
    const value = pick(args.profile?.[key]);
    return this.compactZoneBasisSnapshot({
      ...base,
      benchmarkValue: value,
      benchmarkUnit: benchmark === ZoneBase.VO2MAX ? 'ml/kg/min' : 'm/s',
      benchmarkSource: value != null ? 'PROFILE' : 'UNKNOWN',
      inputs: {
        [key]: value,
      },
    });
  }

  private attachZoneSnapshotToStep(args: {
    step: WorkoutPlanStepDraft;
    sportType: SportType;
    profile?: UserProfileResponse;
    settingsByType: Record<ZoneSnapshotType, ResolvedZoneSetting | undefined>;
  }): WorkoutPlanStepDraft {
    const children = args.step.children?.length
      ? args.step.children.map((child) =>
          this.attachZoneSnapshotToStep({ ...args, step: child }),
        )
      : undefined;
    const zoneIndex = args.step.targetZoneIndex;
    const zoneType = this.resolveDraftZoneType(args.step);
    if (!zoneType || zoneIndex == null || zoneIndex <= 0) {
      return children ? { ...args.step, children } : args.step;
    }

    const setting = args.settingsByType[zoneType];
    const zone = this.pickZoneByIndex(setting, zoneIndex);
    const range = this.getZoneTargetRange({
      zoneType,
      sportType: args.sportType,
      zone,
    });
    if (!range) {
      return {
        ...args.step,
        children,
        targetValueLow: null,
        targetValueHigh: null,
        targetUnit: null,
        targetZoneLabel: `Z${zoneIndex}`,
        targetZoneSystem: null,
        targetZoneSource: null,
        targetZoneBasis: null,
        targetResolutionMode: 'DYNAMIC_ZONE',
        targetZoneSystemKey: null,
        targetZoneFingerprint: null,
      };
    }

    // 动态区间的事实来源是 zoneIndex；客户端或数据库中的旧投影不能覆盖当前区间。
    const low = range.low ?? null;
    const high = range.high ?? null;
    const benchmark = setting?.benchmark ?? args.step.targetZoneSystem;
    const zoneBasis = this.buildZoneBasisSnapshot({
      zoneType,
      sportType: args.sportType,
      benchmark,
      profile: args.profile,
      targetLow: low ?? undefined,
      targetHigh: high ?? undefined,
      targetUnit: range.targetUnit,
    });
    const dimension =
      zoneType === 'PACE'
        ? 'PACE'
        : zoneType === 'POWER'
          ? 'POWER'
          : 'HEART_RATE';
    const identity = ['RUN', 'CYCLING', 'SWIM'].includes(args.sportType)
      ? this.workoutPrescriptions.zoneIdentity({
          sportType: args.sportType as 'RUN' | 'CYCLING' | 'SWIM',
          dimension,
          setting: setting ?? { zones: [] },
        })
      : null;
    return {
      ...args.step,
      children,
      targetValueLow: low,
      targetValueHigh: high,
      targetUnit: range.dbUnit as WorkoutPlanStepDraft['targetUnit'],
      targetZoneLabel: zone?.name ?? `Z${zoneIndex}`,
      targetZoneSystem: benchmark != null ? String(benchmark) : null,
      targetZoneSource: 'TRAININGLOAD',
      targetZoneBasis: zoneBasis,
      intensityIntent:
        args.step.intensityIntent ?? this.inferredIntensityIntent(args.step),
      targetResolutionMode: identity ? 'DYNAMIC_ZONE' : 'LEGACY_SNAPSHOT',
      targetZoneSystemKey: identity?.systemKey ?? null,
      targetZoneFingerprint: identity?.fingerprint ?? null,
    };
  }

  private async attachZoneSnapshotsToStepDrafts(
    tx: Tx,
    workoutId: string,
    stepDrafts: WorkoutPlanStepDraft[],
  ): Promise<WorkoutPlanStepDraft[]> {
    if (!this.hasZoneDraftNeedingSnapshot(stepDrafts)) {
      return stepDrafts;
    }

    try {
      const workout = await this.workouts.findUnique(
        {
          where: { id: workoutId },
          select: {
            userId: true,
            sportType: true,
            plan: { select: { userId: true } },
          },
        },
        tx,
      );
      const userId = workout?.userId ?? workout?.plan?.userId;
      const sportType = workout?.sportType as SportType | undefined;
      if (!userId || !sportType) {
        return this.clearUnavailableZoneProjections(stepDrafts);
      }

      const profile = await this.userService.getComposedUserProfile(
        userId,
        sportType,
        undefined,
        tx,
      );
      const [heartRate, power, pace] = await Promise.all([
        this.userService.getHeartRateZoneSetting(
          userId,
          sportType,
          {
            maxHeartRate: profile?.maxHeartRate,
            restingHeartRate: profile?.restingHeartRate,
            lthr: profile?.lthr,
            heartRateZoneModel: profile?.heartRateZoneModel,
          },
          tx,
        ),
        this.userService.getPowerZoneSettingResolved(
          userId,
          sportType,
          {
            FTP: profile?.ftp,
            CP: profile?.cp,
            powerZoneModel: profile?.powerZoneModel,
          },
          tx,
        ),
        this.userService.getPaceZoneSettingResolved(
          userId,
          sportType,
          {
            vo2max: profile?.vo2max,
            tp: profile?.tp,
            cs: profile?.cs,
            paceZoneModel: profile?.paceZoneModel,
          },
          tx,
        ),
      ]);

      return stepDrafts.map((step) =>
        this.attachZoneSnapshotToStep({
          step,
          sportType,
          profile,
          settingsByType: {
            HEART_RATE: heartRate,
            POWER: power,
            PACE: pace,
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `[replaceWorkoutSteps] attach zone snapshot failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.clearUnavailableZoneProjections(stepDrafts);
    }
  }

  private async createWorkoutPlanSteps(
    tx: Tx,
    workoutId: string,
    steps: ReturnType<WorkoutService['buildWorkoutPlanSteps']>,
    parentId: string | null = null,
  ) {
    const toCreateData = (
      step: ReturnType<WorkoutService['buildWorkoutPlanSteps']>[number],
      stepParentId: string | null,
    ): Prisma.PlanWorkoutStepUncheckedCreateInput => ({
      workoutId,
      parentId: stepParentId,
      orderIndex: step.orderIndex,
      stepType: step.stepType,
      name: step.name ?? null,
      notes: step.notes ?? null,
      intensity: step.intensity ?? null,
      durationType: step.durationType,
      durationValue: step.durationValue ?? null,
      durationUnit: step.durationUnit ?? null,
      targetType: step.targetType ?? null,
      targetValueLow: step.targetValueLow ?? null,
      targetValueHigh: step.targetValueHigh ?? null,
      targetZoneIndex: step.targetZoneIndex ?? null,
      targetZoneLabel: step.targetZoneLabel ?? null,
      targetZoneSystem: step.targetZoneSystem ?? null,
      targetZoneSource: step.targetZoneSource ?? null,
      targetZoneBasis:
        step.targetZoneBasis == null
          ? undefined
          : (step.targetZoneBasis as Prisma.InputJsonValue),
      intensityIntent:
        step.intensityIntent == null
          ? undefined
          : (step.intensityIntent as Prisma.InputJsonValue),
      targetResolutionMode: step.targetResolutionMode ?? 'LEGACY_SNAPSHOT',
      targetZoneSystemKey: step.targetZoneSystemKey ?? null,
      targetZoneFingerprint: step.targetZoneFingerprint ?? null,
      targetUnit: step.targetUnit ?? null,
    });
    const parentSteps = steps.filter(
      (step) =>
        step.stepType === 'REPEAT' &&
        Array.isArray(step.children) &&
        step.children.length > 0,
    );
    const leafSteps = steps.filter((step) => !parentSteps.includes(step));

    // 同层叶子节点不依赖返回 ID，一次写入；只有 REPEAT 父节点需要单条创建
    // 取得 parentId 后递归。常见的线性训练课因此从 N 次 INSERT 降为 1 次。
    if (leafSteps.length > 0) {
      await this.links.createSteps(
        {
          data: leafSteps.map(
            (step) =>
              toCreateData(
                step,
                parentId,
              ) as Prisma.PlanWorkoutStepCreateManyInput,
          ),
        },
        tx,
      );
    }

    for (const step of parentSteps) {
      const created = await this.links.createStep(
        {
          data: toCreateData(step, parentId),
        },
        tx,
      );

      await this.createWorkoutPlanSteps(
        tx,
        workoutId,
        step.children!,
        created.id,
      );
    }
  }

  private buildWorkoutWriteData(
    workout: PersistedWorkoutInput,
    definition: ResolvedWorkoutDefinition,
    planStartDate?: Date | null,
  ) {
    // 若计划已激活，训练课日期由 startDate + dayOffset 推导，不信任前端传入的日期。
    const dayOffset = this.toDayOffset(workout.weekIndex, workout.dayIndex);
    return {
      dayOffset,
      sessionIndex: workout.sessionIndex ?? 1,
      scheduledDate: planStartDate
        ? this.addDays(planStartDate, dayOffset)
        : null,
      sportType: workout.sportType,
      sportDefinitionCode: normalizeSportDefinitionCode(
        workout.sportType,
        workout.sportDefinitionCode,
      ),
      name: workout.name ?? null,
      text: definition.text,
      notes: workout.notes ?? null,
      structureKind: definition.kind,
      dslVersion: definition.version,
    };
  }

  private async createWorkoutsForPlan(
    tx: Tx,
    userId: string,
    planId: string,
    workouts: PersistedWorkoutInput[],
    planStartDate?: Date | null,
  ) {
    for (const workout of workouts) {
      const definition = this.resolveWorkoutDefinitionInput(workout);
      const created = await this.workouts.create(
        {
          data: {
            userId,
            planId,
            ...this.buildWorkoutWriteData(workout, definition, planStartDate),
          },
        },
        tx,
      );
      await this.replaceWorkoutDefinition(
        tx,
        created.id,
        definition,
        workout.plannedSessionRpe,
      );
    }
  }

  async listPlans(userId: string) {
    const plans = await this.plans.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    const planIds = plans.map((p) => p.id);
    const workouts: PlanListWorkoutRow[] =
      planIds.length === 0
        ? []
        : await this.workouts.findMany({
            where: { planId: { in: planIds } },
            select: PLAN_LIST_WORKOUT_SELECT,
          });

    const workoutsByPlanId = new Map<string, WorkoutRollupInput[]>();
    for (const w of workouts) {
      const inputs = workoutsByPlanId.get(w.planId) ?? [];
      inputs.push(this.mapPlanWorkoutToRollupInput(w));
      workoutsByPlanId.set(w.planId, inputs);
    }

    const activityIds = new Set<number>();
    for (const w of workouts) {
      for (const link of w.links) {
        if (
          link.role === PlanWorkoutActivityLinkRole.PRIMARY &&
          link.unlinkedAt == null &&
          typeof link.activityId === 'number'
        ) {
          activityIds.add(link.activityId);
        }
      }
    }

    const actualMap =
      activityIds.size > 0
        ? await this.loadReadout.batchGetActualLoad([...activityIds])
        : new Map<number, { actualLoad: number | null }>();

    const rollups: PlanListRollup[] = [];
    const planRows = plans.map((plan) => {
      const workoutInputs = workoutsByPlanId.get(plan.id) ?? [];
      const rollup = this.planSummary.rollupForWorkouts(
        workoutInputs,
        actualMap,
      );
      rollups.push(rollup);
      const current = clampCurrentIndexes(plan);

      return {
        id: plan.id,
        userId: plan.userId,
        title: plan.title,
        description: plan.description ?? null,
        goal: plan.goal ?? null,
        sourceType: plan.sourceType,
        generationMetadata: plan.generationMetadata ?? null,
        status: plan.status,
        capabilities: planCapabilities(plan.status),
        periodWeeks: plan.periodWeeks,
        startDate: normalizePlanDate(plan.startDate),
        endDate: normalizePlanDate(plan.endDate),
        currentWeekIndex: current.currentWeekIndex,
        currentDayIndex: current.currentDayIndex,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        workoutCount: rollup.workoutCount,
        completedWorkoutCount: rollup.doneCount,
        estimatedLoadTotal: rollup.estimatedLoadTotal,
        actualLoadTotal: rollup.actualLoadTotal,
        sessionCompletionRate: rollup.sessionCompletionRate,
        complianceRate: rollup.complianceRate,
      };
    });

    return {
      plans: planRows,
      aggregates: this.computeListAggregates(rollups),
    };
  }

  async getActivePlan(userId: string) {
    const plan = await this.plans.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { activatedAt: 'desc' },
      include: this.buildPlanInclude(),
    });

    await this.attachActualLoadToWorkouts(plan);
    const resolved = await this.resolvePlanTargetsForRead(userId, plan);

    return {
      plan: this.normalizePlanRow(resolved),
    };
  }

  async getPlanDetail(userId: string, planId: string, db?: PlanDb) {
    const plan = await this.plans.findUnique(
      {
        where: { id: planId },
        include: this.buildPlanInclude(),
      },
      db,
    );
    if (!plan || plan.userId !== userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Plan not found',
      });
    }

    await this.attachActualLoadToWorkouts(plan);
    const resolved = await this.resolvePlanTargetsForRead(userId, plan, db);

    return {
      plan: this.normalizePlanRow(resolved),
    };
  }

  async getWorkoutDetail(
    userId: string,
    planId: string,
    workoutId: string,
    db?: Tx,
  ) {
    const workout = await this.workouts.findUnique(
      {
        where: { id: workoutId },
        include: {
          plan: {
            include: {
              supersededBy: { select: { status: true, startDate: true } },
            },
          },
          steps: {
            where: { parentId: null },
            orderBy: { orderIndex: 'asc' },
            include: {
              children: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
          strengthExercises: this.buildStrengthExercisesInclude(),
          links: this.buildWorkoutLinksInclude(),
        },
      },
      db,
    );

    if (
      !workout ||
      workout.planId !== planId ||
      workout.plan?.userId !== userId
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Workout not found',
      });
    }

    await this.attachActualLoadToWorkout(workout);
    const resolved = await this.resolveWorkoutTargetsForRead(
      userId,
      workout,
      db,
    );

    const mutability = await this.workoutMutabilityInput(userId, workout, db);
    const canEdit =
      this.workoutMutability.reason(mutability, 'DELETE') === null;
    return {
      workout: {
        ...this.normalizePlanWorkoutRow(resolved),
        capabilities: {
          delete: canEdit,
          postpone: canEdit,
          skip:
            this.workoutMutability.reason(mutability, 'STATUS') === null &&
            mutability.activeActivityLinkCount === 0,
        },
      },
    };
  }

  async createPlan(
    userId: string,
    dto: CreatePlanDto,
    options?: {
      tx?: Tx;
      lineage?: {
        derivedFromShareId: string;
        derivedFromLineageId: string;
        rootLineageId: string;
      };
    },
  ) {
    try {
      if (!dto.title?.trim()) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan title cannot be empty',
        });
      }
      this.validatePlanWorkouts(dto.workouts);
      let qualityContract;
      try {
        qualityContract = parsePlanQualityContract(
          dto.generationMetadata?.qualityContract,
        );
      } catch {
        throw new UnprocessableEntityException('Invalid plan quality contract');
      }
      const qualityReport = assessPlanQuality(
        dto.periodWeeks,
        dto.workouts.map((workout) => {
          const definition = this.resolveWorkoutDefinitionInput(workout);
          return {
            ...workout,
            structureKind: definition.kind,
            text: definition.text,
            durationSeconds: definition.summary.durationSeconds,
          };
        }),
        qualityContract,
      );
      if (!qualityReport.valid) {
        throw new UnprocessableEntityException({
          code: 'PLAN_QUALITY_INVALID',
          issues: qualityReport.issues,
        });
      }

      const run = async (tx: Tx) => {
        const plan = await this.plans.create(
          {
            data: {
              userId,
              title: dto.title.trim(),
              description: dto.description?.trim() || null,
              goal: dto.goal?.trim() || null,
              sourceType: dto.sourceType ?? 'MANUAL',
              generationMetadata: {
                ...dto.generationMetadata,
                qualityReport,
              } as Prisma.InputJsonValue,
              status: 'DRAFT',
              periodWeeks: dto.periodWeeks,
              derivedFromShareId: options?.lineage?.derivedFromShareId,
              derivedFromLineageId: options?.lineage?.derivedFromLineageId,
              rootLineageId: options?.lineage?.rootLineageId,
            },
          },
          tx,
        );

        await this.createWorkoutsForPlan(tx, userId, plan.id, dto.workouts);

        const full = await this.plans.findUnique(
          {
            where: { id: plan.id },
            include: this.buildPlanInclude(),
          },
          tx,
        );

        await this.attachActualLoadToWorkouts(full);

        return {
          plan: this.normalizePlanRow(full),
        };
      };

      if (options?.tx) {
        return run(options.tx);
      }
      return await this.prisma.$transaction((tx) => run(tx));
    } catch (error) {
      this.logger.error(
        `[createPlan] 创建计划失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  async updatePlan(
    userId: string,
    planId: string,
    dto: UpdatePlanDto,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const existing = await this.assertPlanOwnership(userId, planId, tx);
      this.assertMutablePlanStatus(existing.status);

      const nextTitle =
        dto.title !== undefined ? dto.title.trim() : existing.title;
      if (!nextTitle) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan title cannot be empty',
        });
      }

      if (dto.workouts) {
        this.validatePlanWorkouts(dto.workouts);
      }

      const nextPeriodWeeks = dto.periodWeeks ?? existing.periodWeeks;
      const nextStartDate = existing.startDate ?? null;

      await this.plans.update(
        {
          where: { id: planId },
          data: {
            title: nextTitle,
            description:
              dto.description !== undefined
                ? dto.description?.trim() || null
                : undefined,
            goal: dto.goal !== undefined ? dto.goal?.trim() || null : undefined,
            periodWeeks: nextPeriodWeeks,
          },
        },
        tx,
      );

      if (
        Array.isArray(dto.deletedWorkoutIds) &&
        dto.deletedWorkoutIds.length > 0
      ) {
        for (const wid of dto.deletedWorkoutIds) {
          const workout = await this.assertWorkoutOwnership(
            userId,
            planId,
            wid,
            tx,
          );
          await this.assertWorkoutMutable(userId, workout, 'DELETE', tx);
        }
        await this.markExternalMappings(
          tx,
          dto.deletedWorkoutIds,
          'LOCAL_DELETED',
        );
        await this.workouts.deleteMany(
          {
            where: {
              id: { in: dto.deletedWorkoutIds },
              planId,
            },
          },
          tx,
        );
      }

      const touchedWorkoutIds: string[] = [];

      if (dto.workouts) {
        const existingWorkouts = await this.workouts.findMany(
          {
            where: { planId },
            select: { id: true },
          },
          tx,
        );
        const existingIds = new Set(existingWorkouts.map((item) => item.id));

        for (const workout of dto.workouts) {
          const definition = this.resolveWorkoutDefinitionInput(workout);
          const data = this.buildWorkoutWriteData(
            workout,
            definition,
            nextStartDate,
          );
          if (workout.id) {
            if (!existingIds.has(workout.id)) {
              throw new BusinessException({
                code: BUSINESS_ERROR_CODE.COMMON,
                message: 'Workout not found',
              });
            }
            const current = await this.assertWorkoutOwnership(
              userId,
              planId,
              workout.id,
              tx,
            );
            await this.assertWorkoutMutable(
              userId,
              current,
              'PRESCRIPTION',
              tx,
            );
            await this.workouts.update(
              {
                where: { id: workout.id },
                data: { ...data, revision: { increment: 1 } },
              },
              tx,
            );
            await this.replaceWorkoutDefinition(tx, workout.id, definition);
            await this.markExternalMappings(tx, [workout.id], 'LOCAL_CHANGED');
            touchedWorkoutIds.push(workout.id);
            continue;
          }

          await this.assertNewWorkoutMutable(
            userId,
            existing,
            nextStartDate
              ? this.addDays(
                  nextStartDate,
                  this.toDayOffset(workout.weekIndex, workout.dayIndex),
                )
              : null,
            tx,
          );

          const created = await this.workouts.create(
            {
              data: {
                userId,
                planId,
                ...data,
              },
            },
            tx,
          );
          await this.replaceWorkoutDefinition(tx, created.id, definition);
          touchedWorkoutIds.push(created.id);
        }
      }

      // PAUSED 计划下编辑：对受影响的 workout 增量重算估值；DRAFT 不算
      if (existing.status === 'PAUSED' && touchedWorkoutIds.length > 0) {
        for (const wid of touchedWorkoutIds) {
          try {
            await this.planLoadEstimator.applyForWorkout(wid, { tx });
          } catch (err) {
            this.logger.warn(
              `[updatePlan] estimate load for workout ${wid} failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }

      const full = await this.plans.findUnique(
        {
          where: { id: planId },
          include: this.buildPlanInclude(),
        },
        tx,
      );

      await this.attachActualLoadToWorkouts(full);

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'plan_update',
          reason: meta?.reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          hasWorkoutEdits: Boolean(dto.workouts?.length),
          deletedWorkoutCount: dto.deletedWorkoutIds?.length ?? 0,
        },
      });

      const plan = this.normalizePlanRow(full);
      return { plan };
    };
    const result = options?.tx
      ? await run(options.tx)
      : await this.prisma.$transaction(run, { timeout: 60_000 });
    const afterCommit = () => this.emitDraftChanged(userId, result.plan);
    if (!options?.tx) {
      await afterCommit();
    }
    return { ...result, afterCommit: options?.tx ? afterCommit : undefined };
  }

  async activatePlan(
    userId: string,
    planId: string,
    startDate?: string,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    // 同一用户同一时间只允许一个 ACTIVE 计划；激活时统一重算每节课 scheduledDate。
    const run = async (tx: Tx) => {
      const active = await this.plans.findFirst(
        {
          where: {
            userId,
            status: 'ACTIVE',
            id: { not: planId },
          },
          select: { id: true },
        },
        tx,
      );
      if (active) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Another active plan already exists',
        });
      }

      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (plan.status !== 'DRAFT' && plan.status !== 'PAUSED') {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan cannot be activated',
        });
      }

      const start = this.parseDate(startDate) ?? new Date();
      const end = this.addDays(start, plan.periodWeeks * 7 - 1);
      const current = clampCurrentIndexes({
        startDate: start,
        periodWeeks: plan.periodWeeks,
        status: 'ACTIVE',
      });

      await this.plans.update(
        {
          where: { id: planId },
          data: {
            status: 'ACTIVE',
            startDate: start,
            endDate: end,
            activatedAt: new Date(),
            pausedAt: null,
            completedAt: null,
            cancelledAt: null,
            currentWeekIndex: current.currentWeekIndex,
            currentDayIndex: current.currentDayIndex,
          },
        },
        tx,
      );

      await this.coachContext.ensureContext({
        tx: tx,
        userId,
        planId,
        status: 'ACTIVE',
        startDate: start,
        endDate: end,
      });

      const workouts = await this.workouts.findMany(
        {
          where: { planId },
          select: { id: true, dayOffset: true },
        },
        tx,
      );

      for (const workout of workouts) {
        await this.workouts.update(
          {
            where: { id: workout.id },
            data: {
              scheduledDate: this.addDays(start, workout.dayOffset),
            },
          },
          tx,
        );
      }

      // DRAFT → ACTIVE：用激活时刻的阈值作为正式快照，全量计算
      try {
        await this.planLoadEstimator.applyForPlan(planId, { tx });
      } catch (err) {
        this.logger.warn(
          `[activatePlan] estimate load failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      const full = await this.plans.findUnique(
        {
          where: { id: planId },
          include: this.buildPlanInclude(),
        },
        tx,
      );

      await this.attachActualLoadToWorkouts(full);

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'plan_activate',
          reason: meta?.reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          startDate: normalizePlanDate(start),
          endDate: normalizePlanDate(end),
        },
      });

      return {
        plan: this.normalizePlanRow(full),
      };
    };
    return options?.tx
      ? run(options.tx)
      : this.prisma.$transaction(run, { timeout: 60_000 });
  }

  async pausePlan(
    userId: string,
    planId: string,
    _reason?: string,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (plan.status !== 'ACTIVE') {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Only active plans can be paused',
        });
      }

      const updated = await this.plans.update(
        {
          where: { id: planId },
          data: {
            status: 'PAUSED',
            pausedAt: new Date(),
            currentWeekIndex: null,
            currentDayIndex: null,
          },
          include: this.buildPlanInclude(),
        },
        tx,
      );

      await this.attachActualLoadToWorkouts(updated);

      await this.coachContext.appendEvent({
        tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'plan_pause',
          reason: meta?.reason ?? _reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
        },
      });

      return {
        plan: this.normalizePlanRow(updated),
      };
    };
    return options?.tx
      ? run(options.tx)
      : this.prisma.$transaction(run, { timeout: 60_000 });
  }

  async completePlan(
    userId: string,
    planId: string,
    completedAt?: string,
    _reason?: string,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (plan.status !== 'ACTIVE' && plan.status !== 'PAUSED') {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan cannot be completed',
        });
      }

      const completed = this.parseDate(completedAt) ?? new Date();
      const updated = await this.plans.update(
        {
          where: { id: planId },
          data: {
            status: 'COMPLETED',
            completedAt: completed,
            endDate: completed,
            currentWeekIndex: null,
            currentDayIndex: null,
          },
          include: this.buildPlanInclude(),
        },
        tx,
      );

      await this.attachActualLoadToWorkouts(updated);

      const finalized = await this.coachContext.finalizeContext({
        tx,
        userId,
        planId,
        planStatus: 'COMPLETED',
        source: meta?.source ?? 'system',
        reason: meta?.reason ?? _reason ?? null,
        occurredAt: updated.completedAt ?? new Date(),
      });

      return {
        plan: this.normalizePlanRow(updated),
        afterCommit: finalized?.afterCommit,
      };
    };
    const result = options?.tx
      ? await run(options.tx)
      : await this.prisma.$transaction(run, { timeout: 60_000 });
    if (!options?.tx) await result.afterCommit?.();
    return result;
  }

  async cancelPlan(
    userId: string,
    planId: string,
    _reason?: string,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (
        plan.status === 'COMPLETED' ||
        plan.status === 'CANCELLED' ||
        plan.status === 'SUPERSEDED'
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan cannot be cancelled',
        });
      }

      const cancelled = new Date();
      const updated = await this.plans.update(
        {
          where: { id: planId },
          data: {
            status: 'CANCELLED',
            cancelledAt: cancelled,
            endDate: cancelled,
            currentWeekIndex: null,
            currentDayIndex: null,
            scheduledActivationAt: null,
            ...(plan.status === 'SCHEDULED' ? { supersedesPlanId: null } : {}),
          },
          include: this.buildPlanInclude(),
        },
        tx,
      );

      await this.attachActualLoadToWorkouts(updated);

      if (plan.status === 'SCHEDULED') {
        await this.markExternalMappings(
          tx,
          updated.workouts.map((workout) => workout.id),
          'LOCAL_DELETED',
        );
        if (plan.supersedesPlanId) {
          const restored = await this.workouts.findMany(
            {
              where: {
                planId: plan.supersedesPlanId,
                scheduledDate: plan.startDate
                  ? { gte: plan.startDate }
                  : undefined,
              },
              select: { id: true },
            },
            tx,
          );
          await this.markExternalMappings(
            tx,
            restored.map((workout) => workout.id),
            'LOCAL_CHANGED',
          );
        }
      }

      const finalized = await this.coachContext.finalizeContext({
        tx,
        userId,
        planId,
        planStatus: 'CANCELLED',
        source: meta?.source ?? 'system',
        reason: meta?.reason ?? _reason ?? null,
        occurredAt: updated.cancelledAt ?? new Date(),
      });

      return {
        plan: this.normalizePlanRow(updated),
        afterCommit: finalized?.afterCommit,
      };
    };
    const result = options?.tx
      ? await run(options.tx)
      : await this.prisma.$transaction(run, { timeout: 60_000 });
    if (!options?.tx) await result.afterCommit?.();
    return result;
  }

  async deletePlan(userId: string, planId: string) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      if (!planCapabilities(plan.status).delete) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.WORKOUT_IMMUTABLE,
          message: 'This plan cannot be deleted',
        });
      }
      const workouts = await this.workouts.findMany(
        {
          where: { planId, userId },
          include: {
            plan: { include: { supersededBy: true } },
            links: this.buildWorkoutLinksInclude(),
          },
        },
        tx,
      );
      if (plan.status === 'DRAFT') {
        for (const workout of workouts) {
          await this.assertWorkoutMutable(userId, workout, 'DELETE', tx);
        }
      }
      await this.plans.delete({ where: { id: planId } }, tx);
      return { success: true as const };
    });
  }

  async updateWorkoutStatus(
    userId: string,
    planId: string,
    workoutId: string,
    status: PlanWorkoutStatus,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const workout = await this.assertWorkoutOwnership(
        userId,
        planId,
        workoutId,
        tx,
      );
      await this.assertWorkoutMutable(userId, workout, 'STATUS', tx);
      if (status === 'SKIPPED') {
        await this.assertWorkoutHasNoActivityLink(workoutId, tx);
      }
      const result = await this.workouts.update(
        {
          where: { id: workoutId },
          data: {
            status,
            completedAt: status === 'DONE' ? new Date() : null,
            skippedAt: status === 'SKIPPED' ? new Date() : null,
            revision: { increment: 1 },
          },
          include: {
            steps: {
              where: { parentId: null },
              orderBy: { orderIndex: 'asc' },
              include: {
                children: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
            strengthExercises: this.buildStrengthExercisesInclude(),
            links: this.buildWorkoutLinksInclude(),
          },
        },
        tx,
      );
      await this.markExternalMappings(
        tx,
        [workoutId],
        status === 'SKIPPED' ? 'LOCAL_DELETED' : 'LOCAL_CHANGED',
      );
      await this.coachContext.appendEvent({
        tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'workout_status_update',
          reason: meta?.reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          workoutId,
          fromStatus: workout.status,
          toStatus: status,
        },
      });
      if (status === 'DONE') {
        await this.coachContext.appendEvent({
          tx,
          userId,
          planId,
          type: 'WORKOUT_COMPLETED',
          source: meta?.source ?? 'system',
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          payload: {
            workoutId,
            completionMode: 'status_update',
            status,
          },
        });
      }
      await this.attachActualLoadToWorkout(result);
      return { workout: this.normalizePlanWorkoutRow(result) };
    };
    return options?.tx
      ? run(options.tx)
      : this.prisma.$transaction(run, { timeout: 60_000 });
  }

  /** 向现有计划追加一节课；ACTIVE/PAUSED 计划也允许通过已确认的教练决策调用。 */
  async addWorkout(
    userId: string,
    planId: string,
    dto: PlanWorkoutInputDto,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      this.validatePlanWorkouts([dto]);
      if (dto.weekIndex > plan.periodWeeks) {
        throw new UnprocessableEntityException(
          'Workout lies outside the plan period',
        );
      }
      const dayOffset = this.toDayOffset(dto.weekIndex, dto.dayIndex);
      await this.assertNewWorkoutMutable(
        userId,
        plan,
        plan.startDate ? this.addDays(plan.startDate, dayOffset) : null,
        tx,
      );
      const sessionIndex = dto.sessionIndex ?? 1;
      const occupied = await this.workouts.findFirst(
        {
          where: { planId, dayOffset, sessionIndex },
          select: { id: true },
        },
        tx,
      );
      if (occupied) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout schedule position is already occupied',
        });
      }
      const definition = this.resolveWorkoutDefinitionInput(dto);
      const created = await this.workouts.create(
        {
          data: {
            userId,
            planId,
            ...this.buildWorkoutWriteData(dto, definition, plan.startDate),
          },
        },
        tx,
      );
      await this.replaceWorkoutDefinition(
        tx,
        created.id,
        definition,
        dto.plannedSessionRpe,
      );
      if (plan.status === 'ACTIVE' || plan.status === 'PAUSED') {
        try {
          await this.planLoadEstimator.applyForWorkout(created.id, { tx });
        } catch (error) {
          this.logger.warn(
            `[addWorkout] estimate load failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const result = await this.workouts.findUnique(
        {
          where: { id: created.id },
          include: {
            steps: {
              where: { parentId: null },
              orderBy: { orderIndex: 'asc' },
              include: { children: { orderBy: { orderIndex: 'asc' } } },
            },
            strengthExercises: this.buildStrengthExercisesInclude(),
            links: this.buildWorkoutLinksInclude(),
          },
        },
        tx,
      );
      await this.coachContext.appendEvent({
        tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        decisionId: meta?.decisionId ?? null,
        branchId: meta?.branchId ?? null,
        commitId: meta?.commitId ?? null,
        payload: {
          action: meta?.action ?? 'workout_add',
          reason: meta?.reason ?? null,
          workoutId: created.id,
          weekIndex: dto.weekIndex,
          dayIndex: dto.dayIndex,
          sessionIndex,
          sourceWorkoutId: null,
        },
      });
      return { workout: this.normalizePlanWorkoutRow(result) };
    };
    return options?.tx
      ? run(options.tx)
      : this.prisma.$transaction(run, { timeout: 60_000 });
  }

  private postponeMovedBy(meta?: CoachEventMeta): 'USER' | 'COACH' {
    return meta?.source === 'ai' ? 'COACH' : 'USER';
  }

  private async nextSessionIndexOnDay(
    tx: Tx,
    planId: string,
    dayOffset: number,
    preferred?: number,
  ) {
    const occupied = await this.workouts.findMany(
      {
        where: { planId, dayOffset },
        select: { sessionIndex: true },
      },
      tx,
    );
    const used = new Set(
      occupied.map((row) => row.sessionIndex).filter((value) => value >= 1),
    );
    if (preferred && preferred >= 1 && !used.has(preferred)) return preferred;
    let index = 1;
    while (used.has(index)) index += 1;
    return index;
  }

  /**
   * 拷贝式顺延：原课次留在原日并标 MOVED；新课次落到目标日为可执行 PLANNED。
   * 返回新课次 id。
   */
  private async applyPostponeCopy(args: {
    tx: Tx;
    userId: string;
    planId: string;
    source: {
      id: string;
      userId: string;
      structureKind?: string | null;
      plannedSessionRpe?: number | null;
      plan: { startDate: Date | null; status: string };
    };
    dto: UpdatePlanWorkoutDto;
    definition: ResolvedWorkoutDefinition;
    meta?: CoachEventMeta;
  }) {
    const movedBy = this.postponeMovedBy(args.meta);
    await this.workouts.update(
      {
        where: { id: args.source.id },
        data: {
          status: 'MOVED',
          movedBy,
          revision: { increment: 1 },
        },
      },
      args.tx,
    );

    const targetDayOffset = this.toDayOffset(
      args.dto.weekIndex,
      args.dto.dayIndex,
    );
    const sessionIndex = await this.nextSessionIndexOnDay(
      args.tx,
      args.planId,
      targetDayOffset,
      args.dto.sessionIndex,
    );
    const created = await this.workouts.create(
      {
        data: {
          userId: args.source.userId || args.userId,
          planId: args.planId,
          ...this.buildWorkoutWriteData(
            { ...args.dto, sessionIndex },
            args.definition,
            args.source.plan.startDate ?? null,
          ),
          status: 'PLANNED',
          movedFromWorkoutId: args.source.id,
          movedBy,
        },
      },
      args.tx,
    );
    await this.replaceWorkoutDefinition(
      args.tx,
      created.id,
      args.definition,
      args.source.plannedSessionRpe,
    );
    if (
      args.source.plan.status === 'ACTIVE' ||
      args.source.plan.status === 'PAUSED'
    ) {
      try {
        await this.planLoadEstimator.applyForWorkout(created.id, {
          tx: args.tx,
        });
      } catch (err) {
        this.logger.warn(
          `[updateWorkout] estimate load for postponed clone failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return created.id;
  }

  async updateWorkout(
    userId: string,
    planId: string,
    workoutId: string,
    dto: UpdatePlanWorkoutDto,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    // 单节课编辑仍会重建 step 树，保证 text/steps 永远保持一致。
    const run = async (tx: Tx) => {
      const workout = await this.assertWorkoutOwnership(
        userId,
        planId,
        workoutId,
        tx,
      );
      await this.assertWorkoutMutable(userId, workout, 'PRESCRIPTION', tx);
      if (
        workout.plan.status === 'COMPLETED' ||
        workout.plan.status === 'CANCELLED'
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout cannot be updated',
        });
      }

      this.validatePlanWorkouts([
        {
          ...dto,
          id: workoutId,
        },
      ]);

      const nextDayOffset = this.toDayOffset(dto.weekIndex, dto.dayIndex);
      if (dto.weekIndex > workout.plan.periodWeeks)
        throw new UnprocessableEntityException(
          'Workout lies outside the plan period',
        );
      const currentDayOffset = workout.dayOffset ?? 0;
      const movedSchedule = nextDayOffset !== currentDayOffset;
      if (movedSchedule) {
        await this.assertWorkoutHasNoActivityLink(workoutId, tx);
      }

      const definition = this.resolveWorkoutDefinitionInput({
        ...dto,
        structureKind: workout.structureKind,
      });

      // 拷贝式顺延：原行留在原日标 MOVED；新行落到目标日为 PLANNED，
      // new.movedFromWorkoutId = old.id。非 postpone 的改期仍原地移动。
      const isPostponeReason =
        dto.reason === 'postpone' || dto.reason === 'POSTPONE';
      if (
        movedSchedule &&
        isPostponeReason &&
        (workout.status === 'DONE' ||
          workout.status === 'SKIPPED' ||
          workout.status === 'MOVED')
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout cannot be postponed',
        });
      }
      const isPostpone =
        movedSchedule &&
        isPostponeReason &&
        (workout.plan.status === 'ACTIVE' || workout.plan.status === 'PAUSED');

      let clonedWorkoutId: string | null = null;
      if (isPostpone) {
        clonedWorkoutId = await this.applyPostponeCopy({
          tx,
          userId,
          planId,
          source: workout,
          dto,
          definition,
          meta,
        });
        await this.markExternalMappings(tx, [workoutId], 'LOCAL_DELETED');
      } else {
        const data = this.buildWorkoutWriteData(
          {
            ...dto,
            id: workoutId,
          },
          definition,
          workout.plan.startDate ?? null,
        ) as Record<string, unknown>;

        await this.workouts.update(
          {
            where: { id: workoutId },
            data: { ...data, revision: { increment: 1 } },
          },
          tx,
        );
        await this.replaceWorkoutDefinition(tx, workoutId, definition);
        await this.markExternalMappings(tx, [workoutId], 'LOCAL_CHANGED');

        if (
          workout.plan.status === 'ACTIVE' ||
          workout.plan.status === 'PAUSED'
        ) {
          try {
            await this.planLoadEstimator.applyForWorkout(workoutId, { tx });
          } catch (err) {
            this.logger.warn(
              `[updateWorkout] estimate load failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }

      const updated = await this.workouts.findUnique(
        {
          where: { id: workoutId },
          include: {
            steps: {
              where: { parentId: null },
              orderBy: { orderIndex: 'asc' },
              include: {
                children: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
            strengthExercises: this.buildStrengthExercisesInclude(),
            links: this.buildWorkoutLinksInclude(),
          },
        },
        tx,
      );

      await this.attachActualLoadToWorkout(updated);

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'ADAPTATION_APPLIED',
        source: meta?.source ?? 'system',
        payload: {
          action: meta?.action ?? 'workout_update',
          reason: meta?.reason ?? dto.reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          workoutId,
          clonedWorkoutId,
          movedSchedule,
          weekIndex: dto.weekIndex,
          dayIndex: dto.dayIndex,
          sessionIndex: dto.sessionIndex ?? null,
          sportType: dto.sportType,
          sportDefinitionCode: normalizeSportDefinitionCode(
            dto.sportType,
            dto.sportDefinitionCode,
          ),
        },
      });

      const snapshotPlan = workout.plan;
      const result = {
        workout: this.normalizePlanWorkoutRow(updated),
      };
      return { ...result, snapshotPlan, clonedWorkoutId };
    };
    const txResult = options?.tx
      ? await run(options.tx)
      : await this.prisma.$transaction(run);
    const afterCommit = () =>
      this.emitDraftChanged(userId, txResult.snapshotPlan);
    if (!options?.tx) await afterCommit();
    return {
      workout: txResult.workout,
      clonedWorkoutId: txResult.clonedWorkoutId ?? null,
      afterCommit: options?.tx ? afterCommit : undefined,
    };
  }

  /** One transaction for an agreed scope, including swaps and read-back validation. */
  async updateWorkouts(
    userId: string,
    planId: string,
    changes: Array<{ workoutId: string; dto: UpdatePlanWorkoutDto }>,
    meta?: CoachEventMeta,
    options?: { tx?: Tx },
  ) {
    if (
      !changes.length ||
      changes.length > 200 ||
      new Set(changes.map((c) => c.workoutId)).size !== changes.length
    ) {
      throw new UnprocessableEntityException(
        'Expected 1–200 distinct workouts',
      );
    }
    const run = async (tx: Tx) => {
      const plan = await this.assertPlanOwnership(userId, planId, tx);
      const before = [];
      for (const change of changes) {
        const workout = await this.assertWorkoutOwnership(
          userId,
          planId,
          change.workoutId,
          tx,
        );
        await this.assertWorkoutMutable(userId, workout, 'PRESCRIPTION', tx);
        const moved =
          workout.dayOffset !==
            this.toDayOffset(change.dto.weekIndex, change.dto.dayIndex) ||
          workout.sessionIndex !== (change.dto.sessionIndex ?? 1);
        if (moved)
          await this.assertWorkoutHasNoActivityLink(change.workoutId, tx);
        before.push(this.normalizePlanWorkoutRow(workout));
      }
      // Release unique schedule positions inside the transaction so A↔B moves work.
      // No temporary position is ever visible outside this transaction.
      for (const [index, change] of changes.entries()) {
        await this.workouts.update(
          {
            where: { id: change.workoutId },
            data: { sessionIndex: -(index + 1) },
          },
          tx,
        );
      }
      const after = [];
      for (const change of changes) {
        const result = await this.updateWorkout(
          userId,
          planId,
          change.workoutId,
          change.dto,
          meta,
          { tx },
        );
        after.push(result.workout);
      }
      const full = await this.plans.findUnique(
        { where: { id: planId }, include: this.buildPlanInclude() },
        tx,
      );
      const qualityReport = this.validateStoredPlanQuality(full);
      await this.plans.update(
        {
          where: { id: planId },
          data: {
            generationMetadata: {
              ...((plan.generationMetadata as Record<string, unknown>) ?? {}),
              qualityReport,
            } as Prisma.InputJsonValue,
          },
        },
        tx,
      );
      return { plan, before, after, qualityReport };
    };
    const result = options?.tx
      ? await run(options.tx)
      : await this.prisma.$transaction(run, { timeout: 60_000 });
    if (!options?.tx) await this.emitDraftChanged(userId, result.plan);
    return result;
  }

  async notifyWorkoutChanges(userId: string, planId: string) {
    try {
      await this.emitDraftChanged(
        userId,
        await this.assertPlanOwnership(userId, planId),
      );
    } catch (error) {
      // The transaction has already committed; notification failure must not report a failed apply.
      this.logger.warn(
        `Failed to notify committed workout changes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateStoredPlanQuality(plan: PlanRowLike | null) {
    if (!plan) throw new UnprocessableEntityException('Plan not found');
    const normalized = this.normalizePlanRow(plan);
    let contract;
    try {
      contract = parsePlanQualityContract(
        (plan.generationMetadata as Record<string, unknown> | null)
          ?.qualityContract,
      );
    } catch {
      throw new UnprocessableEntityException('Invalid plan quality contract');
    }
    const report = assessPlanQuality(
      plan.periodWeeks ?? 0,
      (normalized?.workouts ?? []).map((workout) => {
        const definition = this.resolveWorkoutDefinitionInput(workout);
        return {
          ...workout,
          structureKind: definition.kind,
          durationSeconds: definition.summary.durationSeconds,
        };
      }),
      contract,
    );
    if (!report.valid)
      throw new UnprocessableEntityException({
        code: 'PLAN_QUALITY_INVALID',
        issues: report.issues,
      });
    return report;
  }

  async getWorkoutLinks(userId: string, planId: string, workoutId: string) {
    await this.assertWorkoutOwnership(userId, planId, workoutId);
    const links = await this.links.findMany({
      where: {
        planId,
        planWorkoutId: workoutId,
        unlinkedAt: null,
      },
      orderBy: { linkedAt: 'asc' },
    });

    return {
      links,
    };
  }

  async linkWorkoutActivity(
    userId: string,
    planId: string,
    workoutId: string,
    dto: LinkPlanWorkoutActivityDto,
    meta?: CoachEventMeta,
  ) {
    // 计划训练和实际活动通过软链接关联；重复链接直接复用，避免前端重复点击产生多条关系。
    const workout = await this.assertWorkoutOwnership(
      userId,
      planId,
      workoutId,
    );
    if (
      workout.plan.status === 'COMPLETED' ||
      workout.plan.status === 'CANCELLED'
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Workout cannot be linked',
      });
    }

    const activity = await this.activityRead.findFirst({
      where: readyActivityWhere({ id: dto.activityId }),
      select: { id: true, userId: true, startTime: true },
    });
    if (!activity || activity.userId !== userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Activity not found',
      });
    }

    const existing = await this.links.findFirst({
      where: {
        planWorkoutId: workoutId,
        activityId: dto.activityId,
        unlinkedAt: null,
      },
    });
    if (existing) {
      return { link: existing };
    }

    return this.prisma.$transaction(async (tx) => {
      const isPrimary = (dto.role ?? 'PRIMARY') === 'PRIMARY';
      const autoMarked = isPrimary
        ? await markWorkoutDoneIfApplicable(
            tx,
            workoutId,
            activity.startTime ?? null,
          )
        : false;
      const link = await this.links.create(
        {
          data: {
            planId,
            planWorkoutId: workoutId,
            activityId: dto.activityId,
            source: dto.source ?? 'MANUAL',
            role: dto.role ?? 'PRIMARY',
            autoMarkedWorkoutDone: autoMarked,
          },
        },
        tx,
      );

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'WORKOUT_LINKED',
        source: meta?.source ?? 'system',
        decisionId: meta?.decisionId ?? null,
        branchId: meta?.branchId ?? null,
        commitId: meta?.commitId ?? null,
        payload: {
          action: 'link_workout_activity',
          reason: meta?.reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          workoutId,
          activityId: dto.activityId,
          sourceType: dto.source ?? 'MANUAL',
          role: dto.role ?? 'PRIMARY',
          autoMarkedWorkoutDone: autoMarked,
        },
      });

      if (autoMarked) {
        await this.coachContext.appendEvent({
          tx: tx,
          userId,
          planId,
          type: 'WORKOUT_COMPLETED',
          source: meta?.source ?? 'system',
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          payload: {
            action: 'auto_mark_done_on_link',
            workoutId,
            activityId: dto.activityId,
          },
        });
      }

      return { link };
    });
  }

  async unlinkWorkoutActivity(
    userId: string,
    planId: string,
    workoutId: string,
    linkId: string,
  ) {
    await this.assertWorkoutOwnership(userId, planId, workoutId);

    const link = await this.links.findUnique({
      where: { id: linkId },
    });
    if (!link || link.planId !== planId || link.planWorkoutId !== workoutId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Link not found',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.links.update(
        {
          where: { id: linkId },
          data: { unlinkedAt: new Date() },
        },
        tx,
      );
      // 仅自动 link 自己置 DONE 的回退；用户手动改 DONE 不动。
      await this.revertAutoDoneIfOrphan(tx, workoutId, link);
      return { success: true };
    });
  }

  /**
   * 解绑后若该 workout 不再有任何 active PRIMARY link：
   * - 当且仅当被解绑的 link 自己是 autoMarkedWorkoutDone 的，才把 DONE 回退到 PLANNED；
   * - 用户手动改成 DONE / SKIPPED / MOVED 的不动。
   */
  private async revertAutoDoneIfOrphan(
    tx: PlanDb,
    workoutId: string,
    detachedLink: { autoMarkedWorkoutDone?: boolean | null } | null,
  ) {
    if (!detachedLink?.autoMarkedWorkoutDone) return;
    const stillHasPrimary = await this.links.findFirst(
      {
        where: {
          planWorkoutId: workoutId,
          unlinkedAt: null,
          role: PlanWorkoutActivityLinkRole.PRIMARY,
        },
        select: { id: true },
      },
      tx,
    );
    if (stillHasPrimary) return;
    const workout = await this.workouts.findUnique(
      {
        where: { id: workoutId },
        select: { status: true },
      },
      tx,
    );
    if (!workout || workout.status !== 'DONE') return;
    await this.workouts.update(
      {
        where: { id: workoutId },
        data: { status: 'PLANNED', completedAt: null },
      },
      tx,
    );
  }

  /** 活动视角：当前关联的训练（至多一条 active link） */
  async getActivityPlanLinkByHash(userId: string, hashId: string) {
    const activity = await this.activityRead.findFirst({
      where: readyActivityWhere({ hashId, userId }),
      select: { id: true },
    });
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Activity not found',
      });
    }

    const link = await this.links.findFirst({
      where: { activityId: activity.id, unlinkedAt: null },
      include: {
        planWorkout: {
          select: {
            id: true,
            name: true,
            notes: true,
            sportType: true,
            structureKind: true,
            planId: true,
            status: true,
            completedAt: true,
            scheduledDate: true,
            plannedDurationSeconds: true,
            estimatedLoad: true,
            plan: { select: { title: true } },
          },
        },
      },
    });

    if (!link?.planWorkout) {
      return { linkedPlanWorkout: null as null };
    }

    const durationPromise =
      link.planWorkout.plannedDurationSeconds != null
        ? Promise.resolve(link.planWorkout.plannedDurationSeconds)
        : this.planLinkMatcher.sumExpectedDurationSeconds(link.planWorkout.id);
    const [expectedDurationSec, actualLoadMap] = await Promise.all([
      durationPromise,
      this.loadReadout.batchGetActualLoad([activity.id]),
    ]);
    const actualLoad = actualLoadMap.get(activity.id);

    return {
      linkedPlanWorkout: {
        planId: link.planWorkout.planId,
        planTitle: link.planWorkout.plan?.title ?? null,
        workoutId: link.planWorkout.id,
        name: link.planWorkout.name,
        notes: link.planWorkout.notes,
        sportType: link.planWorkout.sportType,
        structureKind: link.planWorkout.structureKind,
        status: link.planWorkout.status,
        completedAt: link.planWorkout.completedAt,
        scheduledDate: link.planWorkout.scheduledDate,
        expectedDurationSec,
        plannedLoad: link.planWorkout.estimatedLoad,
        actualLoad: actualLoad?.actualLoad ?? null,
        actualLoadSource: actualLoad?.actualLoadSource ?? null,
        source: link.source as string,
      },
    };
  }

  /**
   * 活动视角：当日 ACTIVE 计划下同运动类型的候选 workout（含占用信息）
   * @param userId 用户 ID
   * @param hashId 活动哈希 ID
   * @param calendarTimeZone 日历时区
   * @returns 候选 workout 列表
   * @description
   */
  async listActivityPlanCandidatesByHash(
    userId: string,
    hashId: string,
    calendarTimeZone?: string,
  ) {
    const activity = await this.activityRead.findFirst({
      where: readyActivityWhere({ hashId, userId }),
      select: {
        id: true,
        startTime: true,
        sportType: true,
        timezone: true,
      },
    });
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }
    if (!activity.startTime) {
      return { candidates: [] as unknown[] };
    }
    const sport = activity.sportType;
    if (
      !sport ||
      sport === SportType.UNKNOWN ||
      sport === SportType.STRETCHING
    ) {
      return { candidates: [] as unknown[] };
    }

    const activePlan = await this.plans.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!activePlan) {
      return { candidates: [] as unknown[] };
    }

    const userTz = await this.userService.getPreferredTimezone(userId);

    const dayStr = resolveActivityCalendarDayStr(
      new Date(activity.startTime),
      activity.timezone,
      calendarTimeZone ?? null,
      userTz,
    );
    if (!dayStr) {
      return { candidates: [] as unknown[] };
    }

    const scheduledEq = scheduledDateFromCalendar(dayStr);

    const workouts = await this.workouts.findMany({
      where: {
        planId: activePlan.id,
        scheduledDate: scheduledEq,
        sportType: sport,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        planId: true,
        name: true,
        sportType: true,
        sessionIndex: true,
      },
      orderBy: [{ sessionIndex: 'asc' }],
    });

    const candidates: unknown[] = [];
    for (const w of workouts) {
      const expectedSec = await this.planLinkMatcher.sumExpectedDurationSeconds(
        w.id,
      );
      // 检查是否有其他活动占用该 workout
      const existingLink = await this.links.findFirst({
        where: {
          planWorkoutId: w.id,
          unlinkedAt: null,
          role: PlanWorkoutActivityLinkRole.PRIMARY,
        },
        include: {
          activity: {
            select: {
              id: true,
              hashId: true,
              activityName: true,
            },
          },
        },
      });

      let occupiedBy: {
        activityId: number;
        hashId: string;
        title: string;
      } | null = null;
      if (
        existingLink &&
        existingLink.activity &&
        existingLink.activityId !== activity.id
      ) {
        const title =
          String(existingLink.activity.activityName ?? '').trim() || 'Activity';
        occupiedBy = {
          activityId: existingLink.activity.id,
          hashId: existingLink.activity.hashId,
          title,
        };
      }

      candidates.push({
        workoutId: w.id,
        planId: w.planId,
        name: w.name,
        sportType: w.sportType,
        sessionIndex: w.sessionIndex ?? 1,
        expectedDurationSec: expectedSec,
        occupiedBy,
      });
    }

    return { candidates };
  }

  /**
   * 活动视角：替换关联（事务内软解绑 activity + 目标 workout 的旧 PRIMARY，再写入 MANUAL）
   * @param userId 用户 ID
   * @param hashId 活动哈希 ID
   * @param dto 替换关联请求
   * @param meta 教练事件元数据
   * @returns 无
   * @description
   */
  async replaceActivityPlanLinkByHash(
    userId: string,
    hashId: string,
    dto: ReplaceActivityPlanLinkDto,
    meta?: CoachEventMeta,
    linkSource: PlanWorkoutActivityLinkSource = PlanWorkoutActivityLinkSource.MANUAL,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const activity = await this.activityRead.activity(tx).findFirst({
        // 计划关联是导入处理链的一部分，必须能看到当前刚提交、尚在 ANALYZING
        // 的活动；readyActivityWhere 明确不适用于 worker/association 场景。
        where:
          linkSource === PlanWorkoutActivityLinkSource.AUTO
            ? { hashId, userId, state: 1, mergedIntoActivityId: null }
            : readyActivityWhere({ hashId, userId }),
        select: { id: true, startTime: true },
      });
      if (!activity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Activity not found',
        });
      }

      const targetWorkout = await this.workouts.findUnique(
        {
          where: { id: dto.workoutId },
          include: { plan: true },
        },
        tx,
      );
      if (
        !targetWorkout ||
        targetWorkout.plan?.userId !== userId ||
        targetWorkout.plan.status === 'COMPLETED' ||
        targetWorkout.plan.status === 'CANCELLED'
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout not found',
        });
      }

      const planId = targetWorkout.planId as string;

      // 同 activity 之前的所有 active link 都得解绑：可能涉及别的 workout，因此每条单独处理 auto DONE 回退。
      const detachedActivityLinks = await this.links.findMany(
        {
          where: { activityId: activity.id, unlinkedAt: null },
          select: {
            id: true,
            planWorkoutId: true,
            autoMarkedWorkoutDone: true,
            source: true,
          },
        },
        tx,
      );
      const hardBoundActivityLink = detachedActivityLinks.find(
        (link) => link.source === PlanWorkoutActivityLinkSource.AUTO,
      );
      if (hardBoundActivityLink) {
        if (
          linkSource === PlanWorkoutActivityLinkSource.AUTO &&
          hardBoundActivityLink.planWorkoutId === dto.workoutId
        ) {
          return {
            linkedPlanWorkout: {
              planId,
              workoutId: targetWorkout.id,
              name: targetWorkout.name,
              sportType: targetWorkout.sportType,
              status: targetWorkout.status,
              source: PlanWorkoutActivityLinkSource.AUTO,
            },
          };
        }
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Activity is locked to its recorded workout',
        });
      }
      if (detachedActivityLinks.length > 0) {
        await this.links.updateMany(
          {
            where: { activityId: activity.id, unlinkedAt: null },
            data: { unlinkedAt: new Date() },
          },
          tx,
        );
        for (const l of detachedActivityLinks) {
          await this.revertAutoDoneIfOrphan(tx, l.planWorkoutId, {
            autoMarkedWorkoutDone: l.autoMarkedWorkoutDone,
          });
        }
      }

      // 目标 workout 上原来的 PRIMARY 也要解绑（保持单 PRIMARY 不变量），同样处理回退。
      const detachedWorkoutLinks = await this.links.findMany(
        {
          where: { planWorkoutId: dto.workoutId, unlinkedAt: null },
          select: {
            id: true,
            activityId: true,
            planWorkoutId: true,
            autoMarkedWorkoutDone: true,
            source: true,
          },
        },
        tx,
      );
      if (
        detachedWorkoutLinks.some(
          (link) =>
            link.source === PlanWorkoutActivityLinkSource.AUTO &&
            link.activityId !== activity.id,
        )
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Workout is locked to its recorded activity',
        });
      }
      if (detachedWorkoutLinks.length > 0) {
        await this.links.updateMany(
          {
            where: { planWorkoutId: dto.workoutId, unlinkedAt: null },
            data: { unlinkedAt: new Date() },
          },
          tx,
        );
        for (const l of detachedWorkoutLinks) {
          await this.revertAutoDoneIfOrphan(tx, l.planWorkoutId, {
            autoMarkedWorkoutDone: l.autoMarkedWorkoutDone,
          });
        }
      }

      // 创建新 link 时，对目标 workout 应用自动 DONE 规则。
      const autoMarked = await markWorkoutDoneIfApplicable(
        tx,
        dto.workoutId,
        activity.startTime ?? null,
      );
      const created = await this.links.create(
        {
          data: {
            planId,
            planWorkoutId: dto.workoutId,
            activityId: activity.id,
            source: linkSource,
            role: PlanWorkoutActivityLinkRole.PRIMARY,
            autoMarkedWorkoutDone: autoMarked,
          },
          include: {
            planWorkout: {
              select: {
                id: true,
                name: true,
                sportType: true,
                planId: true,
              },
            },
          },
        },
        tx,
      );

      const pw = created.planWorkout;

      await this.coachContext.appendEvent({
        tx: tx,
        userId,
        planId,
        type: 'WORKOUT_LINKED',
        source: meta?.source ?? 'system',
        decisionId: meta?.decisionId ?? null,
        branchId: meta?.branchId ?? null,
        commitId: meta?.commitId ?? null,
        payload: {
          action: 'replace_activity_plan_link',
          reason: meta?.reason ?? null,
          toolCallId: meta?.toolCallId ?? null,
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          hashId,
          activityId: activity.id,
          workoutId: dto.workoutId,
          autoMarkedWorkoutDone: autoMarked,
        },
      });

      if (autoMarked) {
        await this.coachContext.appendEvent({
          tx: tx,
          userId,
          planId,
          type: 'WORKOUT_COMPLETED',
          source: meta?.source ?? 'system',
          decisionId: meta?.decisionId ?? null,
          branchId: meta?.branchId ?? null,
          commitId: meta?.commitId ?? null,
          payload: {
            action: 'auto_mark_done_on_link',
            hashId,
            activityId: activity.id,
            workoutId: dto.workoutId,
          },
        });
      }

      return {
        linkedPlanWorkout: {
          planId: pw.planId,
          workoutId: pw.id,
          name: pw.name,
          sportType: pw.sportType,
          status: autoMarked ? 'DONE' : targetWorkout.status,
          source: linkSource,
        },
      };
    };
    return options?.tx
      ? run(options.tx)
      : this.prisma.$transaction(run, { timeout: 60_000 });
  }

  async bindRecordedActivityToWorkout(
    userId: string,
    hashId: string,
    workoutId: string,
  ) {
    return this.replaceActivityPlanLinkByHash(
      userId,
      hashId,
      { workoutId },
      undefined,
      PlanWorkoutActivityLinkSource.AUTO,
    );
  }
  /**
   * 移除当前活动关联的 workout 计划链接
   * @param userId 用户 ID
   * @param hashId 活动哈希 ID
   * @returns 无
   * @description 移除当前活动关联的 workout 计划链接
   */
  async removeActivityPlanLinkByHash(
    userId: string,
    hashId: string,
    options?: { tx?: Tx },
  ) {
    const run = async (tx: Tx) => {
      const activity = await this.activityRead.activity(tx).findFirst({
        where: readyActivityWhere({ hashId, userId }),
        select: { id: true },
      });
      if (!activity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Activity not found',
        });
      }

      const detached = await this.links.findMany(
        {
          where: { activityId: activity.id, unlinkedAt: null },
          select: {
            planWorkoutId: true,
            autoMarkedWorkoutDone: true,
            source: true,
          },
        },
        tx,
      );
      if (
        detached.some(
          (link) => link.source === PlanWorkoutActivityLinkSource.AUTO,
        )
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Activity is locked to its recorded workout',
        });
      }
      if (detached.length > 0) {
        await this.links.updateMany(
          {
            where: { activityId: activity.id, unlinkedAt: null },
            data: { unlinkedAt: new Date() },
          },
          tx,
        );
        for (const l of detached) {
          await this.revertAutoDoneIfOrphan(tx, l.planWorkoutId, {
            autoMarkedWorkoutDone: l.autoMarkedWorkoutDone,
          });
        }
      }

      return { success: true as const };
    };
    return options?.tx
      ? run(options.tx)
      : this.prisma.$transaction(run, { timeout: 60_000 });
  }
}
