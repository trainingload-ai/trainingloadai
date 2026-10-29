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

interface FormChartProps {
  data: PMCData[];
  isLoading?: boolean;
  error?: Error | null;
}

const MemoUplotReact = memo(UplotReact);

/**
 * Form (TSB) 图表组件
 * 显示训练应力平衡的变化趋势
 */
const FormChart: React.FC<FormChartProps> = ({
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
    const yVals = chartData.map((d) => Math.round(d.form * 10) / 10);
    return [xVals, yVals];
  }, [chartData]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const dateStr = chartData[idx]?.date;
      const form = chartData[idx]?.form;

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
                    "--color-bg": resolveColor("--slate-400"),
                    "--color-border": resolveColor("--slate-400"),
                  } as React.CSSProperties
                }
              />
              <div className="flex flex-1 justify-between leading-none items-center gap-4">
                <div className="grid gap-1.5">
                  <span className="text-muted-foreground">
                    {t("form.title")}
                  </span>
                </div>
                <span className="text-foreground font-mono font-medium tabular-nums">
                  {typeof form === "number" ? Math.round(form * 10) / 10 : "-"}
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

  const zeroLinePlugin = useMemo((): uPlot.Plugin => {
    return {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            const yPos = u.valToPos(0, "y", true);
            if (yPos === null || yPos === undefined) return;

            // Check if yPos is within the chart area
            if (yPos < u.bbox.top || yPos > u.bbox.top + u.bbox.height) return;

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = "#666";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(u.bbox.left, yPos);
            ctx.lineTo(u.bbox.left + u.bbox.width, yPos);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };
  }, []);

  const uplotPlugins = useMemo((): uPlot.Plugin[] => {
    return [tooltipPlugin, zeroLinePlugin];
  }, [tooltipPlugin, zeroLinePlugin]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const axisStroke = resolveColor("--muted-foreground");
    const gridStroke = resolveColor("--border");
    const lineStroke = resolveColor("--slate-400");

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
            // 确保 0 在视图中，并添加适当的内边距
            const lo = Math.min(min, 0);
            const hi = Math.max(max, 0);

            const span = hi - lo;
            const pad = span > 0 ? span * 0.1 : 5;

            return [lo - pad, hi + pad];
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
          label: t("form.title"),
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
            gradient.addColorStop(0, resolveColor("--slate-400", 0.2));
            gradient.addColorStop(1, resolveColor("--slate-400", 0));
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

export default FormChart;
