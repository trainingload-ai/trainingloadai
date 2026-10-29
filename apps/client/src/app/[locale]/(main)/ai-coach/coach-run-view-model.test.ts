import { describe, expect, it } from "vitest";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import {
  coachPartsFromWireMessage,
  coachWireMessageHasRenderableBody,
} from "@/lib/ai-coach-ui-parts";
import {
  coachActivityResults,
  groupCoachTranscript,
  shouldPinFailedActivity,
} from "./coach-run-view-model";
import { coachRunRequest } from "./coach-run-request";

const assistant = (id: string, runId = "run-1"): CoachUiMessage => ({
  id,
  role: "assistant",
  metadata: { schemaVersion: 2, runId, attemptId: id },
  parts: [],
});
const pending = {
  interactionId: "question-1",
  runId: "run-1",
  questionMessageId: "a1",
  questionToolCallId: "q1",
  revision: 1,
  status: "pending" as const,
};
const question = (): CoachUiMessage => ({
  ...assistant("a1"),
  parts: [
    {
      type: "data-coach-interaction",
      id: pending.interactionId,
      data: pending,
    },
  ],
});
const answer = (notes = { goal: "比赛" }): CoachUiMessage => ({
  id: "u2",
  role: "user",
  parts: [
    {
      type: "data-coach-user-tool-result",
      data: {
        toolUseId: "q1",
        content: {
          kind: "coach_question_reply",
          repliesToAssistantMessageId: "a1",
          questionToolUseId: "q1",
          answers: { goal: "race" },
          notes,
        },
      },
    },
  ],
});
const receipt = (): CoachUiMessage => ({
  ...assistant("a2"),
  parts: [
    {
      type: "data-coach-interaction",
      id: pending.interactionId,
      data: {
        ...pending,
        revision: 2,
        status: "resolved",
        submissionId: "u2:answer",
        answers: { goal: "race" },
        notes: { goal: "比赛" },
      },
    },
  ],
});

