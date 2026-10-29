"use client";

import React, { memo, useCallback, useMemo, useRef, useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import ChartContainer from "@/components/ChartContainer";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import UplotReact from "uplot-react";
import dayjs from "dayjs";

import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import {
  DEFAULT_PADDING,
  DEFAULT_CURSOR,
  DEFAULT_LEGEND,
  createScales,
  createAxes,
  resolveAxisColors,
} from "@/components/charts/uplot/uPlotConfig";
import { useStore } from "@/lib/store";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import {
  useActivityMetricSeries,
  type MetricId,
  type ChartValue,
} from "@/api/useActivityMetric";
import { useActivityId } from "@/hooks/useActivityId";
import { getMetricColor } from "@/lib/chart-data-utils";
import { calculateSmoothedPace } from "@/lib/chartUtils";
import { useGetActivity } from "@/hooks/useActivities";
import { useActivityConfig } from "@/hooks/useActivityConfig";
import {
  getActivityOverviewMetricsForSport,
  getVisibleActivityOverviewMetrics,
  type ActivityOverviewMetricId,
} from "@/lib/activity-overview-metrics";
import { isActivityOverviewMetricVisible } from "@/lib/activity-detail-policy";

const MemoUplotReact = memo(UplotReact);

const OverviewMetricChart = ({
  metricId,
}: {
  metricId?: ActivityOverviewMetricId;
}) => {
  const t = useTranslations("Overview");
  const activityId = useActivityId();
  const { data: activity } = useGetActivity(activityId || "");
  const {
    activitySelectedStat,
    systemUnit,
    chartXaxis,
    setActivitySelectedStat,
  } = useStore();
  const { config } = useActivityConfig();
  const visibleMetrics = useMemo(
    () =>
      getVisibleActivityOverviewMetrics(
        activity?.sportType,
        config.overview,
      ).filter((item) =>
        isActivityOverviewMetricVisible(activity, item.id),
      ),
    [activity, config.overview],
  );
  const availableMetrics = useMemo(
    () =>
      getActivityOverviewMetricsForSport(activity?.sportType).filter((item) =>
        isActivityOverviewMetricVisible(activity, item.id),
      ),
    [activity],
  );
  const selectedMetricDefinition = metricId
    ? (availableMetrics.find((item) => item.id === metricId) ??
      visibleMetrics[0] ??
      availableMetrics[0])
    : (visibleMetrics.find((item) => item.id === activitySelectedStat?.id) ??
      visibleMetrics.find(
        (item) => item.metric === activitySelectedStat?.metric,
      ) ??
      visibleMetrics[0] ??
      availableMetrics[0]);
  const metric = selectedMetricDefinition?.metric ?? "speed";
  const formatMetric = selectedMetricDefinition?.formatMetric ?? metric;
  const unitMetric = selectedMetricDefinition?.unitMetric ?? formatMetric;
  const xAxisType = chartXaxis || "time";

  useEffect(() => {
    if (metricId) return;
    if (!visibleMetrics.length) return;

    const selectedMetricIsVisible = visibleMetrics.some(
      (item) => item.id === activitySelectedStat?.id,
    );

    if (!selectedMetricIsVisible) {
      const firstMetric = visibleMetrics[0];
      setActivitySelectedStat(firstMetric.id, firstMetric.metric);
    }
  }, [
    activitySelectedStat?.id,
    metricId,
    setActivitySelectedStat,
    visibleMetrics,
  ]);

  // If metric is pace, we need to fetch speed data to calculate smoothed pace
  const fetchMetric = metric === "pace" ? "speed" : metric;
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    fetchMetric,
  );

  const otherMetric: MetricId | undefined =
    metric === "altitude" ? "enhancedAltitude" : undefined;

  const { data: otherData, isLoading: isOtherLoading } =
    useActivityMetricSeries(activityId || "", otherMetric, !!otherMetric);

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();

  const isLoadingCombined = isLoading || (!!otherMetric && isOtherLoading);

  const uplotData = useMemo((): uPlot.AlignedData => {
    const primaryHasData = data?.rows && data.rows.length > 0;
    const secondaryHasData = otherData?.rows && otherData.rows.length > 0;

    if (!primaryHasData && !secondaryHasData) return [[], []];

    const rows = primaryHasData ? data!.rows : otherData!.rows;

    const xVals: number[] = [];
    let yVals: number[] = [];
    const yVals2: (number | null)[] = [];

    let lastX = -Infinity;
    const startTime =
      rows?.[0]?.time && xAxisType === "time"
        ? dayjs(rows[0].time).valueOf() / 1000
        : 0;

    // Create lookup for otherData if it exists and we are iterating primary data
    const otherDataMap = new Map<number, number>();
    if (primaryHasData && secondaryHasData) {
      otherData!.rows.forEach((d) => {
        const x =
          xAxisType === "time"
            ? dayjs(d.time).valueOf() / 1000 - startTime
            : Number(d.distance || 0);
        // Round x to avoid float mismatch issues (e.g. 3 decimal places)
        const key = Math.round(x * 1000) / 1000;
        const val = Number(d[otherMetric!] || 0);
        otherDataMap.set(key, val);
      });
    }

    const times: number[] = [];
    const speeds: number[] = [];

    rows.forEach((d: ChartValue) => {
      let x =
        xAxisType === "time"
          ? dayjs(d.time).valueOf() / 1000 - startTime
          : Number(d.distance || 0);

      // If iterating primary, d[metric] exists. If iterating secondary, it's undefined (0).
      const y = Number(d[fetchMetric] || 0);

      // Ensure strictly increasing for uPlot
      if (x <= lastX) {
        if (x === lastX) {
          x += 0.00001; // Tiny nudge to avoid duplicate X
        } else {
          return; // Skip if x < lastX (should not happen for time/distance usually)
        }
      }

      xVals.push(x);
      yVals.push(y);
      if (fetchMetric === "speed") {
        const t = dayjs(d.time).valueOf() / 1000 - startTime;
        times.push(t);
        speeds.push(y);
      }
      lastX = x;

      if (otherMetric) {
        let y2: number | undefined | null;
        if (primaryHasData) {
          const key = Math.round(x * 1000) / 1000;
          y2 = otherDataMap.get(key);
        } else {
          // Iterating secondary data directly
          y2 = Number(d[otherMetric] || 0);
        }
        yVals2.push(y2 !== undefined ? y2 : null);
      }
    });
    if (metric === "pace" && speeds.length > 0) {
      const { smoothedPace } = calculateSmoothedPace(speeds, times, 10);
      let convertedPace: number[];
      if (systemUnit === "imperial") {
        convertedPace = smoothedPace.map((p) => p * 1.60934);
      } else {
        convertedPace = smoothedPace;
      }

      // Handle 0 pace (stopped) by replacing with max pace (slowest valid pace)
      let maxPace = 0;
      for (const p of convertedPace) {
        if (p > maxPace) maxPace = p;
      }

      if (maxPace > 0) {
        yVals = convertedPace.map((p) => (p === 0 ? maxPace : p));
      } else {
        yVals = convertedPace;
      }
    }

    if (otherMetric) {
      return [xVals, yVals, yVals2] as uPlot.AlignedData;
    }

    return [xVals, yVals];
  }, [
    data,
    otherData,
    xAxisType,
    metric,
    otherMetric,
    fetchMetric,
    systemUnit,
  ]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const xVal = uplotData[0][idx];
      const val = uplotData[1][idx];
      const val2 = otherMetric ? uplotData[2][idx] : undefined;

      let title = "";
      if (xAxisType === "time") {
        title = formatSecondsToTime(xVal, { showHours: true });
      } else {
        title =
          formatValue(xVal, "distance", systemUnit) +
          " " +
          getUnit("distance", systemUnit);
      }

      const unit = getUnit(unitMetric, systemUnit);
      const color1 = getMetricColor(metric);
      const color2 = otherMetric ? getMetricColor(otherMetric) : "";

      const renderItem = (
        value: number | null | undefined,
        label: string,
        color: string,
      ) => {
        let displayValue = "";
        if (metric === "pace") {
          const v = value || 0;
          const m = Math.floor(v);
          const s = Math.round((v - m) * 60);
          displayValue = `${m}:${s.toString().padStart(2, "0")}`;
        } else {
          displayValue = formatValue(
            value === null ? undefined : value,
            formatMetric,
            systemUnit,
          );
        }
        return (
          <div className="flex w-full flex-wrap gap-2 items-center">
            <div
              className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
              style={{ "--color-bg": color } as React.CSSProperties}
            />
            <div className="flex flex-1 justify-between leading-none items-center gap-4">
              <span className="text-foreground font-mono font-medium tabular-nums">
                {displayValue} {unit}
              </span>
              {otherMetric && (
                <span className="text-muted-foreground text-mobile-caption pc:text-xs">{label}</span>
              )}
            </div>
          </div>
        );
      };

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            {renderItem(val, metric, color1)}
            {otherMetric &&
              val2 !== undefined &&
              renderItem(val2, otherMetric, color2)}
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [
      uplotData,
      metric,
      formatMetric,
      unitMetric,
      systemUnit,
      otherMetric,
      xAxisType,
    ],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = chartAreaSize.width;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const lineColor = getMetricColor(metric);
    const lineFill = lineColor;

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => {
        if (metric === "pace") {
          const m = Math.floor(v);
          const s = Math.round((v - m) * 60);
          return `${m}:${s.toString().padStart(2, "0")}`;
        }
        const roundedV = Math.round(v * 100) / 100;
        return formatValue(roundedV, formatMetric, systemUnit);
      },
    });

    const series: uPlot.Series[] = [
      {},
      {
        width: 2,
        stroke: lineColor,
        fillTo: (_u, _seriesIdx, _dataMin, dataMax) => {
          // For pace, inverted axis means min (fast) is at top, max (slow) is at bottom.
          // Default fillTo is min, which fills to top.
          // We want to fill to bottom, so use max.
          if (metric === "pace") {
            return dataMax;
          }
          // For others (speed, hr), min is at bottom.
          return _dataMin;
        },
        fill: (u) => {
          const gradient = u.ctx.createLinearGradient(0, 0, 0, u.bbox.height);
          gradient.addColorStop(0, lineFill + "4D"); // 30% opacity
          gradient.addColorStop(1, lineFill + "00"); // 0% opacity
          return gradient;
        },
        paths: uPlot.paths.spline!(),
        points: { show: false },
      },
    ];

    if (otherMetric) {
      const color2 = getMetricColor(otherMetric);
      series.push({
        width: 2,
        stroke: color2,
        // No fill for second line to keep it clean, or maybe light fill
        paths: uPlot.paths.spline!(),
        points: { show: false },
      });
    }

    const rangePadding = ["speed", "pace"].includes(metric) ? 0.5 : 10;
    const scales = createScales(rangePadding);

    if (metric === "pace") {
      // Invert Y-axis for pace (0 at top, max at bottom)
      // Dynamic range based on data min/max with padding
      scales.y.range = (_u: uPlot, min: number, max: number) => {
        if (min === max) {
          return [max + 1, Math.max(0, min - 1)];
        }
        const padding = (max - min) * 0.1;
        const newMax = max + padding;
        const newMin = Math.max(0, min - padding);
        // Return [bottomValue, topValue] -> [max, min] for inverted axis
        return [newMax, newMin];
      };
    }

    return {
      width,
      height,
      legend: DEFAULT_LEGEND,
      padding: DEFAULT_PADDING,
      cursor: DEFAULT_CURSOR,
      scales,
      axes: createAxes({
        axisStroke,
        gridStroke,
        chartXaxis: xAxisType === "time" ? "time" : "distance",
        systemUnit,
      }),
      series,
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    };
  }, [
    chartAreaSize.height,
    chartAreaSize.width,
    cssVar,
    systemUnit,
    tooltipPlugin,
    xAxisType,
    metric,
    formatMetric,
    otherMetric,
  ]);

  const hasData = data?.rows && data.rows.length > 0;
  const hasOtherData = otherData?.rows && otherData.rows.length > 0;

  if (!hasData && !hasOtherData) {
    return (
      <ChartContainer title="" isLoading={isLoadingCombined}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoadingCombined ? "" : t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title="" isLoading={isLoadingCombined}>
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

export default OverviewMetricChart;
