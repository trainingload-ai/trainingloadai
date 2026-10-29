import type { OverviewSummaryKey } from "./overview-model";

export type SummaryComparisonPoint = {
  time: string;
  timeEnd?: string;
  previousTime: string;
  previousTimeEnd?: string;
  current: number | null;
  previous: number | null;
};

const ADDITIVE_METRICS = new Set<OverviewSummaryKey>([
  "count",
  "duration",
  "distance",
  "climb",
  "calories",
]);

export function isAdditiveSummaryMetric(metricKey: OverviewSummaryKey) {
  return ADDITIVE_METRICS.has(metricKey);
}

export function normalizeSummaryPointValue(
  metricKey: OverviewSummaryKey,
  value: number | null | undefined,
) {
  if (value == null || !Number.isFinite(value)) return null;
  if (isAdditiveSummaryMetric(metricKey)) return Math.max(0, value);
  return value > 0 ? value : null;
}

export function summarizeComparisonSeries(
  metricKey: OverviewSummaryKey,
  values: Array<number | null>,
) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  const total = finite.reduce((sum, value) => sum + value, 0);
  return isAdditiveSummaryMetric(metricKey) ? total : total / finite.length;
}

export function comparisonDelta(
  current: number | null,
  previous: number | null,
) {
  if (current == null || previous == null) return null;
  return current - previous;
}

function sumBucket(values: Array<number | null>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length > 0
    ? finite.reduce((total, value) => total + value, 0)
    : null;
}

export function bucketAdditiveComparisonPoints(
  points: SummaryComparisonPoint[],
) {
  const bucketSize = points.length > 14 ? 5 : points.length > 7 ? 2 : 1;
  if (bucketSize === 1) return points;

  const buckets: SummaryComparisonPoint[] = [];
  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    const first = bucket[0];
    const last = bucket.at(-1)!;
    buckets.push({
      time: first.time,
      timeEnd: last.time,
      previousTime: first.previousTime,
      previousTimeEnd: last.previousTime,
      current: sumBucket(bucket.map((point) => point.current)),
      previous: sumBucket(bucket.map((point) => point.previous)),
    });
  }
  return buckets;
}
