"use client";

import { resolveDemoCopy } from "@/lib/demo-i18n";

import { MetricHistoryDemoDialog } from "../home-demo/metric-history/metric-history-demo-dialog";
import { chartIdToMetricView } from "../home-demo/shared/chart-id-to-metric-view";
import { useDemoSubView } from "../home-demo/shared/use-demo-sub-view";
import { useMetricHistoryDialog } from "../home-demo/shared/use-metric-history-dialog";
import { MetricDemoApp } from "../metric-demo/metric-demo-app";
import type { MetricDemoView } from "../metric-demo/types";

import { dashboardDemoCopy } from "./copy";
import {
  DashboardDemoFitnessGrid,
  DashboardDemoOverviewGrid,
  DashboardDemoSubHeader,
} from "./dashboard-demo-panels";

export function DashboardDemoApp({
  lang,
  interactive = false,
}: {
  lang: string;
  interactive?: boolean;
}) {
  const copy = resolveDemoCopy(dashboardDemoCopy, lang);
  const { view, openMetric } = useDemoSubView({ lang, interactive });
  const { metricDialog, openMetricHistory, closeMetricHistory } =
    useMetricHistoryDialog(lang, copy.aboutMetric);

  const handleOpenChart = (chartId: string) => {
    openMetric(chartIdToMetricView(chartId));
  };

  if (view !== "main" && interactive) {
    return <MetricDemoApp lang={lang} view={view as MetricDemoView} />;
  }

  return (
    <div className="flex h-full flex-col gap-2 bg-background p-4 lg:gap-3">
      <DashboardDemoSubHeader copy={copy} />
      <DashboardDemoFitnessGrid
        copy={copy}
        interactive={interactive}
        onOpenStat={openMetricHistory}
      />
      <DashboardDemoOverviewGrid
        copy={copy}
        interactive={interactive}
        onOpenChart={handleOpenChart}
      />
      {interactive ? (
        <MetricHistoryDemoDialog
          state={metricDialog}
          onOpenChange={closeMetricHistory}
        />
      ) : null}
    </div>
  );
}
