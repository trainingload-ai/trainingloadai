import { SportType } from "@/api/activities";
import {
  normalizeActivityOverviewSportType,
  type ActivityOverviewSportType,
} from "@/lib/activity-overview-metrics";
import type { MetricId } from "@/api/useActivityMetric";

export type ActivityDataChartId =
  | "elevation"
  | "pace"
  | "cadence"
  | "stride"
  | "heartRate"
  | "power"
  | "stanceTime";

export interface ActivityDataChartDefinition {
  id: ActivityDataChartId;
  labelNamespace:
    | "ElevationChart"
    | "PaceChart"
    | "CadenceChart"
    | "StrideChart"
    | "HeartRateChart"
    | "PowerChart"
    | "StanceTimeChart";
  colorMetric: string;
  metric: MetricId;
  sports: ActivityOverviewSportType[];
}

const COMMON_DETAIL_SPORTS: ActivityOverviewSportType[] = [
  SportType.RUN,
  SportType.CYCLING,
  SportType.STRETCHING,
  SportType.UNKNOWN,
];

export const ACTIVITY_DATA_CHARTS: ActivityDataChartDefinition[] = [
  {
    id: "elevation",
    labelNamespace: "ElevationChart",
    colorMetric: "altitude",
    metric: "enhancedAltitude",
    sports: COMMON_DETAIL_SPORTS,
  },
  {
    id: "pace",
    labelNamespace: "PaceChart",
    colorMetric: "pace",
    metric: "speed",
    sports: COMMON_DETAIL_SPORTS,
  },
  {
    id: "cadence",
    labelNamespace: "CadenceChart",
    colorMetric: "cadence",
    metric: "cadence",
    sports: COMMON_DETAIL_SPORTS,
  },
  {
    id: "stride",
    labelNamespace: "StrideChart",
    colorMetric: "stepLength",
    metric: "stepLength",
    sports: COMMON_DETAIL_SPORTS,
  },
  {
    id: "heartRate",
    labelNamespace: "HeartRateChart",
    colorMetric: "heartRate",
    metric: "heartRate",
    sports: [...COMMON_DETAIL_SPORTS, SportType.SWIM],
  },
  {
    id: "power",
    labelNamespace: "PowerChart",
    colorMetric: "power",
    metric: "power",
    sports: COMMON_DETAIL_SPORTS,
  },
  {
    id: "stanceTime",
    labelNamespace: "StanceTimeChart",
    colorMetric: "stanceTime",
    metric: "stanceTime",
    sports: COMMON_DETAIL_SPORTS,
  },
];

const DEFAULT_ACTIVITY_DATA_CHART_IDS: Record<
  ActivityOverviewSportType,
  ActivityDataChartId[]
> = {
  [SportType.RUN]: [
    "elevation",
    "pace",
    "cadence",
    "stride",
    "heartRate",
    "power",
    "stanceTime",
  ],
  [SportType.CYCLING]: [
    "elevation",
    "pace",
    "cadence",
    "stride",
    "heartRate",
    "power",
    "stanceTime",
  ],
  [SportType.SWIM]: ["heartRate"],
  [SportType.STRETCHING]: [
    "elevation",
    "pace",
    "cadence",
    "stride",
    "heartRate",
    "power",
    "stanceTime",
  ],
  [SportType.UNKNOWN]: [
    "elevation",
    "pace",
    "cadence",
    "stride",
    "heartRate",
    "power",
    "stanceTime",
  ],
};

export function getActivityDataChartStorageKey(
  sportType: string | null | undefined,
  chartId: ActivityDataChartId,
) {
  return `${normalizeActivityOverviewSportType(sportType)}:${chartId}`;
}

export function isDefaultActivityDataChart(
  sportType: string | null | undefined,
  chartId: ActivityDataChartId,
) {
  const normalizedSportType = normalizeActivityOverviewSportType(sportType);
  return DEFAULT_ACTIVITY_DATA_CHART_IDS[normalizedSportType].includes(chartId);
}

export function getActivityDataChartsForSport(sportType?: string | null) {
  const normalizedSportType = normalizeActivityOverviewSportType(sportType);
  return ACTIVITY_DATA_CHARTS.filter((chart) =>
    chart.sports.includes(normalizedSportType),
  );
}

export function isActivityDataChartEnabled(
  chartConfig: Record<string, boolean> | undefined,
  sportType: string | null | undefined,
  chartId: ActivityDataChartId,
) {
  const key = getActivityDataChartStorageKey(sportType, chartId);
  return chartConfig?.[key] ?? isDefaultActivityDataChart(sportType, chartId);
}

export function getVisibleActivityDataCharts(
  sportType: string | null | undefined,
  chartConfig?: Record<string, boolean>,
) {
  return getActivityDataChartsForSport(sportType).filter((chart) =>
    isActivityDataChartEnabled(chartConfig, sportType, chart.id),
  );
}
