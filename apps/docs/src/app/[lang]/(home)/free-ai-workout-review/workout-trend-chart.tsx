"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  buildWorkoutTrendChartData,
  formatPace,
  type WorkoutTrendMetric,
  type WorkoutTrendPoint,
} from "@/lib/workout-trend-model";

const CHART_CONFIG = {
  paceSecPerKm: { color: "#34d399" },
  speedKph: { color: "#34d399" },
  heartRateBpm: { color: "#fb7185" },
  powerW: { color: "#facc15" },
  altitudeM: { color: "#60a5fa" },
} satisfies ChartConfig;

type TrendLabels = {
  title: string;
  description: string;
  distance: string;
  elapsed: string;
  sample: string;
  pace: string;
  speed: string;
  heartRate: string;
  power: string;
  elevation: string;
};

function metricLabel(metric: WorkoutTrendMetric, labels: TrendLabels) {
  return {
    paceSecPerKm: labels.pace,
    speedKph: labels.speed,
    heartRateBpm: labels.heartRate,
    powerW: labels.power,
    altitudeM: labels.elevation,
  }[metric];
}

function metricValue(metric: WorkoutTrendMetric, value: number) {
  if (metric === "paceSecPerKm") return `${formatPace(value)} /km`;
  if (metric === "speedKph") return `${value.toFixed(1)} km/h`;
  if (metric === "heartRateBpm") return `${Math.round(value)} bpm`;
  if (metric === "powerW") return `${Math.round(value)} W`;
  return `${Math.round(value)} m`;
}

export function WorkoutTrendChart({
  points,
  sport,
  labels,
}: {
  points: WorkoutTrendPoint[];
  sport: string;
  labels: TrendLabels;
}) {
  const gradientId = useId().replace(/:/g, "");
  const chart = useMemo(
    () => buildWorkoutTrendChartData(points, sport),
    [points, sport],
  );
  const [selectedMetric, setSelectedMetric] =
    useState<WorkoutTrendMetric | null>(null);
  const activeMetric =
    selectedMetric && chart.availableMetrics.includes(selectedMetric)
      ? selectedMetric
      : chart.availableMetrics[0];

  if (!activeMetric) return null;
  const axisLabel =
    chart.axis === "distance"
      ? labels.distance
      : chart.axis === "elapsed"
        ? labels.elapsed
        : labels.sample;
  const color = `var(--color-${activeMetric})`;

  return (
    <section className="mt-4 rounded-control border border-white/10 bg-white/[.035] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">{labels.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            {labels.description}
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label={labels.title}
        >
          {chart.availableMetrics.map((metric) => (
            <button
              key={metric}
              type="button"
              role="tab"
              aria-selected={metric === activeMetric}
              onClick={() => setSelectedMetric(metric)}
              className={
                metric === activeMetric
                  ? "rounded-compact bg-emerald-400 px-2.5 py-1.5 text-xs font-bold text-emerald-950"
                  : "rounded-compact border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/10"
              }
            >
              {metricLabel(metric, labels)}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer
        config={CHART_CONFIG}
        className="mt-3 aspect-auto h-[220px] w-full min-w-0 text-neutral-400 sm:h-[260px]"
        initialDimension={{ width: 720, height: 260 }}
        aria-label={`${labels.title}: ${metricLabel(activeMetric, labels)}`}
      >
        <AreaChart
          data={chart.data}
          margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,.09)" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={(value: number) =>
              chart.axis === "distance"
                ? `${value.toFixed(value >= 10 ? 0 : 1)} km`
                : chart.axis === "elapsed"
                  ? `${Math.round(value)} min`
                  : String(Math.round(value))
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            reversed={activeMetric === "paceSecPerKm"}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) =>
              activeMetric === "paceSecPerKm"
                ? formatPace(value)
                : String(Math.round(value))
            }
          />
          <ChartTooltip
            cursor={{ stroke: "rgba(255,255,255,.22)", strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                hideLabel={false}
                labelFormatter={(_, payload) => {
                  const value = Number(payload?.[0]?.payload?.x);
                  return `${axisLabel}: ${
                    chart.axis === "distance"
                      ? `${value.toFixed(2)} km`
                      : chart.axis === "elapsed"
                        ? `${value.toFixed(1)} min`
                        : Math.round(value)
                  }`;
                }}
                formatter={(value) => (
                  <div className="flex min-w-36 items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {metricLabel(activeMetric, labels)}
                    </span>
                    <span className="font-mono font-semibold text-foreground">
                      {metricValue(activeMetric, Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            type="linear"
            dataKey={activeMetric}
            connectNulls={false}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </section>
  );
}
