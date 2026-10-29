import { BadRequestException, Injectable } from '@nestjs/common';
import {
  $Enums,
  BodyMetricType,
  PlanWorkoutActivityLinkRole,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { ActivityReadService } from '../../activity/activity-read.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import {
  activityCalendarYmdInZone,
  activityLocalTimingInZone,
  scheduledDateFromCalendar,
} from '../plan-link-calendar.util';
import { CompetitionImpactService } from '../../competition/competition-impact.service';
import { PMCService } from '@/training-load/pmc.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import type {
  CompetitionEventImpactAssessment,
  CompetitionImpactConstraint,
  CompetitionImpactInputEvent,
  CompetitionImpactPhase,
  CompetitionImpactResult,
} from '../../competition/competition-impact.types';

/** 调用来源。只做追溯，不改变快照怎么算。 */
export type PlanExecutionSurface =
  | 'HOME_TODAY'
  | 'PLAN_SIDEBAR'
  | 'DAY'
  | 'WORKOUT'
  | 'ACTIVITY'
  | 'COACH_CHAT';

/**
 * 锚点当天：计划课 vs 实际活动对上之后的完成口径。
 * - NO_PLAN：没有 ACTIVE 计划
 * - REST_DAY：有计划，当天没排课、也没有计划外活动
 * - PLANNED：有课，还没完成、也没关联活动
 * - PARTIAL：当天课只完成一部分，或已有关联活动但课还没全部 DONE
 * - COMPLETED：当天计划课全部 DONE
 * - EXTRA_ACTIVITY：当天没排课，但有计划外活动
 */
export type PlanExecutionCompletionState =
  | 'NO_PLAN'
  | 'REST_DAY'
  | 'PLANNED'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'EXTRA_ACTIVITY';

/** 当天一条活动，已折到用户时区，并带上是否挂到某节计划课。 */
export type PlanExecutionActivity = {
  id: number;
  hashId: string;
  title: string | null;
  sportType: string | null;
  startTime: string | null;
  timezone: string | null;
  localDate: string | null;
  localStartTime: string | null;
  localHour: number | null;
  dayPeriod: 'night' | 'morning' | 'afternoon' | 'evening' | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  load: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  sessionRpe: number | null;
  updatedAt: string | null;
  linkedPlanWorkout: {
    planId: string;
    workoutId: string;
    source: string;
    role: string;
  } | null;
};

/** 一节计划课，以及已经关联上的活动。weekIndex/dayIndex 由 dayOffset 推出来。 */
export type PlanExecutionWorkout = {
  id: string;
  planId: string;
  scheduledDate: string | null;
  weekIndex: number | null;
  dayIndex: number | null;
  sessionIndex: number | null;
  sportType: string;
  status: string;
  name: string | null;
  notes: string | null;
  text: string;
  structureKind: string;
  dslVersion: number;
  plannedDurationSeconds: number | null;
  plannedSessionRpe: number | null;
  expectedLoad: number | null;
  updatedAt: string | null;
  linkedActivities: PlanExecutionActivity[];
};

/**
 * 计划执行事实快照。只描述「这一天实际怎样」，不做要不要改计划的判断。
 * 首页、今日建议、教练工具、日/周 Runtime 读同一份，避免各算各的。
 */
export type PlanExecutionContext = {
  /** 这份计划的教练账本 CoachContext.id */
  contextId: string | null;
  /** 账本最新事件序号。变了说明教练侧状态变了。 */
  contextHeadEventSeq: number | null;
  userId: string;
  /** 这次快照钉在哪一天、哪份计划、哪节课。 */
  anchor: {
    surface: PlanExecutionSurface;
    anchorDate: string;
    timezone: string | null;
    planId: string | null;
    planWorkoutId: string | null;
    activityId: number | null;
    sourceNode?: unknown;
  };
  plan: {
    id: string;
    title: string;
    goal: string | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    periodWeeks: number | null;
    currentWeekIndex: number | null;
    currentDayIndex: number | null;
    updatedAt: string | null;
  } | null;
  /** 锚点当天：计划课、已关联活动、计划外活动、完成口径。 */
  day: {
    date: string;
    plannedWorkouts: PlanExecutionWorkout[];
    linkedActivities: PlanExecutionActivity[];
    unlinkedActivities: PlanExecutionActivity[];
    completionState: PlanExecutionCompletionState;
  };
  tomorrow: {
    date: string;
    plannedWorkouts: PlanExecutionWorkout[];
  };
  /** 入参指定的课；没指定则取当天第一节。 */
  currentWorkout: PlanExecutionWorkout | null;
  /** 入参指定的活动，或 currentWorkout 上第一条关联活动。 */
  linkedActivity: PlanExecutionActivity | null;
  /** 锚点之后最多 3 节，给「下一练」用。 */
  nextWorkouts: PlanExecutionWorkout[];
  recentLoad: {
    /** 慢性训练负荷 */
    ctl: number | null;
    /** 急性训练负荷 */
    atl: number | null;
    /** 状态（CTL − ATL） */
    tsb: number | null;
    currentWeekLoad: number | null;
    previousWeekLoad: number | null;
    /** 锚点往前 7 天，最旧在前。缺日补 0。 */
    dailyLoadLast7d: number[];
    restDaysLast14d: number | null;
  };
  /** 最近 10 条教练事件，升序。给 Runtime 看「已经想过什么」。 */
  recentEvents: Array<{
    seq: number;
    type: string;
    occurredAt: string;
    payload: unknown;
  }>;
  /** 比赛对锚点当天训练的影响。评估失败时 status=UNAVAILABLE，不阻断快照。 */
  competitionContext: {
    status: 'CURRENT' | 'FALLBACK' | 'UNAVAILABLE';
    assessmentId: string | null;
    inputHash: string | null;
    assessedAt: string | null;
    /** 锚点当天及之后的比赛。 */
    upcomingEvents: Array<{
      id: string;
      title: string;
      startDate: string;
      endDate: string | null;
      sportType: string;
      importance: string;
      daysFromAnchor: number;
    }>;
    /** 锚点前 56 天内已结束的比赛。 */
    recentEvents: Array<{
      id: string;
      title: string;
      startDate: string;
      endDate: string | null;
      sportType: string;
      importance: string;
      daysFromAnchor: number;
    }>;
    /** 锚点落在影响窗口内的比赛约束（减量、避免强度等）。 */
    activeInfluences: Array<{
      eventId: string;
      eventTitle: string;
      eventStartDate: string;
      eventDistanceMeters: number | null;
      athleteImportance: string;
      daysFromAnchor: number;
      impactLevel: string;
      phase: string | null;
      constraints: unknown[];
      confidence: number | null;
      reasoningSummary: string;
    }>;
    combinedConflicts: unknown[];
  };
  /** 事实指纹。计划/活动/负荷没变则不变，Runtime 用来去重。 */
  factHash: string;
};

