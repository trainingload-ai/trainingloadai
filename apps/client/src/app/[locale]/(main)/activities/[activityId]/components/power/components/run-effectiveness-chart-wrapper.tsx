"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import ThemeLogo from "@/components/ui/ThemeLogo";
import CardLoader from "@/components/ui/CardLoader";
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
  DEFAULT_LEGEND,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";

const MemoUplotReact = React.memo(UplotReact);

const RunEffectivenessChartWrapper: React.FC = () => {
  const activityId = useActivityId();
  const { chartXaxis, systemUnit } = useStore();
  const { data, isLoading } = useActivityMetricSeries(activityId || "", "re");

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
      const v = Number(d.re ?? 0);
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
            跑步效果: {Number(val ?? 0).toFixed(2)} kg/N
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
    const lineColor = cssVar("var(--chart-3)") || "#6366f1";

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
      legend: DEFAULT_LEGEND,
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

  const avg = data?.metadata?.avg;

  return (
    <Card>
      <CardContent className="p-2 lg:p-2 flex flex-col gap-2">
        {isLoading && <CardLoader />}
        <div className="flex items-center justify-between px-2 md:px-0">
          <div className="flex items-center space-x-4">
          <ThemeLogo width={120} height={20} />
          </div>
          <div className="flex gap-4 align-center items-center">
            {avg != null && avg !== "" && (
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                平均: {Number(avg).toFixed(2)} W/bpm
              </div>
            )}
            <div className="text-sm">跑步效果</div>
          </div>
        </div>
        <div className="h-[240px] md:h-[290px] relative" ref={chartAreaRef}>
          <div ref={chartWrapperRef}>
            {options.width > 0 && options.height > 0 && (
              <MemoUplotReact options={options} data={uplotData} />
            )}
          </div>
          {tooltip}
        </div>
      </CardContent>
    </Card>
  );
};

export default RunEffectivenessChartWrapper;
