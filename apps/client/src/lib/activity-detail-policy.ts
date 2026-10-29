import type { Activity } from "@/api/activities";
import { getActivityDetailOverviewChartIds } from "@shared/activity-detail";

export type ActivityDetailSportGroup = "RUN" | "CYCLING" | "SWIM" | "OTHER";

export type ActivityDetailTabId =
  | "overview"
  | "bestIntervals"
  | "lap"
  | "heartrate"
  | "power"
  | "pace"
  | "runningDynamics";

type ActivityDetailPolicy = {
  group: ActivityDetailSportGroup;
  canEditSportType: boolean;
  showMap: boolean;
  overviewMetricIds: ReadonlySet<string>;
  dataChartIds: ReadonlySet<string>;
  tabIds: ReadonlySet<ActivityDetailTabId>;
};

const setOf = <T extends string>(...values: T[]) => new Set<T>(values);

/**
 * 活动详情策略
 * 逻辑为：根据活动类型，返回对应的活动详情策略
 * @returns 
 */
const POLICIES: Record<ActivityDetailSportGroup, ActivityDetailPolicy> = {
  RUN: {
    group: "RUN",
    canEditSportType: true,
    showMap: true,
    overviewMetricIds: setOf(
      "pace",
      "speed",
      "distance",
      "altitude",
      "enhancedAltitude",
      "climb",
      "descend",
      "slope",
      "enhancedSlope",
      "heartRate",
      "power",
      "cadence",
      "stepLength",
      "stanceTime",
      "temperature",
      "aePower",
      "re",
      "ei",
    ),
    dataChartIds: new Set(getActivityDetailOverviewChartIds("RUN")),
    tabIds: setOf(
      "overview",
      "bestIntervals",
      "lap",
      "heartrate",
      "power",
      "pace",
      "runningDynamics",
    ),
  },
  CYCLING: {
    group: "CYCLING",
    canEditSportType: true,
    showMap: true,
    overviewMetricIds: setOf(
      "speed",
      "distance",
      "altitude",
      "enhancedAltitude",
      "climb",
      "descend",
      "slope",
      "enhancedSlope",
      "heartRate",
      "power",
      "cadence",
      "temperature",
      "aePower",
      "ei",
    ),
    dataChartIds: new Set(getActivityDetailOverviewChartIds("CYCLING")),
    tabIds: setOf("overview", "bestIntervals", "lap", "heartrate", "power"),
  },
  SWIM: {
    group: "SWIM",
    canEditSportType: true,
    showMap: false,
    overviewMetricIds: setOf("distance", "heartRate", "cadence", "temperature"),
    dataChartIds: new Set(getActivityDetailOverviewChartIds("SWIM")),
    tabIds: setOf("overview", "bestIntervals", "heartrate"),
  },
  OTHER: {
    group: "OTHER",
    canEditSportType: false,
    showMap: false,
    overviewMetricIds: setOf("heartRate", "temperature"),
    dataChartIds: new Set(getActivityDetailOverviewChartIds("OTHER")),
    tabIds: setOf("overview", "bestIntervals", "heartrate"),
  },
};

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const anyLap = (
  activity: Activity | null | undefined,
  predicate: (lap: NonNullable<Activity["laps"]>[number]) => boolean,
) => activity?.laps?.some(predicate) === true;

export function getActivityDetailSportGroup(
  activity: Pick<Activity, "sportType"> | null | undefined,
): ActivityDetailSportGroup {
  if (activity?.sportType === "RUN") return "RUN";
  if (activity?.sportType === "CYCLING") return "CYCLING";
  if (activity?.sportType === "SWIM") return "SWIM";
  return "OTHER";
}

/**
 * 获取活动详情策略
 * @param activity 
 * @returns 
 */
export function getActivityDetailPolicy(
  activity: Pick<Activity, "sportType"> | null | undefined,
) {
  return POLICIES[getActivityDetailSportGroup(activity)];
}

