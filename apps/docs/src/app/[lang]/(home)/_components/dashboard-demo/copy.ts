import {
  Battery,
  Dumbbell,
  Heart,
  TrendingUp,
  Zap,
} from "lucide-react";

import { DEMO_CHART_SERIES } from "@/components/charts/demo-chart-data";
import { getMetricChartColor } from "@/lib/metric-chart-colors";

import type { DashboardDemoCopy, DashboardDemoPayload } from "./types";

function buildPayload(locale: "en" | "zh"): DashboardDemoPayload {
  const isZh = locale === "zh";
  return {
    sportFilter: isZh ? "全部项目" : "All sports",
    editLabel: isZh ? "编辑" : "Edit",
    stats: [
      {
        key: "vo2Max",
        title: isZh ? "最大摄氧量" : "VO2max",
        value: "54",
        unit: "ml/kg/min",
        detail: isZh ? "极好" : "Excellent",
        details: isZh
          ? "最大摄氧量反映有氧能力上限，更适合看趋势而不是单日波动。"
          : "VO2 Max estimates your aerobic ceiling. In Training Load it is tracked as a trend rather than a single-day spike.",
        icon: Heart,
        color: "text-red-500",
        bgColor: "bg-red-100 dark:bg-red-900/30",
      },
      {
        key: "atl",
        title: isZh ? "疲劳" : "Fatigue",
        value: "76",
        unit: "ATL",
        detail: isZh ? "偏高" : "High",
        details: isZh
          ? "ATL 反映近期训练带来的短期疲劳，连续高强度训练后通常会上升。"
          : "ATL reflects short-term fatigue from recent training. Rising ATL usually means you have stacked several hard sessions close together.",
        icon: Zap,
        color: "text-violet-500",
        bgColor: "bg-violet-100 dark:bg-violet-900/30",
      },
      {
        key: "ctl",
        title: isZh ? "体能" : "Fitness",
        value: "72",
        unit: "CTL",
        detail: isZh ? "稳定" : "Stable",
        details: isZh
          ? "CTL 反映长期体能积累，需要持续训练才会缓慢上升，停训后会逐渐下降。"
          : "CTL is a longer-term fitness signal built from sustained training load. It rises slowly with consistent work and falls when you back off.",
        icon: Dumbbell,
        color: "text-sky-500",
        bgColor: "bg-sky-100 dark:bg-sky-900/30",
      },
      {
        key: "tsb",
        title: isZh ? "状态" : "Form",
        value: "-4",
        unit: "TSB",
        detail: isZh ? "可训练" : "Trainable",
        details: isZh
          ? "TSB 对比体能与疲劳，负值通常表示当前疲劳高于新鲜度。"
          : "TSB compares fitness and fatigue. Negative values suggest you are carrying more fatigue than freshness.",
        icon: Battery,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-900/30",
      },
    ],
    charts: [
      {
        id: "weekPressure",
        title: isZh ? "训练压力" : "Training Stress",
        data: [...DEMO_CHART_SERIES.weekPressure],
        accentColor: getMetricChartColor("weekPressure"),
        icon: TrendingUp,
      },
      {
        id: "ctl",
        title: isZh ? "体能" : "Fitness",
        data: [...DEMO_CHART_SERIES.ctl],
        accentColor: getMetricChartColor("ctl"),
        icon: Dumbbell,
      },
      {
        id: "atl",
        title: isZh ? "疲劳" : "Fatigue",
        data: [...DEMO_CHART_SERIES.atl],
        accentColor: getMetricChartColor("atl"),
        icon: Zap,
      },
      {
        id: "tsb",
        title: isZh ? "状态" : "Form",
        data: [...DEMO_CHART_SERIES.tsb],
        accentColor: getMetricChartColor("tsb"),
        icon: Battery,
      },
    ],
  };
}

function buildCopy(payload: DashboardDemoPayload, locale: "en" | "zh"): DashboardDemoCopy {
  const isZh = locale === "zh";
  return {
    aboutMetric: isZh ? "了解 {title}" : "Learn more about {title}",
    overview: {
      title: isZh ? "概览" : "Overview",
      recent30Days: isZh ? "最近 30 天" : "Recent 30 days",
    },
    payload,
  };
}

const enCopy = buildCopy(buildPayload("en"), "en");
const zhCopy = buildCopy(buildPayload("zh"), "zh");

const zhHantCopy: DashboardDemoCopy = {
  ...zhCopy,
  aboutMetric: "了解 {title}",
  overview: {
    title: "概覽",
    recent30Days: "最近 30 天",
  },
  payload: {
    ...zhCopy.payload,
    sportFilter: "全部項目",
    editLabel: "編輯",
    stats: zhCopy.payload.stats.map((stat) => ({
      ...stat,
      title:
        stat.key === "vo2Max"
          ? "最大攝氧量"
          : stat.key === "atl"
            ? "疲勞"
            : stat.key === "ctl"
              ? "體能"
              : "狀態",
      detail:
        stat.key === "vo2Max"
          ? "極好"
          : stat.key === "atl"
            ? "偏高"
            : stat.key === "ctl"
              ? "穩定"
              : "可訓練",
    })),
    charts: [
      { ...zhCopy.payload.charts[0]!, title: "訓練壓力" },
      { ...zhCopy.payload.charts[1]!, title: "體能" },
      { ...zhCopy.payload.charts[2]!, title: "疲勞" },
      { ...zhCopy.payload.charts[3]!, title: "狀態" },
    ],
  },
};

const jaCopy: DashboardDemoCopy = {
  ...enCopy,
  aboutMetric: "Learn more about {title}",
  overview: {
    title: "概要",
    recent30Days: "直近 30 日",
  },
  payload: {
    ...enCopy.payload,
    sportFilter: "全種目",
    editLabel: "編集",
    stats: [
      {
        ...enCopy.payload.stats[0]!,
        title: "VO2max",
        detail: "非常に良い",
      },
      {
        ...enCopy.payload.stats[1]!,
        title: "疲労",
        detail: "高め",
      },
      {
        ...enCopy.payload.stats[2]!,
        title: "体力",
        detail: "安定",
      },
      {
        ...enCopy.payload.stats[3]!,
        title: "コンディション",
        detail: "トレーニング可",
      },
    ],
    charts: [
      { ...enCopy.payload.charts[0]!, title: "トレーニングストレス" },
      { ...enCopy.payload.charts[1]!, title: "体力" },
      { ...enCopy.payload.charts[2]!, title: "疲労" },
      { ...enCopy.payload.charts[3]!, title: "コンディション" },
    ],
  },
};

export const dashboardDemoCopy = {
  en: enCopy,
  zh: zhCopy,
  "zh-hant": zhHantCopy,
  ja: jaCopy,
} satisfies Record<string, DashboardDemoCopy>;

export type DashboardDemoLang = keyof typeof dashboardDemoCopy;