/** 组装快照的入参。只给 userId + surface 时，落到 ACTIVE 计划和用户本地今天。 */
export type BuildPlanExecutionContextArgs = {
  userId: string;
  surface: PlanExecutionSurface;
  timezone?: string | null;
  planId?: string | null;
  contextId?: string | null;
  planWorkoutId?: string | null;
  activityId?: number | string | null;
  anchorDate?: string | null;
  sourceNode?: unknown;
};

type ActivityLoadInput = {
  coggan?: { bikeStress: number | null } | null;
  bikeScore?: { bikeScore: number | null } | null;
  govss?: { govss: number | null } | null;
  swimScore?: { swimScore: number | null } | null;
  trimp?: { trimp100: number | null } | null;
};

const EXECUTION_ACTIVITY_INCLUDE = {
  coggan: { select: { bikeStress: true } },
  bikeScore: { select: { bikeScore: true } },
  govss: { select: { govss: true } },
  swimScore: { select: { swimScore: true } },
  trimp: { select: { trimp100: true } },
  planWorkoutLinks: {
    where: { unlinkedAt: null },
    include: {
      planWorkout: {
        select: { id: true, planId: true },
      },
    },
  },
} satisfies Prisma.ActivityInclude;

type ExecutionActivityRow = Prisma.ActivityGetPayload<{
  include: typeof EXECUTION_ACTIVITY_INCLUDE;
}>;

const EXECUTION_WORKOUT_INCLUDE = {
  links: {
    where: { unlinkedAt: null },
    include: {
      activity: {
        include: EXECUTION_ACTIVITY_INCLUDE,
      },
    },
  },
} satisfies Prisma.PlanWorkoutInclude;

type ExecutionWorkoutRow = Prisma.PlanWorkoutGetPayload<{
  include: typeof EXECUTION_WORKOUT_INCLUDE;
}>;

type ResolvedAnchor = {
  planId: string | null;
  planWorkoutId: string | null;
  activityId: number | null;
  anchorDate: string | null;
  anchorActivity: ExecutionActivityRow | null;
};

type SnapshotPlanRow = {
  id: string;
  title: string;
  goal: string | null;
  status: unknown;
  startDate: Date | null;
  endDate: Date | null;
  periodWeeks: number;
  updatedAt: Date | null;
};

type SnapshotRows = {
  plan: SnapshotPlanRow | null;
  coachContext: { id: string; headEventSeq: number } | null;
  workouts: ExecutionWorkoutRow[];
  dayActivities: ExecutionActivityRow[];
  latestPmc: { CTL: number; ATL: number; TSB: number } | null;
  pmcRows: Array<{
    date: Date;
    dailyValue: number;
    CTL?: number;
    ATL?: number;
    TSB?: number;
  }>;
};

function isCompetitionImpactEvent(
  value: unknown,
): value is CompetitionImpactInputEvent {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.startDate === 'string';
}

/** Date / ISO → YYYY-MM-DD（UTC）。给 PlanWorkout.scheduledDate 这类 DATE 用。 */
function ymdFromDate(date?: Date | string | null): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** 日历日加减。走 UTC 日期，避免本地时区把「加一天」算歪。 */
function addDaysYmd(ymd: string, days: number): string {
  const scheduled = scheduledDateFromCalendar(ymd);
  scheduled.setUTCDate(scheduled.getUTCDate() + days);
  return scheduled.toISOString().slice(0, 10);
}

/** 附近课次一次最多捞多少节。今天 + 明天 + 后面几节，够切出 nextWorkouts。 */
const NEARBY_WORKOUT_LIMIT = 16;
/** 快照里「下一练」最多展示几节。 */
const NEXT_WORKOUT_LIMIT = 3;

