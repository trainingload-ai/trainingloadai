"use client";

import React, { useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useFormatterBySettings } from "@/hooks/useFormatterBySettings";
import { useActivityId } from "@/hooks/useActivityId";
import {
  useActivityPowerDurationCurve,
  usePowerDurationCurve,
} from "@/api/use-power";
import { useGetActivity } from "@/hooks/useActivities";
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
  createScales,
  createAxes,
  DEFAULT_LEGEND,
  DEFAULT_CURSOR,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import { SportType, useStore } from "@/lib/store";
import dayjs from "dayjs";
import { Time } from "@/components/DateSelector/types";
import ChartContainer from "@/components/ChartContainer";

const MemoUplotReact = React.memo(UplotReact);

/**
 * 功率持续曲线组件 - 线图样式 (含 CP 模型) (Refactored to uPlot)
 */
const PowerDurationCurve: React.FC = () => {
  const t = useTranslations("ActivityPowerPage");
  const { formatValue, getUnit } = useFormatterBySettings();
  const { systemUnit } = useStore();
  const activityId = useActivityId();
  const { data, isLoading } = useActivityPowerDurationCurve(activityId);
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

  const { data: mmpData } = usePowerDurationCurve(
    timeRanges as Time[],
    sportType as SportType,
  );

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  // 映射数据到线图格式：5s → 3h
  const chartData = React.useMemo(() => {
    if (!data?.points) return [];

    const labels: Record<number, string> = {
      5: "5s",
      30: "30s",
      60: "1m",
      180: "3m",
      300: "5m",
      1200: "20m",
      3600: "60m",
      7200: "2h",
      10800: "3h",
    };

    // Transform flat list to map by duration
    const map = new Map<
      number,
      { duration: number; label: string; power?: number }
    >();

    data.points.forEach((p) => {
      // Only keep points that match our specific buckets for the categorical chart
      if (!labels[p.duration]) return;

      const existing = map.get(p.duration) || {
        duration: p.duration,
        label: labels[p.duration],
      };

      existing.power = p.power;
      map.set(p.duration, existing);
    });

    return Array.from(map.values()).sort((a, b) => a.duration - b.duration);
  }, [data]);

  // Prepare uPlot data
  const uplotData = useMemo((): uPlot.AlignedData => {
    if (!chartData || chartData.length === 0) return [[], [], []];

    const xVals = chartData.map((_, i) => i);
    const yVals = chartData.map((d) => d.power || 0);

    // 90-day MMP values
    const mmpVals = chartData.map((d) => {
      if (!mmpData || mmpData.length === 0) return 0;
      const mmpPoint = mmpData[0];
      // Type assertion or key access since keys match labels
      const val = mmpPoint?.[d.label as keyof typeof mmpPoint];
      return typeof val === "number" ? val : 0;
    });

    return [xVals, yVals, mmpVals];
  }, [chartData, mmpData]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;
      const dataPoint = chartData[idx];
      if (!dataPoint) return;

      const title = dataPoint.label;
      const val = uplotData[1][idx] || 0;
      const mmpVal = uplotData[2][idx] || 0;

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
                    {t("tooltip.avgPower")}:
                  </span>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {formatValue(val as number, "power")} {getUnit("power")}
                  </span>
                </div>
              </div>
            </div>
            {mmpVal > 0 && (
              <div className="flex w-full flex-wrap gap-2 items-center">
                <div
                  className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                  style={{ "--color-bg": "#a855f7" } as React.CSSProperties}
                />
                <div className="flex flex-col">
                  <div className="flex flex-1 justify-between leading-none items-center gap-4">
                    <span className="text-muted-foreground">90天 MMP:</span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {formatValue(mmpVal as number, "power")}{" "}
                      {getUnit("power")}
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
    const powerColor = cssVar("var(--chart-1)") || "#9333ea";
    const mmpColor = "#a855f7"; // Purple for 90-day MMP

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => Math.round(v).toString() + " W",
    });

    return createUplotOptions({
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      cursor: {
        ...DEFAULT_CURSOR,
        points: {
          size: 9,
          fill: powerColor,
        },
      },
      legend: DEFAULT_LEGEND,
      series: [
        {},
        {
          stroke: powerColor,
          width: 2,
          fill: undefined,
          points: { show: true, size: 6, fill: powerColor }, // Show points for discrete PDC
          paths: uPlot.paths.linear!(), // Linear connection for PDC usually
        },
        {
          stroke: mmpColor,
          width: 2,
          dash: [5, 5],
          points: { show: false },
          paths: uPlot.paths.linear!(),
        },
      ],
      scales: createScales(0, true),
      axes: createAxes({
        systemUnit,
        axisStroke,
        gridStroke,
        formatXValue: (v) => chartData[v]?.label || "",
      }),
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    });
  }, [chartAreaSize, tooltipPlugin, cssVar, chartData, systemUnit]);

  return (
    <ChartContainer
      title={t("chart.pdc") || "Power Duration Curve"}
      isLoading={isLoading}
      height="h-[220px]"
      infoContent={
        data?.cp &&
        data?.wPrime && (
          <div className="ml-auto flex items-center gap-4 text-mobile-caption pc:text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="font-medium">CP:</span>
              <span>
                {Math.round(data.cp)} {getUnit("power")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium">W&apos;:</span>
              <span>{Math.round(data.wPrime / 1000)} kJ</span>
            </div>
          </div>
        )
      }
    >
      <div className="h-full w-full relative" ref={chartAreaRef}>
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

export default PowerDurationCurve;
