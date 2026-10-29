"use client";

import React, { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
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
import ChartContainer from "./activity-chart-container";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { formatTimeToElapsed } from "@/utils/downsample";
import { useStore } from "@/lib/store";
import {
  aggregateMetricData,
  calculateYAxisRange,
  getMetricColor,
} from "@/lib/chart-data-utils";
import ChartToolContainer from "./chart-tool-container";
import ChartExpandDialog from "./chart-expand-dialog";
import { useActivityAnalysisLink } from "../activity-analysis-link-context";

interface OverviewElevationChartProps {
  activityId: string;
}

const MemoUplotReact = memo(UplotReact);

interface ExpandedElevationChartProps {
  rows: Record<string, unknown>[];
  isLoading: boolean;
  chartXaxis: string;
  systemUnit: "metric" | "imperial";
  title: string;
  noDataLabel: string;
}

const ExpandedElevationChart: React.FC<ExpandedElevationChartProps> = ({
  rows,
  isLoading,
  chartXaxis,
  systemUnit,
  title,
  noDataLabel,
}) => {
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();
  const { setHoveredDistanceM } = useActivityAnalysisLink();

  const fullChartData = useMemo(() => {
    return rows
      .map((row) => ({
        time: Number(row.time || 0),
        distance: Number(row.distance || 0),
        altitude: Number(row.enhancedAltitude),
      }))
      .filter((row) => Number.isFinite(row.altitude));
  }, [rows]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (fullChartData.length === 0) return [[], []];

    const xVals = fullChartData.map((d) =>
      chartXaxis === "distance" ? d.distance : d.time,
    );
    const yVals = fullChartData.map((d) => d.altitude);

    return [xVals, yVals];
  }, [chartXaxis, fullChartData]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const hoveredDistance = Number(fullChartData[idx]?.distance);
      setHoveredDistanceM(
        Number.isFinite(hoveredDistance) ? hoveredDistance : null,
      );

      const timeVal = uplotData[0][idx];
      const altitude = uplotData[1][idx];

      const title =
        chartXaxis === "distance"
          ? `${(Number(timeVal) / 1000).toFixed(2)} km`
          : formatSecondsToTime(Number(timeVal));

      const barColor = getMetricColor("altitude");
      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="mt-1 flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: barColor }}
            />
            <span className="font-mono font-medium tabular-nums text-foreground">
              {typeof altitude === "number" ? altitude.toFixed(2) : "-"} m
            </span>
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [chartXaxis, uplotData, fullChartData, setHoveredDistanceM],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
    onHide: () => setHoveredDistanceM(null),
  });

  const yAxisRange = useMemo(() => {
    if (fullChartData.length === 0) return [0, 0] as [number, number];

    const rawMin = Math.min(...fullChartData.map((d) => d.altitude));
    const rawMax = Math.max(...fullChartData.map((d) => d.altitude));
    const { min, max } = calculateYAxisRange(
      rawMin,
      rawMax,
      "enhancedAltitude",
    );

    return [min, max] as [number, number];
  }, [fullChartData]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const lineColor = getMetricColor("altitude");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => Math.round(v).toString(),
    });

    return {
      width,
      height,
      legend: DEFAULT_LEGEND,
      padding: DEFAULT_PADDING,
      cursor: DEFAULT_CURSOR,
      scales: {
        x: { time: false },
        y: {
          auto: false,
          range: yAxisRange,
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
          label: title,
          stroke: lineColor,
          fill: `${lineColor}22`,
          width: 2,
          points: { show: false },
        },
      ],
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    };
  }, [
    chartAreaSize.height,
    chartAreaSize.width,
    chartXaxis,
    cssVar,
    systemUnit,
    title,
    tooltipPlugin,
    yAxisRange,
  ]);

  if (!fullChartData.length) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
        {isLoading ? "" : noDataLabel}
      </div>
    );
  }

  return (
    <div
      ref={chartAreaRef}
      className="relative h-[min(72dvh,calc(100vw-5rem))] min-h-[320px] w-full sm:h-full"
    >
      <div ref={chartWrapperRef}>
        {uplotOptions && (
          <MemoUplotReact options={uplotOptions} data={uplotData} />
        )}
      </div>
      {tooltip}
    </div>
  );
};