/** 同一批已排序课次切成当天 / 明天 / 锚点之后。next 含明天。 */
function sliceWorkoutsAroundAnchor(
  workouts: PlanExecutionWorkout[],
  anchorDate: string,
): {
  today: PlanExecutionWorkout[];
  tomorrow: PlanExecutionWorkout[];
  next: PlanExecutionWorkout[];
} {
  const tomorrowDate = addDaysYmd(anchorDate, 1);
  return {
    today: workouts.filter((workout) => workout.scheduledDate === anchorDate),
    tomorrow: workouts.filter(
      (workout) => workout.scheduledDate === tomorrowDate,
    ),
    next: workouts
      .filter(
        (workout) =>
          workout.scheduledDate != null && workout.scheduledDate > anchorDate,
      )
      .slice(0, NEXT_WORKOUT_LIMIT),
  };
}

/** 当天活动：挂在当前计划上的 vs 完全没挂钩的。 */
function partitionDayActivities(
  activities: PlanExecutionActivity[],
  planId: string | null,
): {
  linked: PlanExecutionActivity[];
  unlinked: PlanExecutionActivity[];
} {
  return {
    linked: activities.filter(
      (activity) => activity.linkedPlanWorkout?.planId === planId,
    ),
    unlinked: activities.filter((activity) => !activity.linkedPlanWorkout),
  };
}

function roundNumber(value: unknown, digits = 0): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** 对象键排序后再序列化，保证同一份事实得到同一个 factHash。 */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`)
    .join(',')}}`;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 活动负荷：TSS / BikeScore / GOVSS / SwimScore / TRIMP，取第一个有值的。 */
function resolveActivityLoad(value: ActivityLoadInput): number | null {
  const candidates = [
    value.coggan?.bikeStress,
    value.bikeScore?.bikeScore,
    value.govss?.govss,
    value.swimScore?.swimScore,
    value.trimp?.trimp100,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.round(candidate);
    }
  }
  return null;
}

/**
 * 把「某用户在某个日历日」的计划执行事实收成一份只读快照。
 *
 * 不写 PlanWorkout，也不决定推迟/跳过。调用方拿这份事实再判断：
 * Runtime 用来想下一练，今日建议/对话用来展示和提问。
 */
