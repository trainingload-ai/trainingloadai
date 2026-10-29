"use client";

import type { LucideIcon } from "lucide-react";
import {
  Battery,
  BedDouble,
  Dumbbell,
  Flame,
  Heart,
  Repeat,
  Gauge,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { WeeklySummaryKey } from "@/api/charts";
import type { FitnessStatusData } from "@/api/usePMC";
import type { FitnessStatusMetricKey } from "@/hooks/useFitnessStatusConfig";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import type { MetricKey } from "./metric-history-chart-types";
import type { FitnessStatCard } from "./components/SortableFitnessStatCard";
import {
  getACRatioStatus,
  getIntensityStatus,
  getMonotonyStatus,
} from "./util";

export interface MetricLink {
  label: string;
  href: string;
}

export interface MetricClickData {
  key: MetricKey;
  title: string;
  value: string;
  unit: string;
  details: string;
  links?: MetricLink[];
}

export interface MetricDialogState {
  open: boolean;
  key: MetricKey;
  title: string;
  currentValue: string;
  unit: string;
  description: string;
  links?: MetricLink[];
}

type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

type WeeklySummaryPair = Partial<
  Record<
    WeeklySummaryKey,
    { current: number | undefined; previous: number | undefined }
  >
>;

type WeeklyMetricFormatter = (
  key: WeeklySummaryKey,
  value: number | undefined,
) => string;

type WeeklyUnitGetter = (key: WeeklySummaryKey) => string;

type BaseMetricConfig = {
  key: Exclude<FitnessStatusMetricKey, WeeklySummaryKey>;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  description: (args: {
    t: TranslateFn;
    fitnessData: FitnessStatusData | undefined;
  }) => string;
  clickable?: boolean;
};

type WeeklyMetricConfig = {
  key: WeeklySummaryKey;
  icon: LucideIcon;
  color: string;
  bgColor: string;
};

// 基础体能卡片直接来自 PMC/体能接口，部分描述会根据当前数值动态变化。
const BASE_METRIC_CONFIGS: BaseMetricConfig[] = [
  {
    key: "vo2Max",
    icon: Heart,
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    description: ({ t }) => t("vo2Max.description"),
    clickable: true,
  },
  {
    key: "paceZones",
    icon: Gauge,
    color: "text-emerald-500",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    description: ({ t }) => t("paceZones.description"),
    clickable: true,
  },
  {
    key: "atl",
    icon: Zap,
    color: "text-violet-500",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    description: ({ t }) => t("atl.description"),
    clickable: true,
  },
  {
    key: "ctl",
    icon: Dumbbell,
    color: "text-sky-500",
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    description: ({ t }) => t("ctl.description"),
    clickable: true,
  },
  {
    key: "tsb",
    icon: Battery,
    color: "text-muted-foreground",
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    description: ({ t }) => t("tsb.description"),
    clickable: true,
  },
  {
    key: "acRatio",
    icon: TrendingUp,
    color: "text-purple-500",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    description: ({ t, fitnessData }) =>
      getACRatioStatus(t, fitnessData?.acRatio),
    clickable: true,
  },
  {
    key: "monotony",
    icon: Repeat,
    color: "text-orange-500",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    description: ({ t, fitnessData }) =>
      getMonotonyStatus(t, fitnessData?.monotony),
    clickable: true,
  },
  {
    key: "intensity",
    icon: Flame,
    color: "text-rose-500",
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    description: ({ t, fitnessData }) =>
      getIntensityStatus(t, fitnessData?.intensity),
    clickable: true,
  },
  {
    key: "restDays",
    icon: BedDouble,
    color: "text-indigo-500",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    description: ({ t }) => t("restDays.description"),
  },
];

// 周汇总卡片来自 charts summary，对比的是当前周和上一周。
const WEEKLY_METRIC_CONFIGS: WeeklyMetricConfig[] = [
  {
    key: "weekPressure",
    icon: TrendingUp,
    color: "text-violet-500",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
  },
  {
    key: "weekCount",
    icon: Repeat,
    color: "text-sky-500",
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
  },
  {
    key: "weekDuration",
    icon: BedDouble,
    color: "text-emerald-500",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  {
    key: "weekDistance",
    icon: TrendingUp,
    color: "text-emerald-500",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  {
    key: "weekSpeed",
    icon: Flame,
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  {
    key: "weekPower",
    icon: Zap,
    color: "text-rose-500",
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
  },
  {
    key: "weekHeartRate",
    icon: Heart,
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  {
    key: "weekClimb",
    icon: TrendingUp,
    color: "text-muted-foreground",
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
  },
  {
    key: "weekCalories",
    icon: Flame,
    color: "text-pink-500",
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
  },
];

export const FITNESS_STATUS_METRIC_KEYS: FitnessStatusMetricKey[] = [
  "vo2Max",
  "paceZones",
  "atl",
  "ctl",
  "tsb",
  "acRatio",
  "monotony",
  "intensity",
  "restDays",
  "weekPressure",
  "weekCount",
  "weekDuration",
  "weekDistance",
  "weekSpeed",
  "weekPower",
  "weekHeartRate",
  "weekClimb",
  "weekCalories",
];

export function createInitialMetricDialogState(): MetricDialogState {
  return {
    open: false,
    key: "vo2Max",
    title: "",
    currentValue: "",
    unit: "",
    description: "",
    links: undefined,
  };
}

export function getWeeklyMetricType(key: WeeklySummaryKey) {
  // 周指标 key 和格式化器 metric type 不完全一致，在这里做一次集中映射。
  if (key === "weekCount") return "count";
  if (key === "weekDuration") return "duration";
  if (key === "weekDistance") return "distance";
  if (key === "weekSpeed") return "speed";
  if (key === "weekPower") return "power";
  if (key === "weekHeartRate") return "heartRate";
  if (key === "weekClimb") return "climb";
  if (key === "weekCalories") return "calories";
  return "count";
}

export function getWeeklyMetricUnit(args: {
  key: WeeklySummaryKey;
  systemUnit: "metric" | "imperial";
  t: TranslateFn;
}) {
  if (args.key === "weekPressure") return args.t("weekPressure.unit");
  return getUnit(getWeeklyMetricType(args.key), args.systemUnit);
}

export function buildMetricDocsLinks(args: {
  key: MetricClickData["key"];
  title: string;
  locale: string;
  t: TranslateFn;
}): MetricLink[] {
  // 指标卡片统一链接到文档页，VO2Max 有独立说明页。
  const docsLocale = args.locale.startsWith("zh") ? "zh" : "en";
  const label = args.t("aboutMetric", { title: args.title });
  const href =
    args.key === "vo2Max"
      ? `https://www.trainingload.ai/${docsLocale}/docs/metrics/maximal-oxygen-uptake`
      : args.key === "paceZones"
        ? `https://www.trainingload.ai/${docsLocale}/docs/metrics/pace/zones`
        : `https://www.trainingload.ai/${docsLocale}/docs/metrics`;
  return [{ label, href }];
}

function formatPaceSecPerKm(
  value: number | undefined,
  systemUnit: "metric" | "imperial",
) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "-";
  return formatValue(value, "paceSeconds", systemUnit);
}

function buildPaceZoneDetails(
  t: TranslateFn,
  data: FitnessStatusData | undefined,
  systemUnit: "metric" | "imperial",
) {
  if (!data?.thresholdPaceSecPerKm) return t("paceZones.noData");
  const unit = getUnit("paceSeconds", systemUnit);
  const dependency = t("paceZones.dependency", {
    pace: formatPaceSecPerKm(data.thresholdPaceSecPerKm, systemUnit),
    unit,
  });
  const zoneLines = (data.paceZones ?? []).map((zone) => {
    const fast = formatPaceSecPerKm(zone.fastestPaceSecPerKm, systemUnit);
    const slow = formatPaceSecPerKm(zone.slowestPaceSecPerKm, systemUnit);
    return `${zone.name}: ${fast}–${slow} ${unit}`;
  });
  return [dependency, ...zoneLines].join("\n");
}

export function buildFitnessStatusStats(args: {
  t: TranslateFn;
  locale: string;
  fitnessData: FitnessStatusData | undefined;
  weeklySummaryPair: WeeklySummaryPair | null | undefined;
  formatWeeklyValue: WeeklyMetricFormatter;
  getWeeklyUnit: WeeklyUnitGetter;
  systemUnit: "metric" | "imperial";
  onMetricClick: (metric: MetricClickData) => void;
}): FitnessStatCard[] {
  // UI 渲染所需的标题、单位、图标、点击行为都在模型层组装，组件保持纯展示。
  const baseStats = BASE_METRIC_CONFIGS.map((config) => {
    const value =
      config.key === "paceZones"
        ? formatPaceSecPerKm(
            args.fitnessData?.thresholdPaceSecPerKm,
            args.systemUnit,
          )
        : args.fitnessData?.[config.key] != null
          ? String(args.fitnessData[config.key])
          : "-";
    const title = args.t(`${config.key}.title`);
    const unit =
      config.key === "restDays"
        ? args.t("restDays.unit")
        : config.key === "paceZones"
          ? getUnit("paceSeconds", args.systemUnit)
          : "";
    const details =
      config.key === "paceZones"
        ? buildPaceZoneDetails(args.t, args.fitnessData, args.systemUnit)
        : args.t(`${config.key}.details`);
    const links = config.clickable
      ? buildMetricDocsLinks({
          key: config.key as MetricKey,
          title,
          locale: args.locale,
          t: args.t,
        })
      : undefined;

    return {
      key: config.key,
      title,
      value,
      unit,
      description: config.description({
        t: args.t,
        fitnessData: args.fitnessData,
      }),
      details,
      icon: config.icon,
      color: config.color,
      bgColor: config.bgColor,
      onClick: config.clickable
        ? () =>
            args.onMetricClick({
              key: config.key as MetricKey,
              title,
              value,
              unit,
              details,
              links,
            })
        : undefined,
    } satisfies FitnessStatCard;
  });

  const weeklyStats = WEEKLY_METRIC_CONFIGS.map((config) => {
    const title = args.t(`${config.key}.title`);
    const value = args.formatWeeklyValue(
      config.key,
      args.weeklySummaryPair?.[config.key]?.current,
    );
    const unit = args.getWeeklyUnit(config.key);
    const details = args.t(`${config.key}.details`);
    const links = buildMetricDocsLinks({
      key: config.key,
      title,
      locale: args.locale,
      t: args.t,
    });

    return {
      key: config.key,
      title,
      value,
      unit,
      description: args.t(`${config.key}.description`),
      details,
      icon: config.icon,
      color: config.color,
      bgColor: config.bgColor,
      onClick: () =>
        args.onMetricClick({
          key: config.key,
          title,
          value,
          unit,
          details,
          links,
        }),
    } satisfies FitnessStatCard;
  });

  return [...baseStats, ...weeklyStats];
}
