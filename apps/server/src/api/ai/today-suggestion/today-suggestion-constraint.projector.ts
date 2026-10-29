import { Inject, Injectable } from '@nestjs/common';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { featureAllowed } from '@/access/feature-access.types';
import { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import { sha256Hex, stableJson } from '../core/ai-common.util';
import { CoachAssessmentCaseQueryService } from '../athlete-state/coach-assessment-case-query.service';
import { CoachStateContextService } from '../coach-state-context.service';
import { TrainingDataCoverageQueryService } from '../core/training-data-coverage-query.service';
import { WeatherContextService } from '@/weather/weather-context.service';
import type { TodayWeatherLocation } from '@/weather/weather.types';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import type {
  TodaySuggestionConstraintCode,
  TodaySuggestionConstraintProjection,
  TodaySuggestionWorkoutFact,
} from './today-suggestion.types';

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return (
    Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    ) - at.getTime()
  );
}

/** End of the projected local day, represented as the first instant of the next day. */
export function todaySuggestionValidUntil(
  date: string,
  timezone: string | null,
) {
  const [year, month, day] = nextDate(date).split('-').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day);
  if (!timezone) return new Date(wallClockUtc);
  try {
    let candidate = new Date(wallClockUtc);
    for (let index = 0; index < 2; index += 1) {
      candidate = new Date(
        wallClockUtc - timeZoneOffsetMs(candidate, timezone),
      );
    }
    return candidate;
  } catch {
    return new Date(wallClockUtc);
  }
}

export const TODAY_SUGGESTION_NEW_WORKOUT_CUTOFF_LOCAL_MINUTES = 20 * 60;

function localTime(at: Date, timezone: string | null) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

export function todaySuggestionTimeContext(
  date: string,
  timezone: string | null,
  now = new Date(),
) {
  const validUntil = todaySuggestionValidUntil(date, timezone);
  const currentLocalTime = localTime(now, timezone);
  const [localHour, localMinute] = currentLocalTime.split(':').map(Number);
  const localMinutesSinceMidnight = localHour * 60 + localMinute;
  const minutesUntilDayEnd = Math.max(
    0,
    Math.floor((validUntil.getTime() - now.getTime()) / 60_000),
  );
  return {
    validUntil,
    localTime: currentLocalTime,
    minutesUntilDayEnd,
    newWorkoutWindowOpen:
      localMinutesSinceMidnight <
      TODAY_SUGGESTION_NEW_WORKOUT_CUTOFF_LOCAL_MINUTES,
  };
}

function workoutFact(
  workout: Awaited<
    ReturnType<PlanExecutionContextService['buildContext']>
  >['day']['plannedWorkouts'][number],
): TodaySuggestionWorkoutFact {
  return {
    id: workout.id,
    planId: workout.planId ?? null,
    scheduledDate: workout.scheduledDate,
    name:
      String(workout.name ?? '').trim() ||
      String(workout.notes ?? '').trim() ||
      String(workout.text ?? '')
        .trim()
        .slice(0, 100) ||
      'Workout',
    sportType: String(workout.sportType ?? 'UNKNOWN').toUpperCase(),
    status: String(workout.status ?? '').toUpperCase(),
    plannedDurationSeconds: workout.plannedDurationSeconds,
    linkedActivityCount: workout.linkedActivities.length,
  };
}

@Injectable()
export class TodaySuggestionConstraintProjector {
  constructor(
    private readonly planExecution: PlanExecutionContextService,
    private readonly coachState: CoachStateContextService,
    private readonly assessmentCases: CoachAssessmentCaseQueryService,
    private readonly trainingDataCoverage: TrainingDataCoverageQueryService,
    private readonly weatherContext: WeatherContextService,
    private readonly runtimeCapabilities: RuntimeCapabilityService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
  ) {}

