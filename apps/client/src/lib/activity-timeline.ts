import type { Activity, ActivityLap } from "@/api/activities";
import type { ChartValue } from "@/api/useActivityMetric";
import type { TimelineTrackPoint } from "@shared/activity-timeline";
import type { RouteCoordinate } from "@/components/MapBoxMap/activity-route-focus";

export type TimelinePoint = { time: number; value: number | null };
export type TimelineRange = readonly [start: number, end: number];

export function timelineNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function timelineTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value))
    return null;
  return timelineNumber(Date.parse(value));
}

export function timelineOrigin(
  activity: Activity,
  rows: ChartValue[][],
): number | null {
  const start = timelineTimestamp(activity.startTime);
  if (start !== null) return start;
  let earliest = Infinity;
  for (const series of rows)
    for (const row of series) {
      const time = timelineTimestamp(row.time);
      if (time !== null) earliest = Math.min(earliest, time);
    }
  return Number.isFinite(earliest) ? earliest : null;
}

export function normalizeTimelineSeries(
  rows: ChartValue[],
  metric: string,
  origin: number,
): TimelinePoint[] {
  const points = new Map<number, TimelinePoint>();
  for (const row of rows) {
    const timestamp = timelineTimestamp(row.time);
    if (timestamp === null || timestamp < origin) continue;
    const time = (timestamp - origin) / 1000;
    const value = timelineNumber(row[metric]);
    if (value !== null || !points.has(time)) points.set(time, { time, value });
  }
  return [...points.values()].sort((a, b) => a.time - b.time);
}

export function timelineGapLimit(points: TimelinePoint[]): number {
  const intervals: number[] = [];
  for (let index = 1; index < points.length; index++) {
    const delta = points[index].time - points[index - 1].time;
    if (delta > 0) intervals.push(delta);
  }
  intervals.sort((a, b) => a - b);
  return Math.min(
    30,
    Math.max(5, (intervals[Math.floor(intervals.length / 2)] ?? 1) * 3),
  );
}

export function timelineLowerBound(
  points: readonly { time: number }[],
  time: number,
): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function timelineValueAt(
  points: TimelinePoint[],
  time: number,
  gap: number,
  interpolate = false,
): number | null {
  const index = timelineLowerBound(points, time);
  const next = points[index];
  if (next?.time === time) return next.value;
  const previous = points[index - 1];
  if (
    !previous ||
    !next ||
    previous.value === null ||
    next.value === null ||
    next.time - previous.time > gap
  )
    return null;
  const fraction = (time - previous.time) / (next.time - previous.time);
  return interpolate
    ? previous.value + (next.value - previous.value) * fraction
    : fraction <= 0.5
      ? previous.value
      : next.value;
}

export function timelineDistanceIndex(
  points: TimelinePoint[],
): TimelinePoint[] {
  const valid = points.filter(
    (point) => point.value !== null && point.value >= 0,
  );
  if (valid.length < 2) return [];
  for (let index = 1; index < valid.length; index++) {
    if (valid[index].value! < valid[index - 1].value!) return [];
  }
  return valid.at(-1)!.value! > valid[0].value! ? valid : [];
}

export function timelineTimeAtDistance(
  points: TimelinePoint[],
  distance: number,
  gap = timelineGapLimit(points),
): number | null {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].value! < distance) low = middle + 1;
    else high = middle;
  }
  const next = points[low];
  if (next?.value === distance) return next.time;
  const previous = points[low - 1];
  if (!previous || !next || next.time - previous.time > gap) return null;
  return (
    previous.time +
    ((distance - previous.value!) / (next.value! - previous.value!)) *
      (next.time - previous.time)
  );
}

