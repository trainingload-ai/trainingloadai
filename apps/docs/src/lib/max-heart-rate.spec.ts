import { describe, expect, it } from "vitest";
import {
  calculateZone2FromMaxHr,
  estimateMaxHrFromAge,
} from "./zone-2-heart-rate";
import {
  calculateMhrZones,
  compareObservedPeak,
  estimateMaxHr,
  observeMaxHeartRate,
  parseMaxHrAge,
  parseMeasuredMaxHr,
  recommendedMaxHrFormula,
  roundBpm,
  tanakaSeeBand,
  TANAKA_SEE_BPM,
} from "./max-heart-rate";
import {
  heartRateZonesMaxHrHref,
  parseHeartRateZonesPrefill,
} from "./zone-tool-links";

describe("max heart rate formulas", () => {
  it("matches zone-2 Tanaka and Fox at the same age", () => {
    for (const age of [25, 40, 55, 70]) {
      expect(estimateMaxHr("tanaka", age)).toBe(
        estimateMaxHrFromAge(age, "tanaka"),
      );
      expect(estimateMaxHr("fox", age)).toBe(estimateMaxHrFromAge(age, "fox"));
    }
  });

  it("keeps fixed ages at the published equations before rounding", () => {
    expect(estimateMaxHr("tanaka", 40)).toBe(180);
    expect(estimateMaxHr("fox", 40)).toBe(180);
    expect(estimateMaxHr("gulati", 40)).toBe(206 - 0.88 * 40);
    expect(estimateMaxHr("hunt", 40)).toBe(211 - 0.64 * 40);
    expect(estimateMaxHr("arena", 40)).toBe(209.3 - 0.72 * 40);
    expect(roundBpm(estimateMaxHr("gulati", 40)!)).toBe(171);
    expect(roundBpm(estimateMaxHr("hunt", 40)!)).toBe(185);
    expect(roundBpm(estimateMaxHr("arena", 40)!)).toBe(181);
  });

  it("rounds a .5 anchor once before zone percentages", () => {
    const raw = estimateMaxHr("tanaka", 45)!;
    expect(raw).toBeCloseTo(176.5, 8);
    expect(roundBpm(raw)).toBe(177);
    expect(calculateMhrZones(raw)).toEqual(calculateMhrZones(177));
    expect(calculateMhrZones(180.5)).toEqual(calculateMhrZones(181));
    expect(calculateMhrZones(180.5)?.[0].bpmMin).toBe(91);
  });

  it("rejects empty, non-finite, zero, and negative input", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -4]) {
      expect(estimateMaxHr("tanaka", bad)).toBeNull();
      expect(estimateMaxHr("fox", bad)).toBeNull();
      expect(calculateMhrZones(bad)).toBeNull();
    }
    expect(parseMaxHrAge("")).toBeNull();
    expect(parseMaxHrAge("0")).toBeNull();
    expect(parseMaxHrAge("-2")).toBeNull();
    expect(parseMaxHrAge("nan")).toBeNull();
    expect(parseMaxHrAge("40")).toBe(40);
    expect(parseMeasuredMaxHr("")).toBeNull();
    expect(parseMeasuredMaxHr("0")).toBeNull();
    expect(parseMeasuredMaxHr("-8")).toBeNull();
    expect(parseMeasuredMaxHr("Infinity")).toBeNull();
    expect(parseMeasuredMaxHr("251")).toBeNull();
    expect(parseMeasuredMaxHr("186")).toBe(186);
  });

  it("picks Gulati for women, HUNT from age 60, otherwise Tanaka", () => {
    expect(recommendedMaxHrFormula(40, "unspecified")).toBe("tanaka");
    expect(recommendedMaxHrFormula(40, "female")).toBe("gulati");
    expect(recommendedMaxHrFormula(60, "male")).toBe("hunt");
    expect(recommendedMaxHrFormula(70, "female")).toBe("gulati");
  });
});

