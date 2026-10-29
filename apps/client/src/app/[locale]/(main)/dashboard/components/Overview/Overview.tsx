"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useDashboardEditMode } from "@/hooks/useDashboardEditMode";
import {
  type DashboardOverviewLayoutItem,
  useDashboardOverviewConfig,
} from "@/hooks/useDashboardOverviewConfig";
import { OverviewMetricChart } from "./OverviewMetricCharts";
import {
  getDashboardMetricChartStyle,
  getDashboardMetricTitle,
  getOverviewChartSpanClass,
} from "./overview-model";

const CHART_HEIGHT = "h-[260px] md:h-[290px]";

function OverviewEditorFallback() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-hidden="true">
      <div className="h-[290px] animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45" />
      <div className="h-[290px] animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45" />
    </div>
  );
}

const OverviewEditor = dynamic(
  () => import("./OverviewEditor").then((module) => module.OverviewEditor),
  { loading: OverviewEditorFallback, ssr: false },
);

const Overview = React.memo(() => {
  const tDashboard = useTranslations("dashboard");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const tOverview = useTranslations("dashboard.overview");
  const { isEditing } = useDashboardEditMode();
  const { layout } = useDashboardOverviewConfig();

  if (isEditing) return <OverviewEditor />;

  const renderChart = (item: DashboardOverviewLayoutItem) => {
    const chartStyle = getDashboardMetricChartStyle(item.key);
    return (
      <OverviewMetricChart
        metricKey={item.key}
        height={CHART_HEIGHT}
        title={getDashboardMetricTitle({
          tDashboard,
          tFitness,
          metricKey: item.key,
        })}
        accentColor={chartStyle.accentColor}
        comparisonColor={chartStyle.comparisonColor}
        titleIcon={chartStyle.icon}
      />
    );
  };

  return (
    <>
      <div className="mb-3 flex flex-row items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {tOverview("title")}
        </h2>
        <p className="text-mobile-caption text-muted-foreground pc:text-xs">
          {tOverview("recent30Days")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {layout.map((item) => (
          <div
            key={item.key}
            className={getOverviewChartSpanClass(item.span)}
          >
            {renderChart(item)}
          </div>
        ))}
      </div>
    </>
  );
});

Overview.displayName = "Overview";

export default Overview;
