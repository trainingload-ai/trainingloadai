import type { TimelineSegment } from "@shared/activity-timeline";
import {
  timelineGapLimit,
  timelineLowerBound,
  type TimelinePoint,
  type TimelineRange,
  type TimelineZone,
} from "./activity-timeline";

export type TimelineSegmentScale = {
  width: number;
  positionAt: (time: number) => number;
  timeAt: (position: number) => number;
};

function interpolate(
  knots: [number, number][],
  input: number,
  inverse = false,
) {
  const key = inverse ? 1 : 0;
  const value = inverse ? 0 : 1;
  let low = 0,
    high = knots.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (knots[middle][key] < input) low = middle + 1;
    else high = middle;
  }
  const right = Math.max(1, Math.min(knots.length - 1, low));
  const before = knots[right - 1],
    after = knots[right];
  return (
    before[value] +
    ((input - before[key]) / (after[key] - before[key])) *
      (after[value] - before[value])
  );
}

/** A shared piecewise scale gives short laps readable widths in every chart. */
export function buildTimelineSegmentScale(
  segments: TimelineSegment[],
  viewport: TimelineRange,
  baseWidth: number,
  coordinate: (time: number) => number | null,
  selectedId: string | null,
): TimelineSegmentScale {
  if (viewport[1] <= viewport[0]) {
    const width = Math.max(1, baseWidth);
    return {
      width,
      positionAt: (time) => (time - viewport[0]) * width,
      timeAt: (position) => viewport[0] + position / width,
    };
  }
  const boundaries = [
    ...new Set([
      viewport[0],
      viewport[1],
      ...segments
        .flatMap((segment) => [segment.start, segment.end])
        .filter((time) => time > viewport[0] && time < viewport[1]),
    ]),
  ].sort((a, b) => a - b);
  const spans = boundaries.slice(1).map((end, index) => {
    const start = boundaries[index];
    const segment = segments.find(
      (segment) => segment.start <= start && segment.end >= end,
    );
    const from = coordinate(start),
      to = coordinate(end);
    const weight =
      from !== null && to !== null ? Math.max(0, to - from) : end - start;
    return { start, end, segment, weight };
  });
  const total = spans.reduce((sum, span) => sum + span.weight, 0);
  const knots: [number, number][] = [[viewport[0], 0]];
  let width = 0;
  for (const span of spans) {
    const proportion =
      total > 0
        ? span.weight / total
        : (span.end - span.start) / (viewport[1] - viewport[0]);
    width += Math.max(
      0.001,
      baseWidth * proportion,
      span.segment ? (span.segment.id === selectedId ? 208 : 144) : 0,
    );
    knots.push([span.end, width]);
  }
  return {
    width,
    positionAt: (time) => interpolate(knots, time),
    timeAt: (position) => interpolate(knots, position, true),
  };
}

export function timelineWeightedAverage(
  points: TimelinePoint[],
  range: TimelineRange,
) {
  const gap = timelineGapLimit(points);
  let sum = 0,
    covered = 0;
  for (
    let index = Math.max(0, timelineLowerBound(points, range[0]) - 1);
    index < points.length - 1;
    index++
  ) {
    const point = points[index],
      next = points[index + 1];
    if (point.time >= range[1]) break;
    if (point.value === null || next.time - point.time > gap) continue;
    const seconds =
      Math.min(next.time, range[1]) - Math.max(point.time, range[0]);
    if (seconds > 0) {
      sum += point.value * seconds;
      covered += seconds;
    }
  }
  return covered > 0 ? sum / covered : null;
}

export function timelineDominantZone(
  points: TimelinePoint[],
  zones: TimelineZone[],
  range: TimelineRange,
) {
  const durations = zones.map(() => 0);
  const gap = timelineGapLimit(points);
  for (
    let index = Math.max(0, timelineLowerBound(points, range[0]) - 1);
    index < points.length - 1;
    index++
  ) {
    const point = points[index],
      next = points[index + 1];
    if (point.time >= range[1]) break;
    if (point.value === null || point.value < 0 || next.time - point.time > gap)
      continue;
    const zoneIndex = zones.findIndex(
      (zone) =>
        point.value! >= (zone.min ?? 0) &&
        point.value! < (zone.max ?? Infinity),
    );
    const seconds =
      Math.min(next.time, range[1]) - Math.max(point.time, range[0]);
    if (zoneIndex >= 0 && seconds > 0) durations[zoneIndex] += seconds;
  }
  const total = durations.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const index = durations.indexOf(Math.max(...durations));
  return {
    ...zones[index],
    percent: Math.round((durations[index] / total) * 100),
  };
}
