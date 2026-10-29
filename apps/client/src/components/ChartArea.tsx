"use client";

import * as React from "react";
import { Line, LineChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatter } from "@/lib/utils";
import type { ChartValue } from "@/api/useActivityMetric";
import { useStore } from "@/lib/store";
import { formatValue } from "@/hooks/useFormatterBySettings";
import { getMetricColor } from "@/lib/chart-data-utils";

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  desktop: {
    label: "Desktop",
    // Soft orange (amber-500)
    color: "#F59E0B",
  },
  mobile: {
    label: "Mobile",
    // Fresh green (emerald-500)
    color: "#10B981",
  },
} satisfies ChartConfig;

// Dashboard uses simple date string format
type DashboardChartValue = {
  time: string; // Date string format, e.g., "2024-01-01"
  value: number;
};

interface ChartAreaProps {
  dataSource?: ChartValue[] | DashboardChartValue[];
  metrics?: string[];
  xAxis?: string;
  metricLabels?: Record<string, string>;
}

export function ChartArea(props: ChartAreaProps) {
  const { dataSource = [], metrics = [], xAxis = "time", metricLabels = {} } = props;
  const { systemUnit } = useStore();
  // Determine tickFormatter based on data format
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
      <LineChart data={dataSource}>
        <CartesianGrid vertical={false} />

        <XAxis
          dataKey={xAxis}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => {
            if (xAxis === "time") {
              return formatter("time", value);
            } else if (xAxis === "elapsedTime") {
              return formatter("elTimeS", value);
            }
            return value;
          }}
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
              formatter={(value, name) => {
                return `${name} ${formatValue(value as string, metrics?.[0], systemUnit)}`;
              }}
              indicator="dot"
            />
          }
        />
        {/* Render metrics */}
        {metrics.map((t, idx) => (
          <Line
            key={t}
            dataKey={t}
            type="monotone"
            stroke={idx === 0 ? getMetricColor(t) : "var(--color-desktop)"}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            dot={false}
            connectNulls
            name={metricLabels[t] ?? t}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