@Injectable()
export class PlanExecutionContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pmcService: PMCService,
    private readonly competitionImpactService: CompetitionImpactService,
    private readonly userService: UserService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly contexts: CoachContextRepository,
    private readonly activityRead: ActivityReadService,
    private readonly users: UserQueryService,
  ) {}

  /**
   * 组装执行快照。
   *
   * 1. 定锚点：看哪一天、哪份计划（可由课次/活动/contextId 反推）。
   * 2. 并行拉原始行：计划、账本指针、附近课次窗口、当天活动、PMC。
   * 3. 切成当天/明天/下一练，再打 factHash。
   */
  async buildContext(
    args: BuildPlanExecutionContextArgs,
  ): Promise<PlanExecutionContext> {
    const timezone =
      (await this.loadUserTimezone(args.userId)) ??
      this.normalizeOptionalTimezone(args.timezone);
    const resolved = await this.resolveAnchor(args, timezone);
    const anchorDate =
      resolved.anchorDate ||
      this.localDateYmd(new Date(), timezone) ||
      new Date().toISOString().slice(0, 10);

    const rows = await this.loadSnapshotRows({
      userId: args.userId,
      planId: resolved.planId,
      planWorkoutId: resolved.planWorkoutId,
      anchorDate,
      timezone,
    });
    const [recentEvents, competitionContext] = await Promise.all([
      this.loadRecentCoachEvents(rows.coachContext?.id ?? null),
      this.buildCompetitionContext({
        userId: args.userId,
        anchorDate,
        plan: rows.plan,
      }),
    ]);

    return this.assembleContext({
      args,
      resolved,
      timezone,
      anchorDate,
      rows,
      recentEvents,
      competitionContext,
    });
  }

  /**
   * 互不依赖的原始行，一次并行打出。
   * 课次只捞「附近窗口」，不在这里区分今天/明天/下一练。
   */
  private async loadSnapshotRows(args: {
    userId: string;
    planId: string | null;
    planWorkoutId: string | null;
    anchorDate: string;
    timezone: string | null;
  }): Promise<SnapshotRows> {
    const [plan, coachContext, workouts, dayActivities, pmc] =
      await Promise.all([
        this.loadPlanSummary(args.userId, args.planId),
        this.loadCoachContextPointer(args.planId),
        this.loadNearbyWorkouts({
          planId: args.planId,
          planWorkoutId: args.planWorkoutId,
          anchorDate: args.anchorDate,
        }),
        this.loadActivitiesForLocalDate(
          args.userId,
          args.anchorDate,
          args.timezone,
        ),
        this.pmcService.getStoredSliceAsOf({
          userId: args.userId,
          asOfDate: scheduledDateFromCalendar(args.anchorDate),
          fromDate: scheduledDateFromCalendar(addDaysYmd(args.anchorDate, -20)),
        }),
      ]);
    return {
      plan,
      coachContext,
      workouts,
      dayActivities,
      latestPmc: pmc.latest,
      pmcRows: pmc.daily,
    };
  }

  private async loadPlanSummary(
    userId: string,
    planId: string | null,
  ): Promise<SnapshotPlanRow | null> {
    if (!planId) return null;
    return this.plans.findFirst({
      where: { id: planId, userId },
      select: {
        id: true,
        title: true,
        goal: true,
        status: true,
        startDate: true,
        endDate: true,
        periodWeeks: true,
        updatedAt: true,
      },
    });
  }

  private async loadCoachContextPointer(planId: string | null) {
    if (!planId) return null;
    return this.contexts.findUnique({
      where: { planId },
      select: { id: true, headEventSeq: true },
    });
  }

  /**
   * 附近课次窗口：当天、明天、明天之后，上限 NEARBY_WORKOUT_LIMIT。
   * 指定了某节课则并进窗口（可能不在日期范围内）。切分在 assemble 里做。
   */
  private async loadNearbyWorkouts(args: {
    planId: string | null;
    planWorkoutId: string | null;
    anchorDate: string;
  }) {
    if (!args.planId) return [];
    const scheduledDate = scheduledDateFromCalendar(args.anchorDate);
    const tomorrowScheduledDate = scheduledDateFromCalendar(
      addDaysYmd(args.anchorDate, 1),
    );
    return this.workouts.findMany({
      where: {
        planId: args.planId,
        OR: [
          { scheduledDate },
          { scheduledDate: tomorrowScheduledDate },
          { scheduledDate: { gt: tomorrowScheduledDate } },
          ...(args.planWorkoutId ? [{ id: args.planWorkoutId }] : []),
        ],
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { dayOffset: 'asc' },
        { sessionIndex: 'asc' },
      ],
      take: NEARBY_WORKOUT_LIMIT,
      include: this.workoutInclude(),
    });
  }

  private async loadRecentCoachEvents(contextId: string | null) {
    if (!contextId) return [];
    const events = await this.contexts.findEvents({
      where: { contextId },
      orderBy: { seq: 'desc' },
      take: 10,
      select: {
        seq: true,
        type: true,
        occurredAt: true,
        payload: true,
      },
    });
    return events.reverse().map((event) => ({
      seq: event.seq,
      type: String(event.type),
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    }));
  }

  /**
   * DB 行 → 快照。在这里才切今天/明天/下一练、归类活动、打 hash。
   */
  private assembleContext(args: {
    args: BuildPlanExecutionContextArgs;
    resolved: ResolvedAnchor;
    timezone: string | null;
    anchorDate: string;
    rows: SnapshotRows;
    recentEvents: PlanExecutionContext['recentEvents'];
    competitionContext: PlanExecutionContext['competitionContext'];
  }): PlanExecutionContext {
    const { resolved, timezone, anchorDate, rows } = args;
    // 持久化的 current*Index 只在计划写入时更新，不能作为日期推进后的事实。
    // anchorDate 已按用户时区或指定课次/活动解析；DATE 列按日历日计算，避开时差。
    const planDayOffset = this.dayDiff(
      ymdFromDate(rows.plan?.startDate),
      anchorDate,
    );
    const isWithinPlan =
      rows.plan != null &&
      Number.isInteger(rows.plan.periodWeeks) &&
      rows.plan.periodWeeks > 0 &&
      planDayOffset >= 0 &&
      planDayOffset < rows.plan.periodWeeks * 7;
    const mappedWorkouts = rows.workouts.map((workout) =>
      this.mapWorkout(workout, timezone),
    );
    const { today, tomorrow, next } = sliceWorkoutsAroundAnchor(
      mappedWorkouts,
      anchorDate,
    );
    const activities = rows.dayActivities.map((activity) =>
      this.mapActivity(activity, timezone),
    );
    const { linked: linkedActivities, unlinked: unlinkedActivities } =
      partitionDayActivities(activities, resolved.planId);
    const currentWorkout = resolved.planWorkoutId
      ? (mappedWorkouts.find(
          (workout) => workout.id === resolved.planWorkoutId,
        ) ?? null)
      : (today[0] ?? null);
    const linkedActivity = resolved.activityId
      ? (activities.find((activity) => activity.id === resolved.activityId) ??
        this.mapNullableActivity(resolved.anchorActivity, timezone))
      : (currentWorkout?.linkedActivities[0] ?? null);

    const base: Omit<PlanExecutionContext, 'factHash'> = {
      contextId: rows.coachContext?.id ?? null,
      contextHeadEventSeq: rows.coachContext?.headEventSeq ?? null,
      userId: args.args.userId,
      anchor: {
        surface: args.args.surface,
        anchorDate,
        timezone,
        planId: resolved.planId,
        planWorkoutId: resolved.planWorkoutId,
        activityId: resolved.activityId,
        ...(args.args.sourceNode !== undefined
          ? { sourceNode: args.args.sourceNode }
          : {}),
      },
      plan: rows.plan
        ? {
            id: rows.plan.id,
            title: rows.plan.title,
            goal: rows.plan.goal ?? null,
            status: String(rows.plan.status),
            startDate: ymdFromDate(rows.plan.startDate),
            endDate: ymdFromDate(rows.plan.endDate),
            periodWeeks: rows.plan.periodWeeks ?? null,
            currentWeekIndex: isWithinPlan
              ? Math.floor(planDayOffset / 7) + 1
              : null,
            currentDayIndex: isWithinPlan ? (planDayOffset % 7) + 1 : null,
            updatedAt: rows.plan.updatedAt?.toISOString() ?? null,
          }
        : null,
      day: {
        date: anchorDate,
        plannedWorkouts: today,
        linkedActivities,
        unlinkedActivities,
        completionState: this.resolveCompletionState({
          hasPlan: Boolean(rows.plan),
          workouts: today,
          linkedActivities,
          unlinkedActivities,
        }),
      },
      tomorrow: {
        date: addDaysYmd(anchorDate, 1),
        plannedWorkouts: tomorrow,
      },
      currentWorkout,
      linkedActivity,
      nextWorkouts: next,
      recentLoad: this.buildRecentLoad(
        anchorDate,
        rows.latestPmc,
        rows.pmcRows,
      ),
      recentEvents: args.recentEvents,
      competitionContext: args.competitionContext,
    };

    return {
      ...base,
      factHash: sha256Hex(stableJson(this.factHashInput(base))),
    };
  }

  /**
   * 把比赛评估收进快照：即将到来的赛、近 8 周已过的赛、锚点当天仍生效的影响窗口。
   * 评估服务不可用或抛错时返回 UNAVAILABLE，不让比赛拖垮整份执行上下文。
   */
  private async buildCompetitionContext(args: {
    userId: string;
    anchorDate: string;
    plan: {
      id: string;
      title: string;
      goal: string | null;
      status: unknown;
      startDate: Date | null;
      endDate: Date | null;
      periodWeeks: number;
    } | null;
  }): Promise<PlanExecutionContext['competitionContext']> {
    const unavailable: PlanExecutionContext['competitionContext'] = {
      status: 'UNAVAILABLE',
      assessmentId: null,
      inputHash: null,
      assessedAt: null,
      upcomingEvents: [],
      recentEvents: [],
      activeInfluences: [],
      combinedConflicts: [],
    };
    if (!this.competitionImpactService) return unavailable;
    try {
      const assessment = await this.competitionImpactService.resolveForContext({
        userId: args.userId,
        scopeType: 'PLAN_EXECUTION',
        scopeStartDate: ymdFromDate(args.plan?.startDate) ?? args.anchorDate,
        scopeEndDate:
          ymdFromDate(args.plan?.endDate) ?? addDaysYmd(args.anchorDate, 14),
        anchorDate: args.anchorDate,
        subjectSummary: args.plan
          ? {
              id: args.plan.id,
              title: args.plan.title,
              goal: args.plan.goal,
              status: String(args.plan.status),
              periodWeeks: args.plan.periodWeeks,
            }
          : null,
      });
      const events = (
        Array.isArray(assessment.events) ? assessment.events : []
      ).flatMap((event) => (isCompetitionImpactEvent(event) ? [event] : []));
      const result =
        assessment.result && typeof assessment.result === 'object'
          ? (assessment.result as CompetitionImpactResult)
          : null;
      const eventAssessments: CompetitionEventImpactAssessment[] =
        Array.isArray(result?.eventAssessments) ? result.eventAssessments : [];
      const mappedEvents = events.map((event) => ({
        id: String(event.id),
        title: String(event.title ?? ''),
        startDate: String(event.startDate),
        endDate: event.endDate ? String(event.endDate) : null,
        sportType: String(event.sportType ?? 'UNKNOWN'),
        importance: String(event.importance ?? 'HIGH'),
        daysFromAnchor: this.ymdDifference(
          String(event.startDate),
          args.anchorDate,
        ),
      }));
      return {
        status:
          assessment.status === 'SUCCESS' ? 'CURRENT' : ('FALLBACK' as const),
        assessmentId: assessment.assessmentId,
        inputHash: assessment.inputHash,
        assessedAt: assessment.assessedAt,
        upcomingEvents: mappedEvents.filter(
          (event) => event.daysFromAnchor >= 0,
        ),
        recentEvents: mappedEvents.filter(
          (event) => event.daysFromAnchor < 0 && event.daysFromAnchor >= -56,
        ),
        activeInfluences: eventAssessments
          .filter((item) => {
            const window = item.influenceWindow;
            return (
              item.relevant === true &&
              window &&
              window.startDate <= args.anchorDate &&
              window.endDate >= args.anchorDate
            );
          })
          .map((item) => ({
            eventId: String(item.eventId),
            eventTitle:
              mappedEvents.find((event) => event.id === String(item.eventId))
                ?.title ?? '',
            eventStartDate:
              mappedEvents.find((event) => event.id === String(item.eventId))
                ?.startDate ?? '',
            eventDistanceMeters:
              events.find((event) => String(event.id) === String(item.eventId))
                ?.distanceMeters ?? null,
            athleteImportance:
              mappedEvents.find((event) => event.id === String(item.eventId))
                ?.importance ?? 'HIGH',
            daysFromAnchor:
              mappedEvents.find((event) => event.id === String(item.eventId))
                ?.daysFromAnchor ?? 0,
            impactLevel: String(item.currentImpactLevel ?? 'LOW'),
            phase:
              item.phases.find(
                (phase: CompetitionImpactPhase) =>
                  phase.startDate <= args.anchorDate &&
                  phase.endDate >= args.anchorDate,
              )?.type ?? null,
            constraints: Array.isArray(item.constraints)
              ? item.constraints.filter(
                  (constraint: CompetitionImpactConstraint) =>
                    constraint.startDate <= args.anchorDate &&
                    constraint.endDate >= args.anchorDate,
                )
              : [],
            confidence:
              typeof item.confidence === 'number' ? item.confidence : null,
            reasoningSummary: String(item.reasoningSummary ?? ''),
          })),
        combinedConflicts: Array.isArray(result?.combinedImpact?.conflicts)
          ? result.combinedImpact.conflicts
          : [],
      };
    } catch {
      return unavailable;
    }
  }

  /**
   * 两个 YYYY-MM-DD 相差几天。`end - start`：正数表示 end 更晚。
   * 给比赛填 daysFromAnchor（比赛日 − 锚点日）。
   */
  private ymdDifference(end: string, start: string) {
    return Math.round(
      (scheduledDateFromCalendar(end).getTime() -
        scheduledDateFromCalendar(start).getTime()) /
        86_400_000,
    );
  }

  /** 用户档案里最新的时区。无效 IANA 名当没有。 */
  private async loadUserTimezone(userId: string): Promise<string | null> {
    if (this.userService) {
      return this.normalizeOptionalTimezone(
        await this.userService.getPreferredTimezone(userId),
      );
    }
    const timezoneMetric = await this.users.bodyMetrics().findFirst({
      where: { userId, type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    const value =
      typeof timezoneMetric?.value === 'string'
        ? timezoneMetric.value.trim()
        : '';
    return this.normalizeOptionalTimezone(value);
  }

  /** 校验 IANA 时区名。空串或非法值返回 null，让调用方继续往下找。 */
  private normalizeOptionalTimezone(value?: string | null): string | null {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate) return null;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
      return candidate;
    } catch {
      return null;
    }
  }

  /**
   * UTC 瞬间 → 指定时区的日历日。
   * 和 ymdFromDate 不同：这里看的是用户本地「今天」，不是 UTC 日期。
   */
  private localDateYmd(
    input: Date | string | null | undefined,
    timezone: string | null,
  ): string | null {
    if (!input) return null;
    const date = input instanceof Date ? input : new Date(input);
    if (!Number.isFinite(date.getTime())) return null;
    return activityCalendarYmdInZone(date, timezone || 'UTC');
  }

  /**
   * 从入参推出「看哪份计划、哪一天」。
   * 优先级：contextId → 指定课次 → 指定活动上的主关联 → 当前 ACTIVE 计划。
   */
  private async resolveAnchor(
    args: BuildPlanExecutionContextArgs,
    timezone: string | null,
  ): Promise<ResolvedAnchor> {
    let planId = String(args.planId ?? '').trim() || null;
    let planWorkoutId = String(args.planWorkoutId ?? '').trim() || null;
    let anchorDate = this.normalizeYmd(args.anchorDate);
    let activityId: number | null = null;
    let anchorActivity: ExecutionActivityRow | null = null;

    const contextId = String(args.contextId ?? '').trim();
    if (contextId) {
      // 教练账本 → 计划。
      const context = await this.contexts.findFirst({
        where: { id: contextId, userId: args.userId },
        select: { planId: true },
      });
      if (!context) throw new BadRequestException('Coach context not found');
      planId = context.planId;
    }

    if (planWorkoutId) {
      // 指定课次 → 计划和课次日。
      const workout = await this.workouts.findFirst({
        where: { id: planWorkoutId, plan: { userId: args.userId } },
        select: { id: true, planId: true, scheduledDate: true },
      });
      if (!workout) throw new BadRequestException('Plan workout not found');
      if (planId && planId !== workout.planId) {
        throw new BadRequestException('Plan workout does not belong to plan');
      }
      planId = workout.planId;
      anchorDate = anchorDate ?? ymdFromDate(workout.scheduledDate);
    }

    if (args.activityId != null && String(args.activityId).trim()) {
      // 指定活动 → 本地日；若有 PRIMARY 关联，再钉到那节课。
      anchorActivity = await this.findAnchorActivity(
        args.userId,
        args.activityId,
      );
      if (!anchorActivity) throw new BadRequestException('Activity not found');
      activityId = anchorActivity.id;
      const primaryLink = anchorActivity.planWorkoutLinks?.find(
        (link) =>
          link.role === PlanWorkoutActivityLinkRole.PRIMARY &&
          !link.unlinkedAt &&
          link.planWorkout,
      );
      if (primaryLink?.planWorkout) {
        if (planId && planId !== primaryLink.planWorkout.planId) {
          throw new BadRequestException(
            'Activity link does not belong to plan',
          );
        }
        planId = primaryLink.planWorkout.planId;
        planWorkoutId = planWorkoutId ?? primaryLink.planWorkout.id;
      }
      anchorDate =
        anchorDate ??
        this.localDateYmd(
          anchorActivity.startTime,
          anchorActivity.timezone || timezone,
        );
    }

    if (!planId) {
      // 上面都没钉到计划时，落到当前 ACTIVE 计划。
      const activePlan = await this.plans.findFirst({
        where: { userId: args.userId, status: $Enums.PlanStatus.ACTIVE },
        select: { id: true },
      });
      planId = activePlan?.id ?? null;
    }

    return { planId, planWorkoutId, activityId, anchorDate, anchorActivity };
  }

  /** 只接受 YYYY-MM-DD。其它格式当没给日期。 */
  private normalizeYmd(value?: string | null): string | null {
    const text = String(value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  /**
   * 按数字 id 或 hashId 找活动，并带上负荷分数和未解除的课关联。
   * 只取 ready 活动，草稿/失败导入不进快照。
   */
  private async findAnchorActivity(
    userId: string,
    activityId: number | string,
  ) {
    const raw = String(activityId).trim();
    const numeric = Number(raw);
    return this.activityRead.findFirst({
      where: readyActivityWhere({
        userId,
        ...(Number.isInteger(numeric) && numeric > 0
          ? { id: numeric }
          : { hashId: raw }),
      }),
      include: EXECUTION_ACTIVITY_INCLUDE,
    });
  }

  /** Prisma include：课上未解除的活动链接，以及活动的负荷分数。 */
  private workoutInclude() {
    return EXECUTION_WORKOUT_INCLUDE;
  }

  /**
   * 拉「用户本地某一天」的活动。
   * 先按 UTC 扩 ±1 天取窗口（跨时区活动可能落在相邻 UTC 日），再按活动时区滤成真正的本地日。
   */
  private async loadActivitiesForLocalDate(
    userId: string,
    localDate: string,
    timezone: string | null,
  ) {
    const center = scheduledDateFromCalendar(localDate);
    const from = new Date(center.getTime());
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(center.getTime());
    to.setUTCDate(to.getUTCDate() + 2);
    const rows = await this.activityRead.findMany({
      where: readyActivityWhere({
        userId,
        startTime: { gte: from, lt: to },
      }),
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      include: EXECUTION_ACTIVITY_INCLUDE,
    });
    return rows.filter((row) => {
      const activityTimezone =
        this.normalizeOptionalTimezone(row.timezone) ?? timezone;
      const ymd = this.localDateYmd(row.startTime, activityTimezone);
      return ymd === localDate;
    });
  }

  /** DB 课次 → 快照课次。weekIndex/dayIndex 由 dayOffset 推：第几周、周几（都从 1 起）。 */
  private mapWorkout(
    row: ExecutionWorkoutRow,
    timezone: string | null,
  ): PlanExecutionWorkout {
    const linkedActivities = (row.links ?? []).flatMap((link) =>
      link.activity ? [this.mapActivity(link.activity, timezone)] : [],
    );
    return {
      id: row.id,
      planId: row.planId ?? '',
      scheduledDate: ymdFromDate(row.scheduledDate),
      weekIndex:
        typeof row.dayOffset === 'number'
          ? Math.floor(row.dayOffset / 7) + 1
          : null,
      dayIndex:
        typeof row.dayOffset === 'number' ? (row.dayOffset % 7) + 1 : null,
      sessionIndex: row.sessionIndex ?? null,
      sportType: String(row.sportType),
      status: String(row.status),
      name: row.name ?? null,
      notes: row.notes ?? null,
      text: row.text ?? '',
      structureKind: String(row.structureKind),
      dslVersion: row.dslVersion,
      plannedDurationSeconds: row.plannedDurationSeconds ?? null,
      plannedSessionRpe: roundNumber(row.plannedSessionRpe),
      expectedLoad: roundNumber(row.estimatedLoad, 1),
      updatedAt: row.updatedAt?.toISOString() ?? null,
      linkedActivities,
    };
  }

  private mapNullableActivity(
    row: ExecutionActivityRow | null,
    timezone: string | null,
  ): PlanExecutionActivity | null {
    return row ? this.mapActivity(row, timezone) : null;
  }

  /**
   * DB 活动 → 快照活动。时间折到活动时区（没有则用用户时区），负荷走 resolveActivityLoad。
   * linkedPlanWorkout 只取 PRIMARY 且未解除的那条。
   */
  private mapActivity(
    row: ExecutionActivityRow,
    timezone: string | null,
  ): PlanExecutionActivity {
    const durationSeconds =
      typeof row.timerTime === 'number'
        ? row.timerTime
        : typeof row.elapsedTime === 'number'
          ? row.elapsedTime
          : null;
    const primaryLink = (row.planWorkoutLinks ?? []).find(
      (link) =>
        link.role === PlanWorkoutActivityLinkRole.PRIMARY && !link.unlinkedAt,
    );
    const activityTimezone =
      this.normalizeOptionalTimezone(row.timezone) ?? timezone;
    const localTiming = row.startTime
      ? activityLocalTimingInZone(row.startTime, activityTimezone || 'UTC')
      : null;
    return {
      id: row.id,
      hashId: row.hashId,
      title: row.activityName ?? null,
      sportType: row.sportType ? String(row.sportType) : null,
      startTime: row.startTime?.toISOString() ?? null,
      timezone: activityTimezone,
      localDate: localTiming?.localDate ?? null,
      localStartTime: localTiming?.localTime ?? null,
      localHour: localTiming?.localHour ?? null,
      dayPeriod: localTiming?.dayPeriod ?? null,
      durationMinutes:
        typeof durationSeconds === 'number'
          ? Math.round(durationSeconds / 60)
          : null,
      distanceKm:
        typeof row.distance === 'number'
          ? Number((row.distance / 1000).toFixed(1))
          : null,
      load: resolveActivityLoad(row),
      avgHeartRate: roundNumber(row.avgHeartRate),
      avgPower: roundNumber(row.avgPower),
      sessionRpe: roundNumber(row.sessionRpe),
      updatedAt: row.updatedAt?.toISOString() ?? null,
      linkedPlanWorkout: primaryLink?.planWorkout
        ? {
            planId: primaryLink.planWorkout.planId,
            workoutId: primaryLink.planWorkout.id,
            source: String(primaryLink.source),
            role: String(primaryLink.role),
          }
        : null,
    };
  }

  /**
   * 锚点附近的负荷切片：CTL/ATL/TSB、本周/上周总量、近 7 日曲线、近 14 日休息天数。
   * 休息日：近 14 天里 dailyValue < 10 的天数。
   */
  private buildRecentLoad(
    anchorDate: string,
    latestPmc: { CTL: number; ATL: number; TSB: number } | null,
    rows: Array<{ date: Date; dailyValue: number }>,
  ): PlanExecutionContext['recentLoad'] {
    const week = this.weekLoad(anchorDate, rows);
    const activeDays = rows
      .filter((row) => this.dayDiff(ymdFromDate(row.date), anchorDate) <= 13)
      .filter((row) => row.dailyValue >= 10).length;
    return {
      ctl: roundNumber(latestPmc?.CTL),
      atl: roundNumber(latestPmc?.ATL),
      tsb: roundNumber(latestPmc?.TSB),
      currentWeekLoad: week.current,
      previousWeekLoad: week.previous,
      dailyLoadLast7d: this.dailyLoadLast7d(anchorDate, rows),
      restDaysLast14d: Math.max(0, 14 - activeDays),
    };
  }

  /**
   * 周一到周日的周负荷。current 是锚点所在周（含未来几天的已有 PMC），previous 是上一整周。
   */
  private weekLoad(
    anchorDate: string,
    rows: Array<{ date: Date; dailyValue: number }>,
  ): { current: number; previous: number } {
    const anchor = scheduledDateFromCalendar(anchorDate);
    const day = anchor.getUTCDay() || 7;
    const currentStart = new Date(anchor.getTime());
    currentStart.setUTCDate(currentStart.getUTCDate() - (day - 1));
    const currentEnd = new Date(currentStart.getTime());
    currentEnd.setUTCDate(currentEnd.getUTCDate() + 6);
    const previousStart = new Date(currentStart.getTime());
    previousStart.setUTCDate(previousStart.getUTCDate() - 7);
    const previousEnd = new Date(currentStart.getTime());
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    let current = 0;
    let previous = 0;
    for (const row of rows) {
      const value = Number.isFinite(row.dailyValue) ? row.dailyValue : 0;
      if (row.date >= currentStart && row.date <= currentEnd) current += value;
      if (row.date >= previousStart && row.date <= previousEnd)
        previous += value;
    }
    return { current: Math.round(current), previous: Math.round(previous) };
  }

  /** 锚点往前 7 天的日负荷，最旧在前。缺日补 0，长度固定为 7。 */
  private dailyLoadLast7d(
    anchorDate: string,
    rows: Array<{ date: Date; dailyValue: number }>,
  ): number[] {
    const anchor = scheduledDateFromCalendar(anchorDate);
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(anchor.getTime());
      date.setUTCDate(date.getUTCDate() - (6 - index));
      const ymd = ymdFromDate(date);
      const row = rows.find((item) => ymdFromDate(item.date) === ymd);
      return row ? Math.round(row.dailyValue * 10) / 10 : 0;
    });
  }

  /**
   * `toYmd - fromYmd` 的天数。from 缺失返回 Infinity，让「是否落在近 N 天」的过滤直接失败。
   */
  private dayDiff(fromYmd: string | null, toYmd: string): number {
    if (!fromYmd) return Number.POSITIVE_INFINITY;
    const from = scheduledDateFromCalendar(fromYmd);
    const to = scheduledDateFromCalendar(toYmd);
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
  }

  /** 当天有没有课、课有没有完成、有没有计划外活动。 */
  private resolveCompletionState(args: {
    hasPlan: boolean;
    workouts: PlanExecutionWorkout[];
    linkedActivities: PlanExecutionActivity[];
    unlinkedActivities: PlanExecutionActivity[];
  }): PlanExecutionCompletionState {
    if (!args.hasPlan) return 'NO_PLAN';
    if (args.workouts.length === 0) {
      return args.unlinkedActivities.length > 0 ? 'EXTRA_ACTIVITY' : 'REST_DAY';
    }
    const doneCount = args.workouts.filter(
      (workout) => workout.status === 'DONE',
    ).length;
    if (doneCount >= args.workouts.length) return 'COMPLETED';
    if (doneCount > 0 || args.linkedActivities.length > 0) return 'PARTIAL';
    return 'PLANNED';
  }

  /** 进入 factHash 的字段。recentEvents 只取 seq/type/时间，避免 payload 噪音导致哈希乱跳。 */
  private factHashInput(
    context: Omit<PlanExecutionContext, 'factHash'>,
  ): unknown {
    return {
      contextId: context.contextId,
      contextHeadEventSeq: context.contextHeadEventSeq,
      anchor: {
        anchorDate: context.anchor.anchorDate,
        timezone: context.anchor.timezone,
        planId: context.anchor.planId,
        planWorkoutId: context.anchor.planWorkoutId,
        activityId: context.anchor.activityId,
      },
      plan: context.plan,
      day: context.day,
      tomorrow: context.tomorrow,
      currentWorkout: context.currentWorkout,
      linkedActivity: context.linkedActivity,
      nextWorkouts: context.nextWorkouts,
      recentLoad: context.recentLoad,
      recentEvents: context.recentEvents.map((event) => ({
        seq: event.seq,
        type: event.type,
        occurredAt: event.occurredAt,
      })),
      competitionContext: {
        status: context.competitionContext.status,
        assessmentId: context.competitionContext.assessmentId,
        inputHash: context.competitionContext.inputHash,
        upcomingEvents: context.competitionContext.upcomingEvents,
        recentEvents: context.competitionContext.recentEvents,
        activeInfluences: context.competitionContext.activeInfluences,
        combinedConflicts: context.competitionContext.combinedConflicts,
      },
    };
  }
}
