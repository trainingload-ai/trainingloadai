import { describe, expect, it } from "vitest";
import {
  buildTimelineScale,
  timelineWeightedAverage,
  timelineDominantZone,
  timelineMetricStatistics,
} from "./activity-timeline-segments";
import { validTimelineSegments } from "@shared/activity-timeline";
import { timelineValueAt, timelineTimeAtDistance } from "./activity-timeline";

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
    expect(timelineMetricStatistics(points, [5, 100])).toEqual({
      average: null,
      minimum: 140,
      maximum: 220,
      coveredSeconds: 0,
    });
    expect(timelineMetricStatistics(points, [100, 103])).toEqual({
      average: 220,
      maximum: 220,
      minimum: 100,
      coveredSeconds: 2,
    });
  });
  it("includes observed final and selection-boundary extrema without adding average coverage", () => {
    const points = [
      { time: 0, value: 120 },
      { time: 1, value: 130 },
      { time: 2, value: 200 },
    ];
    expect(timelineMetricStatistics(points, [0, 2])).toEqual({
      average: 125,
      minimum: 120,
      maximum: 200,
      coveredSeconds: 2,
    });
    expect(timelineMetricStatistics(points, [1, 2])).toEqual({
      average: 130,
      minimum: 130,
      maximum: 200,
      coveredSeconds: 1,
    });
    expect(
      timelineMetricStatistics(
        [
          { time: 0, value: 120 },
          { time: 1, value: 130 },
          { time: 2, value: 0 },
        ],
        [0, 5],
      ),
    ).toEqual({ average: 125, minimum: 0, maximum: 130, coveredSeconds: 2 });
    expect(timelineMetricStatistics(points, [2, 3])).toEqual({
      average: null,
      minimum: 200,
      maximum: 200,
      coveredSeconds: 0,
    });
    expect(timelineMetricStatistics(points, [2.1, 3])).toBeNull();
  });
  const segments = [
    { id: "a", name: "", start: 0, end: 300 },
    { id: "b", name: "", start: 300, end: 303 },
  ];
  it("keeps short and long intervals in their exact time proportions", () => {
    const scale = buildTimelineScale(
      [0, 303],
      900,
      (time) => time,
      (value) => value,
    );
    expect(scale.width).toBe(900);
    expect(scale.positionAt(303)! - scale.positionAt(300)!).toBeCloseTo(
      (900 * 3) / 303,
    );
    for (const time of [0, 10, 299, 300, 301.25, 303])
      expect(scale.timeAt(scale.positionAt(time)!)).toBeCloseTo(time, 8);
    expect(scale.positionAt(300)).toBeCloseTo((900 * 300) / 303);
  });
  it("only gives short segments a 32 px floor and keeps the shared mapping reversible", () => {
    const scale = buildTimelineScale(
      [0, 303],
      900,
      (time) => time,
      (value) => value,
      segments.map((segment) => [segment.start, segment.end]),
    );
    expect(scale.positionAt(303)! - scale.positionAt(300)!).toBeCloseTo(32);
    expect(scale.positionAt(300)).toBeCloseTo((900 * 300) / 303);
    expect(scale.width).toBeCloseTo((900 * 300) / 303 + 32);
    for (const time of [0, 10, 299, 300, 301.25, 303]) {
      const position = scale.positionAt(time)!;
      expect(scale.timeAt(position)).toBeCloseTo(time, 8);
      expect(scale.coordinateAt(position)).toBeCloseTo(time, 8);
    }
  });
  it("projects actual cumulative distances and collapses stationary time without widening it", () => {
    const distance = [
      { time: 0, value: 0 },
      { time: 5, value: 10 },
      { time: 10, value: 10 },
      { time: 15, value: 40 },
    ];
    const scale = buildTimelineScale(
      [0, 40],
      800,
      (time) => timelineValueAt(distance, time, 15, true),
      (value) => timelineTimeAtDistance(distance, value, 15),
    );
    expect(scale.positionAt(5)).toBe(200);
    expect(scale.positionAt(10)).toBe(200);
    expect(scale.timeAt(200)).toBe(5);
    expect(scale.positionAt(12.5)).toBe(500);
    expect(scale.timeAt(500)).toBe(12.5);
    expect(scale.positionAt(20)).toBeNull();
    expect(scale.timeAt(1000)).toBeNull();
  });
  it("does not invent distance positions inside sampling gaps", () => {
    const distance = [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
      { time: 60, value: 40 },
    ];
    const scale = buildTimelineScale(
      [0, 40],
      800,
      (time) => timelineValueAt(distance, time, 5, true),
      (value) => timelineTimeAtDistance(distance, value, 5),
    );
    expect(scale.positionAt(30)).toBeNull();
    expect(scale.timeAt(400)).toBeNull();
    expect(scale.coordinateAt(400)).toBe(20);
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
