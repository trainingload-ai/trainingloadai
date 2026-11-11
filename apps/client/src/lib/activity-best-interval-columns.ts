import type { MetricId } from "@/api/useActivityMetric";

export const BEST_INTERVAL_COLUMNS = [
  "scale",
  "value",
  "duration",
  "distance",
  "location",
  "timeRange",
  "pace",
  "avgHeartRate",
  "maxHeartRate",
  "avgPower",
  "maxPower",
  "cadence",
  "stride",
  "stanceTime",
  "verticalOscillation",
  "verticalRatio",
  "temperature",
] as const;
export type BestIntervalColumn = (typeof BEST_INTERVAL_COLUMNS)[number];
export const DEFAULT_BEST_INTERVAL_COLUMNS: BestIntervalColumn[] = [
  "scale",
  "value",
  "duration",
  "location",
  "avgHeartRate",
  "maxHeartRate",
];
export const INTERVAL_COLUMN_METRIC: Partial<
  Record<BestIntervalColumn, MetricId>
> = {
  pace: "speed",
  avgHeartRate: "heartRate",
  maxHeartRate: "heartRate",
  avgPower: "power",
  maxPower: "power",
  cadence: "cadence",
  stride: "stepLength",
  stanceTime: "stanceTime",
  verticalOscillation: "verticalOscillation",
  verticalRatio: "verticalRatio",
  temperature: "temperature",
};

export function normalizeBestIntervalColumns(
  value: unknown,
): BestIntervalColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_BEST_INTERVAL_COLUMNS];
  const valid = [...new Set(value)].filter((id): id is BestIntervalColumn =>
    BEST_INTERVAL_COLUMNS.includes(id),
  );
  return valid.length ? valid : [...DEFAULT_BEST_INTERVAL_COLUMNS];
}
