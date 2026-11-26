import { describe, expect, it } from "vitest";
import { BenchmarkType } from "./zoneSettings";
import { calculateZoneAbsoluteValue } from "./zone-editor-model";

describe("calculateZoneAbsoluteValue", () => {
  it("adds resting heart rate when computing Karvonen HRR zone boundaries", () => {
    // maxHr = 190, restingHr = 50 => HRR = 140; 50% HRR => 50 + 70 = 120 bpm
    expect(
      calculateZoneAbsoluteValue({
        benchmark: BenchmarkType.HRR,
        benchmarkVal: 140,
        restingHeartRate: 50,
        isCustom: false,
        pct: 50,
        sportType: "RUN",
        zoneType: "HEART_RATE",
      }),
    ).toBe(120);
  });

  it("rounds pace seconds before splitting minutes and seconds to prevent :60 overflow", () => {
    // 1000 / 3.337 = 299.67s => rounds to 300s => 5:00/km (not 4:60/km)
    expect(
      calculateZoneAbsoluteValue({
        benchmark: BenchmarkType.CS,
        benchmarkVal: 3.337,
        isCustom: false,
        pct: 100,
        sportType: "RUN",
        zoneType: "PACE",
      }),
    ).toBe("5:00/km");
  });
});
