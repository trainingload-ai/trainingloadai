"use client";

import React, { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import UplotReact from "uplot-react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEpocData } from "@/api/use-heart-rate";
import { useActivityId } from "@/hooks/useActivityId";
import {
  DEFAULT_PADDING,
  DEFAULT_LEGEND,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import {
  createInnerYAxisLabelsPlugin,
  createMinMaxPointsPlugin,
} from "@/components/charts/uplot/uPlotPlugins";
import {
  useCssVarResolver,
  useElementSize,
} from "@/components/charts/uplot/useElementSize";
import { useStore } from "@/lib/store";
import CardLoader from "@/components/ui/CardLoader";
import { formatBySettings } from "@/lib/utils";
const chartConfig = {
  hr: {
    theme: {
      light: "#ef4444", // red-500
      dark: "#f87171", // red-400
    },
  },
  epoc: {
    theme: {
      light: "#3b82f6", // blue-500
      dark: "#60a5fa", // blue-400
    },
  },
};

export const EpocChart = ({ compact = false }: { compact?: boolean }) => {
  const t = useTranslations("EpocChart");
  const activityId = useActivityId();
  const { theme: currentTheme } = useTheme();
  const cssVar = useCssVarResolver();
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const { width } = size;
  const height = compact ? Math.max(size.height, 1) : 300;
  const { systemUnit } = useStore();
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useEpocData(activityId, true);

  const axisColor = cssVar("var(--muted-foreground)");
  const gridColor = cssVar("var(--border)");

  const isDark = currentTheme === "dark";
  const hrColor = isDark
    ? chartConfig.hr.theme.dark
    : chartConfig.hr.theme.light;
  const epocColor = isDark
    ? chartConfig.epoc.theme.dark
    : chartConfig.epoc.theme.light;

  const uPlotData = useMemo(() => {
    if (!data || data.length === 0) return null;
    // Keep base unit consistent with formatBySettings distance expectations (meters)
    const distances = data.map((d) => d.distance);
    const epocValues = data.map((d) => d.epoc);
    const hrValues = data.map((d) => d.hr);
    return [distances, epocValues, hrValues] as [number[], ...number[][]];
  }, [data]);

  const options = useMemo<uPlot.Options>(() => {
    return {
      width,
      height,
      mode: 1,
      padding: DEFAULT_PADDING,
      legend: DEFAULT_LEGEND,
      cursor: {
        lock: false,
        focus: { prox: 16 },
        sync: {
          key: "epoc-chart",
        },
        drag: { x: true, y: true },
      },
      scales: {
        x: { time: false },
        y: { auto: true },
        y2: { auto: true },
      },
      plugins: [
        createInnerYAxisLabelsPlugin({
          axisStroke: axisColor,
          formatValue: (v) => v.toFixed(0),
          tickCount: 5,
          scale: "y",
          align: "left",
          font: "12px sans-serif",
        }),
        createInnerYAxisLabelsPlugin({
          axisStroke: axisColor,
          formatValue: (v) => v.toFixed(0),
          tickCount: 5,
          scale: "y2",
          align: "right",
          font: "12px sans-serif",
        }),
        createMinMaxPointsPlugin({
          seriesIdx: 1, // EPOC
          pointColor: epocColor,
          scale: "y2",
        }),
        createMinMaxPointsPlugin({
          seriesIdx: 2, // HR
          pointColor: hrColor,
          scale: "y",
        }),
      ],
      series: [
        {
          label: t("distance"),
          value: (self, rawValue) => {
            if (rawValue == null || Number.isNaN(Number(rawValue))) return "--";
            // Format using user system unit
            try {
              // lazy import to avoid top-level circulars

              return formatBySettings(Number(rawValue), "distance", {
                systemUnit,
              });
            } catch {
              return `${Number(rawValue).toFixed(2)}`;
            }
          },
        },
        {
          label: "EPOC",
          scale: "y2",
          stroke: epocColor,
          width: 2,
          value: (self, rawValue) => (rawValue ? rawValue.toFixed(0) : "--"),
          points: { show: false },
        },
        {
          label: t("heartRate"),
          scale: "y",
          stroke: hrColor,
          width: 2,
          value: (self, rawValue) =>
            rawValue ? `${rawValue.toFixed(0)} bpm` : "--",
          points: { show: false },
        },
      ],
      axes: createAxes({
        axisStroke: axisColor,
        gridStroke: gridColor,
        chartXaxis: "distance",
        systemUnit,
      }),
      hooks: {
        setCursor: [
          (u) => {
            const { left, top, idx } = u.cursor;

            if (tooltipRef.current && left !== undefined && top !== undefined) {
              const tooltipWidth = tooltipRef.current.offsetWidth;
              const tooltipHeight = tooltipRef.current.offsetHeight;
              let newLeft = left + 10;
              let newTop = top + 10;

              // Boundary checks
              if (newLeft + tooltipWidth > width) {
                newLeft = left - tooltipWidth - 10;
              }
              if (newTop + tooltipHeight > height) {
                newTop = top - tooltipHeight - 10;
              }

              tooltipRef.current.style.transform = `translate(${newLeft}px, ${newTop}px)`;
            }

            if (idx !== null && idx !== undefined) {
              setCursorIdx(idx);
            } else {
              setCursorIdx(null);
            }
          },
        ],
      },
    } as uPlot.Options;
  }, [axisColor, epocColor, gridColor, height, hrColor, systemUnit, t, width]);

  const tooltipContent = useMemo(() => {
    if (cursorIdx === null || !uPlotData) return null;
    const distance = uPlotData[0][cursorIdx];
    const epoc = uPlotData[1][cursorIdx];
    const hr = uPlotData[2][cursorIdx];

    return (
      <div className="border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-mobile-caption pc:text-xs shadow-xl">
        <div className="font-medium">
          {formatBySettings(distance, "distance", {
            systemUnit,
          })}
        </div>
        <div className="grid gap-1.5">
          <div className="flex w-full flex-wrap items-stretch gap-2 items-center">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: epocColor }}
            />
            <div className="flex flex-1 justify-between leading-none gap-4">
              <span className="text-muted-foreground">EPOC</span>
              <span className="font-medium font-mono text-foreground tabular-nums">
                {epoc.toFixed(0)}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-stretch gap-2 items-center">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: hrColor }}
            />
            <div className="flex flex-1 justify-between leading-none gap-4">
              <span className="text-muted-foreground">{t("heartRate")}</span>
              <span className="font-medium font-mono text-foreground tabular-nums">
                {hr.toFixed(0)} bpm
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }, [cursorIdx, epocColor, hrColor, systemUnit, t, uPlotData]);

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

  return (
    <div
      ref={containerRef}
      className={
        compact ? "relative h-full w-full" : "relative h-[300px] w-full"
      }
    >
      {width > 0 && uPlotData ? (
        <>
          <UplotReact options={options} data={uPlotData} />
          <div
            ref={tooltipRef}
            className="absolute top-0 left-0 pointer-events-none z-50 transition-opacity duration-75"
            style={{ opacity: cursorIdx !== null ? 1 : 0 }}
          >
            {tooltipContent}
          </div>
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {!data || data.length === 0
            ? t("noData") || "No data available"
            : null}
        </div>
      )}
    </div>
  );
};

export interface EpocChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EpocChartModal: React.FC<EpocChartModalProps> = ({
  open,
  onOpenChange,
}) => {
  const t = useTranslations("EpocChart");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] md:max-w-[50vw] gap-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {t("title")}
          </DialogTitle>
        </DialogHeader>
        <div className="w-full">{open && <EpocChart />}</div>
      </DialogContent>
    </Dialog>
  );
};
