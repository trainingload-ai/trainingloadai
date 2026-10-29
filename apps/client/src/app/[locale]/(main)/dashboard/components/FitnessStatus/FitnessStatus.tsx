"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSimpleApiQuery } from "@/hooks/useApiQuery";
import {
  type FitnessStatusMetricKey,
  useFitnessStatusConfig,
} from "@/hooks/useFitnessStatusConfig";
import type { FitnessStatCard } from "./components/SortableFitnessStatCard";
import { FitnessStatusStatCard } from "./components/FitnessStatusStatCard";
import { getUserSettings, PUBLIC_DEMO_USER_SETTINGS } from "@/api/settings";
import { useStore } from "@/lib/store";
import { formatValue } from "@/hooks/useFormatterBySettings";
import {
  useDashboardWeeklySummaryPair,
  type WeeklySummaryKey,
} from "@/api/charts";
import { useDashboardPMC } from "@/api/usePMC";
import { parseFitnessStatusLayout } from "./util";
import { FitnessStatusCardSubContent } from "./components/FitnessStatusCardSubContent";
import { useDashboardEditMode } from "@/hooks/useDashboardEditMode";
import {
  buildFitnessStatusStats,
  createInitialMetricDialogState,
  FITNESS_STATUS_METRIC_KEYS,
  getWeeklyMetricType,
  getWeeklyMetricUnit,
  type MetricClickData,
  type MetricDialogState,
} from "./fitness-status-model";
import { HealthOverviewSection } from "@/components/health/HealthOverviewSection";
import { clampSpan, getSpanClass } from "./fitness-status-layout";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function FitnessStatusEditorFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45"
        />
      ))}
    </div>
  );
}

const FitnessStatusEditor = dynamic(
  () =>
    import("./FitnessStatusEditor").then(
      (module) => module.FitnessStatusEditor,
    ),
  { loading: FitnessStatusEditorFallback, ssr: false },
);

const MetricHistoryDialog = dynamic(
  () =>
    import("./MetricHistoryDialog").then(
      (module) => module.MetricHistoryDialog,
    ),
  { ssr: false },
);

