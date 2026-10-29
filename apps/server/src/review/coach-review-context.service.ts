import { Injectable } from '@nestjs/common';
import { SportType } from '@prisma/client';
import { createHash } from 'crypto';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { UserService } from '@/api/user/user.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import type {
  PlanExecutionContext,
  PlanExecutionWorkout,
} from '@/api/plan/plan-execution-context.service';
import {
  activityCalendarYmdInZone,
  activityLocalTimingInZone,
  scheduledDateFromCalendar,
} from '@/api/plan/plan-link-calendar.util';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { PMCService } from '@/training-load/pmc.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import type { WorkoutSummary } from '@shared/workout-summary';
import type { WorkoutStructureKind } from '@shared/workout-structure';
import { athleteTodayFromPeriodEnd } from '@/api/ai/core/athlete-relative-day';
import { PLAN_REVIEW_JUDGMENT_PROMPT_VERSION } from '@/api/ai/core/prompt-contracts/plan-review-judgment.contract';

export type CoachReviewScale = 'daily' | 'weekly' | 'monthly';

export type CoachReviewWorkoutEvidence = {
  id: string;
  date: string | null;
  weekIndex: number | null;
  dayIndex: number | null;
  sessionIndex: number | null;
  sportType: string;
  status: string;
  executionStatus: string;
  name: string | null;
  notes: string | null;
  text: string;
  structureKind: string;
  dslVersion: number;
  plannedDurationSeconds: number | null;
  plannedSessionRpe: number | null;
  expectedLoad: number | null;
  summary: WorkoutSummary | null;
  linkedActivityIds: number[];
};

export type CoachReviewActivityEvidence = {
  id: number;
  hashId: string;
  date: string | null;
  localStartTime: string | null;
  dayPeriod: string | null;
  title: string | null;
  sportType: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  load: number | null;
  sessionRpe: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  linkedWorkoutId: string | null;
};

export type CoachReviewContext = {
  reviewFactHash: string;
  meta: {
    promptVersion: string;
    scale: CoachReviewScale;
    locale: string;
    timezone: string;
    reviewedFrom: string;
    reviewedThrough: string;
    /** Athlete-local calendar date at job time; daily reviews normally run the morning after reviewedThrough. */
    athleteToday: string;
    generatedAt: string;
  };
  athlete: {
    sportProfiles: Array<{
      sportType: string;
      maxHeartRate: number | null;
      restingHeartRate: number | null;
      lthr: number | null;
      ftp: number | null;
      cp: number | null;
      cs: number | null;
      thresholdPace: number | null;
      vo2max: number | null;
    }>;
  };
  plan: PlanExecutionContext['plan'];
  recent7Days: Array<{
    date: string;
    plannedWorkouts: CoachReviewWorkoutEvidence[];
    activities: CoachReviewActivityEvidence[];
    pmc: {
      dailyLoad: number | null;
      ctl: number | null;
      atl: number | null;
      tsb: number | null;
    };
  }>;
  reviewWindowSummary: {
    planned: number;
    done: number;
    skipped: number;
    moved: number;
    incomplete: number;
    plannedLoad: number;
    actualLoad: number;
    extraActivities: number;
    sportBreakdown: Record<string, { workouts: number; activities: number }>;
  };
  executionSignals: {
    missedWorkoutIds: string[];
    consecutiveMissedWorkouts: number;
    plannedSessionsToDate: number;
    completedSessionsToDate: number;
    plannedLoadToDate: number;
    actualLoadToDate: number;
    sessionCompletionRatio: number | null;
    loadCompletionRatio: number | null;
  };
  scheduleOpportunities: Array<{
    date: string;
    weekIndex: number;
    dayIndex: number;
  }>;
  loadSnapshot: PlanExecutionContext['recentLoad'];
  upcoming: CoachReviewWorkoutEvidence[];
  competitionContext: PlanExecutionContext['competitionContext'];
  recentDecisions: Array<{
    type: string;
    occurredAt: string;
    payload: unknown;
  }>;
  dataQuality: {
    missing: string[];
    hasActivityDetails: boolean;
    hasPmcTrend: boolean;
    hasAthleteProfile: boolean;
  };
};

const ACTIONABLE = new Set(['PLANNED', 'IN_PROGRESS']);

@Injectable()
export class CoachReviewContextService {
  constructor(
    private readonly plans: PlanQueryService,
    private readonly activities: ActivityReadService,
    private readonly loadReadout: LoadReadoutService,
    private readonly pmc: PMCService,
    private readonly users: UserService,
    private readonly codecs: WorkoutCodecRegistry,
  ) {}

