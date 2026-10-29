import type {
  WorkoutStructure,
  WorkoutStructureKind,
} from "./workout-structure";
import type { WorkoutSummary } from "./workout-summary";

export const TODAY_SUGGESTION_VERSION = 2 as const;

export const TODAY_SUGGESTION_INTENT_TYPES = [
  "OPEN_TODAY_WORKOUT",
  "OPEN_PLAN",
  "OPEN_ASSESSMENT",
  "OPEN_PROVIDER_SETTINGS",
  "OPEN_IMPORT",
  "OPEN_ACTIVITY_REVIEW",
  "OPEN_DECISION",
  "ASK_COACH",
  "VIEW_TOMORROW",
  "CREATE_TODAY_WORKOUT",
  "SCHEDULE_REMINDER",
] as const;

export type TodaySuggestionIntentType =
  (typeof TODAY_SUGGESTION_INTENT_TYPES)[number];

type IntentBase<T extends TodaySuggestionIntentType> = {
  type: T;
  label: string;
};

export type TodaySuggestionIntent =
  | (IntentBase<"OPEN_TODAY_WORKOUT"> & {
      workoutId: string;
      scheduledDate: string;
      planId?: string | null;
    })
  | (IntentBase<"OPEN_PLAN"> & { planId: string })
  | (IntentBase<"OPEN_ASSESSMENT"> & { caseId: string })
  | (IntentBase<"OPEN_PROVIDER_SETTINGS"> & { provider?: string })
  | IntentBase<"OPEN_IMPORT">
  | (IntentBase<"OPEN_ACTIVITY_REVIEW"> & { activityId: string })
  | (IntentBase<"OPEN_DECISION"> & { decisionId: string })
  | (IntentBase<"ASK_COACH"> & { starterCode: string })
  | (IntentBase<"VIEW_TOMORROW"> & { date: string })
  | (IntentBase<"CREATE_TODAY_WORKOUT"> & {
      proposalToken: string;
      preview: TodaySuggestionWorkout;
    })
  | (IntentBase<"SCHEDULE_REMINDER"> & {
      earliestAt: string;
      latestAt: string;
      reminderId?: string | null;
    });

export type TodaySuggestionDeliveryState =
  | "GENERATED"
  | "CACHED"
  | "FACT_FALLBACK"
  | "AI_UNAVAILABLE";

export type TodaySuggestionDeliveryReason =
  | "GENERATED"
  | "CACHE_HIT"
  | "COACH_STATE_UNAVAILABLE"
  | "AI_DISABLED"
  | "AI_NOT_CONFIGURED"
  | "ACCESS_DENIED"
  | "CONTEXT_TOO_LARGE"
  | "OUTPUT_REJECTED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR";

export type TodaySuggestionRecommendationKind =
  | "TRAIN"
  | "RECOVER"
  | "REST"
  | "CHECK_IN"
  | "SYNC_DATA"
  | "ADJUST_PLAN"
  | "REVIEW_ACTIVITY";

export type TodaySuggestionIntensity =
  | "VERY_EASY"
  | "EASY"
  | "MODERATE"
  | "HARD";

export type TodaySuggestionWorkout = {
  sportType: "RUN" | "CYCLING" | "SWIM" | "STRETCHING" | "UNKNOWN";
  sportDefinitionCode?: string | null;
  name: string;
  notes: string;
  structureKind: WorkoutStructureKind;
  dslVersion: 1;
  text: string;
  structure: WorkoutStructure;
  summary: WorkoutSummary;
};

export function isTodaySuggestionWorkout(
  value: unknown,
): value is TodaySuggestionWorkout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    ["RUN", "CYCLING", "SWIM", "STRETCHING", "UNKNOWN"].includes(
      String(row.sportType ?? ""),
    ) &&
    typeof row.name === "string" &&
    typeof row.notes === "string" &&
    ["ENDURANCE", "STRENGTH", "FREEFORM"].includes(
      String(row.structureKind ?? ""),
    ) &&
    row.dslVersion === 1 &&
    typeof row.text === "string" &&
    Boolean(row.structure && typeof row.structure === "object") &&
    Boolean(row.summary && typeof row.summary === "object")
  );
}

export type TodaySuggestionEvidence = {
  code: string;
  label: string;
  evidenceRefs: string[];
};

export type TodaySuggestionV2 = {
  version: typeof TODAY_SUGGESTION_VERSION;
  suggestionId: string;
  delivery: {
    state: TodaySuggestionDeliveryState;
    reasonCode: TodaySuggestionDeliveryReason;
    generatedAt: string | null;
  };
  headline: string;
  summary: string;
  recommendation: {
    kind: TodaySuggestionRecommendationKind;
    durationMinutes?: number;
    intensity?: TodaySuggestionIntensity;
    details?: string[];
  };
  confidence: "HIGH" | "MEDIUM" | "LOW";
  uncertainty?: string;
  evidence: TodaySuggestionEvidence[];
  primaryIntent: TodaySuggestionIntent | null;
  secondaryIntents: TodaySuggestionIntent[];
  assessmentCaseRef?: { caseId: string; questionId: string };
  decisionRef?: { decisionId: string };
  validUntil: string;
};

export const TODAY_SUGGESTION_INTERACTION_KINDS = [
  "PRESENTED",
  "INTENT_SELECTED",
  "FEEDBACK",
] as const;

export type TodaySuggestionInteractionKind =
  (typeof TODAY_SUGGESTION_INTERACTION_KINDS)[number];

export const TODAY_SUGGESTION_FEEDBACK_VALUES = [
  "REST_TODAY",
  "TRAINED_ELSEWHERE",
  "DATA_PENDING",
  "LATER",
] as const;

export type TodaySuggestionFeedback =
  (typeof TODAY_SUGGESTION_FEEDBACK_VALUES)[number];

export type TodaySuggestionInteractionInput =
  | { kind: "PRESENTED" }
  | { kind: "INTENT_SELECTED"; intentType: TodaySuggestionIntentType }
  | { kind: "FEEDBACK"; feedback: TodaySuggestionFeedback };

export type TodaySuggestionWorkoutExecutionResult = {
  workoutId: string;
  actionId: string;
  undoUntil: string | null;
  intent: Extract<TodaySuggestionIntent, { type: "OPEN_TODAY_WORKOUT" }>;
};

export type TodaySuggestionReminderResult = {
  reminderId: string;
  remindAt: string;
};

export function isTodaySuggestionIntentType(
  value: unknown,
): value is TodaySuggestionIntentType {
  return TODAY_SUGGESTION_INTENT_TYPES.includes(
    String(value ?? "") as TodaySuggestionIntentType,
  );
}

export function isTodaySuggestionFeedback(
  value: unknown,
): value is TodaySuggestionFeedback {
  return TODAY_SUGGESTION_FEEDBACK_VALUES.includes(
    String(value ?? "") as TodaySuggestionFeedback,
  );
}
