import React from "react";
import { useSimpleApiQuery } from "@/hooks/useApiQuery";
import { apiFetch } from "@/lib/api";
import dayjs from "dayjs";
import { useStore } from "@/lib/store";
import { SportType as ApiSportType } from "@/api/activities";
import {
  getUserFitnessMetricAutoHistory,
  getUserFitnessMetricEffectiveHistory,
} from "@/api/settings";
import { MetricHistoryChartView } from "./MetricHistoryChartView";
import {
  buildManualMetricSegments,
  getFitnessMetricType,
  getPmcSportValue,
  getWeeklySummaryQueryKey,
  isFitnessMetricKey,
  METRIC_HISTORY_CONFIG,
} from "./metric-history-chart-model";
import type {
  HistoryItem,
  MetricKey,
  RangeDays,
} from "./metric-history-chart-types";

function useMetricHistoryData({
  metricKey,
  startDate,
  endDate,
  sportType,
  rangeDaysNumber,
  enabled,
}: {
  metricKey: MetricKey;
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  sportType: ApiSportType;
  rangeDaysNumber: number;
  enabled: boolean;
}) {
  return useSimpleApiQuery<HistoryItem[]>(
    [
      `metric-history-${metricKey}`,
      startDate.toISOString(),
      endDate.toISOString(),
      String(sportType),
      String(rangeDaysNumber),
    ],
    async () => {
      if (isFitnessMetricKey(metricKey)) {
        const rows = await getUserFitnessMetricAutoHistory(
          getFitnessMetricType(metricKey),
          sportType,
          {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        );
        return rows.map((r) => ({ date: r.recordedAt, value: r.value }));
      }

      const isWeeklyMetricKey = metricKey.startsWith("week");
      if (isWeeklyMetricKey) {
        if (metricKey === "weekPressure") {
          const end = endDate.endOf("day");
          const start = startDate.startOf("day");
          const rows =
            (await apiFetch<
              Array<{
                date: string;
                value: number;
                running?: number;
                cycling?: number;
                swimming?: number;
              }>
            >(
              `/pmc/data?startDate=${start.toISOString()}&endDate=${end.toISOString()}`,
            )) ?? [];

          const dayMap = new Map<string, number>();
          for (const r of rows) {
            const dayKey = dayjs(r.date).format("YYYY-MM-DD");
            dayMap.set(
              dayKey,
              (dayMap.get(dayKey) ?? 0) + getPmcSportValue(r, sportType),
            );
          }

          const series: Array<{ date: string; value: number }> = [];
          let cursor = dayjs(start).startOf("day");
          const endDay = dayjs(end).startOf("day");
          while (cursor.isSame(endDay) || cursor.isBefore(endDay, "day")) {
            const key = cursor.format("YYYY-MM-DD");
            series.push({ date: key, value: dayMap.get(key) ?? 0 });
            cursor = cursor.add(1, "day");
          }

          return series.slice(-Math.max(1, rangeDaysNumber));
        }
        const end = dayjs().endOf("isoWeek").toISOString();
        const totalWeeks = Math.max(1, rangeDaysNumber);
        const summaryKey = getWeeklySummaryQueryKey(metricKey);

        const batchSize = 8;
        const batches = Math.max(1, Math.ceil(totalWeeks / batchSize));
        const merged = new Map<string, number>();

        for (let i = 0; i < batches; i++) {
          const batchEnd = dayjs(end)
            .subtract(i * batchSize, "week")
            .toISOString();
          const data =
            (await apiFetch<Array<{ time: string; value: number }>>(
              `/charts/summary/rows?key=${summaryKey}&mode=week&end=${batchEnd}&sportType=${sportType === ApiSportType.UNKNOWN ? "all" : sportType}`,
            )) ?? [];
          for (const r of data) {
            if (!r?.time) continue;
            if (!Number.isFinite(r.value)) continue;
            merged.set(r.time, r.value);
          }
        }

        return Array.from(merged.entries())
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())
          .slice(-totalWeeks);
      }

      if (metricKey === "vo2Max") {
        const startDateParam = startDate.format("YYYY-MM-DD");
        const endDateParam = endDate.format("YYYY-MM-DD");
        const params = new URLSearchParams({
          startDate: startDateParam,
          endDate: endDateParam,
        });
        return (
          (await apiFetch<HistoryItem[]>(
            `/pmc/vo2max-history?${params.toString()}`,
          )) ?? []
        );
      }

      const data = await apiFetch<HistoryItem[]>(
        `/pmc/data?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      );
      return data ?? [];
    },
    {
      enabled,
      placeholderData: (previousData) => previousData,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );
}

function MetricHistoryChartData({
  metricKey,
  enabled = true,
  ignoreZeroValues = false,
  defaultRangeDays,
  allowedRangeDays,
  showComparison = false,
  height,
  title,
  accentColor,
  comparisonColor,
  titleIcon,
  appearance = "default",
}: {
  metricKey: MetricKey;
  enabled?: boolean;
  ignoreZeroValues?: boolean;
  defaultRangeDays?: RangeDays;
  allowedRangeDays?: readonly RangeDays[];
  showComparison?: boolean;
  height?: string;
  title?: string;
  accentColor?: string;
  comparisonColor?: string;
  titleIcon?: React.ReactNode;
  appearance?: "default" | "soft";
}) {
  const [rangeDays, setRangeDays] = React.useState<RangeDays>(
    defaultRangeDays ?? "7",
  );
  const config = METRIC_HISTORY_CONFIG[metricKey];
  const { dashboardFilters } = useStore();
  const selectedSportType = dashboardFilters.selectedSportType;
  const sportType: ApiSportType =
    selectedSportType === "all"
      ? ApiSportType.UNKNOWN
      : (selectedSportType as unknown as ApiSportType);

  const rangeDaysNumber = Number(rangeDays);
  const endDate = React.useMemo(() => dayjs().endOf("day"), []);
  const startDate = React.useMemo(
    () =>
      dayjs()
        .subtract(rangeDaysNumber - 1, "day")
        .startOf("day"),
    [rangeDaysNumber],
  );
  const comparisonEndDate = React.useMemo(
    () => startDate.subtract(1, "day").endOf("day"),
    [startDate],
  );
  const comparisonStartDate = React.useMemo(
    () => comparisonEndDate.subtract(rangeDaysNumber - 1, "day").startOf("day"),
    [comparisonEndDate, rangeDaysNumber],
  );

  const isFitnessMetric = isFitnessMetricKey(metricKey);

  const { data: history, isLoading } = useMetricHistoryData({
    metricKey,
    startDate,
    endDate,
    sportType,
    rangeDaysNumber,
    enabled,
  });
  const { data: comparisonHistory, isLoading: comparisonLoading } =
    useMetricHistoryData({
      metricKey,
      startDate: comparisonStartDate,
      endDate: comparisonEndDate,
      sportType,
      rangeDaysNumber,
      enabled: enabled && showComparison,
    });
  const displayHistory = React.useMemo(() => {
    if (!history || !ignoreZeroValues) return history;
    return history.map((row) => {
      const raw = row[config.dataKey];
      if (typeof raw !== "number" || raw !== 0) return row;
      const cloned = { ...row } as HistoryItem;
      delete (cloned as unknown as Record<string, unknown>)[
        String(config.dataKey)
      ];
      return cloned;
    });
  }, [config.dataKey, history, ignoreZeroValues]);
  const displayComparisonHistory = React.useMemo(() => {
    if (!comparisonHistory || !ignoreZeroValues) return comparisonHistory;
    return comparisonHistory.map((row) => {
      const raw = row[config.dataKey];
      if (typeof raw !== "number" || raw !== 0) return row;
      const cloned = { ...row } as HistoryItem;
      delete (cloned as unknown as Record<string, unknown>)[
        String(config.dataKey)
      ];
      return cloned;
    });
  }, [comparisonHistory, config.dataKey, ignoreZeroValues]);
  const { data: vo2ActivityHistory } = useSimpleApiQuery<HistoryItem[]>(
    [
      "metric-history-vo2-activity",
      startDate.format("YYYY-MM-DD"),
      endDate.format("YYYY-MM-DD"),
    ],
    async () => {
      if (metricKey !== "vo2Max") return [];
      const startDateParam = startDate.format("YYYY-MM-DD");
      const endDateParam = endDate.format("YYYY-MM-DD");
      const params = new URLSearchParams({
        startDate: startDateParam,
        endDate: endDateParam,
      });
      return (
        (await apiFetch<HistoryItem[]>(
          `/pmc/vo2max-activity-history?${params.toString()}`,
        )) ?? []
      );
    },
    {
      enabled: enabled && metricKey === "vo2Max",
      placeholderData: (previousData) => previousData,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );
  const displayVo2ActivityHistory = React.useMemo(() => {
    if (!vo2ActivityHistory || !ignoreZeroValues) return vo2ActivityHistory;
    return vo2ActivityHistory.map((row) => {
      if (typeof row.value !== "number" || row.value !== 0) return row;
      const cloned = { ...row };
      delete (cloned as Record<string, unknown>).value;
      return cloned;
    });
  }, [ignoreZeroValues, vo2ActivityHistory]);

  const { data: manualRows } = useSimpleApiQuery(
    ["fitness-metric-manual-history", metricKey, sportType],
    async () => {
      if (!isFitnessMetric) return [];
      return await getUserFitnessMetricEffectiveHistory(
        getFitnessMetricType(metricKey),
        sportType,
      );
    },
    {
      enabled: enabled && isFitnessMetric,
      placeholderData: (previous) => previous,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const manualSegments = React.useMemo(() => {
    if (!isFitnessMetric) return undefined;
    return buildManualMetricSegments({
      endDate,
      manualRows,
      startDate,
    });
  }, [endDate, isFitnessMetric, manualRows, startDate]);

  const dataValues =
    displayHistory
      ?.map((h) => h[config.dataKey] as number)
      .filter((v) => typeof v === "number") ?? [];
  const manualValues = manualSegments?.map((s) => s.value) ?? [];
  const comparisonValues =
    displayComparisonHistory
      ?.map((h) => h[config.dataKey] as number)
      .filter((v) => typeof v === "number") ?? [];
  const vo2ActivityValues =
    metricKey === "vo2Max"
      ? (displayVo2ActivityHistory
          ?.map((h) => h[config.dataKey] as number)
          .filter((v) => typeof v === "number") ?? [])
      : [];
  const allValues = [
    ...dataValues,
    ...comparisonValues,
    ...manualValues,
    ...vo2ActivityValues,
  ].filter((v) => Number.isFinite(v));
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;

  return (
    <MetricHistoryChartView
      metricKey={metricKey}
      history={displayHistory}
      comparisonHistory={displayComparisonHistory}
      periodStart={startDate.toISOString()}
      comparisonPeriodStart={comparisonStartDate.toISOString()}
      isLoading={isLoading || (showComparison && comparisonLoading)}
      rangeDays={rangeDays}
      onRangeDaysChange={setRangeDays}
      allowedRangeDays={allowedRangeDays}
      showComparison={showComparison}
      color={config.color}
      dataKey={config.dataKey}
      dataMax={dataMax}
      dataMin={dataMin}
      manualSegments={manualSegments}
      vo2ActivityPoints={
        metricKey === "vo2Max" ? displayVo2ActivityHistory : undefined
      }
      height={height}
      title={title}
      accentColor={accentColor}
      comparisonColor={comparisonColor}
      titleIcon={titleIcon}
      appearance={appearance}
    />
  );
}

export function MetricHistoryChartByKey({
  metricKey,
  enabled,
  ignoreZeroValues,
  defaultRangeDays,
  allowedRangeDays,
  showComparison,
  height,
  title,
  accentColor,
  comparisonColor,
  titleIcon,
  appearance = "default",
}: {
  metricKey: MetricKey;
  enabled?: boolean;
  ignoreZeroValues?: boolean;
  defaultRangeDays?: RangeDays;
  allowedRangeDays?: readonly RangeDays[];
  showComparison?: boolean;
  height?: string;
  title?: string;
  accentColor?: string;
  comparisonColor?: string;
  titleIcon?: React.ReactNode;
  appearance?: "default" | "soft";
}) {
  return (
    <MetricHistoryChartData
      metricKey={metricKey}
      enabled={enabled}
      ignoreZeroValues={ignoreZeroValues}
      defaultRangeDays={defaultRangeDays}
      allowedRangeDays={allowedRangeDays}
      showComparison={showComparison}
      height={height}
      title={title}
      accentColor={accentColor}
      comparisonColor={comparisonColor}
      titleIcon={titleIcon}
      appearance={appearance}
    />
  );
}

export type {
  HistoryItem,
  MetricKey,
  RangeDays,
} from "./metric-history-chart-types";
