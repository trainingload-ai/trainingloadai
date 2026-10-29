import { describe, expect, it } from "vitest";
import {
  calculateHealthBaseline,
  getHealthBaselineStatus,
  type HealthChartPoint,
} from "./health-overview-model";

function points(values: number[]): HealthChartPoint[] {
  return values.map((value, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
    value,
  }));
}

describe("health overview baseline", () => {
  it("builds a typical range from the middle 60 percent of history", () => {
    const baseline = calculateHealthBaseline(
      points([40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]),
    );

    expect(baseline).toEqual({
      lower: 44,
      upper: 56,
      center: 50,
      sampleSize: 11,
    });
  });

  it("requires enough history and ignores missing readings", () => {
    const sparse = points([40, 42, 44, 46, 48, 50]);
    sparse.push({ date: "2026-10-07" });

    expect(calculateHealthBaseline(sparse)).toBeNull();
  });

  it("classifies values against the baseline without implying good or bad", () => {
    const baseline = { lower: 45, upper: 55, center: 50, sampleSize: 21 };

    expect(getHealthBaselineStatus(44, baseline)).toBe("below");
    expect(getHealthBaselineStatus(50, baseline)).toBe("within");
    expect(getHealthBaselineStatus(56, baseline)).toBe("above");
  });
});
