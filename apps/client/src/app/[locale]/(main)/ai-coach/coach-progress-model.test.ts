import { describe, expect, it } from "vitest";
import {
  readCoachProgressSnapshot,
  resolveCoachProgressMessageKey,
} from "./coach-progress-model";

describe("coach progress model", () => {
  it("shows generic thinking for an ordinary conversation", () => {
    expect(
      resolveCoachProgressMessageKey({
        status: { status: "model", step: 1, progress: "thinking" },
        toolProgress: null,
      }),
    ).toBe("rendering.thinking");
  });

  it("shows plan drafting during the long model-only plan step", () => {
    expect(
      resolveCoachProgressMessageKey({
        status: {
          status: "model",
          step: 3,
          progress: "drafting_plan",
        },
        toolProgress: null,
      }),
    ).toBe("status.progress.draftingPlan");
  });

  it("uses the active tool to describe evidence reads", () => {
    expect(
      resolveCoachProgressMessageKey({
        status: { status: "tool_run", progress: "running_tools" },
        toolProgress: {
          toolName: "training_baseline",
          status: "start",
        },
      }),
    ).toBe("status.progress.readingBaseline");
  });

  it("reads the latest status and tool progress data parts", () => {
    expect(
      readCoachProgressSnapshot([
        {
          type: "data",
          name: "coach-status",
          data: { status: "model", progress: "synthesizing_evidence" },
        },
        {
          type: "data",
          name: "coach-tool-progress",
          data: { toolName: "profile.zone_ranges", status: "end" },
        },
      ]),
    ).toEqual({
      status: { status: "model", progress: "synthesizing_evidence" },
      toolProgress: { toolName: "profile.zone_ranges", status: "end" },
    });
  });
});