  async project(args: {
    userId: string;
    locale: string;
    timezone?: string | null;
    location?: TodayWeatherLocation | null;
    allowAi: boolean;
  }): Promise<TodaySuggestionConstraintProjection> {
    const execution = await this.planExecution.buildContext({
      userId: args.userId,
      surface: 'HOME_TODAY',
      timezone: args.timezone,
    });
    const [coachState, pendingInquiry, coverage, access] = await Promise.all([
      this.coachState.build({
        userId: args.userId,
        contextId: execution.contextId,
        anchorDate: execution.anchor.anchorDate,
        recentEvents: execution.recentEvents,
      }),
      this.assessmentCases.pendingInquiry(args.userId),
      this.trainingDataCoverage.activityEvidence({
        userId: args.userId,
        windowDays: 35,
      }),
      this.featureAccess.evaluate(args.userId, ['ai.todaySuggestion']),
    ]);
    const featureAllowedForUser = featureAllowed(access, 'ai.todaySuggestion');
    const runtime = this.runtimeCapabilities.snapshot();
    const aiCapability = runtime.capabilities.ai;
    const date = execution.anchor.anchorDate;
    const timezone = execution.anchor.timezone;
    const timeContext = todaySuggestionTimeContext(date, timezone);
    const weather = args.location
      ? await this.weatherContext.getTodayWeatherContext({
          userId: args.userId,
          locale: args.locale,
          timezone: timezone || 'UTC',
          location: args.location,
        })
      : { impact: { status: 'unavailable' as const }, attribution: null };
    const todayWorkouts = execution.day.plannedWorkouts.map(workoutFact);
    const tomorrowWorkouts =
      execution.tomorrow.plannedWorkouts.map(workoutFact);
    const constraints: TodaySuggestionConstraintCode[] = [];
    const latestReadyAt = coverage.activities.latestReadyAt;
    const daysSinceLatestReady = latestReadyAt
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(latestReadyAt)) /
              86_400_000,
          ),
        )
      : null;
    if (!latestReadyAt) constraints.push('NEVER_RECORDED_ACTIVITY');
    if (daysSinceLatestReady != null && daysSinceLatestReady > 30) {
      constraints.push('LAST_ACTIVITY_OVER_30_DAYS');
    }
    if (coverage.activities.processing.some((row) => row.count > 0)) {
      constraints.push('ACTIVITY_PROCESSING_PENDING');
    }
    if (!execution.plan) constraints.push('NO_ACTIVE_PLAN');
    if (todayWorkouts.some((workout) => workout.status === 'DONE')) {
      constraints.push('TODAY_WORKOUT_COMPLETED');
    }
    if (
      todayWorkouts.some((workout) =>
        ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
      )
    ) {
      constraints.push('TODAY_WORKOUT_AVAILABLE');
    }
    if (!timeContext.newWorkoutWindowOpen) {
      constraints.push('TODAY_TRAINING_WINDOW_CLOSED');
    }
    const caseStatus = String(
      coachState.athleteState?.caseStatus ?? '',
    ).toUpperCase();
    if (caseStatus === 'WAITING_FOR_USER') constraints.push('WAITING_FOR_USER');
    if (caseStatus === 'WAITING_FOR_DATA') constraints.push('WAITING_FOR_DATA');
    const highConcern =
      String(coachState.athleteState?.state ?? '').toUpperCase() ===
        'HIGH_CONCERN' ||
      coachState.decisions.some(
        (decision) =>
          decision.riskTier === 'HIGH' &&
          decision.stateRole === 'ACTIVE_PROPOSAL' &&
          ['TODAY', 'TOMORROW'].includes(decision.relevance),
      );
    if (highConcern) constraints.push('HIGH_CONCERN');
    if (!args.allowAi) constraints.push('AI_DISABLED');
    if (!featureAllowedForUser) constraints.push('ACCESS_DENIED');

    const dayActivities = [
      ...execution.day.linkedActivities,
      ...execution.day.unlinkedActivities,
    ].sort((left, right) =>
      String(right.startTime ?? '').localeCompare(String(left.startTime ?? '')),
    );
    const latestActivity = dayActivities[0] ?? null;
    const activeDecision = coachState.decisions.find(
      (decision) =>
        decision.stateRole === 'ACTIVE_PROPOSAL' &&
        ['TODAY', 'TOMORROW', 'UNKNOWN'].includes(decision.relevance),
    );
    const factProjection = {
      date,
      timezone,
      executionFactHash: execution.factHash,
      plan: execution.plan
        ? {
            id: execution.plan.id,
            status: execution.plan.status,
            updatedAt: execution.plan.updatedAt,
          }
        : null,
      todayWorkouts: todayWorkouts.map((workout) => ({
        id: workout.id,
        status: workout.status,
        scheduledDate: workout.scheduledDate,
        linkedActivityCount: workout.linkedActivityCount,
      })),
      tomorrowWorkouts: tomorrowWorkouts.map((workout) => ({
        id: workout.id,
        status: workout.status,
        scheduledDate: workout.scheduledDate,
      })),
      coachState: coachState.athleteState,
      decisions: coachState.decisions.map((decision) => ({
        id: decision.id,
        state: decision.state,
        relevance: decision.relevance,
        appliedAt: decision.appliedAt,
      })),
      coverage: {
        latestReadyAt,
        readyCount: coverage.activities.readyCount,
        processing: coverage.activities.processing,
      },
      allowAi: args.allowAi,
      featureAllowed: featureAllowedForUser,
      edition: process.env.DEPLOYMENT_MODE === 'cloud' ? 'cloud' : 'self-host',
      aiConfiguration: {
        state: aiCapability.state,
        provider: aiCapability.provider,
        defaultModel: process.env.AI_DEFAULT_MODEL?.trim() || null,
        reasoningModel: process.env.AI_REASONING_MODEL?.trim() || null,
        webSearchEnabled: process.env.AI_WEB_SEARCH_ENABLED === 'true',
      },
      newWorkoutWindowOpen: timeContext.newWorkoutWindowOpen,
    };
    const constraintProjection = {
      constraints: [...constraints].sort(),
      athleteStateEvidenceHash: coachState.athleteState?.evidenceHash ?? null,
      pendingQuestionId: pendingInquiry?.questionId ?? null,
    };
    const continuityProjection = {
      constraints: [...constraints].sort(),
      planId: execution.plan?.id ?? null,
      planUpdatedAt: execution.plan?.updatedAt ?? null,
      todayWorkouts: todayWorkouts.map((workout) => ({
        id: workout.id,
        status: workout.status,
        linkedActivityCount: workout.linkedActivityCount,
      })),
      latestReadyAt,
      coachStateEvidenceHash: coachState.athleteState?.evidenceHash ?? null,
      activeDecisionId: activeDecision?.id ?? null,
    };
    const requiredToolNames = constraints.some((constraint) =>
      [
        'NEVER_RECORDED_ACTIVITY',
        'LAST_ACTIVITY_OVER_30_DAYS',
        'ACTIVITY_PROCESSING_PENDING',
      ].includes(constraint),
    )
      ? ['training.data_coverage']
      : [];
    const edition =
      process.env.DEPLOYMENT_MODE === 'cloud' ? 'cloud' : 'self-host';
    return {
      userId: args.userId,
      locale: args.locale,
      date,
      timezone,
      edition,
      allowAi: args.allowAi,
      featureAllowed: featureAllowedForUser,
      factHash: sha256Hex(stableJson(factProjection)),
      constraintHash: sha256Hex(stableJson(constraintProjection)),
      continuityHash: sha256Hex(stableJson(continuityProjection)),
      validUntil: timeContext.validUntil,
      localTime: timeContext.localTime,
      minutesUntilDayEnd: timeContext.minutesUntilDayEnd,
      newWorkoutWindowOpen: timeContext.newWorkoutWindowOpen,
      constraints,
      requiredToolNames,
      activePlan: execution.plan
        ? {
            id: execution.plan.id,
            title: execution.plan.title,
            goal: execution.plan.goal,
            currentWeekIndex: execution.plan.currentWeekIndex,
          }
        : null,
      todayWorkouts,
      tomorrowWorkouts,
      latestActivityId: latestActivity?.hashId ?? null,
      latestActivityAt: latestActivity?.startTime ?? latestReadyAt,
      activityEvidence: coverage,
      coachState,
      pendingInquiry: pendingInquiry
        ? {
            caseId: pendingInquiry.caseId,
            questionId: pendingInquiry.questionId,
          }
        : null,
      activeDecisionId: activeDecision?.id ?? null,
      highConcern,
      weatherImpact: weather.impact,
      weatherAttribution: weather.attribution,
      lightContext: {
        locale: args.locale,
        date,
        timezone,
        newWorkoutWindowOpen: timeContext.newWorkoutWindowOpen,
        edition,
        constraints,
        plan: execution.plan
          ? {
              id: execution.plan.id,
              title: execution.plan.title,
              goal: execution.plan.goal,
              currentWeekIndex: execution.plan.currentWeekIndex,
            }
          : null,
        todayWorkouts,
        tomorrowWorkouts,
        dayCompletionState: execution.day.completionState,
        load: execution.recentLoad,
        recentActivity: latestActivity,
        activityCoverage: {
          readyCount: coverage.activities.readyCount,
          latestReadyAt,
          daysSinceLatestReady,
          processingPending: constraints.includes(
            'ACTIVITY_PROCESSING_PENDING',
          ),
        },
        athleteState: coachState.athleteState,
        relevantDecisions: coachState.decisions.filter((decision) =>
          ['TODAY', 'TOMORROW', 'UNKNOWN'].includes(decision.relevance),
        ),
        competition: execution.competitionContext,
        weather: weather.impact,
      },
    };
  }
}
