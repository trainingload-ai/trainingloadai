"use client";

import React, { useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { MetricSeriesResult } from "@/api/useActivityMetric";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { PowerZoneValue } from "@/api/use-power";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { getPowerZoneColor, POWER_ZONE_PALETTE } from "@/utils/util";
import { ChartXaxis, useStore } from "@/lib/store";
import {
  createUplotOptions,
  createScales,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";

interface PowerPointChartProps {
  zones?: PowerZoneValue[];
  data?: MetricSeriesResult;
  showYAxis?: boolean;
  xAxisType?: ChartXaxis;
}

const MemoUplotReact = React.memo(UplotReact);

/**
 * 功率时间序列图表组件 (Refactored to uPlot)
 */
const PowerPointChart: React.FC<PowerPointChartProps> = ({
  zones = [],
  data,
  xAxisType = "time",
}) => {
  const t = useTranslations("ActivityPowerPage");
  const { systemUnit } = useStore();
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  // Prepare uPlot data
  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!data?.rows || data.rows.length === 0) return [[], []];

    const xVals: number[] = [];
    const yVals: number[] = [];
    const startTime = data.rows[0].time
      ? new Date(data.rows[0].time).getTime() / 1000
      : 0;

    let lastX = -Infinity;

    data.rows.forEach((d) => {
      if (d.power === undefined || d.power === null) return;
      let x = 0;
      if (xAxisType === "distance") {
        x = Number(d.distance || 0);
      } else {
        const time = new Date(d.time!).getTime() / 1000 - startTime;
        x = time;
      }

      const val = Number(d.power);

      if (x <= lastX) {
        if (x === lastX) x += 0.00001;
        else return;
      }

      xVals.push(x);
      yVals.push(val);
      lastX = x;
    });

    return [xVals, yVals];
  }, [data, xAxisType]);

  // Transform zones for gradient helper
  const powerZones = useMemo(() => {
    return (zones || [])
      .map((z) => ({
        min: z?.min ?? 0,
        max: z?.max ?? Infinity,
        color:
          getPowerZoneColor(
            (z?.min ?? 0) + 1,
            zones,
            POWER_ZONE_PALETTE,
            z?.color ?? POWER_ZONE_PALETTE[0],
          ) || POWER_ZONE_PALETTE[0],
      }))
      .sort((a, b) => a.min - b.min);
  }, [zones]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;
      const xVal = uplotData[0][idx];
      const val = uplotData[1][idx];
      const title =
        xAxisType === "distance"
          ? `${(xVal / 1000).toFixed(2)} km`
          : formatSecondsToTime(xVal, { showHours: true });
      const safeVal = val ?? 0;

      // Find zone
      const zoneIndex = powerZones.findIndex(
        (z) => safeVal >= z.min && safeVal < z.max, // Use < for max to avoid overlap ambiguity
      );
      // If not found (e.g. max value), check if it's in the last zone
      const effectiveZoneIndex =
        zoneIndex >= 0
          ? zoneIndex
          : powerZones.length > 0 &&
              safeVal >= powerZones[powerZones.length - 1].min
            ? powerZones.length - 1
            : -1;

      const color =
        effectiveZoneIndex >= 0
          ? POWER_ZONE_PALETTE[effectiveZoneIndex] ||
            POWER_ZONE_PALETTE[POWER_ZONE_PALETTE.length - 1]
          : POWER_ZONE_PALETTE[0];

      const zoneLabel =
        effectiveZoneIndex >= 0 ? `Z${effectiveZoneIndex + 1}` : undefined;

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
                    {Math.round(safeVal)} {t("unit.watt") || "W"}
                  </span>
                </div>
                {zoneLabel && (
                  <span className="text-[0.70rem] uppercase text-muted-foreground">
                    {zoneLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [uplotData, powerZones, t, xAxisType],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const avg = data?.metadata?.avg ? Number(data.metadata.avg) : undefined;

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
      cursor: {
        points: {
          size: 9,
          fill: "var(--color-power, #9333ea)",
        },
      },
      legend: { show: false },
      hooks: {
        draw: [
          (u: uPlot) => {
            if (avg === undefined) return;
            const y = u.valToPos(avg, "y", true);
            // Ensure y is within the chart area
            if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) return;

            const ctx = u.ctx;
            ctx.save();

            // Draw dashed line
            ctx.beginPath();
            ctx.strokeStyle = "#9333ea";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(u.bbox.left, y);
            ctx.lineTo(u.bbox.left + u.bbox.width, y);
            ctx.stroke();

            // Draw Label
            const text = `${t("average")}: ${Math.round(avg)} ${t("unit.watt") || "W"}`;
            ctx.font = "600 11px sans-serif";
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 11; // approximate
            const paddingX = 4;
            const paddingY = 2;

            const xPos =
              u.bbox.left + u.bbox.width - textWidth - paddingX * 2 - 5;
            const yPos = y - textHeight - paddingY * 2 - 2; // Position above the line

            // Background rect
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.beginPath();
            // Round rect manually or just rect
            ctx.roundRect(
              xPos,
              yPos,
              textWidth + paddingX * 2,
              textHeight + paddingY * 2,
              3,
            );
            ctx.fill();

            // Text
            ctx.fillStyle = "#9333ea";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(text, xPos + paddingX, yPos + paddingY + 1); // +1 for visual centering

            ctx.restore();
          },
        ],
      },
      series: [
        {},
        {
          stroke: (u: uPlot) => {
            if (!powerZones || powerZones.length === 0)
              return cssVar("var(--color-power)") || "#9333ea";

            if (
              !u.bbox ||
              !Number.isFinite(u.bbox.top) ||
              !Number.isFinite(u.bbox.height) ||
              u.bbox.height <= 0
            ) {
              return "#9333ea";
            }

            const min = u.scales.y?.min ?? 0;
            const max = u.scales.y?.max ?? 1000;
            const range = max - min;

            if (range <= 0) return "#9333ea";

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

            powerZones.forEach((z, i) => {
              const color =
                POWER_ZONE_PALETTE[i] ||
                POWER_ZONE_PALETTE[POWER_ZONE_PALETTE.length - 1];

              const topStop = getStop(z.max);
              const bottomStop = getStop(z.min);

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
      scales: createScales(0, true),
      axes: createAxes({
        systemUnit,
        axisStroke,
        gridStroke,
        chartXaxis: xAxisType,
        formatXValue: (v) =>
          xAxisType === "distance"
            ? (v / 1000).toFixed(1) + "km"
            : formatSecondsToTime(Number(v)),
      }),
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    });
  }, [
    chartAreaSize,
    tooltipPlugin,
    cssVar,
    powerZones,
    avg,
    t,
    xAxisType,
    systemUnit,
  ]);

  return (
    <div ref={chartAreaRef} className="absolute inset-0">
      <div ref={chartWrapperRef}>
        {options.width > 0 && options.height > 0 && (
          <MemoUplotReact options={options} data={uplotData} />
        )}
      </div>
      {tooltip}
    </div>
  );
};

export default PowerPointChart;
