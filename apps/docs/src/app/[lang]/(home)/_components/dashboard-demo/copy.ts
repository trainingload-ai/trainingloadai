import { useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  Battery,
  Dumbbell,
  Heart,
  TrendingUp,
  Zap,
} from "lucide-react";

import { DEMO_CHART_SERIES } from "@/components/charts/demo-chart-data";
import { getMetricChartColor } from "@/lib/metric-chart-colors";

import type { DashboardDemoCopy } from "./types";

const stats = [
  {
    key: "vo2Max",
    value: "54",
    unit: "ml/kg/min",
    icon: Heart,
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  {
    key: "atl",
    value: "76",
    unit: "ATL",
    icon: Zap,
    color: "text-violet-500",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
  },
  {
    key: "ctl",
    value: "72",
    unit: "CTL",
    icon: Dumbbell,
    color: "text-sky-500",
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
  },
  {
    key: "tsb",
    value: "-4",
    unit: "TSB",
    icon: Battery,
    color: "text-slate-500",
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
  },
] as const;

const charts = [
  {
    id: "weekPressure",
    data: [...DEMO_CHART_SERIES.weekPressure],
    accentColor: getMetricChartColor("weekPressure"),
    icon: TrendingUp,
  },
  {
    id: "ctl",
    data: [...DEMO_CHART_SERIES.ctl],
    accentColor: getMetricChartColor("ctl"),
    icon: Dumbbell,
  },
  {
    id: "atl",
    data: [...DEMO_CHART_SERIES.atl],
    accentColor: getMetricChartColor("atl"),
    icon: Zap,
  },
  {
    id: "tsb",
    data: [...DEMO_CHART_SERIES.tsb],
    accentColor: getMetricChartColor("tsb"),
    icon: Battery,
  },
] as const;

export function useDashboardDemoCopy(): DashboardDemoCopy {
  const t = useTranslations("home.demo.dashboard");

  return useMemo(
    () => ({
      aboutMetric: (title) => t("aboutMetric", { title }),
      overview: {
        title: t("overview.title"),
        recent30Days: t("overview.recent30Days"),
      },
      payload: {
        sportFilter: t("sportFilter"),
        editLabel: t("editLabel"),
        stats: stats.map((stat) => ({
          ...stat,
          title: t(`stats.${stat.key}.title`),
          detail: t(`stats.${stat.key}.detail`),
          details: t(`stats.${stat.key}.details`),
        })),
        charts: charts.map((chart) => ({
          ...chart,
          data: [...chart.data],
          title: t(`charts.${chart.id}`),
        })),
      },
    }),
    [t],
  );
}
