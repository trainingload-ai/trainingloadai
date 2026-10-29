"use client";

import { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  useElementSize,
  useThemeColor,
} from "@/components/charts/uplot/useElementSize";
import type { PMCData } from "@/api/usePMC";
import { formatter } from "@/lib/utils";
import ChartContainer from "@/components/ChartContainer";

interface FitnessChartProps {
  data: PMCData[];
  isLoading?: boolean;
  error?: Error | null;
}

const MemoUplotReact = memo(UplotReact);

/**
 * Fitness (CTL) 图表组件
 * 显示长期训练负荷的变化趋势
 */
const FitnessChart: React.FC<FitnessChartProps> = ({
  data,
  isLoading = false,
  error = null,
}) => {
  const t = useTranslations("PMC");
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const resolveColor = useThemeColor();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data;
  }, [data]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (chartData.length === 0) return [[], []];
    const xVals = chartData.map((d) => new Date(d.date).getTime() / 1000);
    const yVals = chartData.map((d) => Math.round(d.fitness * 10) / 10);
    return [xVals, yVals];
  }, [chartData]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const dateStr = chartData[idx]?.date;
      const fitness = chartData[idx]?.fitness;

      const title = dateStr ? formatter("timeByDay", dateStr) : "";

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            <div className="flex w-full flex-wrap items-stretch gap-2 items-center">
              <div
                className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                style={
                  {
                    "--color-bg": resolveColor("--sky-500"),
                    "--color-border": resolveColor("--sky-500"),
                  } as React.CSSProperties
                }
              />
              <div className="flex flex-1 justify-between leading-none items-center gap-4">
                <div className="grid gap-1.5">
                  <span className="text-muted-foreground">
                    {t("fitness.title")}
                  </span>
                </div>
                <span className="text-foreground font-mono font-medium tabular-nums">
                  {typeof fitness === "number"
                    ? Math.round(fitness * 10) / 10
                    : "-"}
                </span>
              </div>
            </div>
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [chartData, resolveColor, t],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const uplotPlugins = useMemo((): uPlot.Plugin[] => {
    return [tooltipPlugin];
  }, [tooltipPlugin]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const axisStroke = resolveColor("--muted-foreground");
    const gridStroke = resolveColor("--border");
    const lineStroke = resolveColor("--sky-500");

    return {
      width,
      height,
      legend: { show: false },
      padding: [12, 0, 0, 0],
      cursor: {
        y: false,
        drag: {
          x: true,
          y: false,
          setScale: true,
        },
      },
      scales: {
        x: {
          time: true,
        },
        y: {
          auto: true,
          range: (_u, min, max) => {
            const span = max - min;
            const pad = span > 0 ? span * 0.1 : 10;
            return [0, max + pad];
          },
        },
      },
      axes: [
        {
          stroke: axisStroke,
          grid: { show: false },
          font: "12px sans-serif",
          gap: 8,
          space: 60,
          values: [
            // tick incr          default           year                             month    day                        hour     min      sec       mode
            [3600 * 24 * 365, "{YYYY}", null, null, null, null, null, null, 1],
            [
              3600 * 24 * 28,
              "{MMM}",
              "\n{YYYY}",
              null,
              null,
              null,
              null,
              null,
              1,
            ],
            [3600 * 24, "{M}/{D}", "\n{YYYY}", null, null, null, null, null, 1],
            [
              3600,
              "{h}{aa}",
              "\n{M}/{D}/{YY}",
              null,
              "\n{M}/{D}",
              null,
              null,
              null,
              1,
            ],
            [
              60,
              "{h}:{mm}{aa}",
              "\n{M}/{D}/{YY}",
              null,
              "\n{M}/{D}",
              null,
              null,
              null,
              1,
            ],
            [
              1,
              ":{ss}",
              "\n{M}/{D}/{YY} {h}:{mm}{aa}",
              null,
              "\n{M}/{D} {h}:{mm}{aa}",
              null,
              null,
              null,
              1,
            ],
            [
              0.001,
              ":{ss}.{fff}",
              "\n{M}/{D}/{YY} {h}:{mm}{aa}",
              null,
              "\n{M}/{D} {h}:{mm}{aa}",
              null,
              null,
              null,
              1,
            ],
          ],
        },
        {
          stroke: axisStroke,
          grid: { show: true, stroke: gridStroke, width: 1, dash: [3, 3] },
          font: "12px sans-serif",
          size: 40,
          values: (_u, vals) => vals.map((v) => Math.round(v).toString()),
        },
      ],
      series: [
        {},
        {
          label: t("fitness.title"),
          width: 2,
          stroke: lineStroke,
          paths: uPlot.paths.spline!(),
          fill: (u) => {
            const gradient = u.ctx.createLinearGradient(
              0,
              u.bbox.top,
              0,
              u.bbox.top + u.bbox.height,
            );
            gradient.addColorStop(0, resolveColor("--sky-500", 0.2));
            gradient.addColorStop(1, resolveColor("--sky-500", 0));
            return gradient;
          },
          points: { show: false },
        },
      ],
      plugins: uplotPlugins,
    };
  }, [chartAreaSize, resolveColor, t, uplotPlugins]);

  if (error && (!data || data.length === 0)) {
    return (
      <ChartContainer isLoading={false}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer isLoading={isLoading}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer isLoading={isLoading}>
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

export default FitnessChart;
