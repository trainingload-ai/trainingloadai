import { describe, expect, it } from "vitest";
import { buildTodaySuggestionCoachMessage } from "./today-suggestion-coach-context";
import type { TodaySuggestionServerContext } from "@/api/ai-today-suggestion";

describe("server-owned today guidance", () => {
  it("sends a reference without trusting or duplicating cached claims", () => {
    const context: TodaySuggestionServerContext = {
      kind: "today_suggestion_context",
      version: 2,
      suggestionId: "owned-reference",
      date: "2026-11-18",
      headline: "旧标题",
      summary: "可能已过期的判断",
      currentFacts: { private: "not sent by the browser" },
      guidanceStatus: "CURRENT",
      instruction: "not a client instruction",
    };
    const message = buildTodaySuggestionCoachMessage({
      prompt: "请帮我核对这次活动",
      context,
    });
    expect(message.content[0]).toEqual({
      type: "text",
      text: "请帮我核对这次活动",
    });
    expect(message.content[1]).toEqual({
      type: "tool_result",
      tool_use_id: "client:today_suggestion_context",
      content: {
        kind: "today_suggestion_context",
        version: 2,
        suggestionId: "owned-reference",
      },
    });
  });
});
