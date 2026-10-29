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
import {
  createAverageLinePlugin,
  createInnerYAxisLabelsPlugin,
} from "@/components/charts/uplot/uPlotPlugins";
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
import { useQuery } from "@tanstack/react-query";
import { fetchActivity } from "@/api/activities";
import {
  aggregateMetricData,
  calculateYAxisRange,
  getMetricColor,
} from "@/lib/chart-data-utils";
import { queryKeys } from "@/lib/query-keys";
import ChartToolContainer from "./chart-tool-container";
import ChartExpandDialog from "./chart-expand-dialog";
import { useActivityAnalysisLink } from "../activity-analysis-link-context";

interface OverviewCadenceChartProps {
  activityId: string;
  expanded?: boolean;
}

const MemoUplotReact = memo(UplotReact);

const OverviewCadenceChart: React.FC<OverviewCadenceChartProps> = ({
  activityId,
  expanded = false,
}) => {
  const t = useTranslations("CadenceChart");
  const { chartXaxis, systemUnit } = useStore((state) => state);
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "cadence",
  );

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity.detail(activityId),
    queryFn: () => fetchActivity(activityId),
    enabled: !!activityId,
  });

  const unit = activity?.sportType === "CYCLING" ? "rpm" : "spm";
  const isRun = activity?.sportType === "RUN";
  const title = isRun ? t("runningTitle") : t("title");

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();
  const { setHoveredDistanceM } = useActivityAnalysisLink();

  const chartData = useMemo(() => {
    const mainRows = data?.rows || [];
    if (mainRows.length === 0) return [];

    // Format time to elapsed seconds
    const formattedRows = formatTimeToElapsed(mainRows);

    // Apply multiplier for Run (if needed)
    const processedRows = formattedRows.map((row) => ({
      ...row,
      cadence: Number(row.cadence || 0) * (isRun ? 2 : 1),
    }));

    return aggregateMetricData(
      processedRows as Record<string, unknown>[],
      1,
      "cadence",
    );
  }, [data, isRun]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (chartData.length === 0) return [[], []];

    const xVals = chartData.map((d) =>
      chartXaxis === "distance" ? Number(d.distance || 0) : Number(d.time),
    );

    return [xVals, chartData.map((d) => d.avg)];
  }, [chartData, chartXaxis]);
  const averageValue = useMemo(
    () =>
      chartData.length > 0
        ? chartData.reduce((sum, point) => sum + point.avg, 0) /
          chartData.length
        : 0,
    [chartData],
  );

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
      const barColor = getMetricColor("cadence");

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
              </div>
            </div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground mt-1">
              {title}: {Math.round(avgVal ?? 0)} {unit}
            </div>
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [uplotData, chartXaxis, unit, title, chartData, setHoveredDistanceM],
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
    const multiplier = isRun ? 2 : 1;

    const { min, max } = calculateYAxisRange(
      rawMin * multiplier,
      rawMax * multiplier,
      "cadence",
    );
    return [min, max] as [number, number];
  }, [data, isRun]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const barColor = getMetricColor("cadence");

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
          stroke: barColor,
          fill: `${barColor}16`,
          width: 1.5,
          points: { show: false },
        },
      ],
      plugins: [
        tooltipPlugin,
        innerYAxisLabelsPlugin,
        createAverageLinePlugin({
          value: averageValue,
          color: barColor,
          label: `${t("average")} ${Math.round(averageValue)} ${unit}`,
        }),
      ],
    };
  }, [
    chartAreaSize,
    cssVar,
    title,
    tooltipPlugin,
    chartXaxis,
    systemUnit,
    yAxisRange,
    averageValue,
    t,
    unit,
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
      <ChartContainer isLoading={isLoading} title={title}>
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
      title={title}
      tools={
        <ChartToolContainer>
          <ChartExpandDialog title={title}>
            <OverviewCadenceChart activityId={activityId} expanded />
          </ChartExpandDialog>
        </ChartToolContainer>
      }
    >
      {chartNode}
    </ChartContainer>
  );
};

export default OverviewCadenceChart;
