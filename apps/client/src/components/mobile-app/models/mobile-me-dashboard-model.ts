import type { MobileMeMetric, MobileMeRange } from "./mobile-me-model";

export type MobileMeSport =
  | "ALL"
  | "RUN"
  | "CYCLING"
  | "SWIM"
  | "FITNESS";

export const MOBILE_ME_RANGES: readonly MobileMeRange[] = [4, 8, 12];

export const MOBILE_ME_SPORTS: readonly MobileMeSport[] = [
  "ALL",
  "RUN",
  "CYCLING",
  "SWIM",
  "FITNESS",
];

export const MOBILE_ME_FITNESS_DEFINITIONS = new Set([
  "STRENGTH_TRAINING",
  "STRETCHING",
  "HIIT",
  "YOGA",
  "ROWING",
  "ELLIPTICAL",
]);

export const MOBILE_ME_METRIC_COLORS: Record<MobileMeMetric, string> = {
  count: "#10b981",
  distance: "#0ea5e9",
  duration: "#8b5cf6",
  load: "#f59e0b",
  ascent: "#22c55e",
  calories: "#f97316",
  avgSpeed: "#06b6d4",
  avgHeartRate: "#ef4444",
  avgPower: "#6366f1",
  avgCadence: "#a855f7",
};
