import { describe, expect, it } from "vitest";
import {
  safeParseCoachUserToolResultPayload,
  parseCoachPlanDraftData,
  buildCoachUserToolResultPayloadJsonSchema,
} from "@shared/ai-coach-schema";
import { draftToCreatePlanDto } from "./coach-plan-draft";
import type { PlanWorkout, TrainingPlanDetail } from "@/api/plans";
import { rollingStartCarryoverInfo, workoutsForPlanStart } from "./coach-plan-start";
const constraints = {
  version: 1,
  revision: 1,
  calendarTimeZone: "Asia/Shanghai",
  fixedRestWeekdays: [3, 5],
  effectiveFrom: "2026-11-22",
  unavailableDates: [],
  availableDateOverrides: [],
  confirmation: { source: "USER", reference: "message-1" },
};
describe("plan start shared cards and saved draft", () => {
  it("round trips a real assistant card confirmation through the shared schema", () => {
    const payload = {
      kind: "coach_decision_confirmation",
      repliesToAssistantMessageId: "assistant-1",
      decisionId: "decision-1",
    };
    expect(safeParseCoachUserToolResultPayload(payload)).toEqual(payload);
    expect(
      safeParseCoachUserToolResultPayload({
        ...payload,
        repliesToAssistantMessageId: "",
      }),
    ).toBeNull();
    expect(
      JSON.stringify(buildCoachUserToolResultPayloadJsonSchema()),
    ).toContain("coach_decision_confirmation");
  });
  it("preserves explicit calendar constraints when an ordinary draft is saved", () => {
    const parsed = parseCoachPlanDraftData({
      title: "Plan",
      periodWeeks: 1,
      scheduleConstraints: constraints,
      workouts: [{ weekIndex: 1, dayIndex: 1, text: "20m @easy" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      draftToCreatePlanDto(parsed.data).generationMetadata?.scheduleConstraints,
    ).toEqual(constraints);
  });
  it("previews all saved rolling workouts on the selected dates", () => {
    const workout = {
      planId: "rolling",
      weekIndex: 1,
      sessionIndex: 1,
      scheduledDate: null,
      text: "20m @easy",
      structureKind: "FREEFORM",
      dslVersion: 1,
      structure: { kind: "FREEFORM", version: 1, text: "20m @easy" },
      summary: { kind: "FREEFORM", durationSeconds: 1200, hardSession: null },
      status: "PLANNED",
    } satisfies Omit<PlanWorkout, "id" | "dayOffset" | "dayIndex" | "sportType">;
    const plan: TrainingPlanDetail = {
      id: "rolling",
      userId: "owner",
      title: "Rolling plan",
      sourceType: "AI",
      status: "DRAFT",
      planningMode: "ROLLING",
      periodWeeks: null,
      startDate: null,
      endDate: null,
      currentWeekIndex: null,
      currentDayIndex: null,
      createdAt: "2026-11-28T00:00:00.000Z",
      updatedAt: "2026-11-28T00:00:00.000Z",
      generationMetadata: {
        scheduleConstraints: { ...constraints, fixedRestWeekdays: [1, 3] },
      },
      workouts: [
        { ...workout, id: "bike", dayOffset: 1, dayIndex: 2, sportType: "CYCLING" },
        { ...workout, id: "run", dayOffset: 6, dayIndex: 7, sportType: "RUN" },
      ],
    };

    expect(workoutsForPlanStart(plan, "2026-12-01", "2026-11-28")).toMatchObject([
      { id: "bike", scheduledDate: "2026-12-02" },
      { id: "run", scheduledDate: "2026-12-07" },
    ]);
    expect(rollingStartCarryoverInfo(plan, "2026-12-01")).toEqual({
      firstWeekThrough: "2026-12-06",
      carryoverDates: ["2026-12-07"],
    });
  });
});
