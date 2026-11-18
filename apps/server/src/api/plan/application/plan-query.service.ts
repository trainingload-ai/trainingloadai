import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import { addCalendarDays, isCalendarDate } from '@shared/plan-calendar';
import { generationCoverage } from '@shared/rolling-plan';
import {
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { PrismaService } from '@/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { PlanDb } from '../persistence/plan-db';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import {
  plannedStepTotal,
  type PlanExecutionRow,
} from './plan-execution-chart';
import type { ExplorationQuery } from '@shared/training-exploration';
import type { PlanStatus, SportType, ThirdPartyProvider } from '@prisma/client';
import { PlanWorkoutTargetResolver } from './plan-workout-target-resolver.service';

/**
 * Plan 表对外只读/同步 API。其它模块走这里，不要直查 Plan 表。
 */
@Injectable()
export class PlanQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly links: PlanActivityLinkRepository,
    private readonly contexts: CoachContextRepository,
    private readonly loadReadout: LoadReadoutService,
    @Optional()
    private readonly workoutTargetResolver?: PlanWorkoutTargetResolver,
    @Optional() private readonly activityRead?: ActivityReadService,
  ) {}

  /** A dated share/export artifact, deliberately distinct from the finite v1 reusable template. */
  async windowSnapshot(
    userId: string,
    planId: string,
    from: string,
    through: string,
  ) {
    if (
      !isCalendarDate(from) ||
      !isCalendarDate(through) ||
      through < from ||
      through > addCalendarDays(from, 92)
    )
      throw new UnprocessableEntityException(
        'A dated snapshot requires a window of at most 93 days',
      );
    const plan = await this.plans.findFirst({ where: { id: planId, userId } });
    if (!plan || plan.planningMode !== 'ROLLING')
      throw new UnprocessableEntityException('A continuous plan is required');
    const [generations, workouts, strategies] = await Promise.all([
      this.prisma.rollingWeekGeneration.findMany({
        where: {
          planId,
          appliedAt: { not: null },
          supersededAt: null,
          generatedFrom: { lte: new Date(through) },
          generatedThrough: { gte: new Date(from) },
        },
        orderBy: { weekStart: 'asc' },
      }),
      this.workouts.findMany({
        where: {
          planId,
          userId,
          scheduledDate: { gte: new Date(from), lte: new Date(through) },
        },
        orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
        select: {
          scheduledDate: true,
          sessionIndex: true,
          sportType: true,
          name: true,
          notes: true,
          text: true,
          structureKind: true,
          status: true,
          plannedDurationSeconds: true,
          plannedSessionRpe: true,
          estimatedLoad: true,
          estimatedLoadSource: true,
          links: { where: { unlinkedAt: null }, select: { activityId: true } },
        },
      }),
      this.prisma.rollingMonthStrategy.findMany({
        where: {
          planId,
          appliedAt: { not: null },
          supersededAt: null,
          monthStart: { lte: new Date(through) },
          monthEnd: { gte: new Date(from) },
        },
        orderBy: { monthStart: 'asc' },
      }),
    ]);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const observed = this.activityRead
      ? await this.activityRead.findMany({
          where: readyActivityWhere({
            userId,
            startTime: {
              gte: new Date(addCalendarDays(from, -1)),
              lte: new Date(addCalendarDays(through, 2)),
            },
          }),
          select: { id: true, startTime: true, timezone: true },
        })
      : [];
    const activities = observed.filter((a) => {
      const day = activityCalendarYmdInZone(
        a.startTime,
        plan.activationTimezone ?? a.timezone ?? 'UTC',
      );
      return day && day >= from && day <= through;
    });
    const actuals = activities.length
      ? await this.loadReadout.batchGetActualLoad([
          ...new Set(activities.map((a) => a.id)),
        ])
      : new Map<
          number,
          { actualLoad: number | null; actualLoadSource?: string | null }
        >();
    const actualIds = new Set(activities.map((a) => a.id));
    const aggregate = (
      rows: Array<{ value: number | null; source: string | null }>,
    ) => {
      const known = rows.filter(
        (r) => r.value !== null && Number.isFinite(r.value),
      );
      return {
        value: known.length
          ? Math.round(known.reduce((n, r) => n + r.value!, 0) * 10) / 10
          : null,
        unit: 'NORMALIZED_LOAD',
        knownCount: known.length,
        totalCount: rows.length,
        coverage: !rows.length
          ? 'NO_DATA'
          : known.length === rows.length
            ? 'COMPLETE'
            : 'PARTIAL',
        sources: [...new Set(known.map((r) => r.source).filter(Boolean))],
      };
    };
    const load = {
      actual: aggregate(
        activities.map((a) => ({
          value: actuals.get(a.id)?.actualLoad ?? null,
          source: actuals.get(a.id)?.actualLoadSource ?? null,
        })),
      ),
      remainingPlanned: aggregate(
        workouts
          .filter(
            (w) =>
              ['PLANNED', 'IN_PROGRESS'].includes(w.status) &&
              !w.links.some((l) => actualIds.has(l.activityId)),
          )
          .map((w) => ({
            value: w.estimatedLoad,
            source: w.estimatedLoadSource,
          })),
      ),
      ungeneratedForecast: {
        value: null,
        unit: 'NORMALIZED_LOAD',
        coverage: 'UNKNOWN',
        reason:
          'Month directions are forecasts, not completed or generated workout load',
      },
    };
    return {
      load,
      schemaVersion: 2,
      payloadVersion: 'plan-window-v2',
      sourceMode: 'ROLLING',
      snapshotOnly: true,
      title: plan.title,
      goal: plan.goal,
      window: { from, through },
      generationCoverage: generationCoverage(
        from,
        through,
        generations.map((g) => ({
          from: ymd(g.generatedFrom),
          through: ymd(g.generatedThrough),
          weekStart: ymd(g.weekStart),
        })),
      ),
      monthDirections: strategies.map((m) => ({
        monthStart: ymd(m.monthStart),
        effectiveFrom: ymd(m.effectiveFrom),
        revision: m.revision,
        strategy: m.strategy,
      })),
      workouts: workouts.map(({ links: _links, ...w }) => ({
        ...w,
        scheduledDate: w.scheduledDate ? ymd(w.scheduledDate) : null,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  /** Bounded, user-scoped projection for read-only MCP clients. */
  listWorkoutsForMcp(args: {
    userId: string;
    from: Date;
    to: Date;
    offset: number;
    limit: number;
  }) {
    return this.workouts.findMany({
      where: {
        userId: args.userId,
        scheduledDate: { gte: args.from, lte: args.to },
        status: { not: 'MOVED' },
        OR: [{ plan: null }, { plan: { status: { not: 'DRAFT' } } }],
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { sessionIndex: 'asc' },
        { id: 'asc' },
      ],
      skip: args.offset,
      take: args.limit + 1,
      select: {
        id: true,
        scheduledDate: true,
        sportType: true,
        name: true,
        status: true,
        structureKind: true,
        plannedDurationSeconds: true,
        plannedSessionRpe: true,
        estimatedLoad: true,
      },
    });
  }

  /** Detailed user-scoped workout projection without sync credentials. */
  getWorkoutForMcp(userId: string, workoutId: string) {
    return this.workouts.findFirst({
      where: {
        id: workoutId,
        userId,
        status: { not: 'MOVED' },
        OR: [{ plan: null }, { plan: { status: { not: 'DRAFT' } } }],
      },
      select: {
        id: true,
        scheduledDate: true,
        sportType: true,
        name: true,
        text: true,
        notes: true,
        status: true,
        structureKind: true,
        plannedDurationSeconds: true,
        plannedSessionRpe: true,
        estimatedLoad: true,
        steps: {
          orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            parentId: true,
            orderIndex: true,
            stepType: true,
            name: true,
            notes: true,
            intensity: true,
            durationType: true,
            durationValue: true,
            durationUnit: true,
            targetType: true,
            targetValueLow: true,
            targetValueHigh: true,
            targetUnit: true,
            targetZoneIndex: true,
            targetZoneLabel: true,
          },
        },
      },
    });
  }

  /** Bounded, status-based plan adherence facts for read-only MCP clients. */
  getAdherenceForMcp(args: {
    userId: string;
    from: Date;
    to: Date;
    sportTypes?: SportType[];
    limit: number;
  }) {
    return this.workouts.findMany({
      where: {
        userId: args.userId,
        scheduledDate: { gte: args.from, lte: args.to },
        status: { not: 'MOVED' },
        ...(args.sportTypes?.length
          ? { sportType: { in: args.sportTypes } }
          : {}),
        OR: [{ plan: null }, { plan: { status: { not: 'DRAFT' } } }],
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { sessionIndex: 'asc' },
        { id: 'asc' },
      ],
      take: args.limit + 1,
      select: {
        scheduledDate: true,
        sportType: true,
        status: true,
        plannedDurationSeconds: true,
        estimatedLoad: true,
      },
    });
  }

  /** Bounded, user-scoped plan discovery without generation metadata. */
  listPlansForMcp(args: {
    userId: string;
    from: Date;
    to: Date;
    statuses?: PlanStatus[];
    offset: number;
    limit: number;
  }) {
    return this.plans.findMany({
      where: {
        userId: args.userId,
        ...(args.statuses?.length ? { status: { in: args.statuses } } : {}),
        OR: [
          { startDate: { gte: args.from, lte: args.to } },
          { endDate: { gte: args.from, lte: args.to } },
          { startDate: { lte: args.from }, endDate: { gte: args.to } },
          {
            planningMode: 'ROLLING',
            startDate: { lte: args.to },
            endDate: null,
          },
          {
            startDate: null,
            endDate: null,
            updatedAt: { gte: args.from, lte: args.to },
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: args.offset,
      take: args.limit + 1,
      select: {
        id: true,
        title: true,
        description: true,
        goal: true,
        status: true,
        planningMode: true,
        generatedThrough: true,
        periodWeeks: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
    });
  }

  async readExecutionChart(userId: string, q: ExplorationQuery) {
    const workouts = await this.workouts.findMany({
      where: {
        userId,
        ...(q.planId ? { planId: q.planId } : {}),
        status: { not: 'MOVED' },
        scheduledDate: { gte: new Date(q.from!), lte: new Date(q.to!) },
        ...(q.sportTypes?.length
          ? { sportType: { in: q.sportTypes as SportType[] } }
          : {}),
        OR: [{ plan: null }, { plan: { userId, status: { not: 'DRAFT' } } }],
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { sessionIndex: 'asc' },
        { id: 'asc' },
      ],
      take: 1001,
      include: {
        steps: true,
        links: {
          where: {
            role: 'PRIMARY',
            unlinkedAt: null,
            activity: readyActivityWhere({ userId }),
          },
          select: {
            activity: { select: { id: true, timerTime: true, distance: true } },
          },
        },
      },
    });
    const selected = workouts.slice(0, 1000);
    const ids = selected.flatMap((w) => w.links.map((l) => l.activity.id));
    // Ambiguous PRIMARY links do not count the same activity twice.
    const counts = new Map<number, number>();
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    const loads = q.measures?.includes('LOAD')
      ? await this.loadReadout.batchGetActualLoad([...new Set(ids)])
      : new Map();
    let missing = 0;
    const rows: PlanExecutionRow[] = selected.map((w) => {
      const linked =
        w.links.length === 1 && counts.get(w.links[0].activity.id) === 1
          ? w.links[0].activity
          : null;
      if (!linked) missing++;
      return {
        id: w.id,
        name: w.name,
        date: w.scheduledDate!.toISOString().slice(0, 10),
        planned: {
          DURATION_MIN:
            w.plannedDurationSeconds != null
              ? w.plannedDurationSeconds / 60
              : plannedStepTotal(w.steps, 'DURATION_MIN'),
          DISTANCE_KM: plannedStepTotal(w.steps, 'DISTANCE_KM'),
          LOAD: w.estimatedLoad,
        },
        actual: {
          DURATION_MIN:
            linked?.timerTime != null ? linked.timerTime / 60 : null,
          DISTANCE_KM: linked?.distance != null ? linked.distance / 1000 : null,
          LOAD: linked ? (loads.get(linked.id)?.actualLoad ?? null) : null,
        },
      };
    });
    return { rows, missing, truncated: workouts.length > 1000 };
  }

  /** Narrow evidence query for consented assessment follow-ups; no plan mutation. */
  findFitnessTestWorkout(userId: string, workoutId: string) {
    return this.workouts.findFirst({
      where: { id: workoutId, userId },
      include: {
        plan: true,
        links: {
          where: { unlinkedAt: null, role: 'PRIMARY' },
          include: {
            activity: {
              include: {
                parquetFiles: { orderBy: { id: 'asc' } },
                activitySources: { orderBy: { id: 'asc' } },
                laps: { orderBy: { startTime: 'asc' } },
              },
            },
          },
        },
      },
    });
  }

  countActivePlans() {
    return this.plans.countActive();
  }

  countPlansCreatedBetween(start: Date, end: Date) {
    return this.plans.countCreatedBetween(start, end);
  }

  countActivePlansCreatedBetween(start: Date, end: Date) {
    return this.plans.count({
      where: { createdAt: { gte: start, lt: end }, status: 'ACTIVE' },
    });
  }

  findActiveDateRange(userId: string) {
    return this.plans.findActiveForUser(userId, {
      startDate: true,
      endDate: true,
    });
  }

  findLinkCandidatesForDates(userId: string, dates: string[]) {
    return this.workouts.findMany({
      where: {
        userId,
        OR: [{ planId: null }, { plan: { status: 'ACTIVE' } }],
        scheduledDate: {
          in: dates.map((date) => new Date(`${date}T00:00:00Z`)),
        },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: { scheduledDate: true, sportType: true },
    });
  }

  findPlanTitle(planId: string) {
    return this.plans.findUnique({
      where: { id: planId },
      select: { id: true, title: true },
    });
  }

  /** A completed cycle needs a next-plan suggestion only until a successor exists.
   * Include historical activations so an old suggestion cannot reappear after
   * that successor is itself finished or cancelled. Ownership is always scoped.
   */
  async findNextCycleEligiblePlanIds(
    userId: string,
    planIds: string[],
  ): Promise<string[]> {
    if (!planIds.length) return [];
    const plans = await this.plans.findMany({
      where: { userId, status: { not: 'DRAFT' } },
      select: { id: true, status: true, completedAt: true, activatedAt: true },
    });
    return plans
      .filter(
        (source) =>
          planIds.includes(source.id) &&
          source.status === 'COMPLETED' &&
          source.completedAt &&
          !plans.some(
            (other) =>
              other.id !== source.id &&
              (['ACTIVE', 'SCHEDULED', 'PAUSED'].includes(other.status) ||
                (other.activatedAt &&
                  other.activatedAt >= source.completedAt!)),
          ),
      )
      .map((plan) => plan.id);
  }

  async findCalendarFeedPlans(userId: string) {
    const plans = await this.plans.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] },
      },
      orderBy: [{ startDate: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        supersededBy: {
          select: { status: true, startDate: true },
        },
        updatedAt: true,
        workouts: {
          where: { scheduledDate: { not: null } },
          orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
          select: {
            id: true,
            updatedAt: true,
            scheduledDate: true,
            sessionIndex: true,
            sportType: true,
            name: true,
            text: true,
            notes: true,
            status: true,
          },
        },
      },
    });
    return plans.map((plan) => {
      const starts = plan.startDate?.toISOString().slice(0, 10) ?? null;
      const cutoff =
        plan.supersededBy?.status === 'SCHEDULED'
          ? (plan.supersededBy.startDate?.toISOString().slice(0, 10) ?? null)
          : null;
      return {
        ...plan,
        workouts: plan.workouts.filter((workout) => {
          const date = workout.scheduledDate?.toISOString().slice(0, 10);
          if (!date) return false;
          if (plan.status === 'SCHEDULED')
            return Boolean(starts && date >= starts);
          return !cutoff || date < cutoff;
        }),
      };
    });
  }

  findExportPlansCutoff(userId: string, cutoff: Date) {
    return this.plans.findMany({
      where: { userId, createdAt: { lte: cutoff } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        automationPolicies: {
          where: { createdAt: { lte: cutoff } },
          select: {
            revision: true,
            settings: true,
            effectiveFrom: true,
            revokedAt: true,
          },
        },
        monthStrategies: {
          where: { createdAt: { lte: cutoff } },
          select: {
            monthStart: true,
            monthEnd: true,
            effectiveFrom: true,
            revision: true,
            strategy: true,
            appliedAt: true,
            supersededAt: true,
          },
        },
        weekGenerations: {
          where: { createdAt: { lte: cutoff } },
          select: {
            weekStart: true,
            weekEnd: true,
            generatedFrom: true,
            generatedThrough: true,
            revision: true,
            appliedAt: true,
            supersededAt: true,
          },
        },
      },
    });
  }

  findExportWorkoutsCutoff(userId: string, cutoff: Date) {
    return this.workouts.findMany({
      where: { userId, createdAt: { lte: cutoff } },
      include: {
        steps: { orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }] },
        strengthExercises: {
          include: { setGroups: { orderBy: { orderIndex: 'asc' } } },
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findWorkoutsByIdsForUser(
    userId: string,
    ids: string[],
  ): Promise<
    Array<{
      id: string;
      status: string;
      plan?: { status: string } | null;
    }>
  > {
    return this.workouts.findMany({
      where: { id: { in: ids }, userId },
      include: { plan: { select: { status: true } } },
    });
  }

  findActiveOrPausedPlanIds(userId: string, ids: string[]) {
    return this.plans.findMany({
      where: {
        id: { in: ids },
        userId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      select: { id: true },
    });
  }

  async findExportablePlan(args: {
    userId: string;
    planId: string;
    workoutIds?: string[];
    today: Date;
  }) {
    const workoutIdSet =
      args.workoutIds && args.workoutIds.length
        ? Array.from(new Set(args.workoutIds.filter((id) => id?.trim())))
        : null;
    const plan = await this.plans.findFirst({
      where: {
        id: args.planId,
        userId: args.userId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      include: {
        workouts: {
          where: {
            ...(workoutIdSet ? { id: { in: workoutIdSet } } : {}),
            scheduledDate: { gte: args.today },
            status: { in: ['PLANNED', 'IN_PROGRESS', 'MOVED'] },
          },
          include: {
            steps: {
              orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
            },
          },
          orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
        },
      },
    });
    if (!plan || !this.workoutTargetResolver) return plan;
    return {
      ...plan,
      workouts: await this.workoutTargetResolver.resolveWorkouts(
        args.userId,
        plan.workouts,
      ),
    };
  }

  findDeletableScheduledWorkouts(args: {
    userId: string;
    workoutIds: string[];
    today: Date;
  }) {
    return this.workouts.findMany({
      where: {
        id: { in: args.workoutIds },
        plan: { userId: args.userId },
        scheduledDate: { gte: args.today },
        status: { not: 'DONE' },
      },
      orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
    });
  }

  async findActiveWindowWorkouts(args: {
    userId: string;
    from: Date;
    to: Date;
    statuses: string[];
  }) {
    const workouts = await this.workouts.findMany({
      where: {
        userId: args.userId,
        plan: { status: 'ACTIVE' },
        scheduledDate: { gte: args.from, lt: args.to },
        status: {
          in: args.statuses as Prisma.EnumPlanWorkoutStatusFilter['in'],
        },
      },
      include: {
        plan: { select: { title: true, description: true, goal: true } },
        steps: {
          where: { parentId: null },
          orderBy: { orderIndex: 'asc' },
          include: { children: { orderBy: { orderIndex: 'asc' } } },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
    });
    return this.workoutTargetResolver
      ? this.workoutTargetResolver.resolveWorkouts(args.userId, workouts)
      : workouts;
  }

  /** 第三方导出专用读取：动态区间必须在生成设备 payload 前按当前设置解析。 */
  async findWorkoutForExternalExport(
    userId: string,
    workoutId: string,
    provider: ThirdPartyProvider,
  ) {
    const workout = await this.workouts.findFirst({
      where: { id: workoutId, userId },
      include: {
        plan: { select: { title: true, description: true, goal: true } },
        steps: {
          where: { parentId: null },
          orderBy: { orderIndex: 'asc' },
          include: { children: { orderBy: { orderIndex: 'asc' } } },
        },
        externalMappings: { where: { provider } },
      },
    });
    if (!workout || !this.workoutTargetResolver) return workout;
    return this.workoutTargetResolver.resolveWorkout(userId, workout);
  }

  findIncompleteWindowWorkouts(args: {
    userId: string;
    planId: string;
    periodStart: Date;
    periodEnd: Date;
  }) {
    return this.workouts.findMany({
      where: {
        userId: args.userId,
        planId: args.planId,
        scheduledDate: { gte: args.periodStart, lt: args.periodEnd },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: { id: true, status: true },
      take: 8,
    });
  }

  /** Coach Review v4 的窗口课次事实；不在查询层做教练判断。 */
  findReviewWindowWorkouts(args: {
    userId: string;
    planId: string;
    periodStart: Date;
    periodEnd: Date;
  }) {
    return this.workouts.findMany({
      where: {
        userId: args.userId,
        planId: args.planId,
        scheduledDate: { gte: args.periodStart, lt: args.periodEnd },
      },
      select: {
        id: true,
        scheduledDate: true,
        dayOffset: true,
        sessionIndex: true,
        sportType: true,
        status: true,
        name: true,
        notes: true,
        text: true,
        structureKind: true,
        dslVersion: true,
        plannedDurationSeconds: true,
        plannedSessionRpe: true,
        estimatedLoad: true,
        links: {
          where: { unlinkedAt: null },
          select: { activityId: true, role: true, source: true },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
    });
  }

  findTargetExternalEventId(activityId: number, provider: ThirdPartyProvider) {
    return this.links.findFirst({
      where: { activityId, unlinkedAt: null },
      orderBy: { linkedAt: 'desc' },
      select: {
        planWorkout: {
          select: {
            externalMappings: {
              where: { provider, syncState: 'SYNCED' },
              select: { externalEventId: true },
              take: 1,
            },
          },
        },
      },
    });
  }

  findActiveLinkByActivityId(activityId: number, tx?: PlanDb) {
    return this.links.findFirst(
      {
        where: { activityId, unlinkedAt: null },
        select: { id: true },
      },
      tx,
    );
  }

  findPrimaryLinkByWorkoutId(planWorkoutId: string, tx?: PlanDb) {
    return this.links.findFirst(
      {
        where: {
          planWorkoutId,
          unlinkedAt: null,
          role: 'PRIMARY',
        },
        select: { id: true },
      },
      tx,
    );
  }

  findLinkableWorkout(args: { userId: string; workoutId: string }) {
    return this.workouts.findFirst({
      where: {
        id: args.workoutId,
        plan: {
          userId: args.userId,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        status: { in: ['PLANNED', 'IN_PROGRESS', 'MOVED'] },
      },
      select: { id: true, planId: true },
    });
  }

  findLinkableWorkoutsForUser(userId: string) {
    return this.workouts.findMany({
      where: {
        plan: {
          userId,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        status: { in: ['PLANNED', 'IN_PROGRESS', 'MOVED'] },
      },
      select: { id: true, planId: true },
    });
  }

  findExternalWorkoutMapping(
    userId: string,
    provider: ThirdPartyProvider,
    externalUid: string,
  ) {
    return this.links.findMapping({
      where: {
        userId,
        provider,
        externalUid,
        planWorkoutId: { not: null },
      },
      select: {
        planWorkout: { select: { id: true, planId: true, status: true } },
      },
    });
  }

  findMappings<T extends Prisma.PlanWorkoutExternalMappingFindManyArgs>(
    args?: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingFindManyArgs
    >,
    tx?: PlanDb,
  ) {
    return this.links.findMappings(args, tx);
  }

  findMapping<T extends Prisma.PlanWorkoutExternalMappingFindFirstArgs>(
    args?: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingFindFirstArgs
    >,
    tx?: PlanDb,
  ) {
    return this.links.findMapping(args, tx);
  }

  findMappingUnique<T extends Prisma.PlanWorkoutExternalMappingFindUniqueArgs>(
    args: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingFindUniqueArgs
    >,
    tx?: PlanDb,
  ) {
    return this.links.findMappingUnique(args, tx);
  }

  updateMapping<T extends Prisma.PlanWorkoutExternalMappingUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.links.updateMapping(args, tx);
  }

  upsertMapping<T extends Prisma.PlanWorkoutExternalMappingUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingUpsertArgs>,
    tx?: PlanDb,
  ) {
    return this.links.upsertMapping(args, tx);
  }

  createMapping<T extends Prisma.PlanWorkoutExternalMappingCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.links.createMapping(args, tx);
  }

  findPlan<T extends Prisma.PlanFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.plans.findFirst(args, tx);
  }

  findWorkout<T extends Prisma.PlanWorkoutFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.workouts.findFirst(args, tx);
  }

  findWorkouts<T extends Prisma.PlanWorkoutFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.workouts.findMany(args, tx);
  }

  findSetGroups<T extends Prisma.PlanWorkoutSetGroupFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutSetGroupFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.workouts.findSetGroups(args, tx);
  }

  findLink<T extends Prisma.PlanWorkoutActivityLinkFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.links.findFirst(args, tx);
  }

  createLink<T extends Prisma.PlanWorkoutActivityLinkCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.links.create(args, tx);
  }

  updateLink<T extends Prisma.PlanWorkoutActivityLinkUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.links.update(args, tx);
  }

  updateWorkout<T extends Prisma.PlanWorkoutUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.workouts.update(args, tx);
  }

  async findRelatedCalendarPage(args: {
    userId: string;
    planId: string;
    from: string;
    to: string;
    offset: number;
    limit: number;
  }) {
    const where = {
      userId: args.userId,
      OR: [{ planId: null }, { planId: { not: args.planId } }],
      scheduledDate: {
        gte: new Date(`${args.from}T00:00:00Z`),
        lte: new Date(`${args.to}T00:00:00Z`),
      },
    };
    const [total, workouts] = await Promise.all([
      this.workouts.count({ where }),
      this.workouts.findMany({
        where,
        orderBy: [
          { scheduledDate: 'asc' },
          { sessionIndex: 'asc' },
          { id: 'asc' },
        ],
        skip: args.offset,
        take: args.limit,
        select: {
          id: true,
          planId: true,
          revision: true,
          scheduledDate: true,
          sessionIndex: true,
          sportType: true,
          name: true,
          text: true,
          notes: true,
          status: true,
          plannedDurationSeconds: true,
          plannedSessionRpe: true,
          structureKind: true,
          links: { where: { unlinkedAt: null }, select: { id: true } },
        },
      }),
    ]);
    const nextOffset = args.offset + workouts.length;
    return {
      from: args.from,
      to: args.to,
      total,
      offset: args.offset,
      returned: workouts.length,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
      workouts: workouts.map((w) => ({
        ...w,
        scheduledDate: w.scheduledDate?.toISOString().slice(0, 10) ?? null,
        activeActivityLinkCount: w.links.length,
        links: undefined,
      })),
    };
  }

  async findCoachPlanSnapshot(args: {
    asOf?: string;
    calendarFrom?: string;
    calendarTo?: string;
    userId: string;
    planId?: string;
    status?: string | string[];
    orderBy?: Prisma.PlanFindFirstArgs['orderBy'];
    includeCoachSummary?: boolean;
  }) {
    const where: Prisma.PlanWhereInput = {
      userId: args.userId,
      ...(args.planId ? { id: args.planId } : {}),
      ...(args.status
        ? {
            status: Array.isArray(args.status)
              ? { in: args.status as Prisma.EnumPlanStatusFilter['in'] }
              : (args.status as Prisma.PlanWhereInput['status']),
          }
        : {}),
    };
    const scalar = await this.plans.findFirst({ where, orderBy: args.orderBy });
    if (!scalar) return null;
    const anchor =
      args.asOf && isCalendarDate(args.asOf)
        ? args.asOf
        : new Date().toISOString().slice(0, 10);
    const from = args.calendarFrom ?? addCalendarDays(anchor, -28),
      through = args.calendarTo ?? addCalendarDays(anchor, 84);
    if (
      scalar.planningMode === 'ROLLING' &&
      (!isCalendarDate(from) ||
        !isCalendarDate(through) ||
        through < from ||
        through > addCalendarDays(from, 366))
    )
      throw new UnprocessableEntityException(
        'Continuous coach reads require a bounded calendar window',
      );
    const bounded = scalar.planningMode === 'ROLLING';
    const workoutsInclude = {
      ...(bounded
        ? {
            where: {
              scheduledDate: { gte: new Date(from), lte: new Date(through) },
            },
          }
        : {}),
      orderBy: [
        { dayOffset: 'asc' as const },
        { sessionIndex: 'asc' as const },
      ],
      include: {
        links: {
          where: { unlinkedAt: null },
          orderBy: { linkedAt: 'asc' as const },
        },
      },
    };
    const plan = await this.plans.findFirst({
      where,
      orderBy: args.orderBy,
      include: {
        workouts: workoutsInclude,
        coachSummary: args.includeCoachSummary ?? false,
        weekGenerations: {
          where: {
            appliedAt: { not: null },
            supersededAt: null,
            generatedFrom: { lte: new Date(through) },
            generatedThrough: { gte: new Date(from) },
          },
          orderBy: { weekStart: 'asc' },
        },
      },
    });
    if (!plan) return null;
    return {
      ...plan,
      ...(bounded
        ? {
            workoutWindow: { from, through, bounded: true },
            generationCoverage: generationCoverage(
              from,
              through,
              plan.weekGenerations.map((g) => ({
                from: g.generatedFrom.toISOString().slice(0, 10),
                through: g.generatedThrough.toISOString().slice(0, 10),
                weekStart: g.weekStart.toISOString().slice(0, 10),
              })),
            ),
          }
        : {}),
    };
  }

  findContextById<T extends Prisma.CoachContextSelect>(
    id: string,
    select?: Prisma.Subset<T, Prisma.CoachContextSelect>,
    db?: PlanDb,
  ) {
    if (select) {
      return this.contexts.findUnique(
        {
          where: { id },
          select,
        },
        db,
      );
    }
    return this.contexts.findUnique(
      {
        where: { id },
      },
      db,
    );
  }

  findContextByPlan(userId: string, planId: string) {
    return this.contexts.findFirst({
      where: { userId, planId },
      select: { id: true, planId: true, status: true },
    });
  }

  findRecentReviewEvents(args: {
    userId: string;
    planId: string;
    type: 'REVIEW_DAILY' | 'REVIEW_WEEKLY' | 'REVIEW_MONTHLY';
    take?: number;
  }) {
    return this.contexts.findEvents({
      where: {
        type: args.type,
        context: { userId: args.userId, planId: args.planId },
      },
      select: { id: true, dedupeKey: true, payload: true },
      orderBy: { occurredAt: 'desc' },
      take: args.take ?? 20,
    });
  }

  async createAutoPrimaryLink(args: {
    userId: string;
    activityId: number;
    planId: string;
    planWorkoutId: string;
    activityStartTime: Date | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(tx, args.userId);
      const current = await this.workouts.findFirst(
        {
          where: {
            id: args.planWorkoutId,
            userId: args.userId,
            planId: args.planId,
          },
        },
        tx,
      );
      if (!current)
        throw new UnprocessableEntityException('Workout no longer exists');
      const autoMarked = await this.workouts.markDoneIfApplicable(
        args.planWorkoutId,
        args.activityStartTime,
        tx,
      );
      const link = await this.links.create(
        {
          data: {
            planId: args.planId,
            planWorkoutId: args.planWorkoutId,
            activityId: args.activityId,
            source: 'AUTO',
            role: 'PRIMARY',
            autoMarkedWorkoutDone: autoMarked,
          },
        },
        tx,
      );
      return {
        linkId: link.id,
        activityId: args.activityId,
        planId: args.planId,
        planWorkoutId: args.planWorkoutId,
        autoMarkedWorkoutDone: autoMarked,
      };
    });
  }
}
