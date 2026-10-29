"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  activitiesStatsChartConfig,
  formatActivityTooltipValue,
  formatActivityYAxisTick,
  type SupportedMetricKey,
} from "./activities-stats-model";

type ChartRow = Record<string, string | number>;

export function ActivityMetricChartLoading({
  barHeights,
  barWidthClass,
  periodWidthClass,
  titleWidthClass,
  xLabelWidthClass,
  xPaddingClass,
}: {
  barHeights: number[];
  barWidthClass: string;
  periodWidthClass: string;
  titleWidthClass: string;
  xLabelWidthClass: string;
  xPaddingClass: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex justify-between items-center">
          <Skeleton
            className={`h-4 animate-none bg-neutral-100 dark:bg-muted/45 ${titleWidthClass}`}
          />
          <Skeleton
            className={`h-3 animate-none bg-neutral-100 dark:bg-muted/45 ${periodWidthClass}`}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full flex flex-col justify-end">
          <div
            className={`flex-1 flex items-end justify-between gap-3 ${xPaddingClass} pb-6`}
          >
            {barHeights.map((height, index) => (
              <Skeleton
                key={index}
                className={`${barWidthClass} rounded-sm animate-none bg-neutral-100 dark:bg-muted/45`}
                style={{ height }}
              />
            ))}
          </div>
          <div
            className={`flex items-center justify-between ${xPaddingClass} pb-2`}
          >
            {barHeights.map((_, index) => (
              <Skeleton
                key={index}
                className={`h-3 rounded-sm animate-none bg-neutral-100 dark:bg-muted/45 ${xLabelWidthClass}`}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityMetricBarChartBody({
  chartData,
  metricKey,
  maxBarSize,
  systemUnit,
  xAxisKey,
}: {
  chartData: ChartRow[];
  metricKey: SupportedMetricKey;
  maxBarSize: number;
  systemUnit: "metric" | "imperial";
  xAxisKey: string;
}) {
  return (
    <ChartContainer
      config={activitiesStatsChartConfig}
      className="h-[218px] w-full"
    >
      <BarChart
        data={chartData}
        margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          className="stroke-muted"
        />
        <XAxis
          dataKey={xAxisKey}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatActivityYAxisTick(value, metricKey)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) =>
                formatActivityTooltipValue(value, metricKey, systemUnit)
              }
            />
          }
        />
        <Bar
          dataKey={metricKey}
          fill={`var(--color-${metricKey})`}
          fillOpacity={0.6}
          radius={[4, 4, 0, 0]}
          maxBarSize={maxBarSize}
        />
      </BarChart>
    </ChartContainer>
  );
}
