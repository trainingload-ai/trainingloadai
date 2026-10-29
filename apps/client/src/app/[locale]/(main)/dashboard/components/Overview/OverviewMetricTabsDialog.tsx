"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
} from "@/components/ui/adaptive-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAX_DASHBOARD_OVERVIEW_METRICS,
  type DashboardOverviewMetricKey,
} from "@/hooks/useDashboardOverviewConfig";
import { buildOverviewMetricOptionGroups } from "./overview-model";
import { PreviewChart } from "./OverviewMetricCharts";

export function OverviewMetricTabsDialog({
  open,
  onOpenChange,
  activeMetrics,
  onAddMetric,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeMetrics: DashboardOverviewMetricKey[];
  onAddMetric: (metricKey: DashboardOverviewMetricKey) => void;
}) {
  const tDashboard = useTranslations("dashboard");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const tOverview = useTranslations("dashboard.overview");
  const [tab, setTab] = useState<DashboardOverviewMetricKey>("vo2Max");

  const metricOptions = useMemo(
    () =>
      buildOverviewMetricOptionGroups({
        tDashboard,
        tFitness,
        tOverview,
      }),
    [tDashboard, tFitness, tOverview],
  );

  useEffect(() => {
    if (!open) return;
    const preferred =
      metricOptions[0]?.options.find((option) => !activeMetrics.includes(option.key))
        ?.key ??
      metricOptions[1]?.options.find((option) => !activeMetrics.includes(option.key))
        ?.key ??
      "vo2Max";
    setTab(preferred);
  }, [activeMetrics, metricOptions, open]);

  const isSelected = useMemo(() => new Set(activeMetrics), [activeMetrics]);
  const isMaxed =
    activeMetrics.length >= MAX_DASHBOARD_OVERVIEW_METRICS;

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        className="max-w-4xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        mobileClassName="max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="text-base font-semibold">
            {tOverview("addMetricTitle")}
          </div>
          <div className="text-sm text-muted-foreground">
            {activeMetrics.length}/{MAX_DASHBOARD_OVERVIEW_METRICS}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as DashboardOverviewMetricKey)}
          >
            <div className="mt-3 space-y-2">
              {metricOptions.map((group) => (
                <div key={group.group}>
                  <div className="text-mobile-caption pc:text-xs text-muted-foreground mb-2">
                    {group.title}
                  </div>
                  <TabsList className="w-full justify-start overflow-x-auto">
                    {group.options.map((option) => (
                      <TabsTrigger
                        key={option.key}
                        value={option.key}
                        className="shrink-0"
                        disabled={isSelected.has(option.key)}
                      >
                        {option.title}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              ))}
            </div>
            <div className="mt-3">
              {metricOptions
                .flatMap((group) => group.options)
                .map((option) => {
                  const disabled =
                    isSelected.has(option.key) ||
                    (isMaxed && !isSelected.has(option.key));
                  return (
                    <TabsContent key={option.key} value={option.key} className="mt-0">
                      <PreviewChart metricKey={option.key} />
                      <div className="mt-3 flex justify-end">
                        <Button
                          disabled={disabled}
                          onClick={() => {
                            if (disabled) return;
                            onAddMetric(option.key);
                            const nextSet = new Set(activeMetrics);
                            nextSet.add(option.key);
                            const next =
                              metricOptions
                                .flatMap((group) => group.options)
                                .find((item) => !nextSet.has(item.key))?.key ??
                              option.key;
                            setTab(next);
                          }}
                        >
                          {isSelected.has(option.key)
                            ? tOverview("added")
                            : tOverview("add")}
                        </Button>
                      </div>
                    </TabsContent>
                  );
                })}
            </div>
          </Tabs>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
