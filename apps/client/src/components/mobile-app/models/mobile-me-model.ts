import type { V2ActivityListItem } from "@/api/v2-activities";

export type MobileMeRange = 4 | 8 | 12;
export type MobileMeMetric =
  | "count"
  | "distance"
  | "duration"
  | "load"
  | "ascent"
  | "calories"
  | "avgSpeed"
  | "avgHeartRate"
  | "avgPower"
  | "avgCadence";
export type MobileMeLayout = "masonry" | "list";

export const MOBILE_ME_METRICS: readonly MobileMeMetric[] = [
  "count",
  "distance",
  "duration",
  "load",
  "ascent",
  "calories",
  "avgSpeed",
  "avgHeartRate",
  "avgPower",
  "avgCadence",
];

const AVERAGE_METRICS = new Set<MobileMeMetric>([
  "avgSpeed",
  "avgHeartRate",
  "avgPower",
  "avgCadence",
]);

export function mobileMeMetricValue(
  item: V2ActivityListItem,
  metric: MobileMeMetric,
): number | null {
  if (metric === "count") return 1;
  if (metric === "distance")
    return item.distance != null && item.distance >= 0
      ? item.distance / 1000
      : null;
  if (metric === "duration")
    return item.duration != null && item.duration >= 0
      ? item.duration / 3600
      : null;
  if (metric === "avgSpeed")
    return item.averageSpeed != null && item.averageSpeed > 0
      ? item.averageSpeed * 3.6
      : null;
  const value = item[metric];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function aggregateMobileMeMetric(
  items: readonly V2ActivityListItem[],
  metric: MobileMeMetric,
): number | null {
  const values = items
    .map((item) => mobileMeMetricValue(item, metric))
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return AVERAGE_METRICS.has(metric) ? total / values.length : total;
}

export function mobileMeMetricPrecision(metric: MobileMeMetric) {
  return metric === "distance" || metric === "duration" || metric === "avgSpeed"
    ? 1
    : 0;
}

export function buildMobileMeTrend(
  items: readonly V2ActivityListItem[],
  weeks: MobileMeRange,
  metric: MobileMeMetric,
  startDate: string,
) {
  const bucketByWeek = weeks > 4;
  const bucketCount = bucketByWeek ? weeks : weeks * 7;
  const rangeStart = new Date(`${startDate}T00:00:00`);
  const buckets = Array.from({ length: bucketCount }, () => [] as number[]);

  for (const item of items) {
    if (!item.startTime) continue;
    const activityDate = new Date(item.startTime);
    if (Number.isNaN(activityDate.getTime())) continue;
    const localDay = new Date(
      activityDate.getFullYear(),
      activityDate.getMonth(),
      activityDate.getDate(),
    );
    const daysFromStart = Math.floor(
      (localDay.getTime() - rangeStart.getTime()) / 86_400_000,
    );
    const index = bucketByWeek
      ? Math.floor(daysFromStart / 7)
      : daysFromStart;
    const value = mobileMeMetricValue(item, metric);
    if (index < 0 || index >= bucketCount || value == null) continue;
    buckets[index]?.push(value);
  }

  return buckets.map((values, index) => {
    const date = new Date(rangeStart);
    date.setDate(date.getDate() + (bucketByWeek ? index * 7 : index));
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      date,
      value:
        values.length && AVERAGE_METRICS.has(metric)
          ? total / values.length
          : total,
    };
  });
}

export function splitMobileMeMasonry<T>(items: readonly T[]) {
  return [
    items.filter((_, index) => index % 2 === 0),
    items.filter((_, index) => index % 2 === 1),
  ] as const;
}

export function isTallMobileMeTile(index: number, columnIndex: number) {
  return (index + columnIndex) % 3 !== 1;
}
