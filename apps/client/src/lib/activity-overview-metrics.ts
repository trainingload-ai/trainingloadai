import { SportType } from "@/api/activities";
import type { MetricId } from "@/api/useActivityMetric";

export type ActivityOverviewSportType =
  | SportType.RUN
  | SportType.CYCLING
  | SportType.SWIM
  | SportType.STRETCHING
  | SportType.UNKNOWN;

export type ActivityOverviewMetricId =
  | "pace"
  | "speed"
  | "distance"
  | "altitude"
  | "enhancedAltitude"
  | "climb"
  | "descend"
  | "slope"
  | "enhancedSlope"
  | "heartRate"
  | "power"
  | "cadence"
  | "stepLength"
  | "stanceTime"
  | "temperature"
  | "aePower"
  | "re"
  | "ei";

export interface ActivityOverviewMetricDefinition {
  id: ActivityOverviewMetricId;
  metric: MetricId;
  labelKey: string;
  metaField: "avg" | "sum" | "max" | "min";
  unitMetric?: string;
  formatMetric?: string;
  postfix?: string;
  sports: ActivityOverviewSportType[];
}

const RUN_AND_RIDE = [SportType.RUN, SportType.CYCLING];
const COMMON_SPORTS = [
  SportType.RUN,
  SportType.CYCLING,
  SportType.SWIM,
  SportType.STRETCHING,
  SportType.UNKNOWN,
];

export const ACTIVITY_OVERVIEW_METRICS: ActivityOverviewMetricDefinition[] = [
  {
    id: "pace",
    metric: "pace",
    labelKey: "avgPace",
    metaField: "avg",
    sports: [SportType.RUN],
  },
  {
    id: "speed",
    metric: "speed",
    labelKey: "avgSpeed",
    metaField: "avg",
    sports: COMMON_SPORTS,
  },
  {
    id: "distance",
    metric: "distance",
    labelKey: "distance",
    metaField: "max",
    sports: COMMON_SPORTS,
  },
  {
    id: "altitude",
    metric: "altitude",
    labelKey: "elevation",
    metaField: "avg",
    formatMetric: "elevation",
    unitMetric: "elevation",
    sports: COMMON_SPORTS,
  },
  {
    id: "enhancedAltitude",
    metric: "enhancedAltitude",
    labelKey: "enhancedElevation",
    metaField: "avg",
    formatMetric: "elevation",
    unitMetric: "elevation",
    sports: COMMON_SPORTS,
  },
  {
    id: "climb",
    metric: "climb",
    labelKey: "climb",
    metaField: "sum",
    formatMetric: "elevation",
    sports: RUN_AND_RIDE,
  },
  {
    id: "descend",
    metric: "descend",
    labelKey: "descend",
    metaField: "sum",
    formatMetric: "elevation",
    unitMetric: "elevation",
    sports: RUN_AND_RIDE,
  },
  {
    id: "slope",
    metric: "slope",
    labelKey: "slope",
    metaField: "avg",
    sports: RUN_AND_RIDE,
  },
  {
    id: "enhancedSlope",
    metric: "enhancedSlope",
    labelKey: "enhancedSlope",
    metaField: "avg",
    unitMetric: "slope",
    sports: RUN_AND_RIDE,
  },
  {
    id: "heartRate",
    metric: "heartRate",
    labelKey: "avgHeartRate",
    metaField: "avg",
    postfix: "bpm",
    sports: COMMON_SPORTS,
  },
  {
    id: "power",
    metric: "power",
    labelKey: "avgPower",
    metaField: "avg",
    postfix: "W",
    sports: RUN_AND_RIDE,
  },
  {
    id: "cadence",
    metric: "cadence",
    labelKey: "avgCadence",
    metaField: "avg",
    sports: COMMON_SPORTS,
  },
  {
    id: "stepLength",
    metric: "stepLength",
    labelKey: "avgStepLength",
    metaField: "avg",
    unitMetric: "length",
    sports: [SportType.RUN],
  },
  {
    id: "stanceTime",
    metric: "stanceTime",
    labelKey: "avgStanceTime",
    metaField: "avg",
    unitMetric: "milliseconds",
    sports: [SportType.RUN],
  },
  {
    id: "temperature",
    metric: "temperature",
    labelKey: "temperature",
    metaField: "avg",
    unitMetric: "temperature",
    sports: COMMON_SPORTS,
  },
  {
    id: "aePower",
    metric: "aePower",
    labelKey: "aerobicEfficiencyPower",
    metaField: "avg",
    sports: RUN_AND_RIDE,
  },
  {
    id: "re",
    metric: "re",
    labelKey: "runningEffectiveness",
    metaField: "avg",
    sports: [SportType.RUN],
  },
  {
    id: "ei",
    metric: "ei",
    labelKey: "efficiencyIndex",
    metaField: "avg",
    sports: RUN_AND_RIDE,
  },
];

const DEFAULT_ACTIVITY_OVERVIEW_METRIC_IDS: Record<
  ActivityOverviewSportType,
  ActivityOverviewMetricId[]
> = {
  [SportType.RUN]: ["pace", "distance", "altitude", "heartRate", "power"],
  [SportType.CYCLING]: [
    "speed",
    "distance",
    "altitude",
    "heartRate",
    "power",
  ],
  [SportType.SWIM]: ["distance", "heartRate", "cadence", "temperature"],
  [SportType.STRETCHING]: ["heartRate"],
  [SportType.UNKNOWN]: ["speed", "distance", "altitude", "heartRate"],
};

export function normalizeActivityOverviewSportType(
  sportType?: string | null,
): ActivityOverviewSportType {
  if (sportType === SportType.RUN) return SportType.RUN;
  if (sportType === SportType.CYCLING) return SportType.CYCLING;
  if (sportType === SportType.SWIM) return SportType.SWIM;
  if (sportType === SportType.STRETCHING) return SportType.STRETCHING;
  return SportType.UNKNOWN;
}

export function getActivityOverviewStorageKey(
  sportType: string | null | undefined,
  metricId: ActivityOverviewMetricId,
) {
  return `${normalizeActivityOverviewSportType(sportType)}:${metricId}`;
}

export function isDefaultActivityOverviewMetric(
  sportType: string | null | undefined,
  metricId: ActivityOverviewMetricId,
) {
  const normalizedSportType = normalizeActivityOverviewSportType(sportType);
  return DEFAULT_ACTIVITY_OVERVIEW_METRIC_IDS[normalizedSportType].includes(
    metricId,
  );
}

export function getActivityOverviewMetricsForSport(
  sportType?: string | null,
) {
  const normalizedSportType = normalizeActivityOverviewSportType(sportType);
  return ACTIVITY_OVERVIEW_METRICS.filter((metric) =>
    metric.sports.includes(normalizedSportType),
  );
}

export function isActivityOverviewMetricEnabled(
  overviewConfig: Record<string, boolean> | undefined,
  sportType: string | null | undefined,
  metricId: ActivityOverviewMetricId,
) {
  const key = getActivityOverviewStorageKey(sportType, metricId);
  return (
    overviewConfig?.[key] ?? isDefaultActivityOverviewMetric(sportType, metricId)
  );
}

export function getVisibleActivityOverviewMetrics(
  sportType: string | null | undefined,
  overviewConfig?: Record<string, boolean>,
) {
  return getActivityOverviewMetricsForSport(sportType).filter((metric) =>
    isActivityOverviewMetricEnabled(overviewConfig, sportType, metric.id),
  );
}
