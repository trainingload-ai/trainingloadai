import { describe, expect, it } from "vitest";
import { applyVo2Search, calculateVo2, createVo2Draft, vo2SearchFromDraft } from "./vo2-field";
import { vo2DistanceDisplay, vo2WeightDisplay, vo2DistanceFromInput, vo2WeightFromInput } from "./vo2-input-units";

describe("VO2 input units", () => {
  it("converts entered miles and pounds into metric calculation values", () => {
    expect(Number(vo2DistanceFromInput("1", "imperial"))).toBeCloseTo(1609.344, 6);
    expect(Number(vo2WeightFromInput("154.323583526", "imperial"))).toBeCloseTo(70, 6);
    expect(vo2DistanceFromInput("", "imperial")).toBe("");
    expect(vo2WeightFromInput("", "imperial")).toBe("");
  });
  it("formats units without accumulating rounding in the stored result", () => {
    const draft = {...createVo2Draft(), age: "30", sex: "male" as const};
    const before = calculateVo2(draft);
    for (let index = 0; index < 10; index++) {
      expect(vo2DistanceDisplay(draft, "imperial")).toBe("1.7398");
      expect(vo2WeightDisplay(draft, "imperial")).toBe("154.32");
      expect(vo2DistanceDisplay(draft, "metric")).toBe("2800");
      expect(vo2WeightDisplay(draft, "metric")).toBe("70");
    }
    expect(calculateVo2({...draft, units: "imperial"})).toEqual(before);
  });
  it("restores imperial preference and exact metric data in share links", () => {
    const draft = {...createVo2Draft(), method: "rockport" as const, units: "imperial" as const, age: "30", sex: "male" as const};
    const restored = applyVo2Search(vo2SearchFromDraft(draft));
    expect(restored?.units).toBe("imperial");
    expect(restored?.weightKg).toBe("70");
    expect(calculateVo2(restored!)).toEqual(calculateVo2(draft));
    const oldLink = applyVo2Search("method=cooper&age=30&sex=male&distance=2.8&unit=km");
    expect(oldLink?.units).toBe("metric");
    expect(vo2DistanceDisplay(oldLink!, "metric")).toBe("2800");
  });
});