describe("Coach run transcript", () => {
  it("does not promote a recovered tool attempt as a completed turn failure", () => {
    expect(
      shouldPinFailedActivity({
        open: false,
        runStatus: "completed",
        activityStatus: "failed",
      }),
    ).toBe(false);
    expect(
      shouldPinFailedActivity({
        open: false,
        runStatus: "failed",
        activityStatus: "failed",
      }),
    ).toBe(true);
    expect(
      shouldPinFailedActivity({
        open: true,
        runStatus: "failed",
        activityStatus: "failed",
      }),
    ).toBe(false);
  });
  it("owns identical parallel results by call and attempt, never by tool name", () => {
    const message = assistant("a1");
    message.parts = [
      {
        type: "data-coach-run",
        data: { runId: "run-1", attemptId: "a1" },
      } as CoachUiMessage["parts"][number],
      ...["one", "two"].flatMap(
        (id) =>
          [
            {
              type: "data-coach-tool",
              data: {
                toolCallId: id,
                name: "ProfileZoneRanges",
                input: { kind: "profile_zone_ranges" },
              },
            },
            {
              type: "data-coach-activity",
              data: {
                activityId: `a:${id}`,
                attemptId: "a1",
                runId: "run-1",
                toolCallId: id,
                kind: "tool",
              },
            },
          ] as CoachUiMessage["parts"],
      ),
    ];
    expect(
      [...coachActivityResults(message)].map(([id, tool]) => [
        id,
        tool.toolCallId,
      ]),
    ).toEqual([
      ["a:one", "one"],
      ["a:two", "two"],
    ]);
    expect(
      coachActivityResults({
        ...message,
        metadata: { schemaVersion: 2, runId: "run-1", attemptId: "other" },
      }).size,
    ).toBe(0);
    expect(coachActivityResults({ ...message, metadata: undefined }).size).toBe(
      0,
    );
    const toolOnly = {
      ...message,
      parts: message.parts.filter(
        (part) => part.type !== "data-coach-activity",
      ),
    };
    expect(coachActivityResults(toolOnly).size).toBe(0);
    const hiddenAttempt = {
      ...message,
      parts: message.parts.map((part) =>
        part.type === "data-coach-activity" && part.data.toolCallId === "one"
          ? { ...part, data: { ...part.data, display: "hidden" as const } }
          : part,
      ),
    };
    expect([...coachActivityResults(hiddenAttempt).keys()]).toEqual(["a:two"]);
  });
  it("leaves deliverables and confirmation actions outside collapsed evidence", () => {
    const message = assistant("a1");
    message.parts = [
      { type: "data-coach-run", data: { runId: "run-1", attemptId: "a1" } },
      ...[
        "PresentCoachPlanDraft",
        "FitnessAssessment",
        "TrainingVisualization",
        "MutationApplied",
      ].flatMap((name) => [
        {
          type: "data-coach-tool",
          data: { name, toolCallId: name, input: {} },
        },
        {
          type: "data-coach-activity",
          data: {
            activityId: name,
            toolCallId: name,
            kind: "tool",
            attemptId: "a1",
            runId: "run-1",
          },
        },
      ]),
    ] as CoachUiMessage["parts"];
    expect(coachActivityResults(message).size).toBe(0);
  });
  it("keeps card-only save receipts out of the visible transcript", () => {
    const message: CoachUiMessage = {
      id: "saved",
      role: "user",
      parts: [
        {
          type: "data-coach-user-tool-result",
          data: {
            toolUseId: "q1",
            content: {
              kind: "coach_plan_draft_saved",
              repliesToAssistantMessageId: "a1",
              planId: "p",
            },
          },
        },
      ],
    };
    expect(
      groupCoachTranscript([assistant("a1"), message]).map(
        (group) => group.key,
      ),
    ).toEqual(["a1"]);
  });
  it("merges only confirmed, consecutive attempts without changing chronology", () => {
    const groups = groupCoachTranscript([question(), answer(), receipt()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a1", "a2"]);
    const interleaved = groupCoachTranscript([
      question(),
      {
        id: "other-user",
        role: "user",
        parts: [{ type: "text", text: "另一个任务" }],
      },
      assistant("other-answer", "run-2"),
      answer(),
      receipt(),
    ]);
    expect(interleaved.map((g) => g.key)).toEqual([
      "a1",
      "other-user",
      "other-answer",
      "a2",
    ]);
    expect(interleaved.at(-1)?.resumed).toBe(true);
  });
  it("never turns an optimistic or rejected answer into a receipt", () => {
    expect(groupCoachTranscript([question(), answer()])).toHaveLength(2);
    expect(
      groupCoachTranscript([
        question(),
        answer({ goal: "不同备注" }),
        receipt(),
      ]),
    ).toHaveLength(3);
  });
  it("restores resolved receipts even when persisted user IDs differ", () => {
    expect(
      groupCoachTranscript([
        question(),
        { ...answer(), id: "database-user-id" },
        receipt(),
      ]),
    ).toHaveLength(1);
  });
  it("uses explicit answer and retry commands, never regenerate", () => {
    expect(coachRunRequest([question(), answer()])).toMatchObject({
      protocolVersion: 2,
      runCommand: {
        kind: "answer",
        runId: "run-1",
        interactionId: "question-1",
        submissionId: "u2:answer",
      },
    });
    const runCommand = {
      kind: "retry",
      runId: "run-1",
      attemptId: "a1",
      requestId: "request-2",
    };
    expect(coachRunRequest([question()], { runCommand })).toEqual({
      protocolVersion: 2,
      runCommand,
    });
  });
  it("preserves process-only history, rejects malformed snapshots, and never invents legacy timelines", () => {
    const message = {
      kind: "ui_message",
      version: 2,
      role: "assistant",
      providerReplay: false,
      parts: question().parts,
    };
    expect(coachWireMessageHasRenderableBody("assistant", message)).toBe(true);
    expect(coachPartsFromWireMessage("assistant", message)).toEqual(
      question().parts,
    );
    expect(
      coachPartsFromWireMessage("assistant", {
        ...message,
        parts: [{ type: "data-coach-run", data: { status: "running" } }],
      }),
    ).toEqual([]);
    expect(coachPartsFromWireMessage("assistant", null, "旧回答")).toEqual([
      { type: "text", text: "旧回答" },
    ]);
  });
});
