"use client";

import React, { useMemo, useCallback, useRef } from "react";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import { useActivityId } from "@/hooks/useActivityId";
import { useHeartRateZones } from "@/api/use-heart-rate";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useStore } from "@/lib/store";
import { formatBySettings } from "@/lib/utils";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import {
  createUplotOptions,
  createScales,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { getHeartRateZoneColor, POWER_ZONE_PALETTE } from "@/utils/util";
import ChartContainer from "@/components/ChartContainer";
import ChartInfo from "@/components/ChartInfo";

interface HeartRateTimeSeriesChartProps {
  // type: "MHR" | "LTHR" | "HRR";
  title?: string;
  description?: string;
}

const MemoUplotReact = React.memo(UplotReact);

/**
 * 心率时间序列图表组件
 * 显示心率随时间的变化趋势，包括心率范围和平均心率连线
 */
const HeartRateTimeSeriesChart: React.FC<HeartRateTimeSeriesChartProps> = ({
  // type,
  title = "",
  description,
}) => {
  const t = useTranslations("HeartRatePage");
  const activityId = useActivityId();

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();
  const chartXaxis = useStore((state) => state.chartXaxis);
  const systemUnit = useStore((state) => state.systemUnit);

  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "heartRate",
  );

  const { data: heartRateZones, isLoading: isLoadingZones } =
    useHeartRateZones(activityId);
  const avg = data?.metadata?.avg ?? undefined;

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!data?.rows || data.rows.length === 0) return [[], []];

    const xVals: number[] = [];
    const yVals: number[] = [];
    const startTime = data.rows[0].time
      ? new Date(data.rows[0].time).getTime() / 1000
      : 0;

    let lastX = -Infinity;

    data.rows.forEach((d) => {
      const timeVal = new Date(d.time!).getTime() / 1000 - startTime;
      const val = Number(d.heartRate || 0);

      let x = chartXaxis === "distance" ? Number(d.distance || 0) : timeVal;

      if (x <= lastX) {
        if (x === lastX) x += 0.00001;
        else return;
      }

      xVals.push(x);
      yVals.push(val);
      lastX = x;
    });

    return [xVals, yVals];
  }, [data, chartXaxis]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;
      const xVal = uplotData[0][idx];
      const val = uplotData[1][idx];
      const title = `${
        chartXaxis === "distance" ? t("tooltip.distance") : t("tooltip.time")
      }: ${
        chartXaxis === "distance"
          ? formatBySettings(xVal, "distance", { systemUnit })
          : formatSecondsToTime(xVal, { showHours: true })
      }`;
      const safeVal = val ?? 0;

      const color = getHeartRateZoneColor(
        safeVal,
        heartRateZones?.zones || [],
        POWER_ZONE_PALETTE,
      );
      const zoneIndex = heartRateZones?.zones?.findIndex(
        (z) =>
          z.min !== undefined &&
          z.max !== undefined &&
          safeVal >= z.min &&
          safeVal <= z.max,
      );
      const zoneLabel =
        zoneIndex !== undefined && zoneIndex >= 0
          ? `Z${zoneIndex + 1}`
          : undefined;

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            <div className="flex w-full flex-wrap gap-2 items-center">
              <div
                className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                style={{ "--color-bg": color } as React.CSSProperties}
              />
              <div className="flex flex-col">
                <div className="flex flex-1 justify-between leading-none items-center gap-4">
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {Math.round(val ?? 0)} bpm
                  </span>
                </div>
                {zoneLabel && (
                  <span className="text-[0.70rem] uppercase text-muted-foreground">
                    区间: {zoneLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [uplotData, heartRateZones, t, chartXaxis, systemUnit],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const avgLinePlugin = useMemo((): uPlot.Plugin => {
    return {
      hooks: {
        draw: [
          (u) => {
            if (!avg) return;
            const y = u.valToPos(Number(avg), "y", true);
            const ctx = u.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = "#9333ea";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(u.bbox.left, y);
            ctx.lineTo(u.bbox.left + u.bbox.width, y);
            ctx.stroke();

            if (u.bbox.width < 480) {
              ctx.restore();
              return;
            }

            const text = `${t("average")}: ${avg} bpm`;

            // Handle HiDPI scaling for font size
            const dpr = window.devicePixelRatio || 1;
            // Use 12px as base size, scaled by DPR
            const fontSize = 12 * dpr;
            ctx.font = `600 ${fontSize}px sans-serif`;

            const textWidth = ctx.measureText(text).width;
            // Adjust offsets by DPR
            const padding = 6 * dpr;
            const textX = u.bbox.left + u.bbox.width - textWidth - padding;
            const textY = y + 16 * dpr; // below the line

            // Ensure label doesn't go out of bounds bottom
            const bottomEdge = u.bbox.top + u.bbox.height;
            const finalY = textY > bottomEdge ? y - padding : textY;

            const labelStroke = cssVar("var(--background)");
            ctx.lineWidth = 3 * dpr;
            ctx.strokeStyle =
              labelStroke.startsWith("#") ||
              labelStroke.startsWith("rgb") ||
              labelStroke.startsWith("hsl") ||
              labelStroke.startsWith("oklch")
                ? labelStroke
                : `hsl(${labelStroke})`;
            ctx.strokeText(text, textX, finalY);
            ctx.fillStyle = "#9333ea";
            ctx.fillText(text, textX, finalY);

            ctx.restore();
          },
        ],
      },
    };
  }, [avg, cssVar, t]);

  const options = useMemo(() => {
    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => Math.round(v).toString(),
    });

    return createUplotOptions({
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      series: [
        {},
        {
          stroke: (u: uPlot) => {
            if (!heartRateZones || heartRateZones.zones.length === 0)
              return "#ef4444";

            if (
              !u.bbox ||
              !Number.isFinite(u.bbox.top) ||
              !Number.isFinite(u.bbox.height) ||
              u.bbox.height <= 0
            ) {
              return "#ef4444";
            }

            const min = u.scales.y?.min ?? 0;
            const max = u.scales.y?.max ?? 220;
            const range = max - min;

            if (range <= 0) return "#ef4444";

            const gradient = u.ctx.createLinearGradient(
              0,
              u.bbox.top,
              0,
              u.bbox.top + u.bbox.height,
            );

            const getStop = (val: number) => {
              const stop = 1 - (val - min) / range;
              return Math.max(0, Math.min(1, stop));
            };

            heartRateZones?.zones.forEach((z, i) => {
              const color =
                POWER_ZONE_PALETTE[i] ||
                POWER_ZONE_PALETTE[POWER_ZONE_PALETTE.length - 1];
              const topStop = getStop(z?.max || 0);
              const bottomStop = getStop((z?.min || 0) + 0.0001);

              gradient.addColorStop(topStop, color);
              gradient.addColorStop(bottomStop, color);
            });

            return gradient;
          },
          width: 2,
          fill: undefined,
          paths: uPlot.paths.spline!(),
          points: { show: false },
        },
      ],
      scales: createScales(10),
      axes: createAxes({
        axisStroke,
        gridStroke,
        chartXaxis,
        systemUnit,
      }),
      plugins: [tooltipPlugin, avgLinePlugin, innerYAxisLabelsPlugin],
    });
  }, [
    chartAreaSize,
    tooltipPlugin,
    avgLinePlugin,
    cssVar,
    heartRateZones,
    chartXaxis,
    systemUnit,
  ]);

  return (
    <ChartContainer
      title={title}
      appearance="activity-detail"
      infoContent={
        description ? (
          <ChartInfo title={title}>{description}</ChartInfo>
        ) : undefined
      }
      isLoading={isLoading || isLoadingZones}
    >
      <div ref={chartAreaRef} className="absolute inset-0">
        <div ref={chartWrapperRef}>
          {options.width > 0 && options.height > 0 && (
            <MemoUplotReact options={options} data={uplotData} />
          )}
        </div>
        {tooltip}
      </div>
    </ChartContainer>
  );
};

export default HeartRateTimeSeriesChart;