const OverviewElevationChart: React.FC<OverviewElevationChartProps> = ({
  activityId,
}) => {
  const t = useTranslations("ElevationChart");
  const { chartXaxis, systemUnit } = useStore((state) => state);
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "enhancedAltitude",
  );

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();
  const { setHoveredDistanceM } = useActivityAnalysisLink();

  const formattedRows = useMemo(
    () => formatTimeToElapsed(data?.rows || []) as Record<string, unknown>[],
    [data?.rows],
  );

  const chartData = useMemo(() => {
    if (formattedRows.length === 0) return [];

    return aggregateMetricData(
      formattedRows as Record<string, unknown>[],
      1,
      "enhancedAltitude",
    );
  }, [formattedRows]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (chartData.length === 0) return [[], []];

    const xVals = chartData.map((d) =>
      chartXaxis === "distance" ? Number(d.distance || 0) : Number(d.time),
    );

    return [xVals, chartData.map((d) => d.avg)];
  }, [chartData, chartXaxis]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const hoveredDistance = Number(chartData[idx]?.distance);
      setHoveredDistanceM(
        Number.isFinite(hoveredDistance) ? hoveredDistance : null,
      );

      const timeVal = uplotData[0][idx];
      const avgAlt = uplotData[1][idx];

      const title =
        chartXaxis === "distance"
          ? (Number(timeVal) / 1000).toFixed(2) + " km"
          : formatSecondsToTime(Number(timeVal));

      const safeVal = avgAlt ?? 0;
      const barColor = getMetricColor("altitude");

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
                    {typeof safeVal === "number" ? safeVal.toFixed(2) : "-"} m
                  </span>
                </div>
              </div>
            </div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground mt-1">
              {t("title")}:{" "}
              {typeof avgAlt === "number" ? avgAlt.toFixed(2) : "-"} m
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

  // Calculate Y-axis range based on metadata
  const yAxisRange = useMemo(() => {
    const rawMin = Number(data?.metadata?.min ?? 0);
    const rawMax = Number(data?.metadata?.max ?? 0);

    const { min, max } = calculateYAxisRange(
      rawMin,
      rawMax,
      "enhancedAltitude",
    );
    return [min, max] as [number, number];
  }, [data]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const barColor = getMetricColor("altitude");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => Math.round(v).toString(),
    });

    return {
      width,
      height,
      legend: DEFAULT_LEGEND,
      padding: DEFAULT_PADDING,
      cursor: DEFAULT_CURSOR,
      scales: {
        x: { time: false },
        y: {
          auto: false,
          range: yAxisRange,
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
    chartAreaSize.width,
    chartAreaSize.height,
    cssVar,
    yAxisRange,
    chartXaxis,
    systemUnit,
    t,
    tooltipPlugin,
  ]);

  if (!chartData || chartData.length === 0) {
    return (
      <ChartContainer isLoading={isLoading} title={t("title")}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      isLoading={isLoading}
      title={t("title")}
      tools={
        <ChartToolContainer>
          <ChartExpandDialog title={t("title")} triggerLabel={t("expand")}>
            <ExpandedElevationChart
              rows={formattedRows}
              isLoading={isLoading}
              chartXaxis={chartXaxis}
              systemUnit={systemUnit}
              title={t("title")}
              noDataLabel={t("noData")}
            />
          </ChartExpandDialog>
        </ChartToolContainer>
      }
    >
      <div ref={chartAreaRef} className="absolute inset-0">
        <div ref={chartWrapperRef}>
          {uplotOptions && (
            <MemoUplotReact options={uplotOptions} data={uplotData} />
          )}
        </div>
        {tooltip}
      </div>
    </ChartContainer>
  );
};

export { OverviewElevationChart };
