import type { CoachUserMessageBody } from "@/lib/ai-coach-stream";
import type { AiTodaySuggestionResponse } from "@/api/ai-today-suggestion";

export const TODAY_SUGGESTION_CONTEXT_TOOL_USE_ID =
  "client:today_suggestion_context";

const STORAGE_PREFIX = "trainingload:today-suggestion-coach:";

export type TodaySuggestionCoachContext = Pick<
  AiTodaySuggestionResponse,
  | "suggestionId"
  | "headline"
  | "summary"
  | "recommendation"
  | "confidence"
  | "uncertainty"
  | "evidence"
  | "primaryIntent"
  | "secondaryIntents"
  | "validUntil"
> & {
  date: string;
  weekday: string;
};

function storageKey(suggestionId: string) {
  return `${STORAGE_PREFIX}${suggestionId}`;
}

export function storeTodaySuggestionCoachContext(
  context: TodaySuggestionCoachContext,
): void {
  try {
    window.sessionStorage.setItem(
      storageKey(context.suggestionId),
      JSON.stringify(context),
    );
  } catch {
    // Restricted browsers can still open Coach with the visible prompt.
  }
}

export function claimTodaySuggestionCoachContext(
  suggestionId: string,
): TodaySuggestionCoachContext | null {
  try {
    const key = storageKey(suggestionId);
    const raw = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TodaySuggestionCoachContext>;
    return parsed.suggestionId === suggestionId &&
      parsed.headline &&
      parsed.summary
      ? (parsed as TodaySuggestionCoachContext)
      : null;
  } catch {
    return null;
  }
}

export function buildTodaySuggestionCoachMessage(args: {
  prompt: string;
  context: TodaySuggestionCoachContext;
}): CoachUserMessageBody {
  return {
    content: [
      { type: "text", text: args.prompt.trim() },
      {
        type: "tool_result",
        tool_use_id: TODAY_SUGGESTION_CONTEXT_TOOL_USE_ID,
        content: {
          kind: "today_suggestion_context",
          version: 1,
          ...args.context,
        },
      },
    ],
  };
}