  async build(args: {
    userId: string;
    lang: string;
    scale: CoachReviewScale;
    periodStart: Date;
    periodEnd: Date;
    context: PlanExecutionContext;
  }): Promise<CoachReviewContext> {
    if (!args.context.plan) {
      throw new Error('Coach review context requires an active plan');
    }
    const timezone = args.context.anchor.timezone || 'UTC';
    const anchorDate = args.context.anchor.anchorDate;
    const recentFrom = addDays(anchorDate, -6);
    const reviewedFrom =
      activityCalendarYmdInZone(args.periodStart, timezone) ?? recentFrom;
    const reviewedThrough = anchorDate;
    const athleteToday = athleteTodayFromPeriodEnd(args.periodEnd, timezone);
    const queryFrom = minYmd(recentFrom, reviewedFrom);
    const reviewedToExclusive = addDays(anchorDate, 1);
    const workoutQueryToExclusive = addDays(anchorDate, 8);
    const utcFrom = scheduledDateFromCalendar(addDays(queryFrom, -2));
    const utcTo = scheduledDateFromCalendar(addDays(reviewedToExclusive, 2));

    const [windowWorkouts, activityRows, pmcSlice] = await Promise.all([
      this.plans.findReviewWindowWorkouts({
        userId: args.userId,
        planId: args.context.plan.id,
        periodStart: scheduledDateFromCalendar(queryFrom),
        periodEnd: scheduledDateFromCalendar(workoutQueryToExclusive),
      }),
      this.activities.findMany({
        where: readyActivityWhere({
          userId: args.userId,
          startTime: { gte: utcFrom, lt: utcTo },
        }),
        select: {
          id: true,
          hashId: true,
          activityName: true,
          sportType: true,
          startTime: true,
          timezone: true,
          timerTime: true,
          elapsedTime: true,
          distance: true,
          sessionRpe: true,
          avgHeartRate: true,
          avgPower: true,
          planWorkoutLinks: {
            where: { unlinkedAt: null },
            select: {
              planWorkoutId: true,
              planWorkout: { select: { planId: true } },
            },
          },
        },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      }),
      this.pmc.getStoredSliceAsOf({
        userId: args.userId,
        asOfDate: scheduledDateFromCalendar(anchorDate),
        fromDate: scheduledDateFromCalendar(recentFrom),
      }),
    ]);

    const loads = await this.loadReadout.batchGetActualLoad(
      activityRows.map((row) => row.id),
    );
    let workoutEvidence = windowWorkouts.map((row) =>
      this.mapWorkout({
        ...row,
        weekIndex: Math.floor(row.dayOffset / 7) + 1,
        dayIndex: (row.dayOffset % 7) + 1,
        linkedActivityIds: row.links.map((link) => link.activityId),
      }),
    );
    const activityEvidence = activityRows.flatMap((row) => {
      if (!row.startTime) return [];
      const timing = activityLocalTimingInZone(
        row.startTime,
        row.timezone || timezone,
      );
      if (timing.localDate < queryFrom || timing.localDate > anchorDate) {
        return [];
      }
      const durationSeconds = row.timerTime ?? row.elapsedTime;
      const linked = row.planWorkoutLinks.find(
        (link) => link.planWorkout?.planId === args.context.plan?.id,
      );
      return [
        {
          id: row.id,
          hashId: row.hashId,
          date: timing.localDate,
          localStartTime: timing.localTime,
          dayPeriod: timing.dayPeriod,
          title: row.activityName,
          sportType: row.sportType ? String(row.sportType) : null,
          durationMinutes:
            typeof durationSeconds === 'number'
              ? Math.round(durationSeconds / 60)
              : null,
          distanceKm:
            typeof row.distance === 'number'
              ? Number((row.distance / 1000).toFixed(1))
              : null,
          load: round(loads.get(row.id)?.actualLoad),
          sessionRpe: round(row.sessionRpe),
          avgHeartRate: round(row.avgHeartRate),
          avgPower: round(row.avgPower),
          linkedWorkoutId: linked?.planWorkoutId ?? null,
        },
      ];
    });
    workoutEvidence = workoutEvidence.map((workout) => ({
      ...workout,
      executionStatus: resolveExecutionStatus(
        workout,
        activityEvidence,
        anchorDate,
      ),
    }));
    const upcoming = uniqueWorkouts([
      ...args.context.tomorrow.plannedWorkouts,
      ...args.context.nextWorkouts,
    ])
      .filter((row) => ACTIONABLE.has(row.status))
      .slice(0, 3)
      .map((row) => this.mapExecutionWorkout(row));
    const sportProfiles = await this.loadSportProfiles(
      args.userId,
      upcoming.map((row) => row.sportType),
      args.periodEnd,
    );
    const pmcByDate = new Map(
      pmcSlice.daily.map((row) => [ymd(row.date), row]),
    );
    const recent7Days = dateRange(recentFrom, anchorDate).map((date) => {
      const point = pmcByDate.get(date);
      return {
        date,
        plannedWorkouts: workoutEvidence.filter((row) => row.date === date),
        activities: activityEvidence.filter((row) => row.date === date),
        pmc: {
          dailyLoad: round(point?.dailyValue),
          ctl: round(point?.CTL),
          atl: round(point?.ATL),
          tsb: round(point?.TSB),
        },
      };
    });
    const reviewedWorkouts = workoutEvidence.filter(
      (row) =>
        row.date != null &&
        row.date >= reviewedFrom &&
        row.date <= reviewedThrough,
    );
    const reviewedActivities = activityEvidence.filter(
      (row) =>
        row.date != null &&
        row.date >= reviewedFrom &&
        row.date <= reviewedThrough,
    );
    const summary = buildWindowSummary(reviewedWorkouts, reviewedActivities);
    const executionSignals = buildExecutionSignals({
      workouts: workoutEvidence,
      activities: activityEvidence,
      anchorDate,
      currentWeekIndex: args.context.plan.currentWeekIndex,
      planStartDate: args.context.plan.startDate,
    });
    const scheduleOpportunities = buildScheduleOpportunities({
      workouts: workoutEvidence,
      anchorDate,
      planEndDate: args.context.plan.endDate,
      planStartDate: args.context.plan.startDate,
    });
    const missing = [
      ...(pmcSlice.daily.length < 2 ? ['pmcTrend'] : []),
      ...(sportProfiles.length === 0 ? ['athleteProfile'] : []),
      ...(upcoming.length === 0 ? ['upcomingWorkout'] : []),
    ];
    const base = {
      meta: {
        promptVersion: PLAN_REVIEW_JUDGMENT_PROMPT_VERSION,
        scale: args.scale,
        locale: args.lang,
        timezone,
        reviewedFrom,
        reviewedThrough,
        athleteToday,
        generatedAt: new Date().toISOString(),
      },
      athlete: { sportProfiles },
      plan: args.context.plan,
      recent7Days,
      reviewWindowSummary: summary,
      executionSignals,
      scheduleOpportunities,
      loadSnapshot: args.context.recentLoad,
      upcoming,
      competitionContext: args.context.competitionContext,
      recentDecisions: args.context.recentEvents
        .filter((event) => event.type.startsWith('REVIEW_'))
        .map((event) => ({
          type: event.type,
          occurredAt: event.occurredAt,
          payload: event.payload,
        })),
      dataQuality: {
        missing,
        hasActivityDetails: activityEvidence.length > 0,
        hasPmcTrend: pmcSlice.daily.length >= 2,
        hasAthleteProfile: sportProfiles.length > 0,
      },
    };
    const reviewFactHash = sha256(
      stableJson({
        ...base,
        meta: {
          ...base.meta,
          generatedAt: undefined,
          athleteToday: undefined,
        },
      }),
    );
    return { reviewFactHash, ...base };
  }

