import { describe, expect, it } from "vitest";
import type { V2ActivityListItem } from "@/api/v2-activities";
import {
  aggregateMobileMeMetric,
  buildMobileMeTrend,
  isTallMobileMeTile,
  mobileMeMetricValue,
  splitMobileMeMasonry,
} from "./mobile-me-model";

function activity(
  overrides: Partial<V2ActivityListItem> = {},
): V2ActivityListItem {
  return {
    id: 1,
    hashId: "activity-1",
    title: "Run",
    sportType: "RUN",
    startTime: "2026-07-01T08:00:00+08:00",
    duration: 3_600,
    distance: 10_000,
    load: 50,
    status: "READY",
    note: null,
    providers: ["manual"],
    primaryProvider: "manual",
    thirdPartyMappings: [],
    ...overrides,
  };
}

describe("mobile me model", () => {
  it("uses the same metric conversions as mobile", () => {
    const item = activity({ averageSpeed: 3 });
    expect(mobileMeMetricValue(item, "count")).toBe(1);
    expect(mobileMeMetricValue(item, "distance")).toBe(10);
    expect(mobileMeMetricValue(item, "duration")).toBe(1);
    expect(mobileMeMetricValue(item, "avgSpeed")).toBeCloseTo(10.8);
  });

  it("averages average metrics and sums total metrics", () => {
    const items = [
      activity({ avgHeartRate: 120, load: 40 }),
      activity({ id: 2, avgHeartRate: 140, load: 60 }),
    ];
    expect(aggregateMobileMeMetric(items, "avgHeartRate")).toBe(130);
    expect(aggregateMobileMeMetric(items, "load")).toBe(100);
  });

  it("uses daily buckets for four weeks and weekly buckets after that", () => {
    expect(buildMobileMeTrend([], 4, "count", "2026-07-01")).toHaveLength(28);
    expect(buildMobileMeTrend([], 8, "count", "2026-07-01")).toHaveLength(8);
    expect(buildMobileMeTrend([], 12, "count", "2026-07-01")).toHaveLength(12);
  });

  it("matches mobile masonry column and height rules", () => {
    expect(splitMobileMeMasonry([1, 2, 3, 4, 5])).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(isTallMobileMeTile(0, 0)).toBe(true);
    expect(isTallMobileMeTile(1, 0)).toBe(false);
    expect(isTallMobileMeTile(0, 1)).toBe(false);
  });
});
