import type { CoachUserMessageBody } from "@/lib/ai-coach-stream";
import type { TodaySuggestionServerContext } from "@/api/ai-today-suggestion";

export const TODAY_SUGGESTION_CONTEXT_TOOL_USE_ID =
  "client:today_suggestion_context";

/** Only the reference is authoritative; the server reloads its current context. */
export function buildTodaySuggestionCoachMessage(args: {
  prompt: string;
  context: TodaySuggestionServerContext;
}): CoachUserMessageBody {
  return {
    content: [
      { type: "text", text: args.prompt.trim() },
      {
        type: "tool_result",
        tool_use_id: TODAY_SUGGESTION_CONTEXT_TOOL_USE_ID,
        content: {
          kind: "today_suggestion_context",
          version: 2,
          suggestionId: args.context.suggestionId,
        },
      },
    ],
  };
}