  private mapExecutionWorkout(
    workout: PlanExecutionWorkout,
  ): CoachReviewWorkoutEvidence {
    return this.mapWorkout({
      id: workout.id,
      scheduledDate: workout.scheduledDate
        ? scheduledDateFromCalendar(workout.scheduledDate)
        : null,
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      sessionIndex: workout.sessionIndex,
      sportType: workout.sportType,
      status: workout.status,
      name: workout.name,
      notes: workout.notes,
      text: workout.text,
      structureKind: workout.structureKind,
      dslVersion: workout.dslVersion,
      plannedDurationSeconds: workout.plannedDurationSeconds,
      plannedSessionRpe: workout.plannedSessionRpe,
      estimatedLoad: workout.expectedLoad,
      linkedActivityIds: workout.linkedActivities.map((row) => row.id),
    });
  }

  private mapWorkout(row: {
    id: string;
    scheduledDate: Date | null;
    weekIndex: number | null;
    dayIndex: number | null;
    sessionIndex: number | null;
    sportType: unknown;
    status: unknown;
    name: string | null;
    notes: string | null;
    text: string;
    structureKind: unknown;
    dslVersion: number;
    plannedDurationSeconds: number | null;
    plannedSessionRpe: number | null;
    estimatedLoad: number | null;
    linkedActivityIds: number[];
  }): CoachReviewWorkoutEvidence {
    const kind = String(row.structureKind) as WorkoutStructureKind;
    let summary: WorkoutSummary | null = null;
    try {
      const codec = this.codecs.get(kind, row.dslVersion);
      summary = codec.summarize(codec.parseText(row.text, row.dslVersion));
    } catch {
      summary = null;
    }
    return {
      id: row.id,
      date: row.scheduledDate ? ymd(row.scheduledDate) : null,
      weekIndex: row.weekIndex,
      dayIndex: row.dayIndex,
      sessionIndex: row.sessionIndex,
      sportType: String(row.sportType),
      status: String(row.status),
      executionStatus: String(row.status),
      name: row.name,
      notes: row.notes,
      text: row.text,
      structureKind: kind,
      dslVersion: row.dslVersion,
      plannedDurationSeconds: row.plannedDurationSeconds,
      plannedSessionRpe: round(row.plannedSessionRpe),
      expectedLoad: round(row.estimatedLoad),
      summary,
      linkedActivityIds: row.linkedActivityIds,
    };
  }

