"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Clock,
  Flame,
  Gauge,
  HeartPulse,
  Mountain,
  Route,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { SummaryMetricKey } from "@/api/charts";
import type { FitnessStatusData } from "@/api/usePMC";
import type {
  DashboardOverviewChartSpan,
  DashboardOverviewMetricKey,
} from "@/hooks/useDashboardOverviewConfig";
import {
  getMetricColor,
  getMetricComparisonColor,
} from "@/lib/chart-data-utils";
import type { MetricKey } from "../FitnessStatus/MetricHistoryChart";

export type OverviewSummaryKey = Extract<
  DashboardOverviewMetricKey,
  SummaryMetricKey
>;

type WeeklySummaryPair = {
  weekPressure?: { current: number | undefined };
} | null | undefined;

type TranslateFn = (key: string) => string;

export type OverviewMetricOptionGroup = {
  group: "fitness" | "summary";
  title: string;
  options: { key: DashboardOverviewMetricKey; title: string }[];
};

export function getOverviewChartSpanClass(
  span: DashboardOverviewChartSpan,
) {
  return span === 2 ? "col-span-1 md:col-span-2" : "col-span-1";
}

// Overview 同时支持活动汇总指标和体能状态指标，summary 这组来自 charts API。
export const SUMMARY_METRICS: OverviewSummaryKey[] = [
  "count",
  "duration",
  "distance",
  "speed",
  "power",
  "heartRate",
  "climb",
  "calories",
];

export function isOverviewSummaryKey(
  key: DashboardOverviewMetricKey,
): key is OverviewSummaryKey {
  return SUMMARY_METRICS.includes(key as OverviewSummaryKey);
}

export function asMetricHistoryKey(
  key: DashboardOverviewMetricKey,
): MetricKey | null {
  // 只有部分 overview 指标可以打开历史曲线弹窗。
  switch (key) {
    case "vo2Max":
      return "vo2Max";
    case "atl":
      return "atl";
    case "ctl":
      return "ctl";
    case "tsb":
      return "tsb";
    case "acRatio":
      return "acRatio";
    case "monotony":
      return "monotony";
    case "weekPressure":
      return "weekPressure";
    default:
      return null;
  }
}

export function getSummaryMetricTitle(
  tDashboard: TranslateFn,
  key: OverviewSummaryKey,
) {
  if (key === "climb") return tDashboard("climb");
  if (key === "calories") return tDashboard("calories");
  if (key === "speed") return tDashboard("averageSpeed");
  if (key === "power") return tDashboard("averagePower");
  if (key === "heartRate") return tDashboard("averageHeartRate");
  return tDashboard(key);
}

export function getDashboardMetricTitle(args: {
  tDashboard: TranslateFn;
  tFitness: TranslateFn;
  metricKey: DashboardOverviewMetricKey;
}) {
  // 活动汇总和体能状态分别使用不同命名空间，标题在这里收敛。
  const { tDashboard, tFitness, metricKey } = args;
  if (isOverviewSummaryKey(metricKey)) {
    return getSummaryMetricTitle(tDashboard, metricKey);
  }
  if (metricKey === "weekPressure") return tFitness("weekPressure.title");
  if (metricKey === "restDays") return tFitness("restDays.title");
  return tFitness(`${metricKey}.title`);
}

export function getDashboardMetricIcon(
  metricKey: DashboardOverviewMetricKey,
): ReactNode {
  switch (metricKey) {
    case "count":
      return <Activity className="h-4 w-4" />;
    case "distance":
      return <Route className="h-4 w-4" />;
    case "duration":
      return <Clock className="h-4 w-4" />;
    case "speed":
      return <Gauge className="h-4 w-4" />;
    case "power":
      return <Zap className="h-4 w-4" />;
    case "heartRate":
      return <HeartPulse className="h-4 w-4" />;
    case "climb":
      return <Mountain className="h-4 w-4" />;
    case "calories":
      return <Flame className="h-4 w-4" />;
    case "vo2Max":
    case "ctl":
    case "atl":
    case "tsb":
    case "acRatio":
    case "monotony":
    case "restDays":
    case "weekPressure":
      return <TrendingUp className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

export function getDashboardMetricChartStyle(
  metricKey: DashboardOverviewMetricKey,
): {
  accentColor: string;
  comparisonColor: string;
  icon: ReactNode;
} {
  return {
    accentColor: getMetricColor(metricKey),
    comparisonColor: getMetricComparisonColor(metricKey),
    icon: getDashboardMetricIcon(metricKey),
  };
}

export function buildOverviewMetricOptionGroups(args: {
  tDashboard: TranslateFn;
  tFitness: TranslateFn;
  tOverview: TranslateFn;
}): OverviewMetricOptionGroup[] {
  // 指标选择弹窗按“体能状态/活动汇总”分组，避免组件里硬编码列表。
  const summaryOptions = SUMMARY_METRICS.map((key) => ({
    key: key as DashboardOverviewMetricKey,
    title: getSummaryMetricTitle(args.tDashboard, key),
  }));

  const fitnessKeys: DashboardOverviewMetricKey[] = [
    "vo2Max",
    "atl",
    "ctl",
    "tsb",
    "acRatio",
    "monotony",
    "weekPressure",
    "restDays",
  ];

  return [
    {
      group: "fitness",
      title: args.tOverview("groups.fitness"),
      options: fitnessKeys.map((key) => ({
        key,
        title: getDashboardMetricTitle({
          tDashboard: args.tDashboard,
          tFitness: args.tFitness,
          metricKey: key,
        }),
      })),
    },
    {
      group: "summary",
      title: args.tOverview("groups.activity"),
      options: summaryOptions,
    },
  ];
}

export function getOverviewFitnessMetricPresentation(args: {
  metricKey: Exclude<DashboardOverviewMetricKey, SummaryMetricKey>;
  fitnessData: FitnessStatusData | undefined;
  weeklySummaryPair: WeeklySummaryPair;
  tFitness: TranslateFn;
}) {
  // 体能类卡片的值来源不一致：PMC、restDays、weekPressure 分别来自不同接口。
  const unit =
    args.metricKey === "vo2Max"
      ? "ml/kg/min"
      : args.metricKey === "restDays"
        ? args.tFitness("restDays.unit")
        : args.metricKey === "weekPressure"
          ? args.tFitness("weekPressure.unit")
          : "";

  const value =
    args.metricKey === "vo2Max"
      ? args.fitnessData?.vo2Max?.toString() || "-"
      : args.metricKey === "atl"
        ? args.fitnessData?.atl?.toString() || "-"
        : args.metricKey === "ctl"
          ? args.fitnessData?.ctl?.toString() || "-"
          : args.metricKey === "tsb"
            ? args.fitnessData?.tsb?.toString() || "-"
            : args.metricKey === "acRatio"
              ? args.fitnessData?.acRatio?.toString() || "-"
              : args.metricKey === "monotony"
                ? args.fitnessData?.monotony?.toString() || "-"
                : args.metricKey === "restDays"
                  ? args.fitnessData?.restDays?.toString() || "-"
                  : args.metricKey === "weekPressure"
                    ? args.weeklySummaryPair?.weekPressure?.current?.toString() || "-"
                    : "-";

  return { value, unit };
}
