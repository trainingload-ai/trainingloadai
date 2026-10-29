/**
 * AI 教练训练分析与图表的共享契约。
 *
 * 模型只描述分析目标和查询条件；rows 由服务端从用户数据生成，客户端只渲染
 * 这份受限契约。这样新增统计口径或图表时，不需要再增加一套聊天流程。
 */
import { FITNESS_METRICS } from "./fitness-assessment";

export const TRAINING_ANALYSIS_SOURCES = [
  "ACTIVITIES",
  "PMC",
  "METRICS",
] as const;
export type TrainingAnalysisSource = (typeof TRAINING_ANALYSIS_SOURCES)[number];

export const TRAINING_BODY_MEASURES = ["WEIGHT", "HEIGHT"] as const;
export const TRAINING_METRIC_MEASURES = [
  ...FITNESS_METRICS,
  ...TRAINING_BODY_MEASURES,
] as const;
export type TrainingMetricMeasure = (typeof TRAINING_METRIC_MEASURES)[number];
export const TRAINING_METRIC_SOURCES = ["ESTIMATED", "AUTO", "MANUAL"] as const;
export type TrainingMetricSource = (typeof TRAINING_METRIC_SOURCES)[number];

export const TRAINING_ANALYSIS_GROUPS = [
  "DAY",
  "WEEK",
  "MONTH",
  "SPORT",
  "ACTIVITY",
] as const;
export type TrainingAnalysisGroup = (typeof TRAINING_ANALYSIS_GROUPS)[number];

export const TRAINING_ACTIVITY_MEASURES = [
  "ACTIVITY_COUNT",
  "DURATION_MIN",
  "DISTANCE_KM",
  "AVG_SPEED_KMH",
  "AVG_HEART_RATE",
  "AVG_POWER",
] as const;
export const TRAINING_PMC_MEASURES = [
  "DAILY_LOAD",
  "ATL",
  "CTL",
  "TSB",
  "RUNNING_LOAD",
  "CYCLING_LOAD",
  "SWIMMING_LOAD",
  "OTHER_LOAD",
] as const;
export const TRAINING_ANALYSIS_MEASURES = [
  ...TRAINING_ACTIVITY_MEASURES,
  ...TRAINING_PMC_MEASURES,
  ...TRAINING_METRIC_MEASURES,
] as const;
export type TrainingAnalysisMeasure =
  (typeof TRAINING_ANALYSIS_MEASURES)[number];

export const TRAINING_VISUALIZATION_INTENTS = [
  "LOOKUP",
  "TREND",
  "COMPARISON",
  "COMPOSITION",
  "DISTRIBUTION",
  "RELATIONSHIP",
] as const;
export type TrainingVisualizationIntent =
  (typeof TRAINING_VISUALIZATION_INTENTS)[number];

export const TRAINING_VISUALIZATION_VIEWS = [
  "METRIC_STRIP",
  "TABLE",
  "LINE",
  "BAR",
  "STACKED_BAR",
  "AREA",
  "SMALL_MULTIPLES",
] as const;
export type TrainingVisualizationView =
  (typeof TRAINING_VISUALIZATION_VIEWS)[number];

export type TrainingAnalysisQuery = {
  source: TrainingAnalysisSource;
  from: string;
  to: string;
  groupBy: TrainingAnalysisGroup;
  measures: TrainingAnalysisMeasure[];
  sportTypes?: string[];
  /** METRICS only. Defaults to stored estimates; body records have no fitness source. */
  metricSource?: TrainingMetricSource;
  limit?: number;
};

export type TrainingDatasetRow = {
  key: string;
  label: string;
  start?: string;
  end?: string;
  sportType?: string;
  activityHashId?: string;
  values: Partial<Record<TrainingAnalysisMeasure, number | null>>;
};

export type TrainingDatasetV1 = {
  kind: "training_dataset";
  schemaVersion: 1;
  query: TrainingAnalysisQuery;
  timezone: string;
  rows: TrainingDatasetRow[];
  summary: Partial<Record<TrainingAnalysisMeasure, number | null>> & {
    matchedActivityCount?: number;
  };
  coverage: Partial<Record<TrainingAnalysisMeasure, number>>;
  complete: boolean;
  truncated: boolean;
  fingerprint: string;
};

export type TrainingVisualizationSeries = {
  key: TrainingAnalysisMeasure;
  label?: string;
  unit:
    | "count"
    | "min"
    | "km"
    | "km/h"
    | "bpm"
    | "W"
    | "load"
    | "J"
    | "m/s"
    | "s/km"
    | "ml/kg/min"
    | "kg"
    | "cm";
};

export type TrainingVisualizationV1 = {
  kind: "training_visualization";
  schemaVersion: 1;
  title: string;
  subtitle?: string;
  intent: TrainingVisualizationIntent;
  view: TrainingVisualizationView;
  requestedView?: TrainingVisualizationView;
  viewAdjustmentReason?: "NO_DATA" | "SINGLE_POINT" | "INCOMPATIBLE_VIEW";
  x: {
    key: "label";
    label?: string;
    type: "TIME" | "CATEGORY";
  };
  series: TrainingVisualizationSeries[];
  rows: TrainingDatasetRow[];
  summary: TrainingDatasetV1["summary"];
  provenance: {
    source: TrainingAnalysisSource;
    from: string;
    to: string;
    timezone: string;
    groupBy: TrainingAnalysisGroup;
    sportTypes: string[];
    metricSource?: TrainingMetricSource;
    complete: boolean;
    truncated: boolean;
    coverage: TrainingDatasetV1["coverage"];
    fingerprint: string;
  };
};

const MEASURE_UNITS: Record<
  TrainingAnalysisMeasure,
  TrainingVisualizationSeries["unit"]
> = {
  ACTIVITY_COUNT: "count",
  DURATION_MIN: "min",
  DISTANCE_KM: "km",
  AVG_SPEED_KMH: "km/h",
  AVG_HEART_RATE: "bpm",
  AVG_POWER: "W",
  DAILY_LOAD: "load",
  ATL: "load",
  CTL: "load",
  TSB: "load",
  RUNNING_LOAD: "load",
  CYCLING_LOAD: "load",
  SWIMMING_LOAD: "load",
  OTHER_LOAD: "load",
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
  WEIGHT: "kg",
  HEIGHT: "cm",
};

export function trainingMeasureUnit(
  measure: TrainingAnalysisMeasure,
): TrainingVisualizationSeries["unit"] {
  return MEASURE_UNITS[measure];
}

export function isTrainingVisualizationV1(
  input: unknown,
): input is TrainingVisualizationV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as TrainingVisualizationV1;
  return (
    value.kind === "training_visualization" &&
    value.schemaVersion === 1 &&
    typeof value.title === "string" &&
    TRAINING_VISUALIZATION_INTENTS.includes(value.intent) &&
    TRAINING_VISUALIZATION_VIEWS.includes(value.view) &&
    !!value.x &&
    (value.x.type === "TIME" || value.x.type === "CATEGORY") &&
    Array.isArray(value.series) &&
    value.series.every(
      (series) =>
        !!series &&
        TRAINING_ANALYSIS_MEASURES.includes(series.key) &&
        typeof series.unit === "string",
    ) &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (row) =>
        !!row &&
        typeof row.key === "string" &&
        typeof row.label === "string" &&
        !!row.values &&
        typeof row.values === "object",
    ) &&
    !!value.provenance &&
    TRAINING_ANALYSIS_SOURCES.includes(value.provenance.source) &&
    typeof value.provenance.fingerprint === "string"
  );
}
