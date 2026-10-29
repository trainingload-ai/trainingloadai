import { describe, expect, it } from "vitest";
import {
  adjustmentDraftToWorkoutUpdatePayload,
  assertCoachDecisionApplied,
  CoachApplyNotAppliedError,
  coachCycleStartHref,
  isOpenNextCoachDecision,
} from "@shared/coach-adjustment-decision";

describe("adjustmentDraftToWorkoutUpdatePayload", () => {
  it("builds a PLAN_WORKOUT_UPDATE payload the existing apply path can consume", () => {
    expect(
      adjustmentDraftToWorkoutUpdatePayload({
        planId: "plan-1",
        workoutId: "w-1",
        title: "Make tomorrow easier",
        reason: "Fatigue is high",
        before: {
          weekIndex: 2,
          dayIndex: 3,
          sessionIndex: 1,
          sportType: "RUN",
          text: "E 8km",
        },
        after: {
          weekIndex: 2,
          dayIndex: 3,
          sessionIndex: 1,
          sportType: "RUN",
          name: "Recovery jog",
          notes: "keep it easy",
          text: "E 5km",
        },
        changes: [
          { field: "text", before: "E 8km", after: "E 5km" },
        ],
      }),
    ).toEqual({
      planId: "plan-1",
      workoutId: "w-1",
      workoutName: "Recovery jog",
      dto: {
        weekIndex: 2,
        dayIndex: 3,
        sessionIndex: 1,
        sportType: "RUN",
        text: "E 5km",
        name: "Recovery jog",
        notes: "keep it easy",
        reason: "Fatigue is high",
      },
    });
  });
});

describe("open-next cycle decision helpers", () => {
  it("detects the open-next cycle decision and builds a plan-builder href", () => {
    const decision = {
      decisionType: "PLAN_LIFECYCLE",
      planId: "plan-1",
      rationale: "Cycle complete.",
      payload: {
        action: "open_next",
        summaryId: "sum-1",
        nextPlanPrompt: "Start from last cycle",
      },
    };
    expect(isOpenNextCoachDecision(decision)).toBe(true);
    expect(coachCycleStartHref(decision)).toContain("intent=plan-builder");
    expect(coachCycleStartHref(decision)).toContain("summaryId=sum-1");
    expect(coachCycleStartHref(decision, "/coach")).toMatch(/^\/coach\?/);
  });
});

describe("assertCoachDecisionApplied", () => {
  it("accepts APPLIED and rejects conflict results", () => {
    expect(() => assertCoachDecisionApplied("APPLIED")).not.toThrow();
    expect(() => assertCoachDecisionApplied("REBASE_REQUIRED")).toThrow(
      CoachApplyNotAppliedError,
    );
    expect(() => assertCoachDecisionApplied("SKIPPED")).toThrow(
      CoachApplyNotAppliedError,
    );
  });
});