  private async loadSportProfiles(
    userId: string,
    sportTypes: string[],
    at: Date,
  ): Promise<CoachReviewContext['athlete']['sportProfiles']> {
    const sports = Array.from(
      new Set(
        sportTypes.filter(
          (sport): sport is SportType =>
            sport === SportType.RUN ||
            sport === SportType.CYCLING ||
            sport === SportType.SWIM,
        ),
      ),
    );
    const profiles = await Promise.all(
      sports.map(async (sportType) => ({
        sportType,
        profile: await this.users.getComposedUserProfile(userId, sportType, at),
      })),
    );
    return profiles.map(({ sportType, profile }) => ({
      sportType,
      maxHeartRate: round(profile?.maxHeartRate),
      restingHeartRate: round(profile?.restingHeartRate),
      lthr: round(profile?.lthr),
      ftp: round(profile?.ftp),
      cp: round(profile?.cp),
      cs: round(profile?.cs),
      thresholdPace: round(profile?.tp),
      vo2max: round(profile?.vo2max),
    }));
  }
}

function buildWindowSummary(
  workouts: CoachReviewWorkoutEvidence[],
  activities: CoachReviewActivityEvidence[],
): CoachReviewContext['reviewWindowSummary'] {
  const sportBreakdown: Record<
    string,
    { workouts: number; activities: number }
  > = {};
  for (const workout of workouts) {
    const bucket = (sportBreakdown[workout.sportType] ??= {
      workouts: 0,
      activities: 0,
    });
    bucket.workouts += 1;
  }
  for (const activity of activities) {
    const sport = activity.sportType || 'UNKNOWN';
    const bucket = (sportBreakdown[sport] ??= {
      workouts: 0,
      activities: 0,
    });
    bucket.activities += 1;
  }
  return {
    planned: workouts.length,
    done: workouts.filter((row) => row.status === 'DONE').length,
    skipped: workouts.filter((row) => row.status === 'SKIPPED').length,
    moved: workouts.filter((row) => row.status === 'MOVED').length,
    incomplete: workouts.filter((row) => row.executionStatus === 'MISSED')
      .length,
    plannedLoad: roundSum(workouts.map((row) => row.expectedLoad)),
    actualLoad: roundSum(activities.map((row) => row.load)),
    extraActivities: activities.filter((row) => !row.linkedWorkoutId).length,
    sportBreakdown,
  };
}

function resolveExecutionStatus(
  workout: CoachReviewWorkoutEvidence,
  activities: CoachReviewActivityEvidence[],
  anchorDate: string,
) {
  if (workout.status === 'DONE') return 'DONE';
  if (workout.status === 'SKIPPED') return 'SKIPPED';
  if (workout.status === 'MOVED') return 'MOVED';
  if (!workout.date || workout.date > anchorDate) return 'ACTIONABLE';
  if (workout.linkedActivityIds.length > 0) return 'DONE';
  const comparable = activities.some(
    (activity) =>
      activity.date === workout.date &&
      activity.sportType === workout.sportType &&
      activity.load != null &&
      workout.expectedLoad != null &&
      activity.load >= workout.expectedLoad * 0.5,
  );
  return comparable ? 'REPLACED_BY_ACTIVITY' : 'MISSED';
}

