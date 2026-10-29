import { describe, expect, it } from "vitest";

import { isWorkoutPlannedOrInProgress } from "./plans";

describe("plan workout action status", () => {
  it.each([
    ["PLANNED", true],
    ["IN_PROGRESS", true],
    ["DONE", false],
    ["SKIPPED", false],
    ["MOVED", false],
  ] as const)("allows schedule actions for %s: %s", (status, expected) => {
    expect(isWorkoutPlannedOrInProgress(status)).toBe(expected);
  });
});