describe("max heart rate %HRmax zones", () => {
  it("matches the heart-rate zones MHR bounds at 180 bpm", () => {
    const zones = calculateMhrZones(180);
    expect(zones).toEqual([
      expect.objectContaining({
        key: "z1",
        bpmMin: 90,
        bpmMax: 107,
        percentLabel: "50%–60%",
      }),
      expect.objectContaining({
        key: "z2",
        bpmMin: 108,
        bpmMax: 125,
        percentLabel: "60%–70%",
      }),
      expect.objectContaining({
        key: "z3",
        bpmMin: 126,
        bpmMax: 143,
        percentLabel: "70%–80%",
      }),
      expect.objectContaining({
        key: "z4",
        bpmMin: 144,
        bpmMax: 161,
        percentLabel: "80%–90%",
      }),
      expect.objectContaining({
        key: "z5",
        bpmMin: 162,
        bpmMax: 180,
        percentLabel: "90%–100%",
      }),
    ]);
  });

  it("does not overlap or leave a gap, and caps Z5 at HRmax", () => {
    for (let anchor = 80; anchor <= 230; anchor += 1) {
      const zones = calculateMhrZones(anchor);
      expect(zones).not.toBeNull();
      for (let index = 0; index < zones!.length - 1; index += 1) {
        expect(zones![index + 1].bpmMin).toBe(zones![index].bpmMax + 1);
      }
      expect(zones!.at(-1)!.bpmMax).toBe(anchor);
      expect(zones![0].bpmMin).toBeLessThanOrEqual(zones![0].bpmMax);
    }
  });

  it("matches the zone-2 page Zone 2 range and gives the shared edge to the next zone", () => {
    const zone2 = calculateZone2FromMaxHr(180)!;
    const zones = calculateMhrZones(180)!;
    expect(zones[1].bpmMin).toBe(zone2.bpmMin);
    expect(zones[1].bpmMax).toBe(zone2.bpmMax);
    expect(zones[2].bpmMin).toBe(zone2.bpmMax + 1);
  });

  it("limits the ±10 bpm band to Tanaka 2001 SEE", () => {
    expect(TANAKA_SEE_BPM).toBe(10);
    expect(tanakaSeeBand(40)).toEqual({ min: 170, max: 190, bpm: 180 });
    expect(tanakaSeeBand(0)).toBeNull();
    expect(tanakaSeeBand(Number.NaN)).toBeNull();
  });
});

describe("observed max heart rate", () => {
  it("uses the highest heart rate sustained for at least one second", () => {
    const records = [140, 155, 170, 168].map((heartRate, index) => ({
      seconds: index,
      heartRate,
    }));
    expect(observeMaxHeartRate(records)).toBe(170);
  });

  it("rejects an isolated spike and keeps the surrounding plateau", () => {
    expect(
      observeMaxHeartRate([
        { seconds: 0, heartRate: 150 },
        { seconds: 1, heartRate: 150 },
        { seconds: 2, heartRate: 190 },
        { seconds: 3, heartRate: 151 },
      ]),
    ).toBe(150);
  });

  it("accepts sub-second samples that together last at least one second", () => {
    expect(
      observeMaxHeartRate([
        { seconds: 0, heartRate: 160 },
        { seconds: 0.4, heartRate: 162 },
        { seconds: 0.8, heartRate: 161 },
        { seconds: 1.2, heartRate: 160 },
      ]),
    ).toBe(162);
  });

  it("prefers a one-second peak over the window average", () => {
    const records = Array.from({ length: 30 }, (_, index) => ({
      seconds: index,
      heartRate: index === 10 || index === 11 ? 175 : 150,
    }));
    expect(observeMaxHeartRate(records)).toBe(175);
  });

  it("skips invalid samples, long gaps, and unsustained peaks", () => {
    expect(
      observeMaxHeartRate([
        { seconds: 0, heartRate: 0 },
        { seconds: 1, heartRate: -4 },
        { seconds: 2, heartRate: Number.NaN },
        { seconds: 3, heartRate: 148 },
        { seconds: 4, heartRate: 149 },
      ]),
    ).toBe(149);
    expect(
      observeMaxHeartRate([
        { seconds: 0, heartRate: 188 },
        { seconds: 11, heartRate: 188 },
      ]),
    ).toBeNull();
    expect(observeMaxHeartRate([])).toBeNull();
    expect(observeMaxHeartRate([{ seconds: 0, heartRate: 190 }])).toBeNull();
  });

  it("treats a higher peak as a low reference and a lower peak as not a decline signal", () => {
    expect(compareObservedPeak(190, 180)).toBe("higher");
    expect(compareObservedPeak(170, 180)).toBe("lower");
    expect(compareObservedPeak(180, 180)).toBe("equal");
  });
});

describe("max heart rate zone handoff", () => {
  it("round-trips model=mhr and maxHr into the zones prefill", () => {
    const href = heartRateZonesMaxHrHref("/zh", 180.4);
    expect(href).toBe("/zh/heart-rate-zones-calculator?model=mhr&maxHr=180");
    expect(parseHeartRateZonesPrefill(href.split("?")[1] ?? "")).toEqual({
      model: "MHR",
      lthr: null,
      maxHr: "180",
      restHr: null,
    });
  });
});
