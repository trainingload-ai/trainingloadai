import { describe, expect, it } from "vitest";
import { BenchmarkType } from "@/api/settings";

import {
  DEFAULT_WORKOUT_STEP_COLORS,
  resolveWorkoutSegmentColor,
  resolveWorkoutZoneColor,
  workoutZoneColorsFromSettings,
} from "./workout-zone-colors";

describe("workout zone colors", () => {
  it("uses the athlete's configured color for the matching metric and zone", () => {
    const colors = workoutZoneColorsFromSettings(
      [
        {
          sportType: "RUN",
          zoneType: "PACE",
          benchmark: BenchmarkType.CS,
          zones: [
            { name: "Easy", min: 0, max: 1, color: "#123456" },
            { name: "Tempo", min: 1, max: 2, color: "#abcdef" },
          ],
        },
      ],
      "RUN",
    );

    expect(resolveWorkoutZoneColor("SPEED", 2, colors)).toBe("#abcdef");
  });

  it("falls back to the standard palette and ignores non-zone targets", () => {
    expect(resolveWorkoutZoneColor("POWER_ZONE", 4)).toBe("#f59e0b");
    expect(resolveWorkoutZoneColor("POWER_CUSTOM", 4)).toBeNull();
  });

  it("gives every step kind a visible default color", () => {
    for (const stepKind of [
      "WARMUP",
      "WORK",
      "RECOVERY",
      "REST",
      "COOLDOWN",
      "OTHER",
    ] as const) {
      expect(resolveWorkoutSegmentColor(undefined, undefined, stepKind)).toBe(
        DEFAULT_WORKOUT_STEP_COLORS[stepKind],
      );
    }
  });

  it("uses a calm blue for warmup instead of a high-intensity warning color", () => {
    expect(resolveWorkoutSegmentColor(undefined, undefined, "WARMUP")).toBe(
      "#60a5fa",
    );
  });

  it("uses a soft mint color for recovery", () => {
    expect(resolveWorkoutSegmentColor(undefined, undefined, "RECOVERY")).toBe(
      "#6ee7b7",
    );
  });

  it("uses a configured zone color ahead of the step default", () => {
    expect(
      resolveWorkoutSegmentColor("SPEED", 2, "WARMUP", {
        pace: ["#111111", "#abcdef"],
      }),
    ).toBe("#abcdef");
  });
});
