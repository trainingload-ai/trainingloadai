import { normalizeTimelineLayout } from "@/hooks/useActivityTimelineLayout";
import { describe, expect, it } from "vitest";
import {
  smoothTimeline,
  normalizeTimelineSeries,
  timelineOrigin,
  timelineDistanceIndex,
  timelineValueAt,
  timelineTimeAtDistance,
  coordinateAtTrackTime,
  sliceTrackByTime,
  downsampleTimeline,
  timelineLaps,
} from "./activity-timeline";
import type { TimelineTrackPoint } from "@shared/activity-timeline";

const origin = Date.parse("2026-11-10T07:00:00Z");
const at = (seconds: number) => new Date(origin + seconds * 1000).toISOString();

describe("activity timeline alignment", () => {
  it("keeps a late sensor at its real activity offset and preserves zero", () => {
    const rows = [
      { time: at(28), power: 0 },
      { time: at(29), power: "" },
      { time: at(30), power: 200 },
    ];
    expect(timelineOrigin({ startTime: at(0) }, [rows])).toBe(origin);
    const series = normalizeTimelineSeries(rows, "power", origin);
    expect(series).toEqual([
      { time: 28, value: 0 },
      { time: 29, value: null },
      { time: 30, value: 200 },
    ]);
    expect(timelineValueAt(series, 15, 5)).toBeNull();
    expect(timelineValueAt(series, 28, 5)).toBe(0);
    expect(timelineValueAt(series, 29.5, 5)).toBeNull();
  });

  it("rejects ambiguous times, orders rows, and keeps valid duplicate values", () => {
    expect(
      normalizeTimelineSeries(
        [
          { time: at(2), heartRate: 150 },
          { time: "2026-11-10T07:00:01", heartRate: 100 },
          { time: at(2) },
          { time: at(1), heartRate: 145 },
          { time: at(-1), heartRate: 140 },
        ],
        "heartRate",
        origin,
      ),
    ).toEqual([
      { time: 1, value: 145 },
      { time: 2, value: 150 },
    ]);
  });

  it("does not carry a last reading into a sensor outage", () => {
    const points = [
      { time: 0, value: 120 },
      { time: 1, value: 125 },
      { time: 90, value: 140 },
    ];
    expect(timelineValueAt(points, 40, 5)).toBeNull();
    expect(timelineValueAt(points, 0.75, 5)).toBe(125);
  });

  it("keeps pause plateaus and chooses the first arrival on a distance axis", () => {
    const distance = [
      { time: 0, value: 0 },
      { time: 5, value: 100 },
      { time: 10, value: 100 },
      { time: 15, value: 200 },
    ];
    expect(timelineDistanceIndex(distance)).toEqual(distance);
    expect(timelineTimeAtDistance(distance, 100)).toBe(5);
    expect(timelineValueAt(distance, 8, 15, true)).toBe(100);
    expect(timelineTimeAtDistance(distance, 150)).toBe(12.5);
    expect(
      timelineDistanceIndex([...distance, { time: 20, value: 0 }]),
    ).toEqual([]);
  });

  it("uses elapsed lap time rather than moving time across a pause", () => {
    const laps = timelineLaps(
      [{ id: 1, startTime: at(10), elapsedTime: 100, timerTime: 10 }],
      origin,
      150,
    );
    expect(laps[0].range).toEqual([10, 110]);
  });

  it("preserves a short spike and a missing sample when downsampling", () => {
    const points = Array.from({ length: 1000 }, (_, time) => ({
      time,
      value: time === 513 ? 999 : time === 42 ? null : 1,
    }));
    const sampled = downsampleTimeline(points, 80);
    expect(sampled).toContainEqual({ time: 513, value: 999 });
    expect(sampled).toContainEqual({ time: 42, value: null });
    expect(sampled.at(-1)?.time).toBe(999);
  });
});

describe("time-based GPS focus", () => {
  const segments: TimelineTrackPoint[][] = [
    [
      [origin, 120, 30],
      [origin + 10000, 120.001, 30.001],
    ],
    [
      [origin + 20000, 120.001, 30.001],
      [origin + 30000, 120, 30],
    ],
  ];
  it("locates a repeated position by timestamp and hides a fix inside a gap", () => {
    expect(coordinateAtTrackTime(segments, origin + 5000)).toEqual([
      120.0005, 30.000500000000002,
    ]);
    expect(coordinateAtTrackTime(segments, origin + 15000)).toBeNull();
    expect(coordinateAtTrackTime(segments, origin + 25000)?.[0]).toBeCloseTo(
      120.0005,
    );
  });
  it("returns separate highlighted lines across a GPS gap", () => {
    const lines = sliceTrackByTime(segments, origin + 5000, origin + 25000);
    expect(lines).toHaveLength(2);
    expect(lines[0].at(-1)).toEqual([120.001, 30.001]);
    expect(lines[1][0]).toEqual([120.001, 30.001]);
  });
});

describe("timeline smoothing and layouts", () => {
  it("resets smoothing across a missing sample or long data outage", () => {
    const points = [
      { time: 0, value: 120 },
      { time: 1, value: null },
      { time: 2, value: 120 },
      { time: 3, value: 125 },
      { time: 80, value: 125 },
      { time: 81, value: 125 },
    ];
    expect(smoothTimeline(points, 10).map((point) => point.value)).toEqual([
      120,
      null,
      120,
      122.5,
      125,
      125,
    ]);
  });
  it("preserves explicitly empty saved layouts and validates row settings", () => {
    expect(normalizeTimelineLayout({ rows: [] }, true).rows).toEqual([]);
    const layout = normalizeTimelineLayout(
      {
        grouping: "power",
        axis: "distance",
        rows: [
          {
            id: "custom",
            metric: "power",
            height: 9999,
            smoothing: -1,
            color: "javascript:x",
          },
          { id: "custom", metric: "heartRate", height: 86, smoothing: 0 },
        ],
      },
      true,
    );
    expect(layout.rows).toEqual([
      { id: "custom", metric: "power", height: 86, smoothing: 0 },
    ]);
    expect("grouping" in layout).toBe(false);
  });
});
