import type {
  TodaySuggestionIntentType,
  TodaySuggestionRecommendationKind,
  TodaySuggestionWorkout,
  TodaySuggestionFeedback,
} from '@shared/ai-today-suggestion-contract';
import type { TodayAdviceCoachState } from '../coach-state-context.service';
import type { ActivityEvidenceSnapshot } from '../core/training-data-coverage-query.service';
import type {
  TodayWeatherImpact,
  WeatherAttribution,
} from '@/weather/weather.types';

export const TODAY_SUGGESTION_POLICY_VERSION = 'today-activity-first-v4';

export type TodaySuggestionConstraintCode =
  | 'NEVER_RECORDED_ACTIVITY'
  | 'LAST_ACTIVITY_OVER_30_DAYS'
  | 'ACTIVITY_PROCESSING_PENDING'
  | 'TODAY_WORKOUT_COMPLETED'
  | 'TODAY_WORKOUT_AVAILABLE'
  | 'NO_ACTIVE_PLAN'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_DATA'
  | 'HIGH_CONCERN'
  | 'AI_DISABLED'
  | 'ACCESS_DENIED';

export type TodaySuggestionWorkoutFact = {
  id: string;
  planId: string | null;
  scheduledDate: string | null;
  name: string;
  sportType: string;
  status: string;
  plannedDurationSeconds: number | null;
  linkedActivityCount: number;
  revision?: number;
  updatedAt?: string | null;
};

export type TodaySuggestionConstraintProjection = {
  userId: string;
  locale: string;
  date: string;
  timezone: string | null;
  edition: 'self-host' | 'cloud';
  allowAi: boolean;
  featureAllowed: boolean;
  aiState?: string;
  factHash: string;
  constraintHash: string;
  continuityHash: string;
  validUntil: Date;
  localTime: string;
  minutesUntilDayEnd: number;
  constraints: TodaySuggestionConstraintCode[];
  requiredToolNames: string[];
  lightContext: Record<string, unknown>;
  activePlan: {
    id: string;
    title: string;
    goal: string | null;
    currentWeekIndex: number | null;
  } | null;
  todayWorkouts: TodaySuggestionWorkoutFact[];
  tomorrowWorkouts: TodaySuggestionWorkoutFact[];
  latestActivityId: string | null;
  latestActivityAt: string | null;
  todayActivityCount?: number;
  coverageDiagnosis?: Record<string, unknown> | null;
  activityEvidence: ActivityEvidenceSnapshot;
  coachState: TodayAdviceCoachState;
  pendingInquiry: {
    caseId: string;
    questionId: string;
  } | null;
  activeDecisionId: string | null;
  highConcern: boolean;
  userFeedback?: {
    feedback: TodaySuggestionFeedback;
    recordedAt: string;
    quietUntil: string | null;
  } | null;
  weatherImpact: TodayWeatherImpact;
  weatherAttribution: WeatherAttribution | null;
};

export type TodaySuggestionDraft = {
  headline: string;
  summary: string;
  recommendation: {
    kind: TodaySuggestionRecommendationKind;
    durationMinutes?: number;
    intensity?: 'VERY_EASY' | 'EASY' | 'MODERATE' | 'HARD';
    details?: string[];
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  uncertainty?: string;
  evidenceCodes: string[];
  preferredIntent: TodaySuggestionIntentType | null;
  secondaryIntents: TodaySuggestionIntentType[];
  generatedWorkout?: TodaySuggestionWorkout;
  tags: string[];
  coachDecisionHandling?: Array<{
    decisionId: string;
    handling: 'FOLLOW' | 'CONDITIONAL' | 'DEPART' | 'HISTORY' | 'IGNORE';
    reason: string | null;
  }>;
};

export type TodaySuggestionAgentRun = {
  draft: TodaySuggestionDraft;
  provider: string | null;
  model: string;
  runId: string;
  operationId: string;
  replayed: boolean;
};

export function hasRecentTrainingActivity(
  projection: TodaySuggestionConstraintProjection,
) {
  return (
    !(projection.constraints ?? []).includes('LAST_ACTIVITY_OVER_30_DAYS') &&
    Boolean(
      projection.latestActivityId ||
      projection.activityEvidence?.activities?.readyCount > 0,
    )
  );
}
