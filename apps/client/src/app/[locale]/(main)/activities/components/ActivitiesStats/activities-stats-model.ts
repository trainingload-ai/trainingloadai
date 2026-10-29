import type { ChartConfig } from "@/components/ui/chart";
import type { SummaryMetricKey } from "@/api/charts";
import {
  formatDuration,
  formatValue,
  getUnit,
} from "@/hooks/useFormatterBySettings";
import { getMetricColor } from "@/lib/chart-data-utils";

export type SupportedMetricKey = Extract<
  SummaryMetricKey,
  | "distance"
  | "count"
  | "speed"
  | "heartRate"
  | "power"
  | "calories"
  | "duration"
>;

export const ACTIVITY_STATS_METRIC_OPTIONS: SupportedMetricKey[] = [
  "distance",
  "count",
  "speed",
  "heartRate",
  "power",
  "calories",
  "duration",
];

// 图表配置只放颜色和基础 label，最终显示文案由 i18n helper 决定。
export const activitiesStatsChartConfig = {
  distance: { label: "Distance", color: getMetricColor("distance") },
  count: { label: "Count", color: getMetricColor("count") },
  speed: { label: "Speed", color: getMetricColor("speed") },
  heartRate: { label: "Heart Rate", color: getMetricColor("heartRate") },
  power: { label: "Power", color: getMetricColor("power") },
  calories: { label: "Calories", color: getMetricColor("calories") },
  duration: { label: "Duration", color: getMetricColor("duration") },
} satisfies ChartConfig;

export function getActivityMetricLabel(
  tActivities: (key: string) => string,
  tDashboard: (key: string) => string,
  metricKey: SupportedMetricKey,
) {
  // 活动页和 dashboard 已有不同翻译命名空间，统一在这里做文案路由。
  switch (metricKey) {
    case "distance":
      return tActivities("distance");
    case "duration":
      return tActivities("duration");
    case "speed":
      return tDashboard("averageSpeed");
    case "power":
      return tDashboard("averagePower");
    case "heartRate":
      return tDashboard("averageHeartRate");
    case "calories":
      return tDashboard("calories");
    case "count":
      return tDashboard("count");
    default:
      return metricKey;
  }
}

export function isAverageMetric(metricKey: SupportedMetricKey) {
  // 周/月/年柱状图中这些指标展示均值，其余为求和或计数。
  return (
    metricKey === "speed" || metricKey === "heartRate" || metricKey === "power"
  );
}

export function toActivityChartValue(
  rawValue: number,
  metricKey: SupportedMetricKey,
  systemUnit: "metric" | "imperial",
) {
  // API 返回原始单位，图表层在这里转换为用户单位和可绘制 number。
  if (!isFinite(rawValue) || Number.isNaN(rawValue)) return 0;
  if (metricKey === "duration") return rawValue / 60;
  const formatted = formatValue(rawValue, metricKey, systemUnit);
  const numericValue = Number(formatted);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function formatActivityTooltipValue(
  value: unknown,
  metricKey: SupportedMetricKey,
  systemUnit: "metric" | "imperial",
) {
  // tooltip 接收的是已转换后的图表值，duration 需要从分钟还原成秒再格式化。
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!isFinite(numericValue) || Number.isNaN(numericValue)) return "--";
  if (metricKey === "duration") return formatDuration(numericValue * 60);
  const unit = getUnit(metricKey, systemUnit);
  return unit ? `${numericValue} ${unit}` : `${numericValue}`;
}

export function formatActivityYAxisTick(
  value: unknown,
  metricKey: SupportedMetricKey,
) {
  // Y 轴尽量短，duration 使用分钟/小时避免长文本挤压图表。
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!isFinite(numericValue) || Number.isNaN(numericValue)) return "--";
  if (metricKey === "duration") {
    if (numericValue >= 60) return `${(numericValue / 60).toFixed(1)}h`;
    return `${Math.round(numericValue)}m`;
  }
  return `${numericValue}`;
}
