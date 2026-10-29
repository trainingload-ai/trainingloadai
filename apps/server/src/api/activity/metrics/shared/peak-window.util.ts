import type { BestObservedWindow } from '@/algorithm/time-series-metrics';
import type {
  CanonicalActivityRecord,
  PeakIntervalObservation,
} from '../context';

export const PEAK_WINDOW_ALGORITHM_VERSION = 2;

export function interpolateDistanceAtTime(
  records: CanonicalActivityRecord[],
  tMs: number,
): number | null {
  const points = records
    .filter(
      (record) =>
        Number.isFinite(record.tMs) &&
        typeof record.distance === 'number' &&
        Number.isFinite(record.distance),
    )
    .map((record) => ({ tMs: record.tMs, distance: record.distance! }))
    .sort((a, b) => a.tMs - b.tMs);
  if (!points.length || tMs < points[0].tMs || tMs > points.at(-1)!.tMs) {
    return null;
  }
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].tMs === tMs) return points[middle].distance;
    if (points[middle].tMs < tMs) low = middle + 1;
    else high = middle - 1;
  }
  const left = points[high];
  const right = points[low];
  if (
    !left ||
    !right ||
    right.tMs <= left.tMs ||
    right.distance < left.distance
  ) {
    return null;
  }
  const ratio = (tMs - left.tMs) / (right.tMs - left.tMs);
  return left.distance + (right.distance - left.distance) * ratio;
}

export function toPeakIntervalObservation(
  window: BestObservedWindow,
  timelineStartMs: number,
  records: CanonicalActivityRecord[],
  metric: 'POWER' | 'HEART_RATE',
): PeakIntervalObservation {
  return {
    value: window.value,
    startElapsedSec: (window.startMs - timelineStartMs) / 1000,
    endElapsedSec: (window.endMs - timelineStartMs) / 1000,
    startDistanceM: interpolateDistanceAtTime(records, window.startMs),
    endDistanceM: interpolateDistanceAtTime(records, window.endMs),
    coveredSeconds: window.coveredSeconds,
    coverageRatio: window.coverageRatio,
    algorithmVersion: PEAK_WINDOW_ALGORITHM_VERSION,
    parameters: {
      metric,
      aggregation: 'TIME_WEIGHTED_LEFT_SAMPLE',
      missingValues: 'UNKNOWN',
      completeWindowRequired: true,
    },
  };
}
