"use client";

import React, { useMemo } from "react";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { useChartSummaryRows } from "@/api/charts";
import { useStore } from "@/lib/store";
import ChartContainer from "@/components/ChartContainer";
import {
  getMetricColor,
  getMetricComparisonColor,
} from "@/lib/chart-data-utils";
import {
  MetricHistoryChartByKey,
  RangeDays,
} from "../FitnessStatus/MetricHistoryChart";
import { MetricHistoryRangeTabs } from "../FitnessStatus/MetricHistoryRangeTabs";
import type { DashboardOverviewMetricKey } from "@/hooks/useDashboardOverviewConfig";
import {
  type OverviewSummaryKey,
  asMetricHistoryKey,
  isOverviewSummaryKey,
} from "./overview-model";
import { SummaryMetricComparisonChart } from "./SummaryMetricComparisonChart";
import { normalizeSummaryPointValue } from "./summary-comparison-model";

export function SummaryMetricChart({
  metricKey,
  height = "h-[260px] md:h-[290px]",
  title,
  accentColor,
  comparisonColor,
  titleIcon,
  defaultRangeDays = "7",
  appearance = "default",
}: {
  metricKey: OverviewSummaryKey;
  height?: string;
  title?: string;
  accentColor?: string;
  comparisonColor?: string;
  titleIcon?: React.ReactNode;
  defaultRangeDays?: RangeDays;
  appearance?: "default" | "soft";
}) {
  const t = useTranslations("dashboard");
  const { dashboardFilters } = useStore();
  const { selectedSportType } = dashboardFilters;
  const [rangeDays, setRangeDays] = React.useState<RangeDays>(defaultRangeDays);
  const rangeDaysNumber = Number(rangeDays);

  const currentEnd = React.useMemo(
    () => dayjs().endOf("day").toISOString(),
    [],
  );

  const previousEnd = React.useMemo(
    () => dayjs(currentEnd).subtract(rangeDaysNumber, "day").toISOString(),
    [currentEnd, rangeDaysNumber],
  );

  const { data: currentData, isLoading: currentLoading } = useChartSummaryRows(
    metricKey,
    {
      mode: "day",
      end: currentEnd,
      days: rangeDaysNumber,
      sportType: selectedSportType,
    },
  );

  const { data: previousData, isLoading: previousLoading } =
    useChartSummaryRows(metricKey, {
      mode: "day",
      end: previousEnd,
      days: rangeDaysNumber,
      sportType: selectedSportType,
    });

  const isLoading = currentLoading || previousLoading;
  const rangeControl = (
    <MetricHistoryRangeTabs
      allowedRangeDays={["7", "14", "30"]}
      disabled={isLoading}
      onValueChange={setRangeDays}
      rangeDays={rangeDays}
      rangeLabel={(days) => `${days}${t("fitnessStatus.restDays.unit")}`}
    />
  );

  const mergedData = useMemo(() => {
    if (!currentData && !previousData) return [];
    const currentByDay = new Map(
      currentData?.map((row) => [
        dayjs(row.time).format("YYYY-MM-DD"),
        row.value,
      ]),
    );
    const previousByDay = new Map(
      previousData?.map((row) => [
        dayjs(row.time).format("YYYY-MM-DD"),
        row.value,
      ]),
    );
    const currentStart = dayjs(currentEnd)
      .subtract(rangeDaysNumber - 1, "day")
      .startOf("day");
    const previousStart = currentStart.subtract(rangeDaysNumber, "day");
    return Array.from({ length: rangeDaysNumber }, (_, index) => {
      const currentDay = currentStart.add(index, "day");
      const previousDay = previousStart.add(index, "day");
      const currentValue = currentByDay.get(currentDay.format("YYYY-MM-DD"));
      const previousValue = previousByDay.get(previousDay.format("YYYY-MM-DD"));
      return {
        time: currentDay.toISOString(),
        previousTime: previousDay.toISOString(),
        current: normalizeSummaryPointValue(metricKey, currentValue),
        previous: normalizeSummaryPointValue(metricKey, previousValue),
      };
    });
  }, [currentData, currentEnd, metricKey, previousData, rangeDaysNumber]);
  const hasData = mergedData.some(
    (row) => row.current != null || row.previous != null,
  );

  if (!hasData) {
    return (
      <ChartContainer
        accentColor={accentColor}
        isLoading={isLoading}
        height={height}
        title={title}
        titleIcon={titleIcon}
        appearance={appearance}
        infoContent={rangeControl}
      >
        {!isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t("noData")}
          </div>
        ) : null}
      </ChartContainer>
    );
  }

  if (metricKey === "speed" && selectedSportType === "all") {
    return (
      <ChartContainer
        accentColor={accentColor}
        height={height}
        title={title}
        titleIcon={titleIcon}
        appearance={appearance}
        infoContent={rangeControl}
      >
        <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-muted-foreground">
          {t("overview.selectSportForComparableSpeed")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      accentColor={accentColor}
      isLoading={isLoading}
      height={height}
      title={title}
      titleIcon={titleIcon}
      appearance={appearance}
      infoContent={rangeControl}
    >
      <SummaryMetricComparisonChart
        data={mergedData}
        metricKey={metricKey}
        primaryColor={accentColor ?? getMetricColor(metricKey)}
        comparisonColor={comparisonColor ?? getMetricComparisonColor(metricKey)}
      />
    </ChartContainer>
  );
}

/**
 * 概览指标图表
 * @param metricKey 指标键
 * @param height 高度
 * @param title 标题
 * @param accentColor 主色调
 * @param comparisonColor 对比色调
 * @param titleIcon 标题图标
 * @param defaultRangeDays 默认范围天数
 */
export function OverviewMetricChart({
  metricKey,
  height = "h-[260px] md:h-[290px]",
  title,
  accentColor,
  comparisonColor,
  titleIcon,
  defaultRangeDays = "7",
  appearance = "default",
}: {
  metricKey: DashboardOverviewMetricKey;
  height?: string;
  title?: string;
  accentColor?: string;
  comparisonColor?: string;
  titleIcon?: React.ReactNode;
  defaultRangeDays?: RangeDays;
  appearance?: "default" | "soft";
}) {
  const t = useTranslations("dashboard");
  // 判断是否是概览指标
  if (isOverviewSummaryKey(metricKey)) {
    return (
      <SummaryMetricChart
        metricKey={metricKey}
        height={height}
        title={title}
        accentColor={accentColor}
        comparisonColor={comparisonColor}
        titleIcon={titleIcon}
        defaultRangeDays={defaultRangeDays}
        appearance={appearance}
      />
    );
  }
  // 转换为历史指标键
  const historyKey = asMetricHistoryKey(metricKey);
  if (!historyKey) {
    return (
      <ChartContainer
        accentColor={accentColor}
        isLoading={false}
        height={height}
        title={title}
        titleIcon={titleIcon}
        appearance={appearance}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }
  return (
    <MetricHistoryChartByKey
      metricKey={historyKey}
      ignoreZeroValues
      defaultRangeDays={defaultRangeDays}
      allowedRangeDays={["7", "14", "30"]}
      showComparison
      height={height}
      title={title}
      accentColor={accentColor}
      comparisonColor={comparisonColor}
      titleIcon={titleIcon}
      appearance={appearance}
    />
  );
}

export function PreviewChart({
  metricKey,
}: {
  metricKey: DashboardOverviewMetricKey;
}) {
  const t = useTranslations("dashboard");
  if (isOverviewSummaryKey(metricKey)) {
    return (
      <SummaryMetricChart
        metricKey={metricKey}
        height="h-[200px]"
        defaultRangeDays="7"
      />
    );
  }
  const historyKey = asMetricHistoryKey(metricKey);
  if (!historyKey) {
    return (
      <ChartContainer isLoading={false} height="h-[200px]">
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }
  return (
    <MetricHistoryChartByKey
      metricKey={historyKey}
      ignoreZeroValues
      defaultRangeDays="7"
      allowedRangeDays={["7", "14", "30"]}
      showComparison
      height="h-[200px]"
    />
  );
}
