import type { HealthCardKey } from "@/components/health/health-overview-model";
import type { DashboardOverviewMetricKey } from "@/hooks/useDashboardOverviewConfig";

export const HEALTH_RANGE_DAYS = ["1", "3", "7"] as const;
export const OVERVIEW_RANGE_DAYS = ["7", "14", "30"] as const;

export type HealthRangeDays = (typeof HEALTH_RANGE_DAYS)[number];
export type OverviewRangeDays = (typeof OVERVIEW_RANGE_DAYS)[number];
export type MetricChartRangeDays = HealthRangeDays | OverviewRangeDays;

export type MetricChartPolicy =
  | {
      family: "health-247";
      defaultRangeDays: HealthRangeDays;
      rangeDays: typeof HEALTH_RANGE_DAYS;
      comparison: "previous-equal-period";
      granularity: {
        "1": "intraday";
        "3": "day";
        "7": "day";
      };
    }
  | {
      family: "overview";
      defaultRangeDays: OverviewRangeDays;
      rangeDays: typeof OVERVIEW_RANGE_DAYS;
      comparison: "previous-equal-period";
      granularity: "day";
    };

type HealthMetricChartPolicy = Extract<
  MetricChartPolicy,
  { family: "health-247" }
>;
type OverviewMetricChartPolicy = Extract<
  MetricChartPolicy,
  { family: "overview" }
>;

const HEALTH_POLICY: HealthMetricChartPolicy = {
  family: "health-247",
  defaultRangeDays: "1",
  rangeDays: HEALTH_RANGE_DAYS,
  comparison: "previous-equal-period",
  granularity: { "1": "intraday", "3": "day", "7": "day" },
};

const OVERVIEW_POLICY: OverviewMetricChartPolicy = {
  family: "overview",
  defaultRangeDays: "7",
  rangeDays: OVERVIEW_RANGE_DAYS,
  comparison: "previous-equal-period",
  granularity: "day",
};

export function getHealthMetricChartPolicy(_metricKey: HealthCardKey) {
  return HEALTH_POLICY;
}

export function getOverviewMetricChartPolicy(
  _metricKey: DashboardOverviewMetricKey,
): OverviewMetricChartPolicy {
  return OVERVIEW_POLICY;
}
