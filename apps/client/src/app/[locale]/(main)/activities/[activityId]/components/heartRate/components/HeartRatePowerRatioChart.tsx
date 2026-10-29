"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useHeartRatePowerRatio } from "@/api/use-heart-rate";
import { useStore } from "@/lib/store";
import { downsampleEvenly } from "@/utils/downsample";
import dayjs from "dayjs";
import { formatter, formatBySettings } from "@/lib/utils";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import {
  createUplotOptions,
  createScales,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { useHeartRateZones } from "@/api/use-heart-rate";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { renderToStaticMarkup } from "react-dom/server";
import ChartContainer from "@/components/ChartContainer";
import ChartInfo from "@/components/ChartInfo";
import { getHeartRateZoneColor, POWER_ZONE_PALETTE } from "@/utils/util";

export const description = "Heart Rate Power Ratio Chart";

interface HeartRatePowerRatioChartProps {
  activityId: string;
}

const MemoUplotReact = React.memo(UplotReact);
const HeartRatePowerRatioChart: React.FC<HeartRatePowerRatioChartProps> = ({
  activityId,
}) => {
  const t = useTranslations("HeartRatePowerRatio");
  const {
    data: ratioData,
    isLoading,
    error,
  } = useHeartRatePowerRatio(activityId);

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();
  const { chartXaxis, systemUnit } = useStore((state) => state);

  // Fetch zones for coloring points
  const { data: heartRateZones } = useHeartRateZones(activityId);

  // Format Y Axis Value
  const formatYAxisValue = (value: number) => {
    if (value === 0) return "0";
    if (Math.abs(value) < 0.01) {
      return value.toExponential(2);
    }
    if (Math.abs(value) < 1) {
      return value.toFixed(3);
    }
    return value.toFixed(2);
  };

  // Calculate Linear Regression
  const calculateLinearRegression = (data: { x: number; y: number }[]) => {
    const n = data.length;
    if (n < 2) return null;

    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumXX = data.reduce((sum, point) => sum + point.x * point.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  };

  // Prepare Chart Data
  const chartData = useMemo(
    () =>
      downsampleEvenly(
        ratioData
          ? ratioData.map((item, index) => ({
              duration: dayjs(item.time).diff(
                dayjs(ratioData[0].time),
                "second",
              ),
              distance: item.distance || 0,
              ratio: item.ratio,
              heartRate: item.heartRate,
              power: item.power,
              index,
            }))
          : [],
        1000,
      ),
    [ratioData],
  );

  // Calculate Regression Line
  const regressionParams = useMemo(() => {
    if (chartData.length < 2) return null;
    const points = chartData.map((item, index) => ({
      x: index,
      y: item.ratio,
    }));
    return calculateLinearRegression(points);
  }, [chartData]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!chartData || chartData.length === 0) return [[], [], []];

    const xVals = chartData.map((d) =>
      chartXaxis === "distance" ? d.distance : d.duration,
    );
    const ratioVals = chartData.map((d) => d.ratio);

    // Calculate regression values based on index, but map to aligned array
    // The regression was calculated on index (x=0, 1, 2...), so we use index here too
    const regressionVals = regressionParams
      ? chartData.map(
          (_, i) => regressionParams.slope * i + regressionParams.intercept,
        )
      : chartData.map(() => null);

    // uPlot expects numbers or nulls.
    return [xVals, ratioVals, regressionVals as (number | null)[]];
  }, [chartData, regressionParams, chartXaxis]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined || !chartData[idx]) return;

      const data = chartData[idx];
      const xVal = chartXaxis === "distance" ? data.distance : data.duration;
      const titleLabel =
        chartXaxis === "distance" ? t("tooltip.distance") : t("tooltip.time");
      const titleValue =
        chartXaxis === "distance"
          ? formatBySettings(xVal, "distance", { systemUnit })
          : formatter("elTimeS", xVal);

      const title = `${titleLabel}: ${titleValue}`;

      // Determine color based on HR
      const color = getHeartRateZoneColor(
        data.heartRate,
        heartRateZones?.zones || [],
        POWER_ZONE_PALETTE,
      );

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <div className="flex flex-col">
                <span className="text-[0.70rem] uppercase text-muted-foreground">
                  {t("tooltip.ratio")}
                </span>
                <span className="font-bold text-foreground">
                  {formatYAxisValue(data.ratio)}
                </span>
              </div>
            </div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between gap-4">
                <span>{t("tooltip.heartRate")}:</span>
                <span className="font-mono">
                  {Math.round(data.heartRate)} bpm
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>{t("tooltip.power")}:</span>
                <span className="font-mono">{Math.round(data.power)} W</span>
              </div>
            </div>
          </div>
        </>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [chartData, t, heartRateZones, chartXaxis, systemUnit],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const options = useMemo(() => {
    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");
    const trendColor = "#9333ea"; // Purple for trend line

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => formatYAxisValue(v),
    });

    return createUplotOptions({
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      series: [
        {}, // X
        {
          // Ratio Series (Points)
          stroke: "transparent", // No line
          // We want points.
          points: {
            show: true,
            size: 4,
            fill: ((_u: uPlot, _seriesIdx: number, idx: number) => {
              // Color points by HR Zone
              const hr = chartData[idx]?.heartRate;
              return getHeartRateZoneColor(
                hr,
                heartRateZones?.zones || [],
                POWER_ZONE_PALETTE,
              );
            }) as unknown as (
              self: uPlot,
              seriesIdx: number,
            ) => string | CanvasGradient | CanvasPattern,
            stroke: "transparent",
          },
        },
        {
          // Regression Line
          stroke: trendColor,
          width: 2,
          points: { show: false },
        },
      ],
      scales: createScales(0.1),
      axes: createAxes({
        axisStroke,
        gridStroke,
        chartXaxis,
        systemUnit,
      }),
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    });
  }, [
    chartAreaSize,
    cssVar,
    chartData,
    heartRateZones,
    tooltipPlugin,
    chartXaxis,
    systemUnit,
  ]);

  if (error || !ratioData || ratioData.length === 0) {
    return (
      <ChartContainer
        title={t("title")}
        appearance="activity-detail"
        infoContent={
          <ChartInfo title={t("title")}>{t("description")}</ChartInfo>
        }
      >
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title={t("title")}
      appearance="activity-detail"
      infoContent={<ChartInfo title={t("title")}>{t("description")}</ChartInfo>}
      isLoading={isLoading}
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

export { HeartRatePowerRatioChart };
