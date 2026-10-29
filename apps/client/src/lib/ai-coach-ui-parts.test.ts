import { describe, expect, it } from "vitest";

import {
  coachPartsFromWireMessage,
  coachWireMessageHasRenderableBody,
  getCoachUserToolResultsFromRuntimeMessages,
} from "./ai-coach-ui-parts";

describe("stored coach UI parts", () => {
  it("preserves public summary-only history without reviving raw reasoning", () => {
    const summary = {
      source: "assistant_public_summary",
      text: "核对近期负荷后安排恢复。",
    };
    const part = {
      type: "data-coach-activity",
      id: "analysis",
      data: {
        activityId: "analysis",
        runId: "run",
        attemptId: "attempt",
        seq: 0,
        revision: 2,
        kind: "analysis",
        status: "completed",
        labelKey: "analysis",
        publicSummary: summary,
      },
    };
    const message = {
      kind: "ui_message",
      version: 2,
      role: "assistant",
      parts: [part, { type: "reasoning", text: "private" }],
    };
    expect(coachWireMessageHasRenderableBody("assistant", message)).toBe(true);
    expect(coachPartsFromWireMessage("assistant", message)).toEqual([part]);
  });
  it("preserves receipt-only user rows so saved/applied cards survive refresh", () => {
    const part = {
      type: "data-coach-user-tool-result",
      data: {
        toolUseId: "m1",
        content: {
          kind: "plan_workout_adjustment_applied",
          repliesToAssistantMessageId: "m1",
          planId: "p",
          workoutId: "w",
        },
      },
    };
    const message = {
      kind: "ui_message",
      version: 1,
      role: "user",
      parts: [part],
    };
    expect(coachWireMessageHasRenderableBody("user", message)).toBe(true);
    expect(coachPartsFromWireMessage("user", message)).toEqual([part]);
  });
  it("hides invalid internal delivery calls persisted before the server fix", () => {
    const message = {
      kind: "ui_message" as const,
      version: 1 as const,
      role: "assistant" as const,
      parts: [
        null,
        {
          type: "data-coach-tool" as const,
          id: "failed_question",
          data: {
            toolCallId: "failed_question",
            name: "ask_user_question",
            input: {
              questions: [
                {
                  id: "start_week",
                  header: "开始时间",
                  question: "从哪天开始？",
                  options: [{ label: "明天", description: "从明天开始" }],
                },
              ],
            },
          },
        },
      ],
    };

    expect(coachWireMessageHasRenderableBody("assistant", message)).toBe(false);
    expect(coachPartsFromWireMessage("assistant", message)).toEqual([]);
  });

  it("removes reasoning parts from already-stored UI messages", () => {
    const message = {
      kind: "ui_message" as const,
      version: 1 as const,
      role: "assistant" as const,
      parts: [
        {
          type: "reasoning" as const,
          text: "internal chain of thought",
          state: "done" as const,
        },
        { type: "text" as const, text: "用户可见结论" },
      ],
    };

    expect(coachWireMessageHasRenderableBody("assistant", message)).toBe(true);
    expect(coachPartsFromWireMessage("assistant", message)).toEqual([
      { type: "text", text: "用户可见结论" },
    ]);
  });

  it("does not turn legacy reasoning-only messages into visible bubbles", () => {
    const legacyReasoningOnly = {
      content: [],
      reasoning_content: "internal chain of thought",
    };

    expect(
      coachWireMessageHasRenderableBody("assistant", legacyReasoningOnly),
    ).toBe(false);
    expect(coachPartsFromWireMessage("assistant", legacyReasoningOnly)).toEqual(
      [],
    );
  });

  it("preserves legacy text-card-text order during hydration", () => {
    const parts = coachPartsFromWireMessage("assistant", {
      content: [
        { type: "text", text: "前文" },
        {
          type: "tool_use",
          id: "day",
          name: "PlanDayView",
          input: { date: "2026-09-30" },
        },
        { type: "text", text: "后文" },
      ],
    });
    expect(parts.map((part) => part.type)).toEqual([
      "text",
      "data-coach-tool",
      "text",
    ]);
  });
});

describe("stored coach turn failures", () => {
  const failureText = "模型暂时无法响应，请尝试切换模型后重试。";

  it("hydrates a persisted failure row with its failure part", () => {
    const message = {
      kind: "ui_message" as const,
      version: 1 as const,
      role: "assistant" as const,
      providerReplay: false,
      parts: [
        { type: "text" as const, text: failureText },
        {
          type: "data-coach-turn-error" as const,
          id: "coach-turn-error",
          data: { code: "model_unavailable", message: failureText },
        },
      ],
    };

    expect(coachWireMessageHasRenderableBody("assistant", message)).toBe(true);
    expect(coachPartsFromWireMessage("assistant", message)).toEqual(
      message.parts,
    );
  });

  it("renders legacy UI-only failure rows (text only) as failures too", () => {
    const message = {
      kind: "ui_message" as const,
      version: 1 as const,
      role: "assistant" as const,
      providerReplay: false,
      parts: [{ type: "text" as const, text: "回答生成异常，请重试。" }],
    };

    expect(coachPartsFromWireMessage("assistant", message)).toEqual([
      { type: "text", text: "回答生成异常，请重试。" },
      {
        type: "data-coach-turn-error",
        id: "coach-turn-error",
        data: { code: "internal", message: "回答生成异常，请重试。" },
      },
    ]);
  });

  it("keeps a failure row without text renderable", () => {
    const message = {
      kind: "ui_message" as const,
      version: 1 as const,
      role: "assistant" as const,
      providerReplay: false,
      parts: [
        {
          type: "data-coach-turn-error" as const,
          id: "coach-turn-error",
          data: { code: "model_unavailable" },
        },
      ],
    };

    expect(coachWireMessageHasRenderableBody("assistant", message)).toBe(true);
  });

  it("does not add a failure part to normal assistant replies", () => {
    const message = {
      kind: "ui_message" as const,
      version: 1 as const,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "今天轻松跑 40 分钟。" }],
    };

    expect(coachPartsFromWireMessage("assistant", message)).toEqual(
      message.parts,
    );
  });
});

describe("getCoachUserToolResultsFromRuntimeMessages", () => {
  it("keeps multiple question replies across live and hydrated part formats", () => {
    const results = getCoachUserToolResultsFromRuntimeMessages([
      {
        role: "user",
        content: [
          {
            type: "data-coach-user-tool-result",
            data: {
              toolUseId: "question-1",
              content: {
                kind: "coach_question_reply",
                repliesToAssistantMessageId: "assistant-1",
                answers: { goal: "finish" },
                notes: {},
              },
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "data",
            name: "coach-user-tool-result",
            data: {
              toolUseId: "question-2",
              content: {
                kind: "coach_question_reply",
                repliesToAssistantMessageId: "assistant-2",
                answers: { days: "5" },
                notes: {},
              },
            },
          },
        ],
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.toolUseId)).toEqual([
      "question-1",
      "question-2",
    ]);
    expect(
      results.map(
        (result) =>
          (result.content as { repliesToAssistantMessageId: string })
            .repliesToAssistantMessageId,
      ),
    ).toEqual(["assistant-1", "assistant-2"]);
  });
});
