import { Injectable } from '@nestjs/common';
import { activityCalendarYmdInZone } from '@/api/plan/plan-link-calendar.util';
import {
  PlanExecutionContextService,
  type PlanExecutionContext,
} from '@/api/plan/plan-execution-context.service';
import type {
  ReviewDigestCoachingContext,
  ReviewDigestScale,
} from '@/api/ai/core/prompt-contracts/review-digest.contract';
import {
  CoachReviewContextService,
  type CoachReviewContext,
  type CoachReviewScale,
} from './coach-review-context.service';

/**
 * 为用户可见的 Digest 组装只读教练事实。
 *
 * 这里复用 Runtime 的事实口径，但只投影叙事所需字段；调整决策、内部 id 和历史
 * 教练事件不会进入 Digest prompt。无 ACTIVE 计划时返回 null，由 Digest 降级为
 * 纯活动复盘。
 */
@Injectable()
export class ReviewDigestContextService {
  constructor(
    private readonly planExecution: PlanExecutionContextService,
    private readonly coachReviewContext: CoachReviewContextService,
  ) {}

  async build(args: {
    userId: string;
    type: ReviewDigestScale;
    lang: string;
    timezone: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<ReviewDigestCoachingContext | null> {
    const scale = scaleOf(args.type);
    const anchorInstant =
      args.type === 'DAILY'
        ? args.periodStart
        : new Date(args.periodEnd.getTime() - 1);
    const anchorDate =
      activityCalendarYmdInZone(anchorInstant, args.timezone) ??
      anchorInstant.toISOString().slice(0, 10);
    const execution = await this.planExecution.buildContext({
      userId: args.userId,
      surface: 'HOME_TODAY',
      timezone: args.timezone,
      anchorDate,
    });
    if (!execution.plan || execution.plan.status !== 'ACTIVE') return null;

    const context = await this.coachReviewContext.build({
      userId: args.userId,
      lang: args.lang,
      scale,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      context: execution,
    });
    return projectDigestContext(context, execution);
  }
}

function projectDigestContext(
  context: CoachReviewContext,
  execution: PlanExecutionContext,
): ReviewDigestCoachingContext {
  if (!execution.plan) {
    throw new Error('Digest coaching projection requires an active plan');
  }
  return {
    plan: {
      title: execution.plan.title,
      goal: execution.plan.goal,
      startDate: execution.plan.startDate,
      endDate: execution.plan.endDate,
      periodWeeks: execution.plan.periodWeeks,
      currentWeekIndex: execution.plan.currentWeekIndex,
      currentDayIndex: execution.plan.currentDayIndex,
    },
    reviewWindow: {
      from: context.meta.reviewedFrom,
      through: context.meta.reviewedThrough,
      ...context.reviewWindowSummary,
    },
    recentDays: context.recent7Days
      .filter(
        (day) =>
          day.date >= context.meta.reviewedFrom &&
          day.date <= context.meta.reviewedThrough,
      )
      .map((day) => ({
        date: day.date,
        plannedWorkouts: day.plannedWorkouts.map((workout) => ({
          weekIndex: workout.weekIndex,
          dayIndex: workout.dayIndex,
          sportType: workout.sportType,
          status: workout.status,
          name: workout.name,
          plannedDurationSeconds: workout.plannedDurationSeconds,
          plannedSessionRpe: workout.plannedSessionRpe,
          expectedLoad: workout.expectedLoad,
          linkedActivityCount: workout.linkedActivityIds.length,
        })),
        activities: day.activities.map((activity) => ({
          title: activity.title,
          sportType: activity.sportType,
          durationMinutes: activity.durationMinutes,
          distanceKm: activity.distanceKm,
          load: activity.load,
          sessionRpe: activity.sessionRpe,
          linkedToPlan: activity.linkedWorkoutId != null,
        })),
        pmc: day.pmc,
      })),
    loadSnapshot: context.loadSnapshot,
    upcoming: context.upcoming.map((workout) => ({
      date: workout.date,
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      sportType: workout.sportType,
      status: workout.status,
      name: workout.name,
      plannedDurationSeconds: workout.plannedDurationSeconds,
      plannedSessionRpe: workout.plannedSessionRpe,
      expectedLoad: workout.expectedLoad,
    })),
    competition: {
      upcomingEvents: context.competitionContext.upcomingEvents
        .slice(0, 3)
        .map((event) => ({
          title: event.title,
          startDate: event.startDate,
          sportType: event.sportType,
          importance: event.importance,
          daysFromAnchor: event.daysFromAnchor,
        })),
      activeInfluences: context.competitionContext.activeInfluences.map(
        (influence) => ({
          eventTitle: influence.eventTitle,
          eventStartDate: influence.eventStartDate,
          daysFromAnchor: influence.daysFromAnchor,
          impactLevel: influence.impactLevel,
          phase: influence.phase,
          confidence: influence.confidence,
          reasoningSummary: influence.reasoningSummary,
        }),
      ),
    },
    dataQuality: context.dataQuality,
  };
}

function scaleOf(type: ReviewDigestScale): CoachReviewScale {
  if (type === 'WEEKLY') return 'weekly';
  if (type === 'MONTHLY') return 'monthly';
  return 'daily';
}
