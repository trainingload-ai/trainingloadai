import { describe, expect, it } from "vitest";
import {
  getStrengthEquipmentKey,
  getStrengthExerciseKey,
} from "./strength-catalog";

describe("strength catalog localization keys", () => {
  it("normalizes common equipment aliases", () => {
    expect(getStrengthEquipmentKey("Dumbbells")).toBe("dumbbell");
    expect(getStrengthEquipmentKey("pull-up bar")).toBe("pull_up_bar");
    expect(getStrengthEquipmentKey("custom rack")).toBeNull();
  });

  it("prefers a stable exercise code and falls back to the name", () => {
    expect(
      getStrengthExerciseKey({
        exerciseCode: "BACK_SQUAT",
        name: "深蹲变式",
      }),
    ).toBe("backSquat");
    expect(getStrengthExerciseKey({ name: "Dumbbell Romanian Deadlift" })).toBe(
      "dumbbellRomanianDeadlift",
    );
    expect(getStrengthExerciseKey({ name: "杠铃深蹲" })).toBe("backSquat");
    expect(
      getStrengthExerciseKey({ name: "Custom mobility drill" }),
    ).toBeNull();
  });
});
