import type {
  TrainingMetricMeasure,
  TrainingMetricSource,
} from "./training-visualization";
/** Numeric axes and independently sampled series for evidence-based Coach charts. */
export const EXPLORATION_SOURCES = [
  "ACTIVITY_SERIES",
  "ZONE_DISTRIBUTION",
  "PLAN_EXECUTION",
  "RELATIONSHIP",
] as const;
export const SIGNAL_MEASURES = [
  "HEART_RATE",
  "POWER",
  "SPEED",
  "PACE",
  "CADENCE",
  "ELEVATION",
  "GRADE",
] as const;
export type SignalMeasure = (typeof SIGNAL_MEASURES)[number];
export type ExplorationMeasure =
  | SignalMeasure
  | TrainingMetricMeasure
  | "DURATION_MIN"
  | "DISTANCE_KM"
  | "LOAD";
export type ExplorationQuery = {
  source: (typeof EXPLORATION_SOURCES)[number];
  from?: string;
  to?: string;
  measures?: ExplorationMeasure[];
  sportTypes?: string[];
  activityHashIds?: string[];
  alignment?: "ELAPSED_TIME" | "DISTANCE" | "PROGRESS";
  axisLayout?: "SEPARATE" | "OVERLAY";
  fromSecond?: number;
  toSecond?: number;
  maxPoints?: number;
  zoneType?: "HEART_RATE" | "POWER" | "PACE";
  zoneUnit?: "MINUTES" | "PERCENT";
  compareFrom?: string;
  compareTo?: string;
  planId?: string;
  groupBy?: "DAY" | "WEEK" | "MONTH" | "WORKOUT";
  relationshipBasis?: "ACTIVITY" | "SAMPLE" | "METRIC_HISTORY";
  metricSource?: TrainingMetricSource;
};
export type ExplorationUnit =
  | "bpm"
  | "W"
  | "km/h"
  | "s/km"
  | "rpm"
  | "m"
  | "%"
  | "min"
  | "km"
  | "load"
  | "s"
  | "count"
  | "J"
  | "m/s"
  | "ml/kg/min"
  | "kg"
  | "cm";
export const EXPLORATION_UNITS: Record<ExplorationMeasure, ExplorationUnit> = {
  HEART_RATE: "bpm",
  POWER: "W",
  SPEED: "km/h",
  PACE: "s/km",
  CADENCE: "rpm",
  ELEVATION: "m",
  GRADE: "%",
  DURATION_MIN: "min",
  DISTANCE_KM: "km",
  LOAD: "load",
  CP: "W",
  W_PRIME: "J",
  FTP: "W",
  MAX_HR: "bpm",
  RESTING_HR: "bpm",
  LTHR: "bpm",
  AET_HR: "bpm",
  CS: "m/s",
  TP: "s/km",
  AET_PACE: "s/km",
  VO2_MAX: "ml/kg/min",
  P_MAX: "W",
  HEIGHT: "cm",
  WEIGHT: "kg",
};
export type ExplorationPoint = {
  x: number;
  y: number | null;
  label?: string;
  /** Bounds of a time-weighted bucket, in the X axis unit. */
  from?: number;
  to?: number;
  min?: number;
  max?: number;
  coverage?: number;
};
export type ExplorationSeries = {
  id: string;
  label?: string;
  role?: "PLANNED" | "ACTUAL";
  activityHashId?: string;
  /** Index into [panel.y, ...panel.extraY]. Defaults to the primary axis. */
  axisIndex?: number;
  measure?: ExplorationMeasure;
  points: ExplorationPoint[];
};
export type ExplorationAxis = {
  kind:
    | "ELAPSED_TIME"
    | "DISTANCE"
    | "PROGRESS"
    | "DATE"
    | "CATEGORY"
    | "NUMBER";
  unit?: ExplorationUnit;
  measure?: ExplorationMeasure;
  categories?: string[];
  reverse?: boolean;
  zeroBaseline?: boolean;
  domain?: [number, number];
};
export type ExplorationPanel = {
  id: string;
  label?: string;
  measure?: ExplorationMeasure;
  view: "LINE" | "BAR" | "SCATTER";
  x: ExplorationAxis;
  y: ExplorationAxis;
  /** Present (including []) when multiple measures are overlaid. */
  extraY?: ExplorationAxis[];
  series: ExplorationSeries[];
  pairedCount?: number;
  correlation?: number | null;
};
export const EXPLORATION_NOTES = [
  "NO_DATA",
  "PARTIAL_DATA",
  "TIME_WEIGHTED",
  "GAPS",
  "DISTANCE_UNAVAILABLE",
  "PROGRESS_TIME",
  "RECORDED_START",
  "ZONE_SNAPSHOTS",
  "ZONE_SPLIT",
  "ZONE_COVERAGE",
  "LINKED_ONLY",
  "MISSING_ACTUAL",
  "PLAN_DATE",
  "LOAD_METHODS",
  "PAIRED_ONLY",
  "NOT_CAUSAL",
  "HISTORY_PAIRS",
  "MULTI_AXES",
] as const;
export type ExplorationNote = (typeof EXPLORATION_NOTES)[number];
export type TrainingVisualizationV2 = {
  kind: "training_visualization";
  schemaVersion: 2;
  title: string;
  subtitle?: string;
  panels: ExplorationPanel[];
  notes: ExplorationNote[];
  provenance: {
    query: ExplorationQuery;
    timezone: string;
    fingerprint: string;
    complete: boolean;
    truncated: boolean;
    matchedCount: number;
    missingCount: number;
    /** Number of known metric values versus requested intervals or workouts. */
    coverage?: Record<string, number>;
  };
};

