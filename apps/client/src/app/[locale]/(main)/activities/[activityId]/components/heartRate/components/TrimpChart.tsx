"use client";

import React, { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTheme } from "next-themes";
import { useActivityId } from "@/hooks/useActivityId";
import { useTrimpPerMinute } from "@/api/use-heart-rate";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import {
  DEFAULT_PADDING,
  DEFAULT_LEGEND,
  createAxes,
  resolveAxisColors,
} from "@/components/charts/uplot/uPlotConfig";
import CardLoader from "@/components/ui/CardLoader";

const chartConfig = {
  hr: {
    theme: {
      light: "#ef4444", // red-500 (Heart Rate standard)
      dark: "#f87171", // red-400
    },
  },
  trimp: {
    theme: {
      light: "#3b82f6", // blue-500
      dark: "#60a5fa", // blue-400
    },
  },
  instTrimp: {
    theme: {
      light: "#8b5cf6", // violet-500
      dark: "#a78bfa", // violet-400
    },
  },
};

interface TrimpChartProps {
  compact?: boolean;
}

const TrimpChart: React.FC<TrimpChartProps> = ({ compact = false }) => {
  const t = useTranslations("HeartRatePage.trimpInfo");
  const activityId = useActivityId();
  const { data, isLoading } = useTrimpPerMinute(activityId);
  const { theme: currentTheme } = useTheme();

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const cursorIdxRef = useRef<number | null>(null);
  const cssVar = useCssVarResolver();
  const chartHeight = compact ? Math.max(chartAreaSize.height, 1) : 300;

  // Prepare data for uPlot
  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!data || data.length === 0) return [[], [], []];

    const xVals: number[] = [];
    const hrPctVals: number[] = [];
    const trimpVals: number[] = [];
    const instTrimpVals: number[] = [];

    let startTime = 0;
    if (data.length > 0) {
      startTime = new Date(data[0].time).getTime() / 1000;
    }

    data.forEach((d) => {
      const time = new Date(d.time).getTime() / 1000 - startTime;
      xVals.push(time);
      hrPctVals.push(d.hrPercent);
      trimpVals.push(d.cumulativeTrimp);
      instTrimpVals.push(d.trimp);
    });

    return [xVals, hrPctVals, trimpVals, instTrimpVals];
  }, [data]);

  const options = useMemo<uPlot.Options>(() => {
    const isDark = currentTheme === "dark";
    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);

    const hrColor = isDark
      ? chartConfig.hr.theme.dark
      : chartConfig.hr.theme.light;
    const trimpColor = isDark
      ? chartConfig.trimp.theme.dark
      : chartConfig.trimp.theme.light;
    const instTrimpColor = isDark
      ? chartConfig.instTrimp.theme.dark
      : chartConfig.instTrimp.theme.light;

    const innerYAxisLabelsPluginLeft = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => v.toFixed(0) + "%",
      tickCount: 8,
      scale: "y",
      align: "left",
    });

    const innerYAxisLabelsPluginRight = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => v.toFixed(0),
      tickCount: 8,
      scale: "y2",
      align: "right",
    });

    const axes = createAxes({
      axisStroke,
      gridStroke,
      tickCount: 8,
      formatXValue: (v) => {
        const h = Math.floor(v / 3600);
        const m = Math.floor((v % 3600) / 60);
        return h > 0 ? `${h}:${m.toString().padStart(2, "0")}` : `${m}m`;
      },
    });

    // Custom space for X axis
    axes[0].space = (_self, _axisIdx, _scaleMin, _scaleMax, plotDim) =>
      plotDim / 7;

    return {
      width: chartAreaSize.width,
      height: chartHeight,
      padding: DEFAULT_PADDING,
      legend: DEFAULT_LEGEND,
      cursor: {
        drag: { x: false, y: false },
        points: { show: false },
      },
      scales: {
        x: { time: false },
        y: {
          auto: false,
          range: [30, 100],
        },
        y2: {
          auto: true,
        },
        trimp: {
          auto: false,
          range: [0, 5],
        },
      },
      axes: [
        axes[0], // x-axis
        axes[1], // y-axis (left) with grid
        // y2-axis (right) implicit, no axis line/grid, handled by plugin
      ],
      series: [
        {}, // x
        {
          label: t("hrPercentage"),
          stroke: hrColor,
          width: 2,
          scale: "y",
          value: (u, v) => (v == null ? "-" : v + "%"),
          points: { show: false },
        },
        {
          label: t("cumulativeTrimp"),
          stroke: trimpColor,
          width: 2,
          scale: "y2",
          value: (u, v) => (v == null ? "-" : v.toFixed(1)),
          points: { show: false },
          dash: [5, 5],
        },
        {
          label: "TRIMP",
          stroke: instTrimpColor,
          fill: instTrimpColor + "99", // 60% opacity
          width: 0,
          scale: "trimp",
          value: (u, v) => (v == null ? "-" : v.toFixed(1)),
          paths: uPlot.paths.bars!({ size: [0.3, 100], align: 0 }),
          points: { show: false },
        },
      ],
      plugins: [innerYAxisLabelsPluginLeft, innerYAxisLabelsPluginRight],
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

              // Boundary check
              if (newLeft + tooltipWidth > chartAreaSize.width) {
                newLeft = left - tooltipWidth - 10;
              }
              if (newTop + tooltipHeight > chartHeight) {
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
    };
  }, [chartAreaSize, chartHeight, cssVar, t, currentTheme]);

  // Tooltip content
  const tooltipContent = useMemo(() => {
    if (cursorIdx === null || !data || !data[cursorIdx]) return null;

    const d = data[cursorIdx];
    const timeVal = uplotData[0][cursorIdx];
    const h = Math.floor(timeVal / 3600);
    const m = Math.floor((timeVal % 3600) / 60);
    const s = Math.floor(timeVal % 60);
    const timeStr =
      h > 0
        ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
        : `${m}:${s.toString().padStart(2, "0")}`;

    const isDark = currentTheme === "dark";
    const hrColor = isDark
      ? chartConfig.hr.theme.dark
      : chartConfig.hr.theme.light;
    const trimpColor = isDark
      ? chartConfig.trimp.theme.dark
      : chartConfig.trimp.theme.light;
    const instTrimpColor = isDark
      ? chartConfig.instTrimp.theme.dark
      : chartConfig.instTrimp.theme.light;

    return (
      <div className="border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-mobile-caption pc:text-xs shadow-xl">
        <div className="font-medium">{timeStr}</div>
        <div className="grid gap-1.5">
          <div className="flex w-full flex-wrap items-stretch gap-2 items-center">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: hrColor }}
            />
            <div className="flex flex-1 justify-between leading-none gap-4">
              <span className="text-muted-foreground">{t("hrPercentage")}</span>
              <span className="font-medium font-mono text-foreground tabular-nums">
                {d.hrPercent}%
              </span>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-stretch gap-2 items-center">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: trimpColor }}
            />
            <div className="flex flex-1 justify-between leading-none gap-4">
              <span className="text-muted-foreground">
                {t("cumulativeTrimp")}
              </span>
              <span className="font-medium font-mono text-foreground tabular-nums">
                {d.cumulativeTrimp.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-stretch gap-2 items-center">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: instTrimpColor }}
            />
            <div className="flex flex-1 justify-between leading-none gap-4">
              <span className="text-muted-foreground">TRIMP</span>
              <span className="font-medium font-mono text-foreground tabular-nums">
                {d.trimp.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }, [cursorIdx, data, t, currentTheme, uplotData]);

  if (isLoading) {
    return (
      <div
        className={
          compact
            ? "flex h-full w-full items-center justify-center"
            : "flex h-[220px] w-full items-center justify-center"
        }
      >
        <CardLoader />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={
          compact
            ? "flex h-full w-full items-center justify-center text-muted-foreground"
            : "flex h-[220px] w-full items-center justify-center text-muted-foreground"
        }
      >
        {t("noData")}
      </div>
    );
  }

  return (
    <div
      ref={chartWrapperRef}
      className={
        compact ? "relative h-full w-full" : "relative h-[300px] w-full"
      }
    >
      <div ref={chartAreaRef} className="h-full w-full">
        {chartAreaSize.width > 0 && (
          <UplotReact options={options} data={uplotData} />
        )}
      </div>
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
};

export default TrimpChart;
