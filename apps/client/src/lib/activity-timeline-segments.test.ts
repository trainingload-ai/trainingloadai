import { describe, expect, it } from "vitest";
import {
  buildTimelineSegmentScale,
  timelineWeightedAverage,
  timelineDominantZone,
  timelineMetricStatistics,
} from "./activity-timeline-segments";
import { validTimelineSegments } from "@shared/activity-timeline";

describe("activity analysis segments", () => {
  it("calculates interval extrema and time-weighted averages without crossing gaps or extrapolating", () => {
    const points = [
      { time: 0, value: 120 },
      { time: 2, value: 180 },
      { time: 5, value: 140 },
      { time: 100, value: 220 },
      { time: 102, value: 100 },
    ];
    expect(timelineMetricStatistics(points, [1, 5])).toEqual({
      average: 165,
      maximum: 180,
      minimum: 120,
      coveredSeconds: 4,
    });
    expect(timelineMetricStatistics(points, [5, 100])).toBeNull();
    expect(timelineMetricStatistics(points, [100, 103])).toEqual({
      average: 220,
      maximum: 220,
      minimum: 220,
      coveredSeconds: 2,
    });
  });
  const segments = [
    { id: "a", name: "", start: 0, end: 300 },
    { id: "b", name: "", start: 300, end: 303 },
  ];
  it("expands short segments in the shared scale and maps cursor times back exactly", () => {
    const scale = buildTimelineSegmentScale(
      segments,
      [0, 303],
      900,
      (time) => time,
      "b",
    );
    expect(
      scale.positionAt(303) - scale.positionAt(300),
    ).toBeGreaterThanOrEqual(208);
    for (const time of [0, 10, 299, 300, 301.25, 303])
      expect(scale.timeAt(scale.positionAt(time))).toBeCloseTo(time, 8);
    expect(scale.positionAt(300)).toBeCloseTo((900 * 300) / 303);
  });
  it("supports distance weighting, stationary segments and a clipped zoom range", () => {
    const scale = buildTimelineSegmentScale(
      segments,
      [290, 303],
      600,
      (time) => Math.min(time, 300),
      null,
    );
    expect(scale.positionAt(290)).toBe(0);
    expect(
      scale.positionAt(303) - scale.positionAt(300),
    ).toBeGreaterThanOrEqual(144);
    expect(scale.timeAt(scale.positionAt(301))).toBeCloseTo(301);
  });
  it("uses time weighting for averages and the dominant zone rather than the average-value zone", () => {
    const points = [
      { time: 0, value: 100 },
      { time: 6, value: 180 },
      { time: 10, value: 180 },
    ];
    expect(timelineWeightedAverage(points, [0, 10])).toBe(132);
    expect(
      timelineDominantZone(
        points,
        [
          { name: "Z1", min: 0, max: 120 },
          { name: "Z2", min: 120 },
        ],
        [0, 10],
      ),
    ).toMatchObject({ name: "Z1", percent: 60 });
    expect(timelineWeightedAverage(points, [2, 8])).toBeCloseTo(760 / 6);
  });
  it("does not bridge missing samples, counts valid zero power, or invent data after recording ends", () => {
    const points = [
      { time: 0, value: 0 },
      { time: 6, value: 200 },
      { time: 10, value: null },
      { time: 11, value: 200 },
      { time: 60, value: 300 },
    ];
    expect(timelineWeightedAverage(points, [11, 60])).toBeNull();
    expect(timelineWeightedAverage(points, [60, 70])).toBeNull();
    expect(
      timelineDominantZone(
        points,
        [
          { name: "Z1", min: 0, max: 100 },
          { name: "Z2", min: 100 },
        ],
        [0, 10],
      ),
    ).toMatchObject({ name: "Z1", percent: 60 });
  });
  it("rejects overlaps, non-finite boundaries, duplicate identities and boundaries outside the activity", () => {
    expect(validTimelineSegments(segments, 303)).toBe(true);
    expect(
      validTimelineSegments(
        [...segments, { id: "c", name: "", start: 302, end: 303 }],
        303,
      ),
    ).toBe(false);
    expect(
      validTimelineSegments([{ id: "a", name: "", start: NaN, end: 303 }], 303),
    ).toBe(false);
    expect(validTimelineSegments([{ ...segments[0], end: 304 }], 303)).toBe(
      false,
    );
    expect(
      validTimelineSegments(
        [{ ...segments[0] }, { ...segments[1], id: "a" }],
        303,
      ),
    ).toBe(false);
    expect(validTimelineSegments([], 303)).toBe(true);
  });
});
