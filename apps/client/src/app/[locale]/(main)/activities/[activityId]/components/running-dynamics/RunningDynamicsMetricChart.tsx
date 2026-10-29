"use client";

import React, { memo, useCallback, useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import { useActivityMetricSeries } from "@/api/useActivityMetric";
import {
  useCssVarResolver,
  useElementSize,
} from "@/components/charts/uplot/useElementSize";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  createAverageLinePlugin,
  createInnerYAxisLabelsPlugin,
} from "@/components/charts/uplot/uPlotPlugins";
import {
  createAxes,
  DEFAULT_CURSOR,
  DEFAULT_LEGEND,
  DEFAULT_PADDING,
  resolveAxisColors,
} from "@/components/charts/uplot/uPlotConfig";
import {
  aggregateMetricData,
  calculateYAxisRange,
  getMetricColor,
} from "@/lib/chart-data-utils";
import { useStore } from "@/lib/store";
import { formatTimeToElapsed } from "@/utils/downsample";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import ChartContainer from "../charts/activity-chart-container";
import ChartExpandDialog from "../charts/chart-expand-dialog";
import ChartToolContainer from "../charts/chart-tool-container";

type DynamicsChartMetric =
  | "verticalOscillation"
  | "verticalRatio"
  | "flightTime"
  | "flightRatio";

interface RunningDynamicsMetricChartProps {
  activityId: string;
  metric: DynamicsChartMetric;
  unit: string;
  divisor?: number;
  digits?: number;
  expanded?: boolean;
}

const MemoUplotReact = memo(UplotReact);

export default function RunningDynamicsMetricChart({
  activityId,
  metric,
  unit,
  divisor = 1,
  digits = 0,
  expanded = false,
}: RunningDynamicsMetricChartProps) {
  const t = useTranslations("RunningDynamicsPage");
  const title = t(`metrics.${metric}`);
  const { chartXaxis, systemUnit } = useStore((state) => state);
  const { data, isLoading } = useActivityMetricSeries(activityId, metric);
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  const chartData = useMemo(() => {
    if (!data?.rows.length) return [];
    const elapsedRows = formatTimeToElapsed(data.rows).map((row) => ({
      ...row,
      [metric]: Number(row[metric]) / divisor,
    }));
    return aggregateMetricData(
      elapsedRows as Record<string, unknown>[],
      1,
      metric,
    );
  }, [data, divisor, metric]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    const xValues = chartData.map((point) =>
      chartXaxis === "distance" ? point.distance : point.time,
    );
    return [xValues, chartData.map((point) => point.avg)];
  }, [chartData, chartXaxis]);
  const averageValue = useMemo(
    () =>
      chartData.length > 0
        ? chartData.reduce((sum, point) => sum + point.avg, 0) /
          chartData.length
        : 0,
    [chartData],
  );

  const formatValue = useCallback(
    (value: number) => `${value.toFixed(digits)} ${unit}`,
    [digits, unit],
  );

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      const xValue = Number(uplotData[0][idx] ?? 0);
      const value = Number(uplotData[1][idx] ?? 0);
      const position =
        chartXaxis === "distance"
          ? `${(xValue / 1000).toFixed(2)} km`
          : formatSecondsToTime(xValue, { showHours: true });
      const color = getMetricColor(metric);

      contentEl.innerHTML = renderToStaticMarkup(
        <>
          <div className="font-medium">{position}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-micro"
              style={{ backgroundColor: color }}
            />
            <span className="font-mono font-medium tabular-nums">
              {formatValue(value)}
            </span>
          </div>
        </>,
      );
    },
    [chartXaxis, formatValue, metric, uplotData],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const options = useMemo<uPlot.Options>(() => {
    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const color = getMetricColor(metric);
    const values = chartData.flatMap((point) => [point.min, point.max]);
    const minValue = values.length ? Math.min(...values) : 0;
    const maxValue = values.length ? Math.max(...values) : 100;
    const yRange = calculateYAxisRange(minValue, maxValue, metric);

    return {
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      padding: DEFAULT_PADDING,
      cursor: DEFAULT_CURSOR,
      legend: DEFAULT_LEGEND,
      series: [
        {},
        {
          label: title,
          stroke: color,
          fill: `${color}16`,
          width: 1.5,
          points: { show: false },
        },
      ],
      scales: { x: { time: false }, y: { range: [yRange.min, yRange.max] } },
      axes: createAxes({ axisStroke, gridStroke, chartXaxis, systemUnit }),
      plugins: [
        tooltipPlugin,
        createInnerYAxisLabelsPlugin({
          axisStroke,
          formatValue: (value) => value.toFixed(digits),
        }),
        createAverageLinePlugin({
          value: averageValue,
          color,
          label: `${t("average")} ${formatValue(averageValue)}`,
        }),
      ],
    } as unknown as uPlot.Options;
  }, [
    chartAreaSize.height,
    chartAreaSize.width,
    chartData,
    chartXaxis,
    cssVar,
    digits,
    averageValue,
    formatValue,
    metric,
    systemUnit,
    title,
    t,
    tooltipPlugin,
  ]);

  if (!data?.rows.length) return null;

  const chartNode = (
    <div ref={chartAreaRef} className="absolute inset-0">
      <div ref={chartWrapperRef}>
        <MemoUplotReact options={options} data={uplotData} />
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
      title={title}
      isLoading={isLoading}
      tools={
        <ChartToolContainer>
          <ChartExpandDialog title={title}>
            <RunningDynamicsMetricChart
              activityId={activityId}
              metric={metric}
              unit={unit}
              divisor={divisor}
              digits={digits}
              expanded
            />
          </ChartExpandDialog>
        </ChartToolContainer>
      }
    >
      {chartNode}
    </ChartContainer>
  );
}