export function timelineLaps(
  laps: ActivityLap[],
  origin: number,
  duration: number,
) {
  const ranges: { id: number; index: number; range: TimelineRange }[] = [];
  for (const [index, lap] of laps.entries()) {
    const start = timelineTimestamp(lap.startTime);
    if (start === null) continue;
    const elapsed = timelineNumber(lap.elapsedTime);
    const end =
      timelineTimestamp(lap.endTime) ??
      (elapsed !== null && elapsed > 0 ? start + elapsed * 1000 : null);
    if (end === null) continue;
    const range: TimelineRange = [
      Math.max(0, (start - origin) / 1000),
      Math.min(duration, (end - origin) / 1000),
    ];
    if (range[1] <= range[0]) continue;
    ranges.push({ id: lap.id, index: (lap.index ?? index) + 1, range });
  }
  ranges.sort((a, b) => a.range[0] - b.range[0]);
  return ranges.filter(
    (lap, index) => index === 0 || lap.range[0] >= ranges[index - 1].range[1],
  );
}

// Keep local extrema and explicit gaps when reducing a long trace for canvas.
export function downsampleTimeline(
  points: TimelinePoint[],
  maxPoints: number,
): TimelinePoint[] {
  if (points.length <= maxPoints) return points;
  const result = [points[0]];
  const size = Math.max(
    1,
    Math.ceil(points.length / Math.max(1, Math.floor(maxPoints / 4))),
  );
  for (let start = 1; start < points.length - 1; start += size) {
    const bucket = points.slice(
      start,
      Math.min(start + size, points.length - 1),
    );
    let min = bucket[0],
      max = bucket[0];
    const selected = new Set<TimelinePoint>([
      bucket[0],
      bucket[bucket.length - 1],
    ]);
    for (const point of bucket) {
      if (point.value === null) selected.add(point);
      if (
        point.value !== null &&
        (min.value === null || point.value < min.value)
      )
        min = point;
      if (
        point.value !== null &&
        (max.value === null || point.value > max.value)
      )
        max = point;
    }
    selected.add(min);
    selected.add(max);
    result.push(...[...selected].sort((a, b) => a.time - b.time));
  }
  result.push(points[points.length - 1]);
  return result;
}

export function coordinateAtTrackTime(
  segments: TimelineTrackPoint[][],
  epochMs: number,
): RouteCoordinate | null {
  for (const segment of segments) {
    if (
      !segment.length ||
      epochMs < segment[0][0] ||
      epochMs > segment[segment.length - 1][0]
    )
      continue;
    let low = 0,
      high = segment.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (segment[middle][0] < epochMs) low = middle + 1;
      else high = middle;
    }
    const next = segment[low];
    if (next[0] === epochMs) return [next[1], next[2]];
    const previous = segment[low - 1];
    const fraction = (epochMs - previous[0]) / (next[0] - previous[0]);
    return [
      previous[1] + (next[1] - previous[1]) * fraction,
      previous[2] + (next[2] - previous[2]) * fraction,
    ];
  }
  return null;
}

export function sliceTrackByTime(
  segments: TimelineTrackPoint[][],
  start: number,
  end: number,
): RouteCoordinate[][] {
  const result: RouteCoordinate[][] = [];
  for (const segment of segments) {
    if (segment.length < 2) continue;
    const from = Math.max(start, segment[0][0]);
    const to = Math.min(end, segment[segment.length - 1][0]);
    if (to <= from) continue;
    const first = coordinateAtTrackTime([segment], from)!;
    const last = coordinateAtTrackTime([segment], to)!;
    result.push([
      first,
      ...segment
        .filter(([time]) => time > from && time < to)
        .map((point): RouteCoordinate => [point[1], point[2]]),
      last,
    ]);
  }
  return result;
}

export type TimelineZone = {
  name: string;
  shortName?: string;
  min?: number;
  max?: number;
  color?: string;
};
export function smoothTimeline(
  points: TimelinePoint[],
  window: number,
): TimelinePoint[] {
  if (window <= 0) return points;
  const gap = timelineGapLimit(points);
  let left = 0,
    sum = 0,
    count = 0;
  return points.map((point, index) => {
    if (
      point.value === null ||
      (index > 0 && point.time - points[index - 1].time > gap)
    ) {
      left = index;
      sum = 0;
      count = 0;
    }
    if (point.value === null) {
      left = index + 1;
      return point;
    }
    sum += point.value;
    count++;
    while (left < index && point.time - points[left].time > window) {
      if (points[left].value !== null) {
        sum -= points[left].value!;
        count--;
      }
      left++;
    }
    return { time: point.time, value: sum / count };
  });
}
