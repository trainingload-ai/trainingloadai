import {
  timelineGapLimit,
  timelineLowerBound,
  type TimelinePoint,
  type TimelineRange,
  type TimelineZone,
} from "./activity-timeline";

export type TimelineScale = {
  width: number;
  positionAt: (time: number) => number | null;
  timeAt: (position: number) => number | null;
  coordinateAt: (position: number) => number;
};

export const TIMELINE_MIN_SEGMENT_WIDTH = 32;

/** Keep ordinary spans proportional, with a small shared floor for short segments. */
export function buildTimelineScale(
  domain: TimelineRange,
  baseWidth: number,
  coordinate: (time: number) => number | null,
  inverse: (coordinate: number) => number | null,
  segmentRanges: TimelineRange[] = [],
): TimelineScale {
  const proportionalWidth = Math.max(1, baseWidth);
  const span = domain[1] - domain[0];
  const ranges = segmentRanges
    .map(
      ([start, end]): TimelineRange => [
        Math.max(domain[0], start),
        Math.min(domain[1], end),
      ],
    )
    .filter(
      ([start, end]) =>
        Number.isFinite(start) && Number.isFinite(end) && end > start,
    );
  const boundaries = [
    ...new Set([domain[0], domain[1], ...ranges.flat()]),
  ].sort((a, b) => a - b);
  const positions = [0];
  for (let index = 1; index < boundaries.length; index++) {
    const start = boundaries[index - 1],
      end = boundaries[index];
    const isSegment = ranges.some(([from, to]) => from <= start && to >= end);
    positions.push(
      positions[index - 1] +
        Math.max(
          span > 0 ? ((end - start) / span) * proportionalWidth : 0,
          isSegment ? TIMELINE_MIN_SEGMENT_WIDTH : 0,
        ),
    );
  }
  const width = Math.max(1, positions.at(-1) ?? proportionalWidth);
  const interpolate = (value: number, input: number[], output: number[]) => {
    if (input.length < 2) return output[0];
    let low = 1,
      high = input.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (input[middle] < value) low = middle + 1;
      else high = middle;
    }
    const before = Math.max(0, low - 1),
      after = low;
    const length = input[after] - input[before];
    return length > 0
      ? output[before] +
          ((value - input[before]) / length) * (output[after] - output[before])
      : output[before];
  };
  const coordinateAt = (position: number) =>
    interpolate(position, positions, boundaries);
  return {
    width,
    coordinateAt,
    positionAt: (time) => {
      const value = coordinate(time);
      return value !== null && Number.isFinite(value) && span > 0
        ? interpolate(value, boundaries, positions)
        : null;
    },
    timeAt: (position) => (span > 0 ? inverse(coordinateAt(position)) : null),
  };
}

export function timelineMetricStatistics(
  points: TimelinePoint[],
  range: TimelineRange,
  gap = timelineGapLimit(points),
) {
  if (range[1] <= range[0]) return null;
  let sum = 0,
    covered = 0;
  let minimum = Infinity,
    maximum = -Infinity;
  for (
    let index = Math.max(0, timelineLowerBound(points, range[0]) - 1);
    index < points.length;
    index++
  ) {
    const point = points[index],
      next = points[index + 1];
    if (point.time > range[1]) break;
    if (point.value === null) continue;
    const seconds =
      next && next.time - point.time <= gap
        ? Math.max(
            0,
            Math.min(next.time, range[1]) - Math.max(point.time, range[0]),
          )
        : 0;
    if (seconds > 0) {
      sum += point.value * seconds;
      covered += seconds;
    }
    // Observed boundary samples contribute extrema, even when the final sample
    // has no following interval. They never add invented average coverage.
    if (point.time >= range[0] || seconds > 0) {
      minimum = Math.min(minimum, point.value);
      maximum = Math.max(maximum, point.value);
    }
  }
  return minimum !== Infinity
    ? {
        average: covered > 0 ? sum / covered : null,
        minimum,
        maximum,
        coveredSeconds: covered,
      }
    : null;
}

export function timelineWeightedAverage(
  points: TimelinePoint[],
  range: TimelineRange,
  gap = timelineGapLimit(points),
) {
  return timelineMetricStatistics(points, range, gap)?.average ?? null;
}

export function timelineDominantZone(
  points: TimelinePoint[],
  zones: TimelineZone[],
  range: TimelineRange,
  gap = timelineGapLimit(points),
) {
  const durations = zones.map(() => 0);
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
