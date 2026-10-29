"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import "uplot/dist/uPlot.min.css";
import { useTheme } from "next-themes";

import { ChartConfig } from "@/components/ui/chart";
import { formatter } from "@/lib/utils";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import type { ChartValue } from "@/api/useActivityMetric";
import { formatXAxisTimeLabel, formatDateByMode } from "@/lib/chartUtils";
import { createInnerYAxisTickDesign } from "@/components/charts/uplot/uPlotPlugins";
import {
  DEFAULT_PADDING,
  DEFAULT_LEGEND,
} from "@/components/charts/uplot/uPlotConfig";
import dayjs from "dayjs";

const chartConfig = {
  current: {
    label: "当前",
    theme: {
      light: "#ea580c", // orange-600
      dark: "#fb923c", // orange-400
    },
  },
  previous: {
    label: "历史",
    theme: {
      light: "#fdba74", // orange-300
      dark: "#c2410c", // orange-700
    },
  },
} satisfies ChartConfig;

// Dashboard 使用简单的时间字符串格式
type DashboardChartValue = {
  time: string; // 时间字符串格式，如 "2024-01-01"
  value: number;
};

// 对比数据格式（允许 null）
type ComparisonChartValue = {
  time: string;
  current: number | null;
  previous: number | null;
};

interface ChartAreaProps {
  dataSource?: ChartValue[] | DashboardChartValue[] | ComparisonChartValue[];
  metrics?: string[];
  metricKey?: string;
  primaryColor?: string;
  comparisonColor?: string;
  showAverageLines?: boolean;
}

function interpolateShortNullGaps(
  values: Array<number | null>,
  maxGapSize: number = 2,
) {
  if (values.length === 0) return values;
  const result = [...values];
  let i = 0;

  while (i < result.length) {
    if (result[i] !== null) {
      i += 1;
      continue;
    }

    const start = i;
    while (i < result.length && result[i] === null) i += 1;
    const end = i - 1;
    const gapSize = end - start + 1;

    const leftIdx = start - 1;
    const rightIdx = end + 1;
    const leftVal = leftIdx >= 0 ? result[leftIdx] : null;
    const rightVal = rightIdx < result.length ? result[rightIdx] : null;

    if (
      gapSize <= maxGapSize &&
      typeof leftVal === "number" &&
      Number.isFinite(leftVal) &&
      typeof rightVal === "number" &&
      Number.isFinite(rightVal)
    ) {
      for (let j = 1; j <= gapSize; j += 1) {
        const ratio = j / (gapSize + 1);
        result[start + j - 1] = leftVal + (rightVal - leftVal) * ratio;
      }
    }
  }

  return result;
}

function computeMean(values: Array<number | null>) {
  const valid = values.filter(
    (val): val is number => typeof val === "number" && Number.isFinite(val),
  );
  if (valid.length === 0) return null;
  return valid.reduce((acc, v) => acc + v, 0) / valid.length;
}

function useContainerDimensions(ref: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    if (!ref.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!Array.isArray(entries) || !entries.length) return;
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });

    resizeObserver.observe(ref.current);

    return () => resizeObserver.disconnect();
  }, [ref]);

  return dimensions;
}