function buildExecutionSignals(args: {
  workouts: CoachReviewWorkoutEvidence[];
  activities: CoachReviewActivityEvidence[];
  anchorDate: string;
  currentWeekIndex: number | null;
  planStartDate: string | null;
}): CoachReviewContext['executionSignals'] {
  const due = args.workouts
    .filter(
      (workout) =>
        workout.date != null &&
        workout.date <= args.anchorDate &&
        (args.currentWeekIndex == null ||
          workout.weekIndex === args.currentWeekIndex),
    )
    .sort((a, b) =>
      `${a.date}-${a.sessionIndex ?? 1}`.localeCompare(
        `${b.date}-${b.sessionIndex ?? 1}`,
      ),
    );
  const missed = due.filter((workout) => workout.executionStatus === 'MISSED');
  let consecutiveMissedWorkouts = 0;
  for (const workout of [...due].reverse()) {
    if (workout.executionStatus !== 'MISSED') break;
    consecutiveMissedWorkouts += 1;
  }
  const weekStart =
    args.planStartDate && args.currentWeekIndex
      ? addDays(args.planStartDate, (args.currentWeekIndex - 1) * 7)
      : (due[0]?.date ?? addDays(args.anchorDate, -6));
  const actualLoadToDate = roundSum(
    args.activities
      .filter(
        (activity) =>
          activity.date != null &&
          activity.date >= weekStart &&
          activity.date <= args.anchorDate,
      )
      .map((activity) => activity.load),
  );
  const plannedLoadToDate = roundSum(
    due.map((workout) => workout.expectedLoad),
  );
  const completedSessionsToDate = due.filter((workout) =>
    ['DONE', 'REPLACED_BY_ACTIVITY'].includes(workout.executionStatus),
  ).length;
  return {
    missedWorkoutIds: missed.map((workout) => workout.id),
    consecutiveMissedWorkouts,
    plannedSessionsToDate: due.length,
    completedSessionsToDate,
    plannedLoadToDate,
    actualLoadToDate,
    sessionCompletionRatio: due.length
      ? round(completedSessionsToDate / due.length, 3)
      : null,
    loadCompletionRatio:
      plannedLoadToDate > 0
        ? round(actualLoadToDate / plannedLoadToDate, 3)
        : null,
  };
}

function buildScheduleOpportunities(args: {
  workouts: CoachReviewWorkoutEvidence[];
  anchorDate: string;
  planStartDate: string | null;
  planEndDate: string | null;
}): CoachReviewContext['scheduleOpportunities'] {
  if (!args.planStartDate) return [];
  const occupied = new Set(
    args.workouts
      .filter((workout) => workout.status !== 'MOVED')
      .map((workout) => workout.date)
      .filter((date): date is string => Boolean(date)),
  );
  const opportunities: CoachReviewContext['scheduleOpportunities'] = [];
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(args.anchorDate, offset);
    if (args.planEndDate && date > args.planEndDate) break;
    if (occupied.has(date)) continue;
    const planOffset = daysBetween(args.planStartDate, date);
    if (planOffset < 0) continue;
    opportunities.push({
      date,
      weekIndex: Math.floor(planOffset / 7) + 1,
      dayIndex: (planOffset % 7) + 1,
    });
  }
  return opportunities;
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (scheduledDateFromCalendar(to).getTime() -
      scheduledDateFromCalendar(from).getTime()) /
      86_400_000,
  );
}

function uniqueWorkouts(workouts: PlanExecutionWorkout[]) {
  const seen = new Set<string>();
  return workouts.filter((workout) => {
    if (seen.has(workout.id)) return false;
    seen.add(workout.id);
    return true;
  });
}

function addDays(value: string, days: number) {
  const date = scheduledDateFromCalendar(value);
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
}

function dateRange(from: string, through: string) {
  const out: string[] = [];
  for (let value = from; value <= through; value = addDays(value, 1)) {
    out.push(value);
  }
  return out;
}

function minYmd(a: string, b: string) {
  return a < b ? a : b;
}

function ymd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function round(value: unknown, digits = 1): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function roundSum(values: Array<number | null>) {
  return (
    round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0)) ?? 0
  );
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
