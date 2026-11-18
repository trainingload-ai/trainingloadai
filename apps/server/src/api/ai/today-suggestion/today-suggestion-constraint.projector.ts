import { coachingSemanticValue } from '../core/coach-fact-semantic';
import { CoachFactContextService } from '../core/coach-fact-context.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { featureAllowed } from '@/access/feature-access.types';
import { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { sha256Hex, stableJson } from '../core/ai-common.util';
import { CoachAssessmentCaseQueryService } from '../athlete-state/coach-assessment-case-query.service';
import { CoachStateContextService } from '../coach-state-context.service';
import {
  TrainingDataCoverageQueryService,
  toAgentTrainingDataCoverageSnapshot,
} from '../core/training-data-coverage-query.service';
import { WeatherContextService } from '@/weather/weather-context.service';
import type { TodayWeatherLocation } from '@/weather/weather.types';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { TodaySuggestionEngagementService } from './today-suggestion-engagement.service';
import { TODAY_SUGGESTION_POLICY_VERSION } from './today-suggestion.types';
import type {
  TodaySuggestionConstraintCode,
  TodaySuggestionConstraintProjection,
  TodaySuggestionWorkoutFact,
} from './today-suggestion.types';

import { nextDate, todaySuggestionTimeContext } from './today-suggestion-time';
export {
  todaySuggestionTimeContext,
  todaySuggestionValidUntil,
} from './today-suggestion-time';

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
    private readonly engagement: TodaySuggestionEngagementService,
    private readonly workouts: PlanWorkoutRepository,
    @Optional() private readonly facts?: CoachFactContextService,
  ) {}

  async project(args: {
    userId: string;
    locale: string;
    timezone?: string | null;
    location?: TodayWeatherLocation | null;
    allowAi: boolean;
    allowWithoutConsent?: boolean;
  }): Promise<TodaySuggestionConstraintProjection> {
    const execution = await this.planExecution.buildContext({
      userId: args.userId,
      surface: 'HOME_TODAY',
      timezone: args.timezone,
    });
    const date = execution.anchor.anchorDate;
    const [
      rawCoachState,
      pendingInquiry,
      coverage,
      access,
      userFeedback,
      independent,
      recentActivities,
    ] = await Promise.all([
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
      this.engagement.feedbackForDate(args.userId, execution.anchor.anchorDate),
      this.workouts.findMany({
        where: {
          userId: args.userId,
          planId: null,
          scheduledDate: {
            gte: new Date(`${date}T00:00:00Z`),
            lte: new Date(`${nextDate(date)}T00:00:00Z`),
          },
        },
        orderBy: [{ scheduledDate: 'asc' }, { sessionIndex: 'asc' }],
        select: {
          id: true,
          planId: true,
          scheduledDate: true,
          name: true,
          notes: true,
          text: true,
          sportType: true,
          status: true,
          plannedDurationSeconds: true,
          revision: true,
          updatedAt: true,
          _count: { select: { links: { where: { unlinkedAt: null } } } },
        },
      }),
      this.trainingDataCoverage.recentActivityFacts(
        args.userId,
        new Date(Date.parse(`${date}T00:00:00Z`) - 35 * 86_400_000),
      ),
    ]);
    const featureAllowedForUser = featureAllowed(access, 'ai.todaySuggestion');
    const runtime = this.runtimeCapabilities.snapshot();
    const aiCapability = runtime.capabilities.ai;
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
    const sharedFacts = this.facts
      ? await this.facts.build({
          userId: args.userId,
          date,
          timezone: timezone || 'UTC',
          allowAi: args.allowAi && featureAllowedForUser,
          allowWithoutConsent: args.allowWithoutConsent,
        })
      : null;
    const coachState = sharedFacts
      ? this.coachState.forFactRevision(rawCoachState, sharedFacts.revision)
      : rawCoachState;
    const allowAi = args.allowAi && sharedFacts?.status !== 'DISABLED';
    const todayWorkouts = execution.day.plannedWorkouts.map(workoutFact);
    const tomorrowWorkouts =
      execution.tomorrow.plannedWorkouts.map(workoutFact);
    for (const row of independent) {
      const scheduledDate =
        row.scheduledDate?.toISOString().slice(0, 10) ?? null;
      const fact: TodaySuggestionWorkoutFact = {
        id: row.id,
        planId: null,
        scheduledDate,
        name:
          row.name?.trim() ||
          row.notes?.trim() ||
          row.text.slice(0, 100) ||
          'Workout',
        sportType: row.sportType,
        status: row.status,
        plannedDurationSeconds: row.plannedDurationSeconds,
        linkedActivityCount: row._count.links,
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      };
      (scheduledDate === date ? todayWorkouts : tomorrowWorkouts).push(fact);
    }
    const needsCoverageDiagnosis =
      !recentActivities.length ||
      coverage.activities.processing.some((row) => row.count > 0);
    const coverageDiagnosis = needsCoverageDiagnosis
      ? toAgentTrainingDataCoverageSnapshot(
          await this.trainingDataCoverage.snapshot({
            userId: args.userId,
            windowDays: 35,
          }),
        )
      : null;
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
    const scheduledToday = todayWorkouts.filter(
      (workout) => workout.status !== 'MOVED',
    );
    if (
      scheduledToday.length > 0 &&
      scheduledToday.every((workout) => workout.status === 'DONE')
    ) {
      constraints.push('TODAY_WORKOUT_COMPLETED');
    }
    if (
      todayWorkouts.some((workout) =>
        ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
      )
    ) {
      constraints.push('TODAY_WORKOUT_AVAILABLE');
    }
    if (pendingInquiry) constraints.push('WAITING_FOR_USER');
    if (coverageDiagnosis?.signals.syncInProgress)
      constraints.push('WAITING_FOR_DATA');
    const highConcern =
      String(coachState.athleteState?.state ?? '').toUpperCase() ===
        'HIGH_CONCERN' ||
      coachState.decisions.some(
        (decision) =>
          decision.riskTier === 'HIGH' &&
          decision.basisCoverage !== 'UNVERIFIED' &&
          decision.stateRole === 'ACTIVE_PROPOSAL' &&
          ['TODAY', 'TOMORROW'].includes(decision.relevance),
      );
    if (highConcern) constraints.push('HIGH_CONCERN');
    if (!allowAi) constraints.push('AI_DISABLED');
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
      policyVersion: TODAY_SUGGESTION_POLICY_VERSION,
      sharedFactRevision: sharedFacts?.revision ?? null,
      date,
      timezone,
      execution: coachingSemanticValue({
        day: execution.day,
        tomorrow: execution.tomorrow,
        load: execution.recentLoad,
        competition: execution.competitionContext,
      }),
      workoutMatching: execution.workoutMatching ?? [],
      plan: execution.plan
        ? {
            id: execution.plan.id,
            status: execution.plan.status,
            title: execution.plan.title,
            goal: execution.plan.goal,
            currentWeekIndex: execution.plan.currentWeekIndex,
            updatedAt: execution.plan.updatedAt,
          }
        : null,
      todayWorkouts: todayWorkouts.map((workout) => ({
        id: workout.id,
        status: workout.status,
        scheduledDate: workout.scheduledDate,
        linkedActivityCount: workout.linkedActivityCount,
        revision: workout.revision,
        updatedAt: workout.updatedAt,
      })),
      tomorrowWorkouts: tomorrowWorkouts.map((workout) => ({
        id: workout.id,
        status: workout.status,
        scheduledDate: workout.scheduledDate,
        revision: workout.revision,
        updatedAt: workout.updatedAt,
      })),
      coachState: coachingSemanticValue(coachState.athleteState),
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
      recentActivities,
      coverageDiagnosis: coverageDiagnosis
        ? {
            signals: coverageDiagnosis.signals,
            integrations: coverageDiagnosis.integrations,
          }
        : null,
      coachReadStatus: coachState.decisionReadStatus,
      assessmentReadStatus: coachState.assessmentReadStatus,
      assessmentCoverage: coachState.assessmentCoverage,
      coachReviews: coachState.recentReviews.map((review) => ({
        type: review.type,
        outcome: review.outcome,
        decision: review.decision,
        action: review.action,
        targetWorkoutId: review.targetWorkoutId,
        sourceWorkoutId: review.sourceWorkoutId,
        targetDate: review.targetDate,
        evidenceCodes: review.evidenceCodes,
      })),
      allowAi,
      featureAllowed: featureAllowedForUser,
      edition: process.env.DEPLOYMENT_MODE === 'cloud' ? 'cloud' : 'self-host',
      aiConfiguration: {
        state: aiCapability.state,
        provider: aiCapability.provider,
        defaultModel: process.env.AI_DEFAULT_MODEL?.trim() || null,
        reasoningModel: process.env.AI_REASONING_MODEL?.trim() || null,
        webSearchEnabled: process.env.AI_WEB_SEARCH_ENABLED === 'true',
      },
      userFeedback,
    };
    const constraintProjection = {
      constraints: [...constraints].sort(),
      athleteState: coachingSemanticValue(coachState.athleteState),
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
      coachState: coachingSemanticValue(coachState.athleteState),
      activeDecisionId: activeDecision?.id ?? null,
    };
    const requiredToolNames =
      !coverageDiagnosis &&
      constraints.some((constraint) =>
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
      allowAi,
      featureAllowed: featureAllowedForUser,
      factHash: sha256Hex(stableJson(coachingSemanticValue(factProjection))),
      aiState: aiCapability.state,
      constraintHash: sha256Hex(stableJson(constraintProjection)),
      continuityHash: sha256Hex(stableJson(continuityProjection)),
      validUntil: new Date(
        Math.min(
          timeContext.validUntil.getTime(),
          coachState.athleteState?.expiresAt &&
            Date.parse(coachState.athleteState.expiresAt) > Date.now()
            ? Date.parse(coachState.athleteState.expiresAt)
            : timeContext.validUntil.getTime(),
        ),
      ),
      localTime: timeContext.localTime,
      minutesUntilDayEnd: timeContext.minutesUntilDayEnd,
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
      matchingActivityId:
        execution.workoutMatching?.[0]?.activityHashId ?? null,
      latestActivityId:
        latestActivity?.hashId ?? recentActivities[0]?.hashId ?? null,
      latestActivityAt:
        latestActivity?.startTime ??
        recentActivities[0]?.startTime ??
        latestReadyAt,
      todayActivityCount: dayActivities.length,
      coverageDiagnosis,
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
      userFeedback,
      weatherImpact: weather.impact,
      weatherAttribution: weather.attribution,
      lightContext: {
        policyVersion: TODAY_SUGGESTION_POLICY_VERSION,
        sharedFacts,
        workoutMatching: execution.workoutMatching ?? [],
        assessmentCoverage: coachState.assessmentCoverage ?? 'UNVERIFIED',
        assessmentReadStatus: coachState.assessmentReadStatus ?? 'AVAILABLE',
        locale: args.locale,
        date,
        timezone,
        localTime: timeContext.localTime,
        minutesUntilDayEnd: timeContext.minutesUntilDayEnd,
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
        planCompletionState: execution.day.completionState,
        todayExecution: {
          scheduledCount: scheduledToday.length,
          completedCount: scheduledToday.filter(
            (workout) => workout.status === 'DONE',
          ).length,
          remainingCount: scheduledToday.filter((workout) =>
            ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
          ).length,
          skippedCount: scheduledToday.filter(
            (workout) => workout.status === 'SKIPPED',
          ).length,
          recordedActivityCount: dayActivities.length,
        },
        load: execution.recentLoad,
        recentActivity: latestActivity,
        todayActivities: dayActivities,
        recentActivities,
        coverageDiagnosis,
        activityCoverage: {
          readyCount: coverage.activities.readyCount,
          latestReadyAt,
          daysSinceLatestReady,
          processingPending: constraints.includes(
            'ACTIVITY_PROCESSING_PENDING',
          ),
        },
        athleteState: coachState.athleteState,
        pendingInquiry: pendingInquiry
          ? { caseId: pendingInquiry.caseId }
          : null,
        userFeedback,
        relevantDecisions: coachState.decisions.filter((decision) =>
          ['TODAY', 'TOMORROW', 'UNKNOWN'].includes(decision.relevance),
        ),
        coachDecisionReadStatus: coachState.decisionReadStatus,
        recentReviews: coachState.recentReviews,
        competition: execution.competitionContext,
        weather: weather.impact,
      },
    };
  }
}
