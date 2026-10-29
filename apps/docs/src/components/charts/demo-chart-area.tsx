"use client";

import * as React from "react";
import dayjs from "dayjs";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTheme } from "next-themes";

import type { DemoChartPoint } from "./demo-chart-data";
import { cn } from "@/lib/utils";
import { createInnerYAxisTickDesign } from "./uplot/uPlotPlugins";
import { DEFAULT_LEGEND, DEFAULT_PADDING } from "./uplot/uPlotConfig";
import { useElementSize } from "./uplot/useElementSize";

export type DemoChartSeriesLabels = {
  current: string;
  previous: string;
  currentAverage: string;
  previousAverage: string;
};

const DEFAULT_SERIES_LABELS: DemoChartSeriesLabels = {
  current: "Current",
  previous: "Previous",
  currentAverage: "Current avg",
  previousAverage: "Previous avg",
};

function interpolateShortNullGaps(
  values: Array<number | null>,
  maxGapSize = 2,
) {
  if (values.length === 0) return values;
  const result = [...values];
  let index = 0;

  while (index < result.length) {
    if (result[index] !== null) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < result.length && result[index] === null) index += 1;
    const end = index - 1;
    const gapSize = end - start + 1;

    const leftIndex = start - 1;
    const rightIndex = end + 1;
    const leftValue = leftIndex >= 0 ? result[leftIndex] : null;
    const rightValue = rightIndex < result.length ? result[rightIndex] : null;

    if (
      gapSize <= maxGapSize &&
      typeof leftValue === "number" &&
      Number.isFinite(leftValue) &&
      typeof rightValue === "number" &&
      Number.isFinite(rightValue)
    ) {
      for (let offset = 1; offset <= gapSize; offset += 1) {
        const ratio = offset / (gapSize + 1);
        result[start + offset - 1] =
          leftValue + (rightValue - leftValue) * ratio;
      }
    }
  }

  return result;
}

