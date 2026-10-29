import { aiOperationErrorReason } from "./ai-operation-errors";

/**
 * Coach turn failure contract shared by server, web client and mobile.
 *
 * When a coach turn ends without an answer the server streams (and persists as
 * a non-replayable assistant row) a UI data part of this type, so the failure
 * stays visible after a refresh and can offer the appropriate recovery action.
 * These rows are never sent back to the model as conversation context.
 */
export const COACH_TURN_ERROR_PART_TYPE = "data-coach-turn-error" as const;

/** Data part name as seen by assistant-ui (`type: "data"`, `name`). */
export const COACH_TURN_ERROR_PART_NAME = "coach-turn-error" as const;

/**
 * Any model-side failure: provider error, timeout, unavailable tier, rate
 * limit, or a stream without a usable answer. The client suggests switching
 * the model tier and retrying.
 */
export const COACH_MODEL_UNAVAILABLE_ERROR_CODE = "model_unavailable" as const;

/** Stable runtime-neutral terminal codes emitted by the coach runtime. */
export const COACH_TURN_ERROR_CODES = [
  COACH_MODEL_UNAVAILABLE_ERROR_CODE,
  "aborted",
  "business",
  "internal",
  "upstream_failed",
  "unsafe_ai_output_blocked",
  "invalid_ask_user_question_payload",
  "invalid_plan_workout_adjustment_payload",
  "invalid_plan_draft_payload",
  "invalid_ui_surface_payload",
] as const;
const COACH_TURN_ERROR_CODE_SET = new Set<string>(COACH_TURN_ERROR_CODES);

/** Stable presentation categories shared by web and mobile. */
export type CoachTurnErrorReason =
  | "modelUnavailable"
  | "aborted"
  | "business"
  | "internal"
  | "upstreamFailed"
  | "unsafeOutput"
  | "invalidStructuredOutput"
  | "unknown";

const COACH_TURN_ERROR_REASONS: Record<string, CoachTurnErrorReason> = {
  model_unavailable: "modelUnavailable",
  aborted: "aborted",
  business: "business",
  internal: "internal",
  upstream_failed: "upstreamFailed",
  unsafe_ai_output_blocked: "unsafeOutput",
  invalid_ask_user_question_payload: "invalidStructuredOutput",
  invalid_plan_workout_adjustment_payload: "invalidStructuredOutput",
  invalid_plan_draft_payload: "invalidStructuredOutput",
  invalid_ui_surface_payload: "invalidStructuredOutput",
};

export type CoachTurnErrorData = {
  /** Stable error code, e.g. `model_unavailable`, `internal`, `business`. */
  code: string;
  /** Localized, user-facing failure text (already in the reply language). */
  message?: string;
};

const MACHINE_ERROR_CODE = /^[A-Z][A-Z0-9_]*(?::\S+)?$/;

/** Returns only displayable server copy, never a machine-code echo. */
export function coachTurnErrorUserMessage(
  error: CoachTurnErrorData,
): string | null {
  const message = error.message?.trim() ?? "";
  if (!message || message === error.code || MACHINE_ERROR_CODE.test(message)) {
    return null;
  }
  return message;
}

export function isCoachModelUnavailableErrorCode(code: unknown): boolean {
  return code === COACH_MODEL_UNAVAILABLE_ERROR_CODE;
}

export function isCoachTurnErrorCode(code: unknown): boolean {
  return typeof code === "string" && COACH_TURN_ERROR_CODE_SET.has(code);
}

/**
 * Converts internal terminal codes into a small user-facing vocabulary. An
 * unknown code deliberately becomes a generic category instead of exposing
 * unreviewed server text.
 */
export function coachTurnErrorReason(code: unknown): CoachTurnErrorReason {
  return typeof code === "string"
    ? (COACH_TURN_ERROR_REASONS[code] ?? "unknown")
    : "unknown";
}

/** Business errors may carry reviewed, domain-specific guidance from server. */
export function canUseCoachTurnServerMessage(code: unknown): boolean {
  return coachTurnErrorReason(code) === "business";
}

/**
 * Shared retry policy for persisted coach failures. Errors that require a
 * access policy, system configuration or support change must not offer
 * a retry that is guaranteed to fail with the same state.
 */
export function canRetryCoachTurnError(code: unknown): boolean {
  const operationReason = aiOperationErrorReason(code);
  return !["accessRequired", "purposeUnavailable"].includes(operationReason ?? "");
}
