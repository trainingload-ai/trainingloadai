import { describe, expect, it } from "vitest";
import {
  bucketAdditiveComparisonPoints,
  comparisonDelta,
  normalizeSummaryPointValue,
  summarizeComparisonSeries,
} from "./summary-comparison-model";

describe("summary comparison model", () => {
  it("keeps zero for additive metrics so rest days remain visible", () => {
    expect(normalizeSummaryPointValue("count", 0)).toBe(0);
    expect(normalizeSummaryPointValue("duration", 0)).toBe(0);
    expect(normalizeSummaryPointValue("distance", 0)).toBe(0);
  });

  it("treats zero averages as missing readings", () => {
    expect(normalizeSummaryPointValue("speed", 0)).toBeNull();
    expect(normalizeSummaryPointValue("power", 0)).toBeNull();
  });

  it("sums volume metrics and averages rate metrics", () => {
    expect(summarizeComparisonSeries("count", [1, 0, 2, null])).toBe(3);
    expect(summarizeComparisonSeries("speed", [2, null, 4])).toBe(3);
  });

  it("calculates a neutral period delta", () => {
    expect(comparisonDelta(12, 9)).toBe(3);
    expect(comparisonDelta(9, 12)).toBe(-3);
    expect(comparisonDelta(null, 12)).toBeNull();
  });

  it("buckets dense additive series without losing period totals", () => {
    const points = Array.from({ length: 30 }, (_, index) => ({
      time: `2026-10-${String(index + 1).padStart(2, "0")}`,
      previousTime: `2026-09-${String(index + 1).padStart(2, "0")}`,
      current: index % 2,
      previous: 1,
    }));

    const buckets = bucketAdditiveComparisonPoints(points);

    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toMatchObject({
      time: "2026-10-01",
      timeEnd: "2026-10-05",
      current: 2,
      previous: 5,
    });
    expect(buckets.reduce((sum, point) => sum + (point.current ?? 0), 0)).toBe(
      15,
    );
  });
});
