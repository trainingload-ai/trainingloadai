"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, XAxis, YAxis, AreaChart, Area } from "recharts";
import {
  ChartContainer,
  ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { makeTimeTickFormatter } from "@/lib/chart";
import { useActivityMetricSummary, type SummaryMetricKey } from "@/api/charts";
import {
  TimeGranularitySelector,
  type TimeGranularity,
} from "./TimeGranularitySelector";
import { Skeleton } from "@/components/ui/skeleton";
import ThemeLogo from "@/components/ui/ThemeLogo";

interface HistoryComparisonChartProps {
  metricKey: SummaryMetricKey;
  className?: string;
}

export function HistoryComparisonChart({
  metricKey,
  className,
}: HistoryComparisonChartProps) {
  const t = useTranslations("HistoryComparisonChart");
  const [timeGranularity, setTimeGranularity] =
    React.useState<TimeGranularity>("month");
  const chartConfig = React.useMemo(
    () =>
      ({
        current: {
          label: t("current"),
          color: "#84cc16",
        },
        history: {
          label: t("history"),
          color: "#9ca3af",
        },
      }) satisfies ChartConfig,
    [t],
  );

  // 获取历史数据 - 根据时间粒度聚合
  const { data: historyData, isLoading } = useActivityMetricSummary(metricKey, {
    sportType: "all",
  });

  const data = React.useMemo(() => {
    if (!historyData?.rows) return [];

    // 将历史数据转换为对比图表格式
    return historyData.rows.map((row) => ({
      time: new Date(row.time).getTime(),
      cur: row.value, // 当前周期的值
      prev: undefined, // 暂时不显示对比周期
    }));
  }, [historyData]);

  const [minVal, maxVal] = React.useMemo(() => {
    const values = data
      .map((d) => d.cur)
      .filter((v) => v != null && Number.isFinite(v)) as number[];
    if (!values.length) return [0, 1] as [number, number];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1 || 1;
    return [min - pad, max + pad] as [number, number];
  }, [data]);

  const tickFormatter = React.useMemo(
    () => makeTimeTickFormatter(timeGranularity, data),
    [timeGranularity, data],
  );

  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">{t("title")}</h3>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">{t("title")}</h3>
          <TimeGranularitySelector
            value={timeGranularity}
            onChange={setTimeGranularity}
            className="w-24 h-8"
          />
        </div>
        <div className="h-[200px] w-full flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <ThemeLogo width={120} height={20} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <TimeGranularitySelector
          value={timeGranularity}
          onChange={setTimeGranularity}
          className="w-24 h-8"
        />
      </div>
      <div className="h-[200px] w-full">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full w-full"
        >
          <AreaChart
            data={data}
            margin={{
              top: 10,
              right: 30,
              left: 0,
              bottom: 0,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={tickFormatter}
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
            />
            <YAxis domain={[minVal, maxVal]} />
            <defs>
              <linearGradient id="fillCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#84cc16" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#84cc16" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <Area
              key="current"
              dataKey="cur"
              type="natural"
              stackId={undefined}
              name={t("series.historyData")}
              fill="url(#fillCurrent)"
              stroke="#84cc16"
              fillOpacity={1}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
