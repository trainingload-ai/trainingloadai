"use client";

import React, { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import ChartContainer from "./activity-chart-container";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import {
  DEFAULT_PADDING,
  DEFAULT_CURSOR,
  DEFAULT_LEGEND,
  createAxes,
  resolveAxisColors,
} from "@/components/charts/uplot/uPlotConfig";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { formatTimeToElapsed } from "@/utils/downsample";
import { useStore } from "@/lib/store";
import {
  aggregateMetricData,
  calculateYAxisRange,
  getMetricColor,
} from "@/lib/chart-data-utils";
import { calculateSmoothedPace } from "@/lib/chartUtils";
import ChartToolContainer from "./chart-tool-container";
import ChartExpandDialog from "./chart-expand-dialog";
import {
  selectedIntervalRange,
  useActivityAnalysisLink,
} from "../activity-analysis-link-context";

export const description = "Pace Chart";

interface OverviewPaceChartProps {
  activityId: string;
  expanded?: boolean;
}

const MemoUplotReact = memo(UplotReact);

const OverviewPaceChart: React.FC<OverviewPaceChartProps> = ({
  activityId,
  expanded = false,
}) => {
  const t = useTranslations("PaceChart");
  const { chartXaxis, systemUnit } = useStore();
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "speed",
  );

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();
  const { selectedInterval, setHoveredDistanceM } = useActivityAnalysisLink();
  const selectedRange = selectedIntervalRange(
    selectedInterval,
    chartXaxis,
    "pace",
  );

  const chartData = useMemo(() => {
    const mainRows = data?.rows || [];
    if (mainRows.length === 0) return [];

    const formattedRows = formatTimeToElapsed(mainRows);

    // Calculate smoothed pace
    const speeds = formattedRows.map((r) => Number(r.speed || 0));
    const times = formattedRows.map((r) => Number(r.time || 0));
    const { smoothedPace } = calculateSmoothedPace(speeds, times, 10);

    // Merge smoothed pace into rows
    const rowsWithPace = formattedRows.map((row, idx) => ({
      ...row,
      smoothedPace: smoothedPace[idx] > 0 ? smoothedPace[idx] : null,
    }));

    return aggregateMetricData(
      rowsWithPace as Record<string, unknown>[],
      1,
      "smoothedPace",
    );
  }, [data]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (chartData.length === 0) return [[], []];

    const xVals = chartData.map((d) =>
      chartXaxis === "distance" ? Number(d.distance || 0) : Number(d.time),
    );

    return [xVals, chartData.map((d) => d.avg)];
  }, [chartData, chartXaxis]);

  const formatPace = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "-";
    let mins = Math.floor(val);
    let secs = Math.round((val - mins) * 60);
    if (secs === 60) {
      mins += 1;
      secs = 0;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const hoveredDistance = Number(chartData[idx]?.distance);
      setHoveredDistanceM(
        Number.isFinite(hoveredDistance) ? hoveredDistance : null,
      );

      const xVal = uplotData[0][idx];
      const avgPace = uplotData[1][idx];

      const title =
        chartXaxis === "distance"
          ? (Number(xVal) / 1000).toFixed(2) + " km"
          : formatSecondsToTime(xVal, { showHours: true });

      const safeVal = avgPace ?? 0;
      const barColor = getMetricColor("pace");

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            <div className="flex w-full flex-wrap gap-2 items-center">
              <div
                className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                style={{ "--color-bg": barColor } as React.CSSProperties}
              />
              <div className="flex flex-col">
                <div className="flex flex-1 justify-between leading-none items-center gap-4">
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {formatPace(safeVal)} /km
                  </span>
                </div>
              </div>
            </div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground mt-1">
              {t("title")}: {formatPace(avgPace)} /km
            </div>
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [uplotData, chartXaxis, t, chartData, setHoveredDistanceM],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
    onHide: () => setHoveredDistanceM(null),
  });

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const barColor = getMetricColor("pace");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => formatPace(v),
    });

    return {
      width,
      height,
      legend: DEFAULT_LEGEND,
      padding: DEFAULT_PADDING,
      cursor: DEFAULT_CURSOR,
      scales: {
        x: {
          time: false,
          range: selectedRange ? () => selectedRange : undefined,
        },
        y: {
          dir: -1,
          auto: false,
          range: (_u, min, max) => {
            const { min: newMin, max: newMax } = calculateYAxisRange(
              min,
              max,
              "pace",
            );
            return [Math.max(0, newMin), newMax];
          },
        },
      },
      axes: createAxes({
        axisStroke,
        gridStroke,
        chartXaxis,
        systemUnit,
      }),
      series: [
        {},
        {
          label: t("title"),
          stroke: barColor,
          fill: `${barColor}16`,
          width: 1.5,
          points: { show: false },
        },
      ],
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    };
  }, [
    chartAreaSize,
    cssVar,
    tooltipPlugin,
    chartXaxis,
    systemUnit,
    t,
    selectedRange,
  ]);

  if (!data?.rows || data.rows.length === 0) {
    if (expanded) {
      return (
        <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      );
    }

    return (
      <ChartContainer title={t("title")} isLoading={isLoading}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      </ChartContainer>
    );
  }

  const chartNode = (
    <div ref={chartAreaRef} className="absolute inset-0">
      <div ref={chartWrapperRef}>
        {uplotOptions && uplotData && (
          <MemoUplotReact options={uplotOptions} data={uplotData} />
        )}
      </div>
      {tooltip}
    </div>
  );

  if (expanded) {
    return (
      <div className="relative h-[min(72dvh,calc(100vw-5rem))] min-h-[320px] w-full sm:h-full">
        {chartNode}
      </div>
    );
  }

  return (
    <ChartContainer
      title={t("title")}
      isLoading={isLoading}
      tools={
        <ChartToolContainer>
          <ChartExpandDialog title={t("title")}>
            <OverviewPaceChart activityId={activityId} expanded />
          </ChartExpandDialog>
        </ChartToolContainer>
      }
    >
      {chartNode}
    </ChartContainer>
  );
};

export default OverviewPaceChart;
