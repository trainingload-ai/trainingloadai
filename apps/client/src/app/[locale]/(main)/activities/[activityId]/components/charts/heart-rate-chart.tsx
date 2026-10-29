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
import { useHeartRateZones } from "@/api/use-heart-rate";
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
import {
  selectedIntervalRange,
  useActivityAnalysisLink,
} from "../activity-analysis-link-context";

interface OverviewHeartRateChartProps {
  activityId: string;
  expanded?: boolean;
}

const MemoUplotReact = memo(UplotReact);

const OverviewHeartRateChart: React.FC<OverviewHeartRateChartProps> = ({
  activityId,
  expanded = false,
}) => {
  const t = useTranslations("HeartRateChart");
  const { chartXaxis, systemUnit } = useStore((state) => state);
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "heartRate",
  );
  const { data: heartRateZoneData } = useHeartRateZones(activityId);

  const unit = "bpm";

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();
  const { selectedInterval, setHoveredDistanceM } = useActivityAnalysisLink();
  const selectedRange = selectedIntervalRange(
    selectedInterval,
    chartXaxis,
    "hr",
  );

  const chartData = useMemo(() => {
    const mainRows = data?.rows || [];
    if (mainRows.length === 0) return [];

    // Format time to elapsed seconds
    const formattedRows = formatTimeToElapsed(mainRows);

    return aggregateMetricData(
      formattedRows as Record<string, unknown>[],
      1,
      "heartRate",
    );
  }, [data]);

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
      const avgVal = uplotData[1][idx];

      const title =
        chartXaxis === "distance"
          ? (Number(timeVal) / 1000).toFixed(2) + " km"
          : formatSecondsToTime(Number(timeVal));

      const safeVal = avgVal ?? 0;
      const barColor = getMetricColor("heartRate");
      const zoneIndex = heartRateZoneData?.zones
        ? heartRateZoneData.zones.findIndex(
            (z) => safeVal >= (z.min || 0) && safeVal <= (z.max || 300),
          )
        : -1;
      const zoneLabel =
        zoneIndex >= 0 ? heartRateZoneData?.zones[zoneIndex].name : undefined;

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
                    {Math.round(safeVal)} {unit}
                  </span>
                </div>
                {zoneLabel && (
                  <span className="text-[0.70rem] uppercase text-muted-foreground">
                    {zoneLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground mt-1">
              {t("title")}: {Math.round(avgVal ?? 0)} {unit}
            </div>
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [
      uplotData,
      chartXaxis,
      unit,
      heartRateZoneData?.zones,
      t,
      chartData,
      setHoveredDistanceM,
    ],
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

    const { min, max } = calculateYAxisRange(rawMin, rawMax, "heartRate");
    return [min, max] as [number, number];
  }, [data]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const barColor = getMetricColor("heartRate");

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
        x: {
          time: false,
          range: selectedRange ? () => selectedRange : undefined,
        },
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
    chartAreaSize,
    cssVar,
    t,
    tooltipPlugin,
    chartXaxis,
    systemUnit,
    yAxisRange,
    selectedRange,
  ]);

  if (!chartData || chartData.length === 0) {
    if (expanded) {
      return (
        <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      );
    }

    return (
      <ChartContainer isLoading={isLoading} title={t("title")}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      </ChartContainer>
    );
  }

  const chartNode = (
    <div ref={chartAreaRef} className="absolute inset-0">
      <div ref={chartWrapperRef}>
        {uplotOptions && (
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
      isLoading={isLoading}
      title={t("title")}
      tools={
        <ChartToolContainer>
          <ChartExpandDialog title={t("title")}>
            <OverviewHeartRateChart activityId={activityId} expanded />
          </ChartExpandDialog>
        </ChartToolContainer>
      }
    >
      {chartNode}
    </ChartContainer>
  );
};

export default OverviewHeartRateChart;
