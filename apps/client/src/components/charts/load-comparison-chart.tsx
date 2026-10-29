"use client";

import { useId } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type LoadComparisonChartPoint = {
  key: string;
  label: string;
  actual: number;
  planned: number;
  selectionKey?: string;
};

export function LoadComparisonChart({
  data,
  actualLabel,
  plannedLabel,
  ariaLabel,
  className,
  selectedKey,
  onPointSelect,
  xAxisHeight = 30,
}: {
  data: LoadComparisonChartPoint[];
  actualLabel: string;
  plannedLabel: string;
  ariaLabel: string;
  className?: string;
  selectedKey?: string;
  onPointSelect?: (key: string) => void;
  xAxisHeight?: number;
}) {
  const patternId = `load-comparison-${useId().replace(/:/g, "")}`;
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
  const selectedPoint = data.find(
    (point) => (point.selectionKey ?? point.key) === selectedKey,
  );

  return (
    <div className="relative">
      <ChartContainer
        config={config}
        role={onPointSelect ? "group" : "img"}
        aria-label={ariaLabel}
        className={cn(
          "aspect-auto h-44 w-full rounded-none bg-transparent tabular-nums dark:bg-transparent",
          onPointSelect && "[&_.recharts-wrapper]:cursor-pointer",
          className,
        )}
      >
        <ComposedChart
          accessibilityLayer
          data={data}
          margin={{ top: 12, right: 8, bottom: 0, left: 12 }}
          barCategoryGap="39%"
          maxBarSize={22}
          onClick={
            onPointSelect
              ? (state) => {
                  const point = state.activePayload?.[0]?.payload as
                    | LoadComparisonChartPoint
                    | undefined;
                  if (point) onPointSelect(point.selectionKey ?? point.key);
                }
              : undefined
          }
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
          {selectedPoint ? (
            <ReferenceLine
              x={selectedPoint.label}
              stroke="var(--color-actual)"
              strokeDasharray="3 3"
              strokeOpacity={0.28}
            />
          ) : null}
          <XAxis
            dataKey="label"
            height={xAxisHeight}
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

      {onPointSelect ? (
        <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-x-3 focus-within:bottom-2 focus-within:z-10 focus-within:flex focus-within:justify-center focus-within:gap-1 focus-within:rounded-control focus-within:bg-background focus-within:p-1 focus-within:shadow-sm">
          {data.map((point) => {
            const pointKey = point.selectionKey ?? point.key;
            return (
              <button
                key={pointKey}
                type="button"
                aria-pressed={pointKey === selectedKey}
                onClick={() => onPointSelect(pointKey)}
                className="rounded-sm px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {point.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
