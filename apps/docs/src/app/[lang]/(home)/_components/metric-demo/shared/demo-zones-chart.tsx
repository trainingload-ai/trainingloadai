"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import {
  ChartContainer as RechartsChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { DemoChartContainer } from "./demo-chart-container";
import type { DemoTimeKey, ZoneDistributionRow } from "./demo-types";

export function DemoZonesChart({
  title,
  rows,
  timeLabels,
  activeTimes,
  noDataLabel,
}: {
  title: string;
  rows: ZoneDistributionRow[];
  timeLabels: Record<DemoTimeKey, string>;
  activeTimes: DemoTimeKey[];
  noDataLabel: string;
}) {
  const seriesMeta = useMemo(
    () =>
      activeTimes.map((timeKey, index) => ({
        key: timeKey,
        label: timeLabels[timeKey],
        color: `var(--chart-${(index % 5) + 1})`,
      })),
    [activeTimes, timeLabels],
  );

  const chartData = useMemo(() => {
    return rows.map((row) => {
      const entry: Record<string, string | number> = { zone: row.zone };
      for (const series of seriesMeta) {
        entry[series.key] = row.values[series.key as DemoTimeKey] ?? 0;
      }
      return entry;
    });
  }, [rows, seriesMeta]);

  const chartConfig = useMemo(() => {
    return seriesMeta.reduce((acc, series) => {
      acc[series.key] = { label: series.label, color: series.color };
      return acc;
    }, {} as ChartConfig);
  }, [seriesMeta]);

  if (!chartData.length) {
    return (
      <DemoChartContainer title={title}>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {noDataLabel}
        </div>
      </DemoChartContainer>
    );
  }

  return (
    <DemoChartContainer title={title}>
      <RechartsChartContainer config={chartConfig} className="h-full w-full">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="zone" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            tickLine={false}
            axisLine={false}
            fontSize={12}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesMeta.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              fill={series.color}
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((row, index) => (
                <Cell
                  key={`${series.key}-${row.zone}`}
                  fill={rows[index]?.color ?? series.color}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </RechartsChartContainer>
    </DemoChartContainer>
  );
}
