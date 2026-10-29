"use client";

import React, { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  useElementSize,
  useThemeColor,
} from "@/components/charts/uplot/useElementSize";
import ChartContainer from "@/components/ChartContainer";
import type { PMCData } from "@/api/usePMC";
import { formatter } from "@/lib/utils";

interface PMCCombinedChartProps {
  data: PMCData[];
  isLoading?: boolean;
  error?: Error | null;
}

const MemoUplotReact = memo(UplotReact);

const toDayKey = (date: string) => {
  const dateText = String(date);
  const isoDay = dateText.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDay) return isoDay;

  const time = new Date(dateText).getTime();
  if (!Number.isFinite(time)) return dateText;

  return new Date(time).toISOString().slice(0, 10);
};

const roundOneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * PMC 集合图表组件
 * 显示 Fitness (CTL)、Fatigue (ATL) 和 Form (TSB) 三条线的组合图表
 */
const PMCCombinedChart: React.FC<PMCCombinedChartProps> = ({
  data,
  isLoading = false,
  error = null,
}) => {
  const t = useTranslations("PMC");
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const resolveColor = useThemeColor();
  const zoneHelp = {
    ariaLabel: t("zoneHelp.ariaLabel"),
    title: t("zoneHelp.title"),
    danger: t("zoneHelp.danger"),
    optimal: t("zoneHelp.optimal"),
    neutral: t("zoneHelp.neutral"),
    fresh: t("zoneHelp.fresh"),
    peak: t("zoneHelp.peak"),
    transition: t("zoneHelp.transition"),
  };
  const zoneHelpContent = (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={zoneHelp.ariaLabel}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{zoneHelp.title}</DialogTitle>
          <DialogDescription>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: "hsl(var(--red-400))" }}
                />
                <span>{zoneHelp.danger}</span>
              </p>
              <p className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: "hsl(var(--emerald-500))" }}
                />
                <span>{zoneHelp.optimal}</span>
              </p>
              <p className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: "hsl(var(--slate-300))" }}
                />
                <span>{zoneHelp.neutral}</span>
              </p>
              <p className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: "hsl(var(--sky-500))" }}
                />
                <span>{zoneHelp.fresh}</span>
              </p>
              <p className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: "hsl(var(--violet-500))" }}
                />
                <span>{zoneHelp.peak}</span>
              </p>
              <p className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: "hsl(var(--amber-500))" }}
                />
                <span>{zoneHelp.transition}</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );

  const tsbZoneColors = useMemo(() => {
    return {
      danger: resolveColor("--red-400", 0.16),
      optimal: resolveColor("--emerald-500", 0.16),
      neutral: resolveColor("--slate-300", 0.16),
      fresh: resolveColor("--sky-500", 0.16),
      peak: resolveColor("--violet-500", 0.16),
      transition: resolveColor("--amber-500", 0.16),
    };
  }, [resolveColor]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const byDay = new Map<string, PMCData>();

    data.forEach((item) => {
      const day = toDayKey(item.date);
      const load = Number.isFinite(item.value) ? item.value : 0;
      const existing = byDay.get(day);

      byDay.set(day, {
        ...item,
        date: day,
        value: (existing?.value ?? 0) + load,
      });
    });

    return Array.from(byDay.values()).sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [data]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (chartData.length === 0) return [[], [], [], [], []];
    const xVals = chartData.map((d) => new Date(d.date).getTime() / 1000);
    const loadVals = chartData.map((d) => roundOneDecimal(d.value));
    const fitnessVals = chartData.map((d) => roundOneDecimal(d.fitness));
    const fatigueVals = chartData.map((d) => roundOneDecimal(d.fatigue));
    const formVals = chartData.map((d) => roundOneDecimal(d.form));
    return [xVals, loadVals, fitnessVals, fatigueVals, formVals];
  }, [chartData]);

  const tsbZones = useMemo(
    () => [
      { y1: -1000, y2: -30, color: tsbZoneColors.danger },
      { y1: -30, y2: -10, color: tsbZoneColors.optimal },
      { y1: -10, y2: 5, color: tsbZoneColors.neutral },
      { y1: 5, y2: 15, color: tsbZoneColors.fresh },
      { y1: 15, y2: 25, color: tsbZoneColors.peak },
      { y1: 25, y2: 1000, color: tsbZoneColors.transition },
    ],
    [tsbZoneColors],
  );

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const dateStr = chartData[idx]?.date;
      const fitness = chartData[idx]?.fitness;
      const fatigue = chartData[idx]?.fatigue;
      const form = chartData[idx]?.form;
      const load = chartData[idx]?.value;

      const title = dateStr ? formatter("timeByDay", dateStr) : "";

      const items = [
        {
          label: t("load.title"),
          value: load,
          color: resolveColor("--purple-500", 0.55),
        },
        {
          label: t("fitness.title"),
          value: fitness,
          color: resolveColor("--sky-500"),
        },
        {
          label: t("fatigue.title"),
          value: fatigue,
          color: resolveColor("--violet-500"),
        },
        {
          label: t("form.title"),
          value: form,
          color: resolveColor("--slate-400"),
        },
      ];

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex w-full flex-wrap gap-2 items-center"
              >
                <div
                  className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                  style={
                    {
                      "--color-bg": item.color,
                      "--color-border": item.color,
                    } as React.CSSProperties
                  }
                />
                <div className="flex flex-1 justify-between leading-none items-center gap-4">
                  <div className="grid gap-1.5">
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof item.value === "number"
                      ? roundOneDecimal(item.value)
                      : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [chartData, t, resolveColor],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  // Plugin to draw TSB Zones and Reference Lines
  const backgroundPlugin = useMemo((): uPlot.Plugin => {
    return {
      hooks: {
        drawClear: [
          (u) => {
            const ctx = u.ctx;
            const { top, height, left, width } = u.bbox;

            ctx.save();

            // Draw TSB Zones
            tsbZones.forEach((zone) => {
              const y1Pos = u.valToPos(zone.y1, "y", true);
              const y2Pos = u.valToPos(zone.y2, "y", true);

              // Skip if completely out of view
              if (y1Pos === null || y2Pos === null) return;

              // Ensure coordinates are within bounds for filling
              // Note: y axis is inverted (top is 0), so y2 (higher value) has smaller y coordinate
              const topY = Math.max(top, Math.min(y1Pos, y2Pos));
              const bottomY = Math.min(top + height, Math.max(y1Pos, y2Pos));

              if (bottomY <= topY) return;

              ctx.fillStyle = zone.color;
              ctx.fillRect(left, topY, width, bottomY - topY);
            });

            // Draw Reference Lines
            const refLines = [-30, -10, 5, 25, 0];

            refLines.forEach((val) => {
              const yPos = u.valToPos(val, "y", true);
              if (yPos === null || yPos < top || yPos > top + height) return;

              ctx.beginPath();
              ctx.strokeStyle = val === 0 ? "#666" : "#999";
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 5]);
              ctx.moveTo(left, yPos);
              ctx.lineTo(left + width, yPos);
              ctx.stroke();
            });

            ctx.restore();
          },
        ],
      },
    };
  }, [tsbZones]);

  const uplotPlugins = useMemo((): uPlot.Plugin[] => {
    return [tooltipPlugin, backgroundPlugin];
  }, [tooltipPlugin, backgroundPlugin]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const axisStroke = resolveColor("--muted-foreground");
    // Grid is handled by backgroundPlugin (Ref Lines) and default grid hidden

    const lineStrokeFitness = resolveColor("--sky-500");
    const lineStrokeFatigue = resolveColor("--violet-500");
    const lineStrokeForm = resolveColor("--slate-400");
    const loadBarFill = resolveColor("--purple-500", 0.22);
    const loadValues = uplotData[1] as number[];
    const maxLoad = Math.max(
      1,
      ...loadValues.filter((value) => Number.isFinite(value)),
    );

    const drawLoadBars = (
      u: uPlot,
      seriesIdx: number,
      idx0: number,
      idx1: number,
    ) => {
      const { ctx } = u;
      const xs = u.data[0] as number[];
      const ys = u.data[seriesIdx] as number[];
      const { top } = u.bbox;
      const y0 = u.valToPos(0, "y", true);
      const availableHeight = Math.max(1, y0 - top);

      ctx.save();
      ctx.fillStyle = loadBarFill;

      for (let i = idx0; i <= idx1; i++) {
        const xVal = xs[i];
        const yVal = ys[i];
        if (!Number.isFinite(xVal) || !Number.isFinite(yVal) || yVal <= 0) {
          continue;
        }

        const xPos = u.valToPos(xVal, "x", true);
        const yPos = Math.max(
          top,
          y0 - (Math.min(yVal, maxLoad) / maxLoad) * availableHeight,
        );

        let intervalPx = 10;
        if (xs.length > 1) {
          const xPrev = i > 0 ? u.valToPos(xs[i - 1]!, "x", true) : null;
          const xNext =
            i < xs.length - 1 ? u.valToPos(xs[i + 1]!, "x", true) : null;
          const dPrev = xPrev != null ? Math.abs(xPos - xPrev) : Infinity;
          const dNext = xNext != null ? Math.abs(xNext - xPos) : Infinity;
          const d = Math.min(dPrev, dNext);
          if (Number.isFinite(d) && d > 0) intervalPx = d;
        }

        const barWidth = Math.max(2, Math.min(18, intervalPx * 0.58));
        const barHeight = Math.max(1, y0 - yPos);

        ctx.beginPath();
        ctx.roundRect(xPos - barWidth / 2, yPos, barWidth, barHeight, 2);
        ctx.fill();
      }

      ctx.restore();
      return null;
    };

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
            // Add some padding
            const span = max - min;
            const pad = span > 0 ? span * 0.1 : 10;
            return [Math.min(0, min - pad), max + pad];
          },
        },
        yLoad: {
          auto: false,
          range: () => [0, maxLoad * 1.15],
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
          grid: { show: false }, // Using custom reference lines instead
          font: "12px sans-serif",
          size: 40,
          values: (_u, vals) => vals.map((v) => Math.round(v).toString()),
        },
      ],
      series: [
        {},
        {
          label: t("load.title"),
          scale: "yLoad",
          width: 0,
          stroke: loadBarFill,
          fill: loadBarFill,
          paths: drawLoadBars,
          points: { show: false },
        },
        {
          label: t("fitness.title"),
          width: 2,
          stroke: lineStrokeFitness,
          paths: uPlot.paths.spline!(),
          points: { show: false },
        },
        {
          label: t("fatigue.title"),
          width: 2,
          stroke: lineStrokeFatigue,
          paths: uPlot.paths.spline!(),
          points: { show: false },
        },
        {
          label: t("form.title"),
          width: 2,
          stroke: lineStrokeForm,
          paths: uPlot.paths.spline!(),
          points: { show: false },
        },
      ],
      plugins: uplotPlugins,
    };
  }, [chartAreaSize, resolveColor, t, uplotData, uplotPlugins]);

  if (error && (!data || data.length === 0)) {
    return (
      <ChartContainer
        appearance="mobile-soft"
        ref={chartAreaRef}
        isLoading={false}
        height="h-[220px] md:h-[340px]"
        infoContent={zoneHelpContent}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer
        appearance="mobile-soft"
        ref={chartAreaRef}
        isLoading={isLoading}
        height="h-[220px] md:h-[340px]"
        infoContent={zoneHelpContent}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? "" : t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      appearance="mobile-soft"
      ref={chartAreaRef}
      isLoading={isLoading}
      height="h-[220px] md:h-[340px]"
      infoContent={zoneHelpContent}
    >
      <div className="absolute inset-0">
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

export default PMCCombinedChart;
