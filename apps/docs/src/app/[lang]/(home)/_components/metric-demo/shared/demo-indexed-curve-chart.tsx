"use client";

import * as React from "react";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTheme } from "next-themes";

import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { createInnerYAxisTickDesign } from "@/components/charts/uplot/uPlotPlugins";
import { DEFAULT_LEGEND, DEFAULT_PADDING } from "@/components/charts/uplot/uPlotConfig";
import { useElementSize } from "@/components/charts/uplot/useElementSize";

import { DemoChartContainer } from "./demo-chart-container";
import {
  DEMO_UPLOT_CURSOR,
  renderDemoTooltipHtml,
} from "./demo-uplot-interactive";

const MemoUplotReact = React.memo(UplotReact);

type IndexedSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
  dash?: number[];
};

export function DemoIndexedCurveChart({
  title,
  labels,
  series,
  formatYValue,
  referenceLines,
  noDataLabel,
}: {
  title: string;
  labels: string[];
  series: IndexedSeries[];
  formatYValue?: (value: number) => string;
  referenceLines?: Array<{ value: number; color: string; label: string }>;
  noDataLabel?: string;
}) {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gridColor = isDark ? "#404040" : "#e5e5e5";
  const tickColor = isDark ? "#a3a3a3" : "#737373";
  const defaultFormatValue = React.useCallback(
    (value: number) => String(Math.round(value)),
    [],
  );
  const formatValue = formatYValue ?? defaultFormatValue;

  const plotData = React.useMemo(() => {
    if (!labels.length || !series.length) return null;
    const xValues = labels.map((_, index) => index);
    const yValues = series.map((item) => item.values);
    return [xValues, ...yValues] as uPlot.AlignedData;
  }, [labels, series]);

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: ({ idx, contentEl }) => {
      const label = labels[idx] ?? "";
      contentEl.innerHTML = renderDemoTooltipHtml(
        label,
        series.map((item) => ({
          label: item.label,
          color: item.color,
          value: formatValue(item.values[idx] ?? 0),
        })),
      );
    },
  });

  const options = React.useMemo((): uPlot.Options | null => {
    const { width, height } = size;
    if (width <= 0 || height <= 0 || !plotData) return null;

    const { axes, plugins } = createInnerYAxisTickDesign({
      axisStroke: tickColor,
      gridStroke: gridColor,
      tickCount: 4,
      fontSizePx: 12,
      formatXValue: (value) => labels[Math.round(value)] ?? "",
      formatYValue: formatValue,
    });

    axes[0].space = (_self, _axisIdx, _scaleMin, _scaleMax, plotDim) =>
      plotDim / 7;

    const refLinePlugin: uPlot.Plugin = {
      hooks: {
        draw: (chart) => {
          if (!referenceLines?.length || !chart.bbox) return;
          const ctx = chart.ctx;
          const bbox = chart.bbox;
          ctx.save();
          for (const line of referenceLines) {
            const y = chart.valToPos(line.value, "y", true);
            if (y < bbox.top || y > bbox.top + bbox.height) continue;
            ctx.strokeStyle = line.color;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(bbox.left, y);
            ctx.lineTo(bbox.left + bbox.width, y);
            ctx.stroke();
          }
          ctx.restore();
        },
      },
    };

    return {
      width,
      height,
      mode: 1,
      padding: DEFAULT_PADDING,
      plugins: [...plugins, refLinePlugin, tooltipPlugin],
      series: [
        {},
        ...series.map((item) => ({
          label: item.label,
          stroke: item.color,
          width: 2,
          dash: item.dash,
          paths: uPlot.paths.spline!(),
          points: { show: false },
        })),
      ],
      axes,
      cursor: DEMO_UPLOT_CURSOR,
      legend: DEFAULT_LEGEND,
    };
  }, [
    size,
    plotData,
    series,
    labels,
    tickColor,
    gridColor,
    formatValue,
    referenceLines,
    tooltipPlugin,
  ]);

  if (!series.length) {
    return (
      <DemoChartContainer title={title}>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {noDataLabel ?? "No data"}
        </div>
      </DemoChartContainer>
    );
  }

  return (
    <DemoChartContainer title={title}>
      <div ref={containerRef} className="relative h-full w-full">
        <div ref={chartWrapperRef} className="relative h-full w-full">
          {options && plotData ? (
            <MemoUplotReact options={options} data={plotData} />
          ) : null}
          {tooltip}
        </div>
      </div>
    </DemoChartContainer>
  );
}
