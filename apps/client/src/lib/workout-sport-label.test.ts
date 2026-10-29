import { describe, expect, it } from "vitest";
import { resolveWorkoutSportLabelKind } from "./workout-sport-label";

describe("resolveWorkoutSportLabelKind", () => {
  it("recognizes strength from its structure or sport definition", () => {
    expect(
      resolveWorkoutSportLabelKind({
        sportType: "UNKNOWN",
        structureKind: "STRENGTH",
      }),
    ).toBe("strength");
    expect(
      resolveWorkoutSportLabelKind({
        sportType: "UNKNOWN",
        sportDefinitionCode: "STRENGTH_TRAINING",
      }),
    ).toBe("strength");
  });

  it("does not treat every unknown sport as strength", () => {
    expect(resolveWorkoutSportLabelKind({ sportType: "UNKNOWN" })).toBe(
      "other",
    );
    expect(resolveWorkoutSportLabelKind({ sportType: "CYCLING" })).toBe(
      "cycling",
    );
  });
});
