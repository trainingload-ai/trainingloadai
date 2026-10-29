"use client";

import { useId } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const LOAD_VALUES = [
  { key: "2026-06-01", actual: 42, planned: 38 },
  { key: "2026-06-02", actual: 56, planned: 48 },
  { key: "2026-06-03", actual: 18, planned: 72 },
  { key: "2026-06-04", actual: 0, planned: 32 },
  { key: "2026-06-05", actual: 0, planned: 46 },
  { key: "2026-06-06", actual: 0, planned: 0 },
  { key: "2026-06-07", actual: 0, planned: 64 },
] as const;

export function HomeProductDemoWeeklyLoadChart({
  weekdays,
  actualLabel,
  plannedLabel,
  ariaLabel,
  interactive,
}: {
  weekdays: string[];
  actualLabel: string;
  plannedLabel: string;
  ariaLabel: string;
  interactive: boolean;
}) {
  const patternId = `weekly-load-${useId().replace(/:/g, "")}`;
  const data = LOAD_VALUES.map((point, index) => ({
    ...point,
    label: weekdays[index] ?? String(index + 1),
  }));
  const config = {
    actual: {
      label: actualLabel,
      theme: { light: "#7c3aed", dark: "#a78bfa" },
    },
    planned: {
      label: plannedLabel,
      theme: { light: "#7c3aed", dark: "#a78bfa" },
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={ariaLabel}
      className="aspect-auto h-44 w-full rounded-none bg-transparent tabular-nums dark:bg-transparent"
    >
      <ComposedChart
        accessibilityLayer
        data={data}
        margin={{ top: 12, right: 8, bottom: 0, left: 12 }}
        barCategoryGap="39%"
        maxBarSize={22}
      >
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="6"
              height="6"
              fill="var(--color-planned)"
              fillOpacity={0.1}
            />
            <path
              d="M-1 1L1-1 M0 6L6 0 M5 7L7 5"
              stroke="var(--color-planned)"
              strokeWidth={1.5}
              strokeOpacity={0.42}
            />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.45} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          interval={0}
        />
        <YAxis
          orientation="right"
          width={36}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          tickCount={4}
          allowDecimals={false}
          domain={[0, "auto"]}
        />
        {interactive ? (
          <ChartTooltip
            itemSorter={(item) => (item.dataKey === "actual" ? 0 : 1)}
            cursor={{
              fill: "var(--muted-foreground)",
              fillOpacity: 0.05,
              radius: 6,
            }}
            content={
              <ChartTooltipContent
                labelFormatter={(label, payload) =>
                  String(payload?.[0]?.payload?.key ?? label)
                }
              />
            }
          />
        ) : null}
        <Bar
          dataKey="planned"
          fill={`url(#${patternId})`}
          stroke="var(--color-planned)"
          strokeOpacity={0.24}
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="actual"
          stroke="var(--color-actual)"
          strokeWidth={2.5}
          dot={{
            r: 3,
            fill: "var(--color-actual)",
            fillOpacity: 0.4,
            strokeWidth: 0,
          }}
          activeDot={{
            r: 5,
            fill: "var(--color-actual)",
            stroke: "var(--background)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
