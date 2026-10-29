import { aiOperationErrorCode } from "@/lib/ai-operation-errors";
import {
  canRetryCoachTurnError,
  COACH_TURN_ERROR_PART_NAME,
  isCoachModelUnavailableErrorCode,
  type CoachTurnErrorData,
} from "@shared/coach-turn-error";
import {
  classifyMetaReasonFromErrorMessage,
  type CoachTranscriptItem,
} from "./coach-transcript-model";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads the turn-failure part from the read-only Coach message view
 * (`data-coach-turn-error` arrives as `{ type: "data", name, data }`).
 */
export function readCoachTurnError(
  content: readonly unknown[],
): CoachTurnErrorData | null {
  for (const part of content) {
    if (
      !isRecord(part) ||
      part.type !== "data" ||
      part.name !== COACH_TURN_ERROR_PART_NAME ||
      !isRecord(part.data) ||
      typeof part.data.code !== "string"
    ) {
      continue;
    }
    return {
      code: part.data.code,
      ...(typeof part.data.message === "string"
        ? { message: part.data.message }
        : {}),
    };
  }
  return null;
}

/**
 * The persisted failure row keeps its localized text as a plain text part for
 * other clients; the web card already shows it, so that copy is not repeated.
 */
export function isCoachTurnErrorEchoText(
  text: string,
  turnError: CoachTurnErrorData | null,
): boolean {
  const message = turnError?.message?.trim();
  return Boolean(message) && text.trim() === message;
}

export function shouldOfferCoachModelSwitch(
  turnError: CoachTurnErrorData,
): boolean {
  return isCoachModelUnavailableErrorCode(turnError.code);
}

/** Keep web retry behavior aligned with the shared web/mobile policy. */
export function shouldOfferCoachRetry(turnError: CoachTurnErrorData): boolean {
  return canRetryCoachTurnError(turnError.code);
}

/** Maps a turn failure to the shared transcript card model. */
export function buildCoachTurnErrorItem(
  turnError: CoachTurnErrorData,
  id: string,
  options: {
    /** Localized copy for deployment-neutral AI operation codes. */
    localizeOperationCode?: (code: string) => string | null;
    /** Localized copy for stable Coach failure categories. */
    localizeTurnError?: (error: CoachTurnErrorData) => string;
  } = {},
): CoachTranscriptItem {
  if (isCoachModelUnavailableErrorCode(turnError.code)) {
    const message = options.localizeTurnError?.(turnError);
    return {
      id,
      type: "turn_failed",
      reason: "model_unavailable",
      ...(message ? { message } : {}),
    };
  }
  if (aiOperationErrorCode(turnError.code)) {
    const reason = classifyMetaReasonFromErrorMessage(turnError.code);
    const message =
      options.localizeOperationCode?.(turnError.code) ?? undefined;
    return {
      id,
      type: "turn_failed",
      reason,
      // Deployment-specific accounting details remain behind the adapter.
      ...(message ? { message } : {}),
    };
  }
  return {
    id,
    type: "turn_failed",
    reason: "unknown",
    message: options.localizeTurnError?.(turnError),
  };
}
