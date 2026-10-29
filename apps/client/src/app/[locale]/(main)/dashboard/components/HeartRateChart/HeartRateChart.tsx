"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChartContainer as UiChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis } from "recharts";
import { SummaryMetricKey, useActivityMetricSummary } from "@/api/charts";
import { timeToRange } from "@/lib/timeRange";
import { useStore } from "@/lib/store";
import { formatter } from "@/lib/utils";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import ChartContainer from "@/components/ChartContainer";
import {
  AggregationTypeSelect,
  type AggregationType,
} from "../AggregationTypeSelect/AggregationTypeSelect";
import { calculateXAxisInterval, formatXAxisTimeLabel } from "@/lib/chartUtils";

const chartConfig = {
  current: {
    label: "当前",
    theme: {
      light: "#dc2626", // red-600
      dark: "#f87171", // red-400
    },
  },
  previous: {
    label: "历史",
    theme: {
      light: "#fca5a5", // red-300
      dark: "#b91c1c", // red-700
    },
  },
};

export function HeartRateChart() {
  const t = useTranslations("dashboard");
  const [aggregationType, setAggregationType] =
    useState<AggregationType>("avg");
  const { dashboardFilters } = useStore();
  const { systemUnit } = useStore();
  const { time, previousTime, selectedSportType } = dashboardFilters;
  const tr = timeToRange(time);
  const prevTr = timeToRange(previousTime);
  const at = selectedSportType;

  // 获取当前时间段数据
  const { data: currentData, isLoading: currentLoading } =
    useActivityMetricSummary("heartRate" as SummaryMetricKey, {
      start: tr?.start,
      end: tr?.end,
      sportType: at,
      agg: aggregationType,
    });

  // 获取对比时间段数据
  const { data: previousData, isLoading: previousLoading } =
    useActivityMetricSummary("heartRate" as SummaryMetricKey, {
      start: prevTr?.start,
      end: prevTr?.end,
      sportType: at,
      agg: aggregationType,
    });

  const isLoading = currentLoading || previousLoading;

  // 合并当前数据和对比数据（按索引对齐，0 或空值视为 null）
  const mergedData = useMemo(() => {
    if (!currentData?.rows && !previousData?.rows) return [];

    const newRows: {
      time: string;
      current: number | null;
      previous: number | null;
    }[] = [];

    currentData?.rows?.forEach((row, i) => {
      const prevVal = previousData?.rows?.[i]?.value;
      const curVal = row?.value;
      newRows.push({
        time: row.time,
        current: curVal == null || curVal === 0 ? null : curVal,
        previous: prevVal == null || prevVal === 0 ? null : prevVal,
      });
    });

    return newRows;
  }, [currentData, previousData]);

  const mergedDataWithMA = mergedData;

  if (mergedData.length === 0) {
    return (
      <ChartContainer
        title={t("heartRateTrend")}
        isLoading={isLoading}
        height="h-[200px] md:h-[290px]"
        infoContent={
          <AggregationTypeSelect
            value={aggregationType}
            onValueChange={setAggregationType}
          />
        }
      >
        <div className="flex items-center justify-center h-full">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title={t("heartRateTrend")}
      isLoading={isLoading}
      height="h-[200px] md:h-[290px]"
      infoContent={
        <AggregationTypeSelect
          value={aggregationType}
          onValueChange={setAggregationType}
        />
      }
    >
      <UiChartContainer config={chartConfig} className="aspect-auto h-full w-full">
        <LineChart data={mergedDataWithMA}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={"time"}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={20}
            interval={calculateXAxisInterval(mergedData.length)}
            tick={{
              textAnchor: "middle",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
            tickFormatter={(value) =>
              formatXAxisTimeLabel(value, mergedData.length, formatter)
            }
            height={40}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeWidth: 2,
              strokeDasharray: "2 2",
              strokeOpacity: 0.7,
            }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatter("timeByDay", value)}
                formatter={(value, name) => {
                  if (value == null || Number.isNaN(Number(value))) {
                    return ["—", String(name)];
                  }
                  const formattedValue = formatValue(
                    Number(value),
                    "heartRate",
                    systemUnit,
                  );
                  const unit = getUnit("heartRate", systemUnit);
                  return [`${formattedValue} ${unit}`, String(name)];
                }}
                indicator="dot"
              />
            }
          />
          <Line
            dataKey="current"
            type="monotone"
            stroke="var(--color-current)"
            strokeWidth={2}
            dot={false}
            connectNulls
            strokeOpacity={0.7}
            name={t("current")}
          />
          <Line
            dataKey="previous"
            type="monotone"
            stroke="var(--color-previous)"
            strokeWidth={2}
            dot={false}
            connectNulls
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            name={t("comparison")}
          />
        </LineChart>
      </UiChartContainer>
    </ChartContainer>
  );
}

export default HeartRateChart;
