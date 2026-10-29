import { describe, expect, it } from "vitest";
import { getBranchContextFromSearchParams } from "./coach-branch-context";

describe("getBranchContextFromSearchParams", () => {
  it("preserves a no-plan Athlete State case as request context", () => {
    const params = new URLSearchParams({
      caseId: "case-1",
      openReason: "athlete_state_assessment",
    });

    expect(
      getBranchContextFromSearchParams(params, {
        intent: "athlete_state_assessment",
        source: "home-state-inquiry",
        planId: "",
        pending: "",
      }),
    ).toMatchObject({
      caseId: "case-1",
      openReason: "athlete_state_assessment",
    });
  });
});
