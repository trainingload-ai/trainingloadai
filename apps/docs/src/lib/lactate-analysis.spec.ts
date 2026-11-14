import { describe, expect, it } from "vitest";
import {
  analyzeLactate,
  LactateInputError,
  selectLactatePair,
} from "@trainingloadai/shared/lactate-analysis";
import {
  fitCubic,
  maximumDistance,
  predict,
  rootsInRange,
  upwardCrossing,
} from "../../../../packages/shared/lactate-analysis/math";
import { lactateExample } from "./lactate-recording";
import fixtures from "../../../../packages/shared/lactate-analysis/fixtures.json";
import type {
  LactateAnalysisInput,
  LactateMethodId,
} from "@trainingloadai/shared/lactate-analysis";

describe("pinned lactater numerical reference", () => {
  for (const fixture of fixtures.cases) {
    it(fixture.id, () => {
      const result = analyzeLactate(fixture.input as LactateAnalysisInput);
      for (const method of result.methods) {
        const expected =
          fixture.expectedIntensity[method.methodId as LactateMethodId];
        if (expected === null)
          expect(method.intensity, method.methodId).toBeNull();
        else
          expect(
            Math.abs(method.intensity! - expected),
            method.methodId,
          ).toBeLessThan(fixture.input.sport === "cycling" ? 0.01 : 0.001);
      }
    });
  }
});

describe("lactate numerical invariants", () => {
  it("recovers a known cubic and its crossings", () => {
    const x = [10, 20, 30, 40, 50, 60];
    const y = x.map((v) => 1 + (v / 40) ** 3);
    const curve = fitCubic(x, y)!;
    expect(predict(curve, 40)).toBeCloseTo(2, 10);
    expect(upwardCrossing(curve, 2, 10, 60)).toBeCloseTo(40, 8);
    expect(upwardCrossing(curve, 100, 10, 60)).toBeNull();
    const result = analyzeLactate({
      sport: "cycling",
      stages: x.map((intensity, i) => ({ intensity, lactate: y[i]! })),
    });
    expect(result.fitQuality!.rmse).toBeLessThan(1e-12);
    expect(result.fitQuality!.maxResidual).toBeLessThan(1e-12);
    expect(result.fitQuality!.rSquared).toBeCloseTo(1, 12);
  });
  it("chooses the last upward crossing, excluding tangencies", () => {
    const curve = { coefficients: [2, -1, 0, 1], center: 0, scale: 1 };
    expect(rootsInRange([0, -1, 0, 1], -2, 2)).toEqual(
      expect.arrayContaining([-1, 0, 1]),
    );
    expect(upwardCrossing(curve, 2, -2, 2)).toBeCloseTo(1, 10);
    expect(
      upwardCrossing(
        { coefficients: [2, 0, 1], center: 0, scale: 1 },
        2,
        -1,
        1,
      ),
    ).toBeNull();
    expect(
      upwardCrossing(
        { coefficients: [2, 0, 0, 1], center: 0, scale: 1 },
        2,
        -1,
        1,
      ),
    ).toBeCloseTo(0, 10);
  });
  it("finds the analytic distance maximum without a power grid", () => {
    const curve = { coefficients: [0, 0, 1], center: 0, scale: 1 };
    expect(maximumDistance(curve, 0, 0, 1, 1)).toBeCloseTo(0.5, 10);
    expect(maximumDistance(curve, 0, 0, 1, -1)).toBeNull();
  });
  it("is invariant under intensity scaling and never mutates input", () => {
    const stages = lactateExample("cycling");
    const snapshot = structuredClone(stages);
    const a = analyzeLactate({ sport: "cycling", stages });
    const b = analyzeLactate({
      sport: "cycling",
      stages: stages.map((row) => ({ ...row, intensity: row.intensity * 2 })),
    });
    for (const [i, method] of a.methods.entries()) {
      expect(b.methods[i]!.status).toBe(method.status);
      if (method.intensity !== null)
        expect(b.methods[i]!.intensity).toBeCloseTo(method.intensity * 2, 6);
    }
    expect(stages).toEqual(snapshot);
  });
  it("retains partial results with four stages and rejects an invalid pair", () => {
    const a = analyzeLactate({
      sport: "cycling",
      stages: lactateExample("cycling").slice(1, 5),
    });
    expect(a.status).toBe("partial");
    expect(
      a.methods.find((method) => method.methodId === "log_log")?.reasonCodes,
    ).toContain("too_few_stages");
    expect(
      selectLactatePair(a, { lt1Method: "obla_4", lt2Method: "obla_2" }).zones,
    ).toEqual([]);
  });
  it("rejects duplicate, unordered, missing, nonfinite and excessive samples", () => {
    const stages = lactateExample("cycling");
    for (const bad of [
      [stages[1]!, stages[1]!, ...stages.slice(2)],
      stages.toReversed(),
      stages.slice(0, 3),
      stages.map((row) => ({ ...row, lactate: NaN })),
      Array.from({ length: 31 }, (_, i) => ({ intensity: i + 1, lactate: 1 })),
    ]) {
      expect(() => analyzeLactate({ sport: "cycling", stages: bad })).toThrow(
        LactateInputError,
      );
    }
  });
  it("does not interpolate a missing heart-rate segment or invent zones", () => {
    const stages = lactateExample("cycling").map((stage) => {
      const row = { ...stage };
      delete row.heartRate;
      return row;
    });
    const result = analyzeLactate({ sport: "cycling", stages });
    expect(result.methods.every((method) => method.heartRate === null)).toBe(
      true,
    );
    const flat = analyzeLactate({
      sport: "cycling",
      stages: stages.map((row) => ({ ...row, lactate: 1 })),
    });
    expect(flat.zones).toEqual([]);
    expect(flat.status).toBe("unavailable");
    expect(
      flat.methods.every(
        (method) =>
          method.intensity === null || Number.isFinite(method.intensity),
      ),
    ).toBe(true);
  });
  it("uses the stage before an exact decimal 0.4 rise and rejects degenerate QR fits", () => {
    const result = analyzeLactate({
      sport: "cycling",
      stages: [1, 1.1, 1.5, 2, 3.2, 5].map((lactate, i) => ({
        intensity: 100 + i * 25,
        lactate,
      })),
    });
    expect(
      result.methods.find((method) => method.methodId === "moddmax")
        ?.anchors?.[0],
    ).toEqual({ intensity: 125, lactate: 1.1 });
    expect(fitCubic([1, 1, 1, 2], [1, 2, 3, 4])).toBeNull();
  });
});