const FitnessStatus = () => {
  const t = useTranslations("dashboard.fitnessStatus");
  const locale = useLocale();
  const [metricDialogOpen, setMetricDialogOpen] =
    React.useState<MetricDialogState>(createInitialMetricDialogState());

  const { dashboardFilters, systemUnit } = useStore();
  const publicDemo = usePublicDemo();
  const selectedSportType = dashboardFilters.selectedSportType;

  const { layout, setLayout } = useFitnessStatusConfig();
  const { isEditing } = useDashboardEditMode();

  // 用户设置
  const settingsQuery = useSimpleApiQuery(
    ["user-settings"],
    () => getUserSettings(),
    { enabled: !publicDemo.active },
  );
  const userSettings = publicDemo.active
    ? PUBLIC_DEMO_USER_SETTINGS
    : settingsQuery.data;
  const isUserSettingsPending = !publicDemo.active && settingsQuery.isPending;
  // PMC 概览数据（含派生的百分比/区间）
  const {
    fitnessData,
    atlPercent,
    ctlPercent,
    tsbDomainMin,
    tsbDomainMax,
    tsbFillPercent,
    tsbZone,
    acRatioFillPercent,
    acRatioZone,
    monotonyFillPercent,
    monotonyZone,
    isPending: isPMCPending,
  } = useDashboardPMC();

  // 周总结（本周/上周对比）
  const { data: weeklySummaryPair, isPending: isWeeklyPending } =
    useDashboardWeeklySummaryPair(selectedSportType);

  const isStatsPending =
    isUserSettingsPending || isPMCPending || isWeeklyPending;

  const hasHydratedFromServerRef = React.useRef(false);
  const hasInteractedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isEditing) return;
    hasInteractedRef.current = true;
  }, [isEditing]);

  React.useEffect(() => {
    const raw = userSettings?.FITNESS_STATUS_LAYOUT;
    if (!raw) return;
    if (hasHydratedFromServerRef.current) return;
    if (hasInteractedRef.current) return;
    const parsed = parseFitnessStatusLayout(raw, FITNESS_STATUS_METRIC_KEYS);
    if (!parsed) return;
    hasHydratedFromServerRef.current = true;
    setLayout(parsed);
  }, [setLayout, userSettings?.FITNESS_STATUS_LAYOUT]);

  const formatWeeklyValue = React.useCallback(
    (key: WeeklySummaryKey, v: number | undefined) => {
      if (v == null || !Number.isFinite(v)) return "-";
      if (key === "weekPressure") return String(Math.round(v));
      const metricType = getWeeklyMetricType(key);
      return formatValue(v, metricType, systemUnit);
    },
    [getWeeklyMetricType, systemUnit],
  );

  const getWeeklyUnit = React.useCallback(
    (key: WeeklySummaryKey) => {
      return getWeeklyMetricUnit({ key, systemUnit, t });
    },
    [systemUnit, t],
  );

  const handleMetricClick = (stat: MetricClickData) => {
    setMetricDialogOpen({
      open: true,
      key: stat.key,
      title: stat.title,
      currentValue: stat.value,
      unit: stat.unit,
      description: stat.details,
      links: stat.links,
    });
  };

  const stats: FitnessStatCard[] = React.useMemo(
    () =>
      buildFitnessStatusStats({
        t,
        locale,
        fitnessData,
        weeklySummaryPair,
        formatWeeklyValue,
        getWeeklyUnit,
        systemUnit,
        onMetricClick: handleMetricClick,
      }),
    [
      t,
      locale,
      fitnessData,
      weeklySummaryPair,
      formatWeeklyValue,
      getWeeklyUnit,
      systemUnit,
    ],
  );

  const statsByKey = React.useMemo(() => {
    const map = new Map<FitnessStatusMetricKey, FitnessStatCard>();
    for (const stat of stats) map.set(stat.key, stat);
    return map;
  }, [stats]);

  const orderedCards = React.useMemo(() => {
    return layout
      .map((item) => {
        const stat = statsByKey.get(item.key);
        if (!stat) return null;
        return {
          item,
          stat,
          className: getSpanClass(clampSpan(item.span, 4)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [layout, statsByKey]);

  const renderSubContent = (stat: FitnessStatCard) => (
    <FitnessStatusCardSubContent
      stat={stat}
      t={t}
      weeklySummaryPair={weeklySummaryPair}
      formatWeeklyValue={formatWeeklyValue}
      fitnessData={fitnessData}
      atlPercent={atlPercent}
      ctlPercent={ctlPercent}
      tsbZone={tsbZone}
      tsbDomainMin={tsbDomainMin}
      tsbDomainMax={tsbDomainMax}
      tsbFillPercent={tsbFillPercent}
      acRatioZone={acRatioZone}
      acRatioFillPercent={acRatioFillPercent}
      monotonyZone={monotonyZone}
      monotonyFillPercent={monotonyFillPercent}
    />
  );

  return (
    <div className="mb-3">
      {isEditing ? (
        <FitnessStatusEditor
          statsByKey={statsByKey}
          renderSubContent={renderSubContent}
        />
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {isStatsPending
            ? Array.from({ length: 4 }).map((_, index) => (
                <Card
                  key={index}
                  className="relative overflow-hidden border-0 bg-neutral-100 dark:bg-muted/45 shadow-none"
                >
                  <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </CardHeader>
                  <CardContent className="lg:p-2">
                    <div className="mt-2 sm:mt-6">
                      <div className="flex items-end gap-2">
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-4 w-10" />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <Skeleton className="h-4 w-28" />
                        <div className="w-6 shrink-0 flex justify-end">
                          <Skeleton className="h-5 w-5 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            : orderedCards.map(({ stat, className }) => (
                <FitnessStatusStatCard
                  key={stat.key}
                  stat={stat}
                  onClick={stat.onClick}
                  className={className}
                  subContent={renderSubContent(stat)}
                  rightAccessory={
                    stat.onClick ? (
                      <button className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-muted cursor-pointer">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null
                  }
                />
              ))}
        </div>
      )}

      {!isEditing ? (
        <div className="mt-6">
          <HealthOverviewSection />
        </div>
      ) : null}

      {metricDialogOpen.open ? (
        <MetricHistoryDialog
          open
          onOpenChange={(open) =>
            setMetricDialogOpen((prev) => ({ ...prev, open }))
          }
          metricKey={metricDialogOpen.key}
          title={metricDialogOpen.title}
          currentValue={metricDialogOpen.currentValue}
          unit={metricDialogOpen.unit}
          description={metricDialogOpen.description}
          links={metricDialogOpen.links}
        />
      ) : null}
    </div>
  );
};

export default FitnessStatus;