export function isExplorationQuery(value: {
  source?: unknown;
}): value is ExplorationQuery {
  return EXPLORATION_SOURCES.includes(
    value.source as ExplorationQuery["source"],
  );
}
export function isTrainingVisualizationV2(
  input: unknown,
): input is TrainingVisualizationV2 {
  if (!input || typeof input !== "object") return false;
  const v = input as TrainingVisualizationV2;
  const axis = (a: ExplorationAxis) =>
    a &&
    [
      "ELAPSED_TIME",
      "DISTANCE",
      "PROGRESS",
      "DATE",
      "CATEGORY",
      "NUMBER",
    ].includes(a.kind) &&
    (a.unit === undefined ||
      Object.values(EXPLORATION_UNITS)
        .concat(["%", "s", "count"])
        .includes(a.unit)) &&
    (a.domain === undefined ||
      (Array.isArray(a.domain) &&
        a.domain.length === 2 &&
        a.domain.every(Number.isFinite) &&
        a.domain[0] < a.domain[1])) &&
    (a.kind !== "CATEGORY" ||
      (Array.isArray(a.categories) &&
        a.categories.length <= 1000 &&
        a.categories.every((c) => typeof c === "string")));
  return (
    v.kind === "training_visualization" &&
    v.schemaVersion === 2 &&
    typeof v.title === "string" &&
    Array.isArray(v.panels) &&
    v.panels.length <= 24 &&
    v.panels.every(
      (p) =>
        p &&
        ["LINE", "BAR", "SCATTER"].includes(p.view) &&
        typeof p.id === "string" &&
        axis(p.x) &&
        axis(p.y) &&
        (p.extraY === undefined ||
          (p.view === "LINE" &&
            Array.isArray(p.extraY) &&
            p.extraY.length <= 2 &&
            p.extraY.every(axis))) &&
        Array.isArray(p.series) &&
        p.series.length <= 9 &&
        p.series.every(
          (s) =>
            s &&
            typeof s.id === "string" &&
            (s.axisIndex === undefined ||
              (Number.isInteger(s.axisIndex) &&
                s.axisIndex >= 0 &&
                s.axisIndex <= (p.extraY?.length ?? 0))) &&
            Array.isArray(s.points) &&
            s.points.length <= 1000 &&
            s.points.every(
              (point) =>
                point &&
                Number.isFinite(point.x) &&
                (point.y === null || Number.isFinite(point.y)) &&
                [point.from, point.to, point.min, point.max].every(
                  (v) => v === undefined || Number.isFinite(v),
                ) &&
                (point.coverage === undefined ||
                  (Number.isFinite(point.coverage) &&
                    point.coverage >= 0 &&
                    point.coverage <= 1)),
            ),
        ),
    ) &&
    Array.isArray(v.notes) &&
    v.notes.every((n) => EXPLORATION_NOTES.includes(n)) &&
    !!v.provenance &&
    typeof v.provenance.fingerprint === "string" &&
    !!v.provenance.query &&
    isExplorationQuery(v.provenance.query) &&
    typeof v.provenance.timezone === "string" &&
    typeof v.provenance.complete === "boolean" &&
    typeof v.provenance.truncated === "boolean" &&
    Number.isSafeInteger(v.provenance.matchedCount) &&
    v.provenance.matchedCount >= 0 &&
    Number.isSafeInteger(v.provenance.missingCount) &&
    v.provenance.missingCount >= 0
  );
}
