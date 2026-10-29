import { localizedAiOperationError } from "@/lib/ai-operation-errors";
import {
  coachTurnErrorReason,
  isCoachTurnErrorCode,
  type CoachTurnErrorReason,
} from "@shared/coach-turn-error";
import {
  classifyMetaReasonFromErrorMessage,
  type CoachTranscriptMetaReason,
} from "./coach-transcript-model";

const TRANSCRIPT_REASON_KEYS: Record<CoachTranscriptMetaReason, string> = {
  timeout: "reasonTimeout",
  disconnect: "reasonDisconnect",
  rate_limit: "reasonRateLimit",
  access_required: "reasonAccessRequired",
  action_in_progress: "reasonActionInProgress",
  settlement_pending: "reasonSettlementPending",
  model_tier: "reasonModelTierUnavailable",
  model_unavailable: "reasonModelUnavailable",
  auth: "reasonAuth",
  server: "reasonServer",
  internal: "reasonInternal",
  unknown: "reasonUnknown",
};

export type CoachVisibleErrorTranslate = {
  operation: (key: string) => string;
  turn: (key: CoachTurnErrorReason) => string;
  transcript: (key: string) => string;
};

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * Maps Coach and deployment-neutral AI operation failures to localized copy.
 * Never returns machine codes such as `AI_MODEL_PURPOSE_UNAVAILABLE`.
 */
export function resolveCoachVisibleErrorMessage(
  error: unknown,
  translate: CoachVisibleErrorTranslate,
): string {
  const operation = localizedAiOperationError(error, translate.operation);
  if (operation) return operation;
  const raw = errorText(error);
  if (isCoachTurnErrorCode(raw)) {
    return translate.turn(coachTurnErrorReason(raw));
  }
  const reason = classifyMetaReasonFromErrorMessage(raw);
  return translate.transcript(TRANSCRIPT_REASON_KEYS[reason]);
}
