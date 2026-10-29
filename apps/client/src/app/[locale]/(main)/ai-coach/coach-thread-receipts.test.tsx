import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CoachThreadReceiptsProvider,
  useCoachThreadReceipts,
} from "./coach-thread-receipts";

const runtime = vi.hoisted(() => ({ messages: [] as unknown[] }));
vi.mock("./coach-chat-provider", () => ({
  useCoachThread: (select: (state: unknown) => unknown) => select(runtime),
}));
function Probe() {
  const index = useCoachThreadReceipts();
  return (
    <output>
      {JSON.stringify({
        workouts: [...index.appliedWorkoutAdjustments],
        decisions: [...index.appliedDecisions],
      })}
    </output>
  );
}
function inspect(messages: unknown[]) {
  runtime.messages = messages;
  render(
    <CoachThreadReceiptsProvider>
      <Probe />
    </CoachThreadReceiptsProvider>,
  );
  return JSON.parse(screen.getByRole("status").textContent!);
}
const result = (result: string, role = "assistant") => ({
  role,
  content: [
    {
      type: "data",
      name: "coach-tool",
      data: {
        name: "CoachDecisionApplied",
        input: {
          kind: "coach_decision_apply",
          decisionId: "decision-1",
          result,
        },
      },
    },
  ],
});

describe("durable applied receipts", () => {
  it("recognizes server-applied decisions after history hydration", () => {
    expect(inspect([result("APPLIED"), result("APPLIED")])).toEqual({
      workouts: [],
      decisions: ["decision-1"],
    });
  });
  it("does not mark failures or user text as applied decisions", () => {
    expect(
      inspect([
        result("FAILED"),
        result("REBASE_REQUIRED"),
        result("APPLIED", "user"),
      ]),
    ).toEqual({ workouts: [], decisions: [] });
  });
  it("keeps a legacy workout apply receipt attached to the source card", () => {
    expect(
      inspect([
        {
          role: "user",
          content: [
            {
              type: "data",
              name: "coach-user-tool-result",
              data: {
                toolUseId: "call-1",
                content: {
                  kind: "plan_workout_adjustment_applied",
                  repliesToAssistantMessageId: "message-1",
                  planId: "p",
                  workoutId: "w",
                },
              },
            },
          ],
        },
      ]),
    ).toEqual({ workouts: ["message-1"], decisions: [] });
  });
});
