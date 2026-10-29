"use client";

import * as React from "react";
import dayjs from "dayjs";
import { HelpCircle } from "lucide-react";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTheme } from "next-themes";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { createInnerYAxisTickDesign } from "@/components/charts/uplot/uPlotPlugins";
import { DEFAULT_LEGEND, DEFAULT_PADDING } from "@/components/charts/uplot/uPlotConfig";
import { useElementSize } from "@/components/charts/uplot/useElementSize";
import { cn } from "@/lib/utils";

import { DemoChartContainer } from "../shared/demo-chart-container";
import {
  DEMO_UPLOT_CURSOR,
  renderDemoTooltipHtml,
} from "../shared/demo-uplot-interactive";
import type { MetricDemoCopy } from "../types";
import type { PmcDataPoint } from "../shared/demo-types";

const MemoUplotReact = React.memo(UplotReact);

function PmcSingleChart({
  title,
  data,
  field,
  color,
  fieldLabel,
}: {
  title: string;
  data: PmcDataPoint[];
  field: "fitness" | "fatigue" | "form";
  color: string;
  fieldLabel: string;
}) {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const plotData = React.useMemo(() => {
    if (!data.length) return null;
    return [
      data.map((point) => dayjs(point.date).unix()),
      data.map((point) => point[field]),
    ] as uPlot.AlignedData;
  }, [data, field]);

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: ({ idx, contentEl }) => {
      const point = data[idx];
      if (!point) return;
      contentEl.innerHTML = renderDemoTooltipHtml(
        dayjs(point.date).format("YYYY-MM-DD"),
        [
          {
            label: fieldLabel,
            color,
            value: point[field].toFixed(2),
          },
        ],
      );
    },
  });

  const options = React.useMemo((): uPlot.Options | null => {
    if (!plotData || size.width <= 0 || size.height <= 0) return null;
    const { axes, plugins } = createInnerYAxisTickDesign({
      axisStroke: isDark ? "#a3a3a3" : "#737373",
      gridStroke: isDark ? "#404040" : "#e5e5e5",
      tickCount: 4,
      fontSizePx: 12,
      formatXValue: (value) => dayjs(value * 1000).format("MM-DD"),
      formatYValue: (value) => value.toFixed(1),
    });
    return {
      width: size.width,
      height: size.height,
      padding: DEFAULT_PADDING,
      plugins: [...plugins, tooltipPlugin],
      axes,
      series: [
        {},
        {
          stroke: color,
          width: 2,
          paths: uPlot.paths.spline!(),
          points: { show: false },
        },
      ],
      cursor: DEMO_UPLOT_CURSOR,
      legend: DEFAULT_LEGEND,
    };
  }, [plotData, size, isDark, color, tooltipPlugin]);

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

