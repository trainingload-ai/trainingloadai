"use client";
import { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useLocale, useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import {
  usePowerDurationCurve,
  usePowerDurationCurvePoints,
  type PowerDurationCurveByRange,
  type PowerDurationCurvePointsByRange,
} from "@/api/use-power";
import { useUserBasicInfo } from "@/hooks/useUserProfile";
import { Time } from "@/components/DateSelector/types";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  createUplotOptions,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import ChartContainer from "@/components/ChartContainer";
import { SportType } from "@/lib/store";
import { SportType as ApiSportType } from "@/api/activities";
import { PowerChartLegend } from "./PowerChartLegend";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  buildPowerChartData,
  buildPowerChartRangeMeta,
  getPowerChartYRange,
  POWER_CHART_DURATION_LABELS,
} from "./power-chart-model";

export const description = "Power Duration Curve Chart";

interface PowerChartProps {
  times: Time[];
  sportType: SportType;
}

const MemoUplotReact = memo(UplotReact);

export function PowerChart({ times, sportType }: PowerChartProps) {
  const t = useTranslations("power");
  const tDate = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();

  const {
    data: lineCurveData = [] as PowerDurationCurveByRange[],
    isLoading: isLineLoading,
    error: lineError,
  } = usePowerDurationCurve(times, sportType);
  const {
    data: pointCurveData = [] as PowerDurationCurvePointsByRange[],
    isLoading: isPointLoading,
    error: pointError,
  } = usePowerDurationCurvePoints(times, sportType);
  const userProfileSportType =
    sportType === "all"
      ? undefined
      : (sportType as unknown as ApiSportType | undefined);
  const { ftp, cp, wPrime } = useUserBasicInfo(userProfileSportType);
  const hasLineData = lineCurveData.length > 0;
  const isLoading = isLineLoading || isPointLoading;
  const error = lineError || pointError;

  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [locale]);

  const lineRangesMeta = useMemo(() => {
    return buildPowerChartRangeMeta({
      dateFormatter,
      lineCurveData,
      locale,
      tDate,
      times,
    });
  }, [dateFormatter, lineCurveData, locale, tDate, times]);

  const legendItems = useMemo(() => {
    return lineRangesMeta.map((m) => ({
      ...m,
      label: m.label ?? "",
    }));
  }, [lineRangesMeta]);

  const uplotData = useMemo((): uPlot.AlignedData => {
    return buildPowerChartData({
      lineCurveData,
      pointCurveData,
    });
  }, [lineCurveData, pointCurveData]);

  const xCount = POWER_CHART_DURATION_LABELS.length;
  const shouldScrollX = false;
  const minPxPerPoint = 56;
  const desiredWidth = useMemo(() => {
    if (!shouldScrollX) return chartAreaSize.width;
    return Math.max(chartAreaSize.width, xCount * minPxPerPoint);
  }, [chartAreaSize.width, shouldScrollX, xCount]);

  const lineTooltipSeriesItems = useMemo(() => {
    return legendItems.map((m, i) => ({
      label: m.label,
      color: m.color,
      dataIndex: i + 1,
    }));
  }, [legendItems]);

  const renderTooltip = useCallback(
    (args: { idx: number; u: uPlot; contentEl: HTMLDivElement }) => {
      const idx = args.idx;
      if (idx === null || idx === undefined) return;

      const title = `${t("duration")}: ${POWER_CHART_DURATION_LABELS[idx] ?? ""}`;

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            {lineTooltipSeriesItems.map((item) => {
              const watts = Number(uplotData[item.dataIndex]?.[idx] ?? 0);
              return (
                <div
                  key={item.label}
                  className="[&>svg]:text-muted-foreground flex w-full flex-wrap items-center gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5"
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
                  <div className="flex flex-1 justify-between leading-none items-center">
                    <div className="grid gap-1.5">
                      <span className="text-muted-foreground">
                        {item.label ?? ""}
                      </span>
                    </div>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {Math.round(watts).toLocaleString()}W
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {(cp || ftp || wPrime) && (
            <div className="mt-2 pt-2 border-t border-border grid gap-1">
              {cp && (
                <div className="flex justify-between items-center text-mobile-caption pc:text-xs">
                  <span className="text-muted-foreground">CP</span>
                  <span
                    className="font-mono font-medium"
                    style={{ color: "#9333ea" }}
                  >
                    {Math.round(cp)}W
                  </span>
                </div>
              )}
              {wPrime && (
                <div className="flex justify-between items-center text-mobile-caption pc:text-xs">
                  <span className="text-muted-foreground">W&apos;</span>
                  <span
                    className="font-mono font-medium"
                    style={{ color: "#9333ea" }}
                  >
                    {(wPrime / 1000).toFixed(1)}kJ
                  </span>
                </div>
              )}
              {ftp && (
                <div className="flex justify-between items-center text-mobile-caption pc:text-xs">
                  <span className="text-muted-foreground">FTP</span>
                  <span
                    className="font-mono font-medium"
                    style={{ color: "#3b82f6" }}
                  >
                    {Math.round(ftp)}W
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      );

      args.contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [t, lineTooltipSeriesItems, uplotData, cp, ftp, wPrime],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const cpPlugin = useMemo((): uPlot.Plugin => {
    return {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            const left = u.bbox.left;
            const right = u.bbox.left + u.bbox.width;

            // Draw CP
            if (typeof cp === "number" && Number.isFinite(cp)) {
              const yPos = u.valToPos(cp, "y");
              if (yPos >= u.bbox.top && yPos <= u.bbox.top + u.bbox.height) {
                ctx.save();
                ctx.strokeStyle = "rgba(147, 51, 234, 0.4)";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(left, yPos);
                ctx.lineTo(right, yPos);
                ctx.stroke();

                const text =
                  typeof wPrime === "number" && Number.isFinite(wPrime)
                    ? `CP ${Math.round(cp)}W • W' ${Math.round(wPrime / 1000)}kJ`
                    : `CP ${Math.round(cp)}W`;

                ctx.fillStyle = "#9333ea";
                ctx.font =
                  "600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
                ctx.textAlign = "right";
                ctx.textBaseline = "bottom";
                ctx.fillText(text, right, yPos - 4);
                ctx.restore();
              }
            }

            // Draw FTP
            if (typeof ftp === "number" && Number.isFinite(ftp)) {
              const yPos = u.valToPos(ftp, "y");
              if (yPos >= u.bbox.top && yPos <= u.bbox.top + u.bbox.height) {
                ctx.save();
                ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(left, yPos);
                ctx.lineTo(right, yPos);
                ctx.stroke();

                const text = `FTP ${Math.round(ftp)}W`;

                ctx.fillStyle = "#3b82f6";
                ctx.font =
                  "600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
                ctx.textAlign = "right";
                ctx.textBaseline = "bottom";
                ctx.fillText(text, right, yPos - 4);
                ctx.restore();
              }
            }
          },
        ],
      },
    };
  }, [cp, wPrime, ftp]);

  const uplotPlugins = useMemo((): uPlot.Plugin[] => {
    return [tooltipPlugin, cpPlugin];
  }, [cpPlugin, tooltipPlugin]);

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = desiredWidth;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => `${Math.round(v)}`,
    });

    const series: uPlot.Series[] = [
      {},
      ...legendItems.map((m) => ({
        label: m.label,
        width: 2,
        stroke: cssVar(m.color),
        points: { show: true, size: 6, width: 2, fill: cssVar(m.color) },
      })),
      ...Array.from(
        { length: Math.max(0, uplotData.length - 1 - legendItems.length) },
        () => ({
          label: "",
          width: 0,
          stroke: "transparent",
          paths: () => null,
          points: {
            show: true,
            size: 5,
            width: 0,
            fill: "rgba(147, 51, 234, 0.55)",
          },
        }),
      ),
    ];

    const axes = createAxes({
      axisStroke,
      gridStroke,
      formatXValue: (v) =>
        POWER_CHART_DURATION_LABELS[Math.round(Number(v))] ?? "",
    });

    // Custom x-axis splits
    axes[0].splits = () => POWER_CHART_DURATION_LABELS.map((_, i) => i);

    return createUplotOptions({
      width,
      height,
      padding: isMobile ? [6, 0, 20, 0] : undefined,
      legend: { show: false },
      scales: {
        x: {
          time: false,
          range: () => [-0.5, xCount - 0.5],
        },
        y: {
          range: (_u: uPlot, min: number, max: number) =>
            getPowerChartYRange({
              cp: cp ?? undefined,
              ftp: ftp ?? undefined,
              max,
              min,
            }),
        } as unknown as uPlot.Scale,
      },
      axes,
      series,
      plugins: [...uplotPlugins, innerYAxisLabelsPlugin],
    });
  }, [
    chartAreaSize.height,
    cp,
    ftp,
    cssVar,
    isMobile,
    legendItems,
    uplotPlugins,
    uplotData.length,
    desiredWidth,
    xCount,
  ]);

  if (error && !hasLineData) {
    return <ChartContainer appearance="mobile-soft" isLoading={isLoading} title={t("tabs.curve")} />;
  }

  if (isLoading && !hasLineData) {
    return <ChartContainer appearance="mobile-soft" isLoading={isLoading} title={t("tabs.curve")} />;
  }

  if (!hasLineData) {
    return <ChartContainer appearance="mobile-soft" isLoading={isLoading} title={t("tabs.curve")} />;
  }

  return (
    <ChartContainer
      appearance="mobile-soft"
      isLoading={isLoading}
      title={t("tabs.curve")}
      infoContent={<PowerChartLegend items={legendItems} />}
    >
      <div
        data-uplot-chart
        ref={chartAreaRef}
        className={cn(
          "h-full w-full relative",
          shouldScrollX && "overflow-x-auto overflow-y-hidden",
        )}
      >
        <div
          ref={chartWrapperRef}
          className="h-full relative"
          style={{ width: shouldScrollX ? desiredWidth : "100%" }}
        >
          {uplotOptions ? (
            <MemoUplotReact options={uplotOptions} data={uplotData} />
          ) : null}
          {tooltip}
        </div>
      </div>
    </ChartContainer>
  );
}