function computeMean(values: Array<number | null>) {
  const valid = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function getSeriesLabel(metric: string, labels: DemoChartSeriesLabels) {
  switch (metric) {
    case "current":
      return labels.current;
    case "previous":
      return labels.previous;
    case "currentAvg":
      return labels.currentAverage;
    case "previousAvg":
      return labels.previousAverage;
    default:
      return metric;
  }
}

const MemoUplotReact = React.memo(UplotReact);

export function DemoChartArea({
  data,
  primaryColor = "#7c3aed",
  comparisonColor,
  showComparison = true,
  showAverageLines = true,
  seriesLabels = DEFAULT_SERIES_LABELS,
  interactive = true,
}: {
  data: DemoChartPoint[];
  primaryColor?: string;
  comparisonColor?: string;
  showComparison?: boolean;
  showAverageLines?: boolean;
  seriesLabels?: DemoChartSeriesLabels;
  /** 预览缩略图传 false：仅展示折线，不响应 hover */
  interactive?: boolean;
}) {
  const { theme } = useTheme();
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [cursorIdx, setCursorIdx] = React.useState<number | null>(null);
  const [cursorPos, setCursorPos] = React.useState<{
    left: number;
    top: number;
  } | null>(null);

  const isDark = theme === "dark";
  const gridColor = isDark ? "#404040" : "#e5e5e5";
  const tickColor = isDark ? "#a3a3a3" : "#737373";
  const averageLineColor = isDark ? "#94a3b8" : "#64748b";
  const resolvedComparison =
    comparisonColor ?? (isDark ? "rgba(255,255,255,0.22)" : "#d4d4d4");

  const validData = React.useMemo(
    () => data.filter((point) => point.time),
    [data],
  );

  const metrics = React.useMemo(() => {
    const base = ["current"];
    if (showComparison) base.push("previous");
    return base;
  }, [showComparison]);

  const chartMetrics = React.useMemo(() => {
    const base = [...metrics];
    if (!showAverageLines) return base;
    const withAverage = [...base];
    if (base.includes("current")) withAverage.push("currentAvg");
    if (base.includes("previous")) withAverage.push("previousAvg");
    return withAverage;
  }, [metrics, showAverageLines]);

  const metricSeriesMap = React.useMemo(() => {
    const map = new Map<string, Array<number | null>>();
    for (const metric of metrics) {
      const raw = validData.map((point) => {
        const value = point[metric as keyof DemoChartPoint];
        return value == null ? null : Number(value);
      });
      map.set(metric, interpolateShortNullGaps(raw, 2));
    }

    if (showAverageLines) {
      if (map.has("current")) {
        const mean = computeMean(map.get("current") ?? []);
        map.set(
          "currentAvg",
          validData.map(() => mean),
        );
      }
      if (map.has("previous")) {
        const mean = computeMean(map.get("previous") ?? []);
        map.set(
          "previousAvg",
          validData.map(() => mean),
        );
      }
    }

    return map;
  }, [metrics, validData, showAverageLines]);

  const plotData = React.useMemo(() => {
    if (!validData.length) return null;

    const times = validData.map((point) => dayjs(point.time).unix());
    const seriesData = chartMetrics.map(
      (metric) => metricSeriesMap.get(metric) ?? [],
    );

    return [times, ...seriesData] as uPlot.AlignedData;
  }, [validData, chartMetrics, metricSeriesMap]);

  const options = React.useMemo((): uPlot.Options | null => {
    const { width, height } = size;
    if (width <= 0 || height <= 0 || !plotData) return null;

    const { axes, plugins } = createInnerYAxisTickDesign({
      axisStroke: tickColor,
      gridStroke: gridColor,
      tickCount: 4,
      fontSizePx: 12,
      formatXValue: (value) => dayjs(value * 1000).format("MM-DD"),
      formatYValue: (value) => String(Math.round(value)),
    });

    axes[0].space = (_self, _axisIdx, _scaleMin, _scaleMax, plotDim) =>
      plotDim / 7;

    return {
      width,
      height,
      mode: 1,
      padding: DEFAULT_PADDING,
      plugins,
      series: [
        {},
        ...chartMetrics.map((metric) => {
          const isCurrent = metric === "current" || metric === "currentAvg";
          const isAverage = metric === "currentAvg" || metric === "previousAvg";
          const color = isAverage
            ? averageLineColor
            : isCurrent
              ? primaryColor
              : resolvedComparison;

          return {
            label: metric,
            stroke: color,
            width: isAverage ? 1.5 : 2,
            dash:
              metric === "previous"
                ? [5, 5]
                : metric === "currentAvg"
                  ? [3, 4]
                  : metric === "previousAvg"
                    ? [3, 5]
                    : undefined,
            paths: uPlot.paths.spline!(),
            points: { show: false },
          };
        }),
      ],
      axes,
      cursor: interactive
        ? {
            y: false,
            drag: { x: false, y: false },
            points: { show: false },
          }
        : {
            show: false,
            drag: { x: false, y: false },
            points: { show: false },
          },
      legend: DEFAULT_LEGEND,
      hooks: interactive
        ? {
            setCursor: [
              (chart) => {
                const { left, top, idx } = chart.cursor;

                if (left !== undefined && top !== undefined) {
                  setCursorPos({ left, top });
                }

                if (idx !== null && idx !== undefined) {
                  setCursorIdx(idx);
                } else {
                  setCursorIdx(null);
                }
              },
            ],
          }
        : undefined,
    };
  }, [
    size,
    plotData,
    tickColor,
    gridColor,
    chartMetrics,
    primaryColor,
    resolvedComparison,
    averageLineColor,
    interactive,
  ]);

  React.useLayoutEffect(() => {
    if (!interactive || !cursorPos || !tooltipRef.current) return;
    const { width, height } = size;
    if (width <= 0 || height <= 0) return;

    const { left, top } = cursorPos;
    const tooltipWidth = tooltipRef.current.offsetWidth;
    const tooltipHeight = tooltipRef.current.offsetHeight;
    let newLeft = left + 10;
    let newTop = top + 10;

    if (newLeft + tooltipWidth > width) {
      newLeft = left - tooltipWidth - 10;
    }
    if (newTop + tooltipHeight > height) {
      newTop = top - tooltipHeight - 10;
    }

    tooltipRef.current.style.transform = `translate(${newLeft}px, ${newTop}px)`;
  }, [cursorPos, size, interactive]);

  const tooltipContent = React.useMemo(() => {
    if (cursorIdx === null || !validData[cursorIdx]) return null;

    const dataPoint = validData[cursorIdx]!;
    const timeLabel = dayjs(dataPoint.time).format("YYYY-MM-DD");

    return (
      <div className="grid min-w-32 items-start gap-1.5 rounded-compact border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
        <div className="font-medium">{timeLabel}</div>
        <div className="grid gap-1.5">
          {chartMetrics.map((metric) => {
            const value = metricSeriesMap.get(metric)?.[cursorIdx] ?? null;
            const isCurrent = metric === "current" || metric === "currentAvg";
            const isAverage =
              metric === "currentAvg" || metric === "previousAvg";
            const color = isAverage
              ? averageLineColor
              : isCurrent
                ? primaryColor
                : resolvedComparison;

            let content;
            if (value == null || Number.isNaN(Number(value))) {
              content = <span className="text-muted-foreground">—</span>;
            } else {
              content = (
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {Math.round(Number(value))}
                </span>
              );
            }

            return (
              <div key={metric} className="flex w-full items-center gap-2">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">
                    {getSeriesLabel(metric, seriesLabels)}
                  </span>
                  {content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [
    cursorIdx,
    validData,
    chartMetrics,
    metricSeriesMap,
    primaryColor,
    resolvedComparison,
    averageLineColor,
    seriesLabels,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0", !interactive && "pointer-events-none")}
    >
      <div className="relative h-full w-full">
        {options ? <MemoUplotReact options={options} data={plotData!} /> : null}
        {interactive ? (
          <div
            ref={tooltipRef}
            className="pointer-events-none absolute left-0 top-0 z-50 transition-opacity duration-75"
            style={{ opacity: cursorIdx !== null ? 1 : 0 }}
          >
            {tooltipContent}
          </div>
        ) : null}
      </div>
    </div>
  );
}
