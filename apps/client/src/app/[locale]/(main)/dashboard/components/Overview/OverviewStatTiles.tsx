"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useChartSummaryMetadata } from "@/api/charts";
import { cn } from "@/lib/utils";
import { timeToRange } from "@/lib/timeRange";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import type { DashboardOverviewMetricKey } from "@/hooks/useDashboardOverviewConfig";
import { useDashboardWeeklySummaryPair } from "@/api/charts";
import { useDashboardPMC } from "@/api/usePMC";
import {
  type OverviewSummaryKey,
  getDashboardMetricTitle,
  getOverviewFitnessMetricPresentation,
  getSummaryMetricTitle,
} from "./overview-model";

function StatShell({
  title,
  value,
  unit,
  isLoading,
  isSelected,
  isDragging,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className,
  children,
}: {
  title: string;
  value: string;
  unit: string;
  isLoading: boolean;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "tap-feedback flex flex-col border border-neutral-100 dark:border-neutral-600 text-nowrap relative",
        isSelected && "bg-neutral-100 dark:bg-neutral-700",
        isDragging && "opacity-80",
        className,
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
      <div className="flex flex-col px-3 py-2 gap-6">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <div className="text-2xl font-medium flex gap-2 items-center justify-between">
          <div className="flex gap-1 items-baseline relative">
            <span
              className={cn(
                "font-medium text-foreground transition-opacity duration-200",
                isLoading && "opacity-30",
              )}
            >
              {value || "--"}
            </span>
            {unit ? (
              <span
                className={cn(
                  "text-muted-foreground text-mobile-caption pc:text-xs transition-opacity duration-200",
                  isLoading && "opacity-30",
                )}
              >
                {unit}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OverviewSummaryStat({
  metricKey,
}: {
  metricKey: OverviewSummaryKey;
}) {
  const t = useTranslations("dashboard");
  const [isHovering, setIsHovering] = useState(false);
  const { selectedStat, setSelectedStat, dashboardFilters, systemUnit } =
    useStore();
  const { selectedSportType } = dashboardFilters;
  const currentEnd = useMemo(() => {
    const range = timeToRange(dashboardFilters.time);
    return range?.end ?? new Date().toISOString();
  }, [dashboardFilters.time]);
  const { data, isLoading } = useChartSummaryMetadata(metricKey, {
    mode: "day",
    end: currentEnd,
    sportType: selectedSportType,
  });

  const { value, unit } = useMemo(() => {
    const rawValue = Number(data?.sum ?? data?.avg) || 0;
    if (!isFinite(rawValue) || isNaN(rawValue)) {
      return { value: "--", unit: getUnit(metricKey, systemUnit) };
    }
    const formattedValue = formatValue(rawValue, metricKey, systemUnit);
    const unitValue = getUnit(metricKey, systemUnit);
    if (metricKey === "duration" && formattedValue?.includes?.(":")) {
      return { value: formattedValue, unit: "" };
    }
    return { value: formattedValue, unit: unitValue };
  }, [data, metricKey, systemUnit]);

  return (
    <StatShell
      title={getSummaryMetricTitle(t, metricKey)}
      value={value || "--"}
      unit={unit || ""}
      isLoading={isLoading}
      isSelected={selectedStat?.id === metricKey}
      isDragging={false}
      className={isHovering ? "bg-neutral-200 dark:bg-neutral-800" : ""}
      onClick={() => setSelectedStat(metricKey, "")}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    />
  );
}

export function OverviewFitnessStat({
  metricKey,
}: {
  metricKey: Exclude<DashboardOverviewMetricKey, OverviewSummaryKey>;
}) {
  const tDashboard = useTranslations("dashboard");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const [isHovering, setIsHovering] = useState(false);
  const { selectedStat, setSelectedStat, dashboardFilters } = useStore();
  const { fitnessData } = useDashboardPMC();
  const { data: weeklySummaryPair } = useDashboardWeeklySummaryPair(
    dashboardFilters.selectedSportType,
  );

  const title = useMemo(() => {
    return getDashboardMetricTitle({
      tDashboard,
      tFitness,
      metricKey,
    });
  }, [metricKey, tDashboard, tFitness]);

  const { value, unit } = useMemo(() => {
    return getOverviewFitnessMetricPresentation({
      metricKey,
      fitnessData,
      weeklySummaryPair,
      tFitness,
    });
  }, [fitnessData, metricKey, tFitness, weeklySummaryPair]);

  return (
    <StatShell
      title={title}
      value={value}
      unit={unit}
      isLoading={false}
      isSelected={selectedStat?.id === metricKey}
      isDragging={false}
      className={isHovering ? "bg-neutral-200 dark:bg-neutral-800" : ""}
      onClick={() => setSelectedStat(metricKey, "")}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    />
  );
}
