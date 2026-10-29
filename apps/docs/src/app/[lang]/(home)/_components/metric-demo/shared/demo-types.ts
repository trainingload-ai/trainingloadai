export type DemoSportType = "all" | "RUN" | "CYCLING" | "SWIM";

export type DemoTimeKey = "thisYear" | "last30" | "last90";

export type DemoTimeRange = {
  key: DemoTimeKey;
  label: string;
};

export const DEMO_TIME_OPTIONS: DemoTimeRange[] = [
  { key: "thisYear", label: "This year" },
  { key: "last30", label: "Last 30 days" },
  { key: "last90", label: "Last 90 days" },
];

export const DEMO_SPORT_OPTIONS: Array<{
  value: DemoSportType;
  label: string;
}> = [
  { value: "all", label: "All sports" },
  { value: "RUN", label: "Run" },
  { value: "CYCLING", label: "Cycling" },
  { value: "SWIM", label: "Swim" },
];

export const CHART_SERIES_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
];

export type DurationKey =
  | "5s"
  | "30s"
  | "1m"
  | "3m"
  | "5m"
  | "10m"
  | "20m"
  | "60m"
  | "2h"
  | "3h"
  | "6h";

export const POWER_DURATION_KEYS = [
  "5s",
  "30s",
  "1m",
  "3m",
  "5m",
  "20m",
  "60m",
  "2h",
  "3h",
] as const;

export const HR_TABLE_DURATION_KEYS = [
  "5s",
  "30s",
  "1m",
  "3m",
  "5m",
  "10m",
  "20m",
  "60m",
  "2h",
  "3h",
  "6h",
] as const;

export const HR_CHART_DURATION_KEYS = [
  "5s",
  "30s",
  "1m",
  "3m",
  "5m",
  "20m",
  "60m",
  "2h",
  "3h",
  "6h",
] as const;

export const PACE_DISTANCE_KEYS = [
  "400m",
  "800m",
  "1500m",
  "1mi",
  "3k",
  "5k",
  "10k",
  "20k",
  "42.2k",
] as const;

export type PowerDurationRow = Record<(typeof POWER_DURATION_KEYS)[number], number> & {
  timeKey: DemoTimeKey;
};

export type HeartRateDurationRow = Record<
  (typeof HR_TABLE_DURATION_KEYS)[number],
  number
> & { timeKey: DemoTimeKey };

export type PaceDistanceCell = { paceSec: number; timeSec: number };

export type PaceDistanceRow = Partial<
  Record<(typeof PACE_DISTANCE_KEYS)[number], PaceDistanceCell>
> & { timeKey: DemoTimeKey };

export type PmcDataPoint = {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
  value: number;
};

export type ZoneDistributionRow = {
  zone: string;
  values: Record<DemoTimeKey, number>;
  color: string;
};
