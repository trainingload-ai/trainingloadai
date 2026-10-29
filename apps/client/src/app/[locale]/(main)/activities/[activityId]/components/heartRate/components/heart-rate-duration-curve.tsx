"use client";

import React, { useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useFormatterBySettings } from "@/hooks/useFormatterBySettings";
import { useActivityId } from "@/hooks/useActivityId";
import {
  useActivityHeartRateDurationCurve,
  useHeartRateDurationCurve,
} from "@/api/use-heart-rate";
import { useGetActivity } from "@/hooks/useActivities";
import { SportType as StoreSportType } from "@/lib/store";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  createUplotOptions,
  createAxes,
  DEFAULT_CURSOR,
} from "@/components/charts/uplot/uPlotConfig";
import ChartContainer from "@/components/ChartContainer";
import dayjs from "dayjs";
import { Time } from "@/components/DateSelector/types";

const MemoUplotReact = React.memo(UplotReact);

const HeartRateDurationCurve: React.FC = () => {
  const t = useTranslations("HeartRatePage");
  const { formatValue, getUnit } = useFormatterBySettings();
  const activityId = useActivityId();
  const { data, isLoading } = useActivityHeartRateDurationCurve(activityId);
  const { data: activity } = useGetActivity(activityId || "");

  // Calculate time range for past 90 days from activity start time
  const { timeRanges, sportType } = useMemo(() => {
    if (!activity?.startTime) return { timeRanges: null, sportType: "all" };

    const endTime = dayjs(activity.startTime);
    const startTime = endTime.subtract(90, "day");

    const range: Time = {
      mode: "range",
      startDate: startTime.toISOString(),
      endDate: endTime.toISOString(),
    };

    return {
      timeRanges: [range],
      sportType: activity.sportType,
    };
  }, [activity]);

  const { data: comparisonData } = useHeartRateDurationCurve(
    timeRanges as Time[],
    sportType as StoreSportType | "all",
  );

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  const chartData = React.useMemo(() => {
    if (!data) return [];

    const labels: Record<number, string> = {
      1: "1s",
      5: "5s",
      10: "10s",
      20: "20s",
      30: "30s",
      60: "1m",
      180: "3m",
      300: "5m",
      600: "10m",
      1200: "20m",
      1800: "30m",
      3600: "60m",
      7200: "2h",
      10800: "3h",
      21600: "6h",
    };

    const map = new Map<
      number,
      { duration: number; label: string; bpm?: number }
    >();

    data.forEach((p) => {
      if (!labels[p.duration]) return;
      map.set(p.duration, {
        duration: p.duration,
        label: labels[p.duration],
        bpm: p.bpm,
      });
    });

    return Array.from(map.values()).sort((a, b) => a.duration - b.duration);
  }, [data]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!chartData || chartData.length === 0) return [[], [], []];
    const xVals = chartData.map((_, i) => i);
    const yVals = chartData.map((d) => d.bpm || 0);

    // 90-day comparison values
    const comparisonVals = chartData.map((d) => {
      if (!comparisonData || comparisonData.length === 0) return 0;
      const comparisonPoint = comparisonData[0];
      // Type assertion or key access since keys match labels
      const val = comparisonPoint[d.label as keyof typeof comparisonPoint];
      return typeof val === "number" ? val : 0;
    });

    return [xVals, yVals, comparisonVals];
  }, [chartData, comparisonData]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;
      const dataPoint = chartData[idx];
      if (!dataPoint) return;

      const title = dataPoint.label;
      const val = uplotData[1][idx] || 0;
      const comparisonVal = uplotData[2][idx] || 0;

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            <div className="flex w-full flex-wrap gap-2 items-center">
              <div
                className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                style={
                  { "--color-bg": "var(--chart-1)" } as React.CSSProperties
                }
              />
              <div className="flex flex-col">
                <div className="flex flex-1 justify-between leading-none items-center gap-4">
                  <span className="text-muted-foreground">
                    {t("baseStats.avg")}:
                  </span>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {formatValue(val as number, "heartRate")}{" "}
                    {getUnit("heartRate")}
                  </span>
                </div>
              </div>
            </div>
            {comparisonVal > 0 && (
              <div className="flex w-full flex-wrap gap-2 items-center">
                <div
                  className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                  style={{ "--color-bg": "#be123c" } as React.CSSProperties}
                />
                <div className="flex flex-col">
                  <div className="flex flex-1 justify-between leading-none items-center gap-4">
                    <span className="text-muted-foreground">
                      {t("charts.durationCurve.tooltip.peak", { days: 90 })}:
                    </span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {formatValue(comparisonVal as number, "heartRate")}{" "}
                      {getUnit("heartRate")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [chartData, t, formatValue, getUnit, uplotData],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const options = useMemo(() => {
    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");
    const hrColor = cssVar("var(--chart-1)") || "#e11d48"; // Rose-600 for HR
    const comparisonColor = "#be123c"; // Darker Rose for comparison

    return createUplotOptions({
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      axes: [
        {
          ...createAxes({ axisStroke, gridStroke })[0],
          values: (self, splits) => {
            return splits.map((i) => chartData[i]?.label || "");
          },
        },
        createAxes({ axisStroke, gridStroke })[1],
      ],
      series: [
        {},
        {
          stroke: hrColor,
          width: 2,
          points: { show: true, size: 6, fill: hrColor },
        },
        {
          stroke: comparisonColor,
          width: 2,
          dash: [5, 5],
          points: { show: false },
        },
      ],
      plugins: [tooltipPlugin],
      legend: { show: false },
      cursor: DEFAULT_CURSOR,
    });
  }, [chartAreaSize, cssVar, chartData, tooltipPlugin]);

  if (isLoading) {
    return (
      <ChartContainer
        title={t("charts.durationCurve.title")}
        isLoading={true}
        appearance="activity-detail"
      >
        <div className="h-full w-full" />
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ChartContainer
      title={t("charts.durationCurve.title")}
      isLoading={isLoading}
      appearance="activity-detail"
    >
      <div ref={chartAreaRef} className="absolute inset-0">
        <div ref={chartWrapperRef}>
          <MemoUplotReact
            options={options}
            data={uplotData}
            onCreate={() => {}}
          />
        </div>
        {tooltip}
      </div>
    </ChartContainer>
  );
};

export default HeartRateDurationCurve;