export function ChartArea(props: ChartAreaProps) {
  const {
    dataSource = [],
    metrics = [],
    metricKey,
    primaryColor,
    comparisonColor,
    showAverageLines = false,
  } = props;
  const translate = useTranslations("dashboard");
  const { selectedStat, systemUnit, dashboardFilters } = useStore();
  const { theme: currentTheme } = useTheme();
  const averageLineColor = currentTheme === "dark" ? "#94a3b8" : "#64748b";
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { width, height } = useContainerDimensions(containerRef);
  const [cursorIdx, setCursorIdx] = React.useState<number | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const cursorIdxRef = React.useRef<number | null>(null);

  // Filter valid data
  const validDataSource = React.useMemo(() => {
    return dataSource.filter((d) => d.time);
  }, [dataSource]);

  const chartMetrics = React.useMemo(() => {
    const base = [...metrics];
    if (!showAverageLines) return base;
    const withAvg = [...base];
    if (base.includes("current")) withAvg.push("currentAvg");
    if (base.includes("previous")) withAvg.push("previousAvg");
    return withAvg;
  }, [metrics, showAverageLines]);

  const metricSeriesMap = React.useMemo(() => {
    const map = new Map<string, Array<number | null>>();
    for (const metric of metrics) {
      const raw = validDataSource.map((d) => {
        const val = (d as Record<string, unknown>)[metric];
        return val == null ? null : Number(val);
      });
      map.set(metric, interpolateShortNullGaps(raw, 2));
    }

    if (showAverageLines) {
      if (map.has("current")) {
        const mean = computeMean(map.get("current") ?? []);
        map.set(
          "currentAvg",
          validDataSource.map(() => mean),
        );
      }
      if (map.has("previous")) {
        const mean = computeMean(map.get("previous") ?? []);
        map.set(
          "previousAvg",
          validDataSource.map(() => mean),
        );
      }
    }
    return map;
  }, [metrics, validDataSource, showAverageLines]);

  // Prepare data for uPlot
  const data = React.useMemo(() => {
    if (!validDataSource.length) return null;

    const times = validDataSource.map(
      (d) => new Date(d.time as string).getTime() / 1000,
    );
    const seriesData = chartMetrics.map(
      (metric) => metricSeriesMap.get(metric) ?? [],
    );

    return [times, ...seriesData] as [
      number[],
      ...(number | null | undefined)[][],
    ];
  }, [validDataSource, chartMetrics, metricSeriesMap]);

  // Configure options
  const options = React.useMemo(() => {
    const isDark = currentTheme === "dark";
    const gridColor = isDark ? "#404040" : "#e5e5e5";
    const tickColor = isDark ? "#a3a3a3" : "#737373"; // muted-foreground

    const { axes, plugins } = createInnerYAxisTickDesign({
      axisStroke: tickColor,
      gridStroke: gridColor,
      tickCount: 4,
      fontSizePx: 12,
      formatXValue: (v) => {
        const dateStr = dayjs(v * 1000).format("MM-DD");
        return dateStr;
      },
      formatYValue: (v) =>
        formatValue(v, (metricKey || selectedStat?.id) as "count", systemUnit),
    });

    // Custom space for X axis
    axes[0].space = (_self, _axisIdx, _scaleMin, _scaleMax, plotDim) =>
      plotDim / 7;

    const averageLineLabelPlugin: uPlot.Plugin = {
      hooks: {
        draw: [
          (u) => {
            if (!showAverageLines) return;
            const labels = [
              {
                key: "currentAvg",
                text: `${translate("current")} ${translate("average")}`,
                yOffset: -8,
              },
              {
                key: "previousAvg",
                text: `${translate("comparison")} ${translate("average")}`,
                yOffset: 10,
              },
            ] as const;

            const xVals = u.data[0] as number[];
            const lastX = xVals[xVals.length - 1];
            if (!Number.isFinite(lastX)) return;

            const ctx = u.ctx;
            const rightX = u.bbox.left + u.bbox.width - 6;

            ctx.save();
            ctx.font = "11px ui-sans-serif, system-ui, -apple-system, sans-serif";
            ctx.fillStyle = averageLineColor;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            for (const item of labels) {
              const seriesIdx = chartMetrics.indexOf(item.key);
              if (seriesIdx < 0) continue;
              const series = u.data[seriesIdx + 1] as Array<
                number | null | undefined
              >;
              let yVal: number | null = null;
              for (let i = series.length - 1; i >= 0; i -= 1) {
                const v = series[i];
                if (typeof v === "number" && Number.isFinite(v)) {
                  yVal = v;
                  break;
                }
              }
              if (yVal == null) continue;
              const y = u.valToPos(yVal, "y", true) + item.yOffset;
              if (!Number.isFinite(y)) continue;
              ctx.fillText(item.text, rightX, y);
            }
            ctx.restore();
          },
        ],
      },
    };

    return {
      width,
      height,
      mode: 1,
      padding: DEFAULT_PADDING,
      plugins: [...plugins, averageLineLabelPlugin],
      series: [
        {}, // x-axis
        ...chartMetrics.map((metric) => {
          const isCurrent = metric === "current" || metric === "currentAvg";
          const isAvg = metric === "currentAvg" || metric === "previousAvg";
          const color =
            isAvg
              ? averageLineColor
              : isCurrent
              ? primaryColor ||
                (isDark
                  ? chartConfig.current.theme.dark
                  : chartConfig.current.theme.light)
              : comparisonColor ||
                (isDark
                  ? chartConfig.previous.theme.dark
                  : chartConfig.previous.theme.light);

          return {
            label:
              metric === "current"
                ? translate("current")
                : metric === "previous"
                  ? translate("comparison")
                  : metric === "currentAvg"
                    ? `${translate("current")} ${translate("average")}`
                    : metric === "previousAvg"
                      ? `${translate("comparison")} ${translate("average")}`
                  : metric,
            stroke: color,
            width: isAvg ? 1.5 : 2,
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
      cursor: {
        drag: { x: false, y: false },
        points: { show: false },
      },
      legend: DEFAULT_LEGEND,
      hooks: {
        setCursor: [
          (u: uPlot) => {
            const { left, top, idx } = u.cursor;

            // Update tooltip position
            if (tooltipRef.current && left !== undefined && top !== undefined) {
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
            }

            // Update tooltip content state only if index changes
            if (idx !== null && idx !== undefined) {
              if (cursorIdxRef.current !== idx) {
                setCursorIdx(idx);
                cursorIdxRef.current = idx;
              }
            } else {
              if (cursorIdxRef.current !== null) {
                setCursorIdx(null);
                cursorIdxRef.current = null;
              }
            }
          },
        ],
      },
    } as uPlot.Options;
  }, [
    width,
    height,
    chartMetrics,
    currentTheme,
    validDataSource.length,
    selectedStat,
    metricKey,
    primaryColor,
    comparisonColor,
    averageLineColor,
    systemUnit,
    translate,
    dashboardFilters.time.mode,
    showAverageLines,
  ]);

  // Tooltip content
  const tooltipContent = React.useMemo(() => {
    if (cursorIdx === null || !validDataSource[cursorIdx]) return null;

    const dataPoint = validDataSource[cursorIdx];
    const timeLabel = formatDateByMode(
      dataPoint.time!,
      dashboardFilters.time.mode,
    );

    return (
      <div className="border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-mobile-caption pc:text-xs shadow-xl">
        <div className="font-medium">{timeLabel}</div>
        <div className="grid gap-1.5">
          {chartMetrics.map((metric) => {
            const value = metricSeriesMap.get(metric)?.[cursorIdx] ?? null;
            const isCurrent = metric === "current" || metric === "currentAvg";
            const isAvg = metric === "currentAvg" || metric === "previousAvg";
            const color =
              isAvg
                ? averageLineColor
                : isCurrent
                ? primaryColor ||
                  (currentTheme === "dark"
                    ? chartConfig.current.theme.dark
                    : chartConfig.current.theme.light)
                : comparisonColor ||
                  (currentTheme === "dark"
                    ? chartConfig.previous.theme.dark
                    : chartConfig.previous.theme.light);

            const name =
              metric === "current"
                ? translate("current")
                : metric === "previous"
                  ? translate("comparison")
                  : metric === "currentAvg"
                    ? `${translate("current")} ${translate("average")}`
                    : metric === "previousAvg"
                      ? `${translate("comparison")} ${translate("average")}`
                  : metric;

            let content;
            if (value == null || Number.isNaN(Number(value))) {
              content = <span className="text-muted-foreground">—</span>;
            } else {
              const activeMetricKey =
                metricKey || selectedStat?.id || String(name);
              const formattedValue = formatValue(
                Number(value),
                activeMetricKey as "count",
                systemUnit,
              );
              const unitValue = getUnit(activeMetricKey, systemUnit);
              content = (
                <span className="font-medium font-mono text-foreground tabular-nums">
                  {formattedValue}{" "}
                  <span className="text-muted-foreground font-normal">
                    {unitValue}
                  </span>
                </span>
              );
            }

            return (
              <div
                key={metric}
                className="flex w-full flex-wrap items-stretch gap-2 items-center"
              >
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-micro"
                  style={{ backgroundColor: color }}
                />
                <div className="flex flex-1 justify-between leading-none gap-4">
                  <span className="text-muted-foreground">{name}</span>
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
    validDataSource,
    chartMetrics,
    metricSeriesMap,
    currentTheme,
    selectedStat,
    metricKey,
    primaryColor,
    comparisonColor,
    averageLineColor,
    systemUnit,
    translate,
    dashboardFilters.time.mode,
  ]);

  return (
    <div ref={containerRef} className="aspect-auto h-full w-full relative">
      {width > 0 && height > 0 && data && (
        <UplotReact options={options} data={data} />
      )}
      {/* Custom Tooltip Overlay */}
      <div
        ref={tooltipRef}
        className="absolute top-0 left-0 pointer-events-none z-50 transition-opacity duration-75"
        style={{ opacity: cursorIdx !== null ? 1 : 0 }}
      >
        {tooltipContent}
      </div>
    </div>
  );
}
