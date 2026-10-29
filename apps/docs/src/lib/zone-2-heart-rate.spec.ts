import { describe, expect, it } from "vitest";
import {
  calculateZone2FromAge,
  calculateZone2FromHrr,
  calculateZone2FromLthr,
  calculateZone2FromMaxHr,
  estimateMaxHrFromAge,
  formatAnchorBpm,
  formatZone2Bpm,
  parsePositiveNumber,
  roundBpm,
} from "./zone-2-heart-rate";

describe("zone 2 heart rate formulas", () => {
  it("maps 60–70% of max HR to Zone 2, giving the 70% edge to Zone 3", () => {
    const range = calculateZone2FromMaxHr(190);
    expect(range).toMatchObject({
      bpmMin: 114,
      bpmMax: 132,
      percentMin: 60,
      percentMax: 70,
      anchorBpm: 190,
      method: "maxHr",
    });
    expect(formatZone2Bpm(range!)).toBe("114–132 bpm");
  });

  it("rounds each zone edge once from the raw anchor", () => {
    const range = calculateZone2FromMaxHr(190.5);
    expect(range).toMatchObject({
      bpmMin: roundBpm(190.5 * 0.6),
      bpmMax: roundBpm(190.5 * 0.7) - 1,
      anchorBpm: 190.5,
    });
    expect(range!.bpmMin).toBe(114);
    expect(range!.bpmMax).toBe(132);
    expect(roundBpm(191 * 0.6)).toBe(115);
    expect(range!.bpmMin).not.toBe(roundBpm(191 * 0.6));
  });

  it("matches the heart-rate zones Friel Zone 2 bounds and the max-HR percentages", () => {
    const maxHr = 190;
    const maxHrZone = calculateZone2FromMaxHr(maxHr);
    expect(maxHrZone).toMatchObject({
      bpmMin: Math.round(maxHr * 0.6),
      bpmMax: Math.round(maxHr * 0.7) - 1,
      percentMin: 60,
      percentMax: 70,
    });
    const fullTableUpperEdge = Math.round(maxHr * 0.7) - 1;
    expect(maxHrZone!.bpmMax).toBe(fullTableUpperEdge);

    const lthr = 170;
    const frielMin = Math.round(lthr * 0.81);
    const frielMax = Math.round(lthr * 0.9) - 1;
    expect(calculateZone2FromLthr(lthr)).toMatchObject({
      bpmMin: frielMin,
      bpmMax: frielMax,
      percentMin: 81,
      percentMax: 89,
      anchorBpm: 170,
      method: "lthr",
    });
    expect(frielMin).toBe(138);
    expect(frielMax).toBe(152);
  });

  it("reuses the Karvonen five-zone model for an HRR Zone 2 range", () => {
    expect(calculateZone2FromHrr(190, 50)).toMatchObject({
      bpmMin: 134,
      bpmMax: 147,
      percentMin: 60,
      percentMax: 70,
      anchorBpm: 190,
      restingBpm: 50,
      method: "hrr",
    });
    expect(calculateZone2FromHrr(50, 50)).toBeNull();
  });

  it("applies Tanaka or Fox, then 60–70%, without rounding HRmax first", () => {
    expect(estimateMaxHrFromAge(40, "tanaka")).toBe(180);
    expect(estimateMaxHrFromAge(40, "fox")).toBe(180);
    expect(estimateMaxHrFromAge(30, "tanaka")).toBe(187);
    const tanaka = calculateZone2FromAge(30, "tanaka");
    expect(tanaka).toMatchObject({
      anchorBpm: 187,
      bpmMin: 112,
      bpmMax: 130,
      ageFormula: "tanaka",
      method: "age",
    });

    const halfYear = calculateZone2FromAge(35, "tanaka");
    expect(estimateMaxHrFromAge(35, "tanaka")).toBe(183.5);
    expect(halfYear).toMatchObject({
      anchorBpm: 183.5,
      bpmMin: roundBpm(183.5 * 0.6),
      bpmMax: roundBpm(183.5 * 0.7) - 1,
    });
    expect(halfYear!.bpmMin).toBe(110);
    expect(halfYear!.bpmMax).toBe(127);
    expect(halfYear!.bpmMax).not.toBe(roundBpm(184 * 0.7) - 1);
    expect(formatAnchorBpm(183.5)).toBe("183.5");
    expect(formatAnchorBpm(180)).toBe("180");
  });

  it("returns null for empty, non-positive, and non-finite input", () => {
    expect(parsePositiveNumber("")).toBeNull();
    expect(parsePositiveNumber("0")).toBeNull();
    expect(parsePositiveNumber("-4")).toBeNull();
    expect(parsePositiveNumber("abc")).toBeNull();
    expect(parsePositiveNumber("NaN")).toBeNull();
    expect(parsePositiveNumber("Infinity")).toBeNull();
    expect(parsePositiveNumber("185")).toBe(185);
    expect(parsePositiveNumber("190.5")).toBe(190.5);

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(calculateZone2FromMaxHr(bad)).toBeNull();
      expect(calculateZone2FromHrr(bad, 50)).toBeNull();
      expect(calculateZone2FromHrr(190, bad)).toBeNull();
      expect(calculateZone2FromLthr(bad)).toBeNull();
      expect(calculateZone2FromAge(bad)).toBeNull();
      expect(estimateMaxHrFromAge(bad, "fox")).toBeNull();
    }
  });
});