export function activityHasMetricData(
  activity: Activity | null | undefined,
  metricId: string,
): boolean {
  if (!activity) return false;

  switch (metricId) {
    case "distance":
      return positive(activity.distance);
    case "pace":
    case "speed":
      return positive(activity.averageSpeed) || positive(activity.maxSpeed);
    case "altitude":
    case "enhancedAltitude":
    case "elevation":
    case "climb":
    case "descend":
    case "slope":
    case "enhancedSlope":
      return (
        positive(activity.elevationGain) ||
        (typeof activity.elevHigh === "number" &&
          typeof activity.elevLow === "number" &&
          activity.elevHigh !== activity.elevLow) ||
        anyLap(activity, (lap) => positive(lap.ascent) || positive(lap.descent))
      );
    case "heartRate":
      return (
        positive(activity.avgHeartRate) ||
        positive(activity.maxHeartRate) ||
        anyLap(activity, (lap) =>
          Boolean(positive(lap.avgHeartRate) || positive(lap.maxHeartRate)),
        )
      );
    case "power":
    case "aePower":
      return (
        positive(activity.avgPower) ||
        positive(activity.maxPower) ||
        positive(activity.averageWatts) ||
        positive(activity.maxWatts) ||
        anyLap(activity, (lap) =>
          Boolean(
            positive(lap.avgPower) ||
              positive(lap.maxPower) ||
              positive(lap.aePower),
          ),
        )
      );
    case "cadence":
      return (
        positive(activity.averageCadence) ||
        positive(activity.maxCadence) ||
        anyLap(activity, (lap) =>
          Boolean(positive(lap.avgCadence) || positive(lap.maxCadence)),
        )
      );
    case "stepLength":
    case "stride":
      return anyLap(activity, (lap) => positive(lap.avgStrideLength));
    case "stanceTime":
      return anyLap(activity, (lap) => positive(lap.avgGroundContactTime));
    case "temperature":
      return anyLap(activity, (lap) =>
        Boolean(positive(lap.avgTemperature) || positive(lap.maxTemperature)),
      );
    case "re":
    case "ei":
      return (
        activityHasMetricData(activity, "speed") &&
        (activityHasMetricData(activity, "power") ||
          activityHasMetricData(activity, "heartRate"))
      );
    default:
      return false;
  }
}

export function isActivityOverviewMetricVisible(
  activity: Activity | null | undefined,
  metricId: string,
) {
  const policy = getActivityDetailPolicy(activity);
  return (
    policy.overviewMetricIds.has(metricId) &&
    activityHasMetricData(activity, metricId)
  );
}

export function isActivityDataChartVisible(
  activity: Activity | null | undefined,
  chartId: string,
) {
  return (
    isActivityDataChartAllowed(activity, chartId) &&
    activityHasMetricData(activity, chartId)
  );
}

export function isActivityDataChartAllowed(
  activity: Activity | null | undefined,
  chartId: string,
) {
  return getActivityDetailPolicy(activity).dataChartIds.has(chartId);
}

export function isActivityDetailTabVisible(
  activity: Activity | null | undefined,
  tabId: ActivityDetailTabId,
) {
  const policy = getActivityDetailPolicy(activity);
  if (!policy.tabIds.has(tabId)) return false;
  if (tabId === "overview") return true;
  if (tabId === "bestIntervals") {
    return (
      activity?.activityPeakMetrics?.some(
        (peak) =>
          typeof peak.value === "number" &&
          Number.isFinite(peak.value) &&
          typeof peak.startElapsedSec === "number" &&
          Number.isFinite(peak.startElapsedSec) &&
          typeof peak.endElapsedSec === "number" &&
          Number.isFinite(peak.endElapsedSec) &&
          peak.endElapsedSec > peak.startElapsedSec,
      ) === true
    );
  }
  if (tabId === "lap") return Boolean(activity?.laps?.length);
  if (tabId === "heartrate") return activityHasMetricData(activity, "heartRate");
  if (tabId === "power") return activityHasMetricData(activity, "power");
  if (tabId === "pace") return activityHasMetricData(activity, "pace");
  // 曲线数据是否真实存在由调用方的 metric availability 进一步判断。
  if (tabId === "runningDynamics") return policy.group === "RUN";
  return false;
}
