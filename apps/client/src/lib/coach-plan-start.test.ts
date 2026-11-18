import { describe, expect, it } from "vitest";
import {
  safeParseCoachUserToolResultPayload,
  parseCoachPlanDraftData,
  buildCoachUserToolResultPayloadJsonSchema,
} from "@shared/ai-coach-schema";
import { draftToCreatePlanDto } from "./coach-plan-draft";
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
});
