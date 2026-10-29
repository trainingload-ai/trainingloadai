"use client";

import { useMemo, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/cn";
import type { FitFileViewerPageMessages } from "../fit-view-copy";
import {
  metersPerSecondToKilometersPerHour,
  metersPerSecondToPaceSecondsPerKilometer,
} from "../fit-value-format";
import type { FitRecordTrendPoint, FitViewModel } from "../fit-view-model";

type MetricKey =
  | "pace"
  | "speed"
  | "altitude"
  | "heartRate"
  | "power"
  | "cadence"
  | "grade"
  | "temperature";
type AxisKey = "elapsed" | "distance" | "index";

type MetricDefinition = {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  reversed?: boolean;
  value: (point: FitRecordTrendPoint) => number | undefined;
  format: (value: number) => string;
  tick: (value: number) => string;
};

type ChartDatum = {
  x: number;
  y: number;
  recordIndex: number;
  elapsedSec?: number;
  distanceM?: number;
};

function finite(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function formatClock(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function metricDefinitions(
  r: FitFileViewerPageMessages["results"],
): MetricDefinition[] {
  return [
    {
      key: "pace",
      label: r.paceMetric,
      unit: "min/km",
      color: "#059669",
      reversed: true,
      value: (point) =>
        point.speedMps === undefined
          ? undefined
          : metersPerSecondToPaceSecondsPerKilometer(point.speedMps),
      format: (value) => `${formatClock(value)} /km`,
      tick: formatClock,
    },
    {
      key: "speed",
      label: r.speedMetric,
      unit: "km/h",
      color: "#059669",
      value: (point) =>
        point.speedMps === undefined
          ? undefined
          : metersPerSecondToKilometersPerHour(point.speedMps),
      format: (value) => `${value.toFixed(1)} km/h`,
      tick: (value) => value.toFixed(value >= 10 ? 0 : 1),
    },
    {
      key: "altitude",
      label: r.elevationMetric,
      unit: "m",
      color: "#2563eb",
      value: (point) => point.altitudeM,
      format: (value) => `${value.toFixed(1)} m`,
      tick: (value) => Math.round(value).toString(),
    },
    {
      key: "heartRate",
      label: r.heartRateMetric,
      unit: "bpm",
      color: "#e11d48",
      value: (point) => point.heartRateBpm,
      format: (value) => `${Math.round(value)} bpm`,
      tick: (value) => Math.round(value).toString(),
    },
    {
      key: "power",
      label: r.powerMetric,
      unit: "W",
      color: "#d97706",
      value: (point) => point.powerW,
      format: (value) => `${Math.round(value)} W`,
      tick: (value) => Math.round(value).toString(),
    },
    {
      key: "cadence",
      label: r.cadenceMetric,
      unit: "rpm",
      color: "#7c3aed",
      value: (point) => point.cadenceRpm,
      format: (value) => `${value.toFixed(1)} rpm`,
      tick: (value) => Math.round(value).toString(),
    },
    {
      key: "grade",
      label: r.gradeMetric,
      unit: "%",
      color: "#c2410c",
      value: (point) => point.gradePercent,
      format: (value) => `${value.toFixed(1)}%`,
      tick: (value) => `${Math.round(value)}%`,
    },
    {
      key: "temperature",
      label: r.temperatureMetric,
      unit: "°C",
      color: "#0891b2",
      value: (point) => point.temperatureC,
      format: (value) => `${value.toFixed(1)} °C`,
      tick: (value) => Math.round(value).toString(),
    },
  ];
}

function availableAxes(points: FitRecordTrendPoint[]): AxisKey[] {
  const varying = (values: Array<number | undefined>) => {
    const valid = values.filter(
      (value): value is number => finite(value) !== undefined,
    );
    return valid.length >= 2 && Math.max(...valid) > Math.min(...valid);
  };
  const axes: AxisKey[] = [];
  if (varying(points.map((point) => point.elapsedSec))) axes.push("elapsed");
  if (varying(points.map((point) => point.distanceM))) axes.push("distance");
  return axes.length > 0 ? axes : ["index"];
}

function axisValue(point: FitRecordTrendPoint, axis: AxisKey) {
  if (axis === "elapsed") return finite(point.elapsedSec);
  if (axis === "distance") {
    const meters = finite(point.distanceM);
    return meters === undefined ? undefined : meters / 1_000;
  }
  return point.index + 1;
}

function buildChartData(
  points: FitRecordTrendPoint[],
  metric: MetricDefinition,
  axis: AxisKey,
) {
  const byX = new Map<number, ChartDatum>();
  for (const point of points) {
    const x = axisValue(point, axis);
    const y = finite(metric.value(point));
    if (x === undefined || y === undefined) continue;
    byX.set(x, {
      x,
      y,
      recordIndex: point.index + 1,
      elapsedSec: point.elapsedSec,
      distanceM: point.distanceM,
    });
  }
  return [...byX.values()].sort(
    (left, right) => left.x - right.x || left.recordIndex - right.recordIndex,
  );
}

function axisLabel(axis: AxisKey, r: FitFileViewerPageMessages["results"]) {
  if (axis === "elapsed") return r.elapsedAxis;
  if (axis === "distance") return r.distanceAxis;
  return r.recordIndex;
}

function formatAxisValue(axis: AxisKey, value: number) {
  if (axis === "elapsed") return formatClock(value);
  if (axis === "distance") return `${value.toFixed(value >= 10 ? 0 : 1)} km`;
  return Math.round(value).toString();
}

export function FitRecordChart({
  model,
  copy,
}: {
  model: FitViewModel;
  copy: FitFileViewerPageMessages;
}) {
  const r = copy.results;
  const points = model.visualization.trends;
  const paceSport =
    model.identity.sport?.toLowerCase().includes("run") ?? false;
  const definitions = useMemo(() => metricDefinitions(r), [r]);
  const metrics = useMemo(
    () =>
      definitions.filter(
        (metric) =>
          (metric.key !== "pace" || paceSport) &&
          points.filter((point) => finite(metric.value(point)) !== undefined)
            .length >= 2,
      ),
    [definitions, paceSport, points],
  );
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [selectedAxis, setSelectedAxis] = useState<AxisKey | null>(null);
  const preferredMetric = paceSport ? "pace" : "speed";
  const activeMetric =
    metrics.find((metric) => metric.key === selectedMetric) ??
    metrics.find((metric) => metric.key === preferredMetric) ??
    metrics[0];
  const axes = useMemo(() => availableAxes(points), [points]);
  const activeAxis = axes.includes(selectedAxis ?? "elapsed")
    ? (selectedAxis ?? "elapsed")
    : axes[0];
  const data = useMemo(
    () =>
      activeMetric ? buildChartData(points, activeMetric, activeAxis) : [],
    [activeAxis, activeMetric, points],
  );
  const stats = useMemo(() => {
    if (!activeMetric || data.length === 0) return null;
    const values = data.map((point) => point.y);
    return {
      minimum: Math.min(...values),
      average:
        values.reduce((total, value) => total + value, 0) / values.length,
      maximum: Math.max(...values),
    };
  }, [activeMetric, data]);

  if (!activeMetric || data.length < 2) {
    return (
      <section className="grid min-h-80 place-items-center rounded-compact border border-dashed border-neutral-300 bg-neutral-50/50 p-8 text-center dark:border-border dark:bg-white/[0.025]">
        <div>
          <ChartNoAxesCombined
            aria-hidden="true"
            className="mx-auto size-5 text-neutral-400"
          />
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            {r.chartUnavailable}
          </p>
        </div>
      </section>
    );
  }

  const chartConfig = {
    y: { label: activeMetric.label, color: activeMetric.color },
  } satisfies ChartConfig;

  return (
    <section aria-labelledby="fit-chart-title" className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h3
            id="fit-chart-title"
            className="text-sm font-bold text-neutral-950 dark:text-white"
          >
            {r.chartTitle}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-sm">
            {r.chartDescription}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid gap-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {r.metric}
            <select
              value={activeMetric.key}
              onChange={(event) =>
                setSelectedMetric(event.target.value as MetricKey)
              }
              className="h-11 min-w-44 rounded-compact border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-border dark:bg-neutral-950 dark:text-white sm:h-9 sm:text-xs"
            >
              {metrics.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label} · {metric.unit}
                </option>
              ))}
            </select>
          </label>
          {axes.length > 1 ? (
            <div className="grid gap-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              <span>{r.horizontalAxis}</span>
              <div className="inline-flex h-11 rounded-compact border border-neutral-300 bg-white p-0.5 dark:border-border dark:bg-neutral-950 sm:h-9">
                {axes.map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    onClick={() => setSelectedAxis(axis)}
                    className={cn(
                      "rounded-[4px] px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                      axis === activeAxis
                        ? "bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-950"
                        : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white",
                    )}
                  >
                    {axisLabel(axis, r)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-compact border border-neutral-200 bg-neutral-50/35 px-2 py-3 dark:border-border dark:bg-white/[0.02] sm:px-4 sm:py-4">
        <ChartContainer
          config={chartConfig}
          className="h-[280px] w-full min-w-0 text-neutral-500 sm:h-[360px]"
          initialDimension={{ width: 900, height: 360 }}
          aria-label={`${r.chartTitle}: ${activeMetric.label}`}
        >
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="x"
              axisLine={false}
              tickLine={false}
              minTickGap={36}
              tickFormatter={(value: number) =>
                formatAxisValue(activeAxis, value)
              }
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={56}
              reversed={activeMetric.reversed}
              domain={["auto", "auto"]}
              tickFormatter={activeMetric.tick}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      | ChartDatum
                      | undefined;
                    if (!point) return null;
                    return `${axisLabel(activeAxis, r)} · ${formatAxisValue(activeAxis, point.x)}`;
                  }}
                  formatter={(value) => (
                    <div className="flex min-w-36 items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {activeMetric.label}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {activeMetric.format(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Line
              type="linear"
              dataKey="y"
              stroke="var(--color-y)"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </div>

      {stats ? (
        <dl className="grid grid-cols-3 divide-x divide-neutral-200 rounded-compact border border-neutral-200 bg-white py-3 text-center dark:divide-border dark:border-border dark:bg-card">
          {(
            [
              [r.minimum, stats.minimum],
              [r.average, stats.average],
              [r.maximum, stats.maximum],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0 px-2 sm:px-4">
              <dt className="truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                {label}
              </dt>
              <dd className="mt-1 truncate font-mono text-xs font-bold tabular-nums text-neutral-950 dark:text-white sm:text-sm">
                {activeMetric.format(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
