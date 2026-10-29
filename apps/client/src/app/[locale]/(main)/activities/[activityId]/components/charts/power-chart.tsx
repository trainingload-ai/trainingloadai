"use client";

import React, { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import ChartContainer from "./activity-chart-container";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import { useActivityPowerZones } from "@/api/use-power";
import UplotReact from "uplot-react";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import {
  DEFAULT_PADDING,
  DEFAULT_CURSOR,
  DEFAULT_LEGEND,
  createAxes,
  resolveAxisColors,
} from "@/components/charts/uplot/uPlotConfig";
import { renderToStaticMarkup } from "react-dom/server";
import {
  aggregateMetricData,
  calculateYAxisRange,
  getMetricColor,
} from "@/lib/chart-data-utils";
import { formatTimeToElapsed } from "@/utils/downsample";
import { useStore } from "@/lib/store";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import ChartToolContainer from "./chart-tool-container";
import ChartExpandDialog from "./chart-expand-dialog";
import {
  selectedIntervalRange,
  useActivityAnalysisLink,
} from "../activity-analysis-link-context";

interface OverviewPowerChartProps {
  activityId: string;
  expanded?: boolean;
}

const MemoUplotReact = React.memo(UplotReact);

const OverviewPowerChart: React.FC<OverviewPowerChartProps> = ({
  activityId,
  expanded = false,
}) => {
  const t = useTranslations("PowerChart");
  const { chartXaxis, systemUnit } = useStore((state) => state);
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "power",
  );
  const isCalculatedPower = data?.metadata.powerSource === "CALCULATED";
  const powerMetricKey = isCalculatedPower ? "calculatedPower" : "power";
  const { data: powerZoneData } = useActivityPowerZones(activityId || null);
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();
  const { selectedInterval, setHoveredDistanceM } = useActivityAnalysisLink();
  const selectedRange = isCalculatedPower
    ? null
    : selectedIntervalRange(selectedInterval, chartXaxis, "power");

  const chartData = useMemo(() => {
    const mainRows = data?.rows || [];
    if (mainRows.length === 0) return [];

    // Format time to elapsed seconds
    const formattedRows = formatTimeToElapsed(mainRows);

    return aggregateMetricData(
      formattedRows as Record<string, unknown>[],
      1,
      powerMetricKey,
    );
  }, [data, powerMetricKey]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (chartData.length === 0) return [[], []];

    const xVals = chartData.map((d) =>
      chartXaxis === "distance" ? Number(d.distance || 0) : Number(d.time),
    );

    return [xVals, chartData.map((d) => d.avg)];
  }, [chartData, chartXaxis]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const hoveredDistance = Number(chartData[idx]?.distance);
      setHoveredDistanceM(
        Number.isFinite(hoveredDistance) ? hoveredDistance : null,
      );

      const xVal = uplotData[0][idx];
      const avgVal = uplotData[1][idx];

      const title =
        chartXaxis === "distance"
          ? (Number(xVal) / 1000).toFixed(2) + " km"
          : formatSecondsToTime(xVal, { showHours: true });

      const safeVal = avgVal ?? 0;
      const zoneColor = getMetricColor("power");
      const zoneIndex =
        !isCalculatedPower && powerZoneData?.zones
          ? powerZoneData.zones.findIndex(
              (z) => safeVal >= (z.min || 0) && safeVal <= (z.max || 0),
            )
          : -1;
      const zoneLabel = zoneIndex >= 0 ? `Z${zoneIndex + 1}` : undefined;

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            <div className="flex w-full flex-wrap gap-2 items-center">
              <div
                className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                style={{ "--color-bg": zoneColor } as React.CSSProperties}
              />
              <div className="flex flex-col">
                <div className="flex flex-1 justify-between leading-none items-center gap-4">
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {Math.round(safeVal)} W
                  </span>
                </div>
                {zoneLabel && (
                  <span className="text-[0.70rem] uppercase text-muted-foreground">
                    {zoneLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="text-mobile-caption pc:text-xs text-muted-foreground mt-1">
              {isCalculatedPower ? t("calculatedTitle") : t("title")}:{" "}
              {Math.round(avgVal ?? 0)} W
            </div>
          </div>
        </>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [
      uplotData,
      powerZoneData?.zones,
      chartXaxis,
      isCalculatedPower,
      chartData,
      setHoveredDistanceM,
      t,
    ],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
    onHide: () => setHoveredDistanceM(null),
  });

  const options = useMemo<uPlot.Options>(() => {
    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const barColor = getMetricColor("power");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => Math.round(v).toString(),
    });

    // Calculate Y range
    const allMax = chartData
      .map((d) => d.max)
      .filter((v) => v !== null && v !== undefined) as number[];
    const allMin = chartData
      .map((d) => d.min)
      .filter((v) => v !== null && v !== undefined) as number[];
    const maxVal = allMax.length > 0 ? Math.max(...allMax) : 100;
    const minVal = allMin.length > 0 ? Math.min(...allMin) : 0;

    const { min: yMin, max: yMax } = calculateYAxisRange(
      minVal,
      maxVal,
      "power",
    );

    return {
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      padding: DEFAULT_PADDING,
      cursor: DEFAULT_CURSOR,
      legend: DEFAULT_LEGEND,
      series: [
        {},
        {
          label: isCalculatedPower ? t("calculatedTitle") : t("title"),
          stroke: barColor,
          fill: `${barColor}16`,
          width: 1.5,
          points: { show: false },
        },
      ],
      scales: {
        x: {
          time: false,
          range: selectedRange ? () => selectedRange : undefined,
        },
        y: {
          range: [yMin, yMax],
        },
      },
      axes: createAxes({
        axisStroke,
        gridStroke,
        chartXaxis,
        systemUnit,
      }),
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    } as unknown as uPlot.Options;
  }, [
    cssVar,
    chartAreaSize.width,
    chartAreaSize.height,
    chartXaxis,
    systemUnit,
    tooltipPlugin,
    chartData,
    isCalculatedPower,
    selectedRange,
    t,
  ]);

  if (!data?.rows || data.rows.length === 0) {
    if (expanded) {
      return (
        <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground text-sm">
          {t("noData")}
        </div>
      );
    }

    return (
      <ChartContainer title={t("title")} isLoading={isLoading}>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  const chartNode = (
    <div ref={chartAreaRef} className="absolute inset-0">
      <div ref={chartWrapperRef}>
        {options.width > 0 && options.height > 0 && (
          <MemoUplotReact options={options} data={uplotData} />
        )}
      </div>
      {tooltip}
    </div>
  );

  if (expanded) {
    return (
      <div className="relative h-[min(72dvh,calc(100vw-5rem))] min-h-[320px] w-full sm:h-full">
        {chartNode}
      </div>
    );
  }

  return (
    <ChartContainer
      title={t("title")}
      isLoading={isLoading}
      tools={
        <ChartToolContainer>
          {isCalculatedPower ? (
            <span
              className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
              title={t("calculatedDescription")}
            >
              {t("calculatedBadge")}
            </span>
          ) : null}
          <ChartExpandDialog
            title={isCalculatedPower ? t("calculatedTitle") : t("title")}
          >
            <OverviewPowerChart activityId={activityId} expanded />
          </ChartExpandDialog>
        </ChartToolContainer>
      }
    >
      {chartNode}
    </ChartContainer>
  );
};

export default OverviewPowerChart;