export function PmcDemoCharts({
  copy,
  data,
  selected,
}: {
  copy: MetricDemoCopy;
  data: PmcDataPoint[];
  selected: "fitness" | "fatigue" | "form";
}) {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const zoneHelp = copy.pmc.zoneHelp;

  const plotData = React.useMemo(() => {
    if (!data.length) return null;
    return [
      data.map((point) => dayjs(point.date).unix()),
      data.map((point) => point.value),
      data.map((point) => point.fitness),
      data.map((point) => point.fatigue),
      data.map((point) => point.form),
    ] as uPlot.AlignedData;
  }, [data]);

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: ({ idx, contentEl }) => {
      const point = data[idx];
      if (!point) return;
      contentEl.innerHTML = renderDemoTooltipHtml(
        dayjs(point.date).format("YYYY-MM-DD"),
        [
          {
            label: copy.pmc.load.title,
            color: "#7c3aed",
            value: String(Math.round(point.value)),
          },
          {
            label: copy.pmc.abbr.fitness,
            color: "#0ea5e9",
            value: point.fitness.toFixed(1),
          },
          {
            label: copy.pmc.abbr.fatigue,
            color: "#8b5cf6",
            value: point.fatigue.toFixed(1),
          },
          {
            label: copy.pmc.abbr.form,
            color: "#94a3b8",
            value: point.form.toFixed(1),
          },
        ],
      );
    },
  });

  const options = React.useMemo((): uPlot.Options | null => {
    if (!plotData || size.width <= 0 || size.height <= 0) return null;
    const { axes, plugins } = createInnerYAxisTickDesign({
      axisStroke: isDark ? "#a3a3a3" : "#737373",
      gridStroke: isDark ? "#404040" : "#e5e5e5",
      tickCount: 4,
      fontSizePx: 12,
      formatXValue: (value) => dayjs(value * 1000).format("MM-DD"),
      formatYValue: (value) => value.toFixed(0),
    });

    const tsbPlugin: uPlot.Plugin = {
      hooks: {
        draw: (chart) => {
          if (!chart.bbox) return;
          const ctx = chart.ctx;
          const bbox = chart.bbox;
          const zones = [
            { y1: -1000, y2: -30, color: "rgba(248,113,113,0.16)" },
            { y1: -30, y2: -10, color: "rgba(16,185,129,0.16)" },
            { y1: -10, y2: 5, color: "rgba(148,163,184,0.16)" },
            { y1: 5, y2: 15, color: "rgba(14,165,233,0.16)" },
            { y1: 15, y2: 25, color: "rgba(139,92,246,0.16)" },
            { y1: 25, y2: 1000, color: "rgba(245,158,11,0.16)" },
          ];
          ctx.save();
          for (const zone of zones) {
            const yTop = chart.valToPos(zone.y2, "y", true);
            const yBottom = chart.valToPos(zone.y1, "y", true);
            ctx.fillStyle = zone.color;
            ctx.fillRect(bbox.left, yTop, bbox.width, yBottom - yTop);
          }
          ctx.restore();
        },
      },
    };

    return {
      width: size.width,
      height: size.height,
      padding: DEFAULT_PADDING,
      plugins: [...plugins, tsbPlugin, tooltipPlugin],
      axes,
      scales: {
        yLoad: { auto: true },
        y: { auto: true },
      },
      series: [
        {},
        {
          scale: "yLoad",
          stroke: "#7c3aed",
          fill: "rgba(124,58,237,0.35)",
          paths: uPlot.paths.bars!({ size: [0.6, 100] }),
        },
        { stroke: "#0ea5e9", width: 2, paths: uPlot.paths.spline!() },
        { stroke: "#8b5cf6", width: 2, paths: uPlot.paths.spline!() },
        { stroke: "#94a3b8", width: 2, paths: uPlot.paths.spline!() },
      ],
      cursor: DEMO_UPLOT_CURSOR,
      legend: DEFAULT_LEGEND,
    };
  }, [plotData, size, isDark, tooltipPlugin]);

  const help = (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={zoneHelp.ariaLabel}
        >
          <HelpCircle className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{zoneHelp.title}</DialogTitle>
          <DialogDescription className="space-y-2">
            <p>{zoneHelp.danger}</p>
            <p>{zoneHelp.optimal}</p>
            <p>{zoneHelp.neutral}</p>
            <p>{zoneHelp.fresh}</p>
            <p>{zoneHelp.peak}</p>
            <p>{zoneHelp.transition}</p>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex flex-col gap-3 px-1 md:gap-4">
      <div className="relative">
        {(["fitness", "fatigue", "form"] as const).map((type) => (
          <div
            key={type}
            className={cn(
              "transition-opacity duration-150",
              selected === type
                ? "relative opacity-100"
                : "absolute inset-0 opacity-0 pointer-events-none",
            )}
          >
            <PmcSingleChart
              title={
                type === "fitness"
                  ? copy.pmc.fitnessChart
                  : type === "fatigue"
                    ? copy.pmc.fatigueChart
                    : copy.pmc.formChart
              }
              fieldLabel={
                type === "fitness"
                  ? copy.pmc.fitness.title
                  : type === "fatigue"
                    ? copy.pmc.fatigue.title
                    : copy.pmc.form.title
              }
              data={data}
              field={type}
              color={
                type === "fitness"
                  ? "#0ea5e9"
                  : type === "fatigue"
                    ? "#8b5cf6"
                    : "#94a3b8"
              }
            />
          </div>
        ))}
      </div>

      <DemoChartContainer title={copy.pmc.combinedTitle} infoContent={help}>
        <div ref={containerRef} className="relative h-full w-full">
          <div ref={chartWrapperRef} className="relative h-full w-full">
            {options && plotData ? (
              <MemoUplotReact options={options} data={plotData} />
            ) : null}
            {tooltip}
          </div>
        </div>
      </DemoChartContainer>
    </div>
  );
}
