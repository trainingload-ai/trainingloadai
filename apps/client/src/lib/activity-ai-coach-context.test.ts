import { describe, expect, it } from "vitest";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { getCoachUserToolResultParts } from "@/lib/ai-coach-ui-parts";
import {
  ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
  ACTIVITY_COACH_SID_PREFIX,
  attachActivityCoachContextToUserMessage,
  activityCoachSessionId,
  activityReviewAssistantMessageId,
  buildActivityAiCoachMessage,
  shouldAttachActivityCoachContext,
  withActivityReviewAssistantSeed,
  withPersistedActivityReviewAssistantSeed,
} from "./activity-ai-coach-context";

const REVIEW = "## 配速与跑步经济性\n平均配速 5:56/km。";

describe("activityCoachSessionId", () => {
  it("uses a stable activity-keyed sid within the coach sid length limit", () => {
    expect(activityCoachSessionId("17879876544695645646")).toBe(
      `${ACTIVITY_COACH_SID_PREFIX}17879876544695645646`,
    );
    expect(activityCoachSessionId("  activity-1  ")).toBe(
      `${ACTIVITY_COACH_SID_PREFIX}activity-1`,
    );
    expect(activityCoachSessionId("17879876544695645646").length).toBeLessThanOrEqual(
      64,
    );
  });

  it("hashes unsafe or oversized activity ids instead of dropping the prefix", () => {
    const sid = activityCoachSessionId("weird id / with spaces");
    expect(sid.startsWith(ACTIVITY_COACH_SID_PREFIX)).toBe(true);
    expect(sid).not.toContain(" ");
    expect(sid.length).toBeLessThanOrEqual(64);
    expect(activityCoachSessionId("weird id / with spaces")).toBe(sid);
  });
});

describe("withActivityReviewAssistantSeed", () => {
  it("puts the review markdown first and keeps persisted follow-ups", () => {
    const persisted: CoachUiMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "步频是不是偏低？" }],
      },
      {
        id: "assistant-2",
        role: "assistant",
        parts: [{ type: "text", text: "偏低一点，可以先试 165。" }],
      },
    ];

    const seeded = withActivityReviewAssistantSeed(persisted, {
      activityId: "activity-1",
      markdown: REVIEW,
    });

    expect(seeded[0]).toMatchObject({
      id: activityReviewAssistantMessageId("activity-1"),
      role: "assistant",
      parts: [{ type: "text", text: REVIEW }],
    });
    expect(seeded.slice(1)).toEqual(persisted);
  });

  it("does not duplicate the local review seed if it was already prepended", () => {
    const once = withActivityReviewAssistantSeed([], {
      activityId: "activity-1",
      markdown: REVIEW,
    });
    const twice = withActivityReviewAssistantSeed(once, {
      activityId: "activity-1",
      markdown: REVIEW,
    });
    expect(twice).toHaveLength(1);
    expect(twice[0]?.id).toBe(activityReviewAssistantMessageId("activity-1"));
  });

  it("restores the opening review from the persisted first-turn context", () => {
    const messages: CoachUiMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "步频是不是偏低？" },
          {
            type: "data-coach-user-tool-result",
            id: ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
            data: {
              toolUseId: ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
              content: {
                kind: "activity_ai_analysis_context",
                activityId: "activity-1",
                analysisMarkdown: REVIEW,
              },
            },
          },
        ],
      },
    ];

    expect(withPersistedActivityReviewAssistantSeed(messages)[0]).toMatchObject({
      id: activityReviewAssistantMessageId("activity-1"),
      role: "assistant",
      parts: [{ type: "text", text: REVIEW }],
    });
  });
});

describe("activity coach first-send context", () => {
  it("builds the same hidden activity review context the mobile follow-up uses", () => {
    const message = buildActivityAiCoachMessage({
      activityId: "activity-1",
      analysisMarkdown: REVIEW,
      prompt: "步频是不是偏低？",
    });
    expect(message.content[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
      content: {
        kind: "activity_ai_analysis_context",
        version: 1,
        activityId: "activity-1",
        analysisMarkdown: REVIEW,
        truncated: false,
      },
    });
  });

  it("attaches context only on the first user follow-up of a new activity thread", () => {
    expect(
      shouldAttachActivityCoachContext({
        trigger: "submit-message",
        serverHadUserTurn: false,
        messages: [
          { role: "assistant" },
          { role: "user" },
        ],
      }),
    ).toBe(true);
    expect(
      shouldAttachActivityCoachContext({
        trigger: "submit-message",
        serverHadUserTurn: true,
        messages: [{ role: "assistant" }, { role: "user" }],
      }),
    ).toBe(false);
    expect(
      shouldAttachActivityCoachContext({
        trigger: "submit-message",
        serverHadUserTurn: false,
        messages: [
          { role: "assistant" },
          { role: "user" },
          { role: "assistant" },
          { role: "user" },
        ],
      }),
    ).toBe(false);
    expect(
      shouldAttachActivityCoachContext({
        trigger: "regenerate-message",
        serverHadUserTurn: false,
        messages: [{ role: "assistant" }, { role: "user" }],
      }),
    ).toBe(false);
  });

  it("adds the hidden tool result to the outgoing user UI message", () => {
    const userMessage: CoachUiMessage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "步频是不是偏低？" }],
    };
    const attached = attachActivityCoachContextToUserMessage(userMessage, {
      activityId: "activity-1",
      analysisMarkdown: REVIEW,
    });
    expect(getCoachUserToolResultParts(attached)).toEqual([
      {
        toolUseId: ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
        content: {
          kind: "activity_ai_analysis_context",
          version: 1,
          activityId: "activity-1",
          analysisMarkdown: REVIEW,
          truncated: false,
        },
      },
    ]);
  });
});
