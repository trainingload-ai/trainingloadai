import { describe, expect, it } from "vitest";
import {
  workoutStepIntensityFactor as factor,
  workoutStepSchematicHeight as schematic,
  type WorkoutChartThresholds,
} from "./workout-chart-intensity";

const thresholds: WorkoutChartThresholds = {
  ftp: 250,
  cp: null,
  lthr: 170,
  runThresholdPaceSecPerKm: 350,
  swimThresholdPaceSecPer100m: 120,
};
describe("workout chart intensity", () => {
  it("compares warmup and easy pace on the same threshold scale", () => {
    const warmup = factor(
      { duration: 300, stepKind: "WARMUP" },
      "RUN",
      thresholds,
    );
    const easy = factor(
      { duration: 1200, stepKind: "WORK", paceKmh: 3600 / 420 },
      "RUN",
      thresholds,
    );
    expect(warmup).toBe(0.55);
    expect(easy).toBeCloseTo(0.8333, 3);
    expect(warmup!).toBeLessThan(easy!);
  });
  it("preserves explicitly prescribed intensity, even above threshold", () => {
    expect(
      factor(
        { duration: 60, stepKind: "WARMUP", powerWatts: 300 },
        "CYCLING",
        thresholds,
      ),
    ).toBe(1.2);
    expect(factor({ duration: 60, power: 1.5 }, "CYCLING")).toBe(1.5);
  });
  it("normalizes heart rate and swimming using their own thresholds", () => {
    expect(
      factor({ duration: 60, heartRateBpm: 153 }, "RUN", thresholds),
    ).toBeCloseTo(0.9);
    expect(
      factor({ duration: 60, paceKmh: 2.4 }, "SWIM", thresholds),
    ).toBeCloseTo(0.8);
  });
  it("never invents a threshold for absolute targets or cadence", () => {
    expect(factor({ duration: 60, paceKmh: 8 }, "RUN")).toBeNull();
    expect(factor({ duration: 60, powerWatts: 200 }, "CYCLING")).toBeNull();
    expect(factor({ duration: 60, cadence: 90 }, "CYCLING")).toBeNull();
    expect(
      factor({ duration: 60, paceKmh: 25 }, "CYCLING", thresholds),
    ).toBeNull();
  });
  it("uses zone/phase structure for schematic fallback, not raw pace", () => {
    const work = {
      duration: 60,
      stepKind: "WORK" as const,
      paceKmh: 8,
      primaryTargetMeta: { kind: "SPEED" as const, zoneIndex: 1 },
    };
    expect(schematic(work)).toBeGreaterThan(
      schematic({ duration: 60, stepKind: "WARMUP" }),
    );
    expect(schematic({ ...work, paceKmh: 6 })).toBe(schematic(work));
  });
});
