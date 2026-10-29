"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { useActivityId } from "@/hooks/useActivityId";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import { useStore } from "@/lib/store";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import UplotReact from "uplot-react";
import uPlot from "uplot";
import {
  createUplotOptions,
  createScales,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import ChartContainer from "@/components/ChartContainer";

const MemoUplotReact = React.memo(UplotReact);

const AerobicEfficiencyChartWrapper: React.FC = () => {
  const activityId = useActivityId();
  const { chartXaxis, systemUnit } = useStore();
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "aePower",
  );

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!data?.rows || data.rows.length === 0) return [[], []];

    const xVals: number[] = [];
    const yVals: number[] = [];
    const startTime = data.rows[0].time
      ? new Date(data.rows[0].time!).getTime() / 1000
      : 0;

    let lastX = -Infinity;

    data.rows.forEach((d) => {
      const t = new Date(d.time!).getTime() / 1000 - startTime;
      const v = Number(d.aePower || 0);
      let x = chartXaxis === "distance" ? Number(d.distance || 0) : t;

      if (x <= lastX) {
        if (x === lastX) x += 0.00001;
        else return;
      }

      xVals.push(x);
      yVals.push(v);
      lastX = x;
    });

    return [xVals, yVals];
  }, [data, chartXaxis]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;
      const xVal = uplotData[0][idx];
      const val = uplotData[1][idx];
      const title =
        chartXaxis === "distance"
          ? (Number(xVal) / 1000).toFixed(2) + " km"
          : formatSecondsToTime(xVal, { showHours: true });

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="mt-1 text-mobile-caption pc:text-xs">
            有氧效率: {Number(val ?? 0).toFixed(2)} W/bpm
          </div>
        </>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [uplotData, chartXaxis],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const options = useMemo<uPlot.Options>(() => {
    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");
    const lineColor = cssVar("var(--chart-2)") || "#22c55e";

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => v.toFixed(2),
    });

    return createUplotOptions({
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      cursor: {
        points: {
          size: 6,
          fill: lineColor,
        },
      },
      legend: { show: false },
      series: [
        {},
        {
          stroke: lineColor,
          width: 2,
          fill: undefined,
          points: { show: false },
        },
      ],
      scales: createScales(0, true),
      axes: createAxes({
        chartXaxis,
        systemUnit,
        axisStroke,
        gridStroke,
      }),
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    });
  }, [chartAreaSize, tooltipPlugin, cssVar, chartXaxis, systemUnit]);

  // const avg = data?.metadata?.avg;

  return (
    <ChartContainer isLoading={isLoading} title="有氧效率" ref={chartAreaRef}>
      <div ref={chartWrapperRef}>
        {options.width > 0 && options.height > 0 && (
          <MemoUplotReact options={options} data={uplotData} />
        )}
      </div>
      {tooltip}
    </ChartContainer>
  );
};

export default AerobicEfficiencyChartWrapper;
