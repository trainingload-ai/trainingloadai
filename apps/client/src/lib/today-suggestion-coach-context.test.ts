import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTodaySuggestionCoachMessage,
  claimTodaySuggestionCoachContext,
  storeTodaySuggestionCoachContext,
  TODAY_SUGGESTION_CONTEXT_TOOL_USE_ID,
  type TodaySuggestionCoachContext,
} from "./today-suggestion-coach-context";

const context: TodaySuggestionCoachContext = {
  suggestionId: "suggestion-1",
  date: "2026-10-29",
  weekday: "Thursday",
  headline: "Keep today easy",
  summary: "Use a short recovery run.",
  recommendation: { kind: "RECOVER", durationMinutes: 20 },
  confidence: "MEDIUM",
  evidence: [],
  primaryIntent: null,
  secondaryIntents: [],
  validUntil: "2026-10-29T15:59:59.999Z",
};

describe("today suggestion coach context", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("claims a stored suggestion once", () => {
    storeTodaySuggestionCoachContext(context);
    expect(claimTodaySuggestionCoachContext("suggestion-1")).toEqual(context);
    expect(claimTodaySuggestionCoachContext("suggestion-1")).toBeNull();
  });

  it("builds a visible prompt with structured product context", () => {
    const message = buildTodaySuggestionCoachMessage({
      prompt: "Help me decide what to do next.",
      context,
    });
    expect(message.content[0]).toEqual({
      type: "text",
      text: "Help me decide what to do next.",
    });
    expect(message.content[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: TODAY_SUGGESTION_CONTEXT_TOOL_USE_ID,
      content: {
        kind: "today_suggestion_context",
        suggestionId: "suggestion-1",
      },
    });
  });
});
