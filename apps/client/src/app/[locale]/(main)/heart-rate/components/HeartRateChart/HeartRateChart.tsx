"use client";
import { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import UplotReact from "uplot-react";
import uPlot from "uplot";

import { useUserBasicInfo } from "@/hooks/useUserProfile";
import { useHeartRateDurationCurve } from "@/api/use-heart-rate";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const description = "Heart Rate Duration Curve Chart";

interface HeartRateChartProps {
  times: Time[];
  sportType: SportType;
}

interface DurationCurveDataItem {
  timeRange: { start?: string; end?: string };
  "1s": number;
  "5s": number;
  "10s": number;
  "20s": number;
  "30s": number;
  "1m": number;
  "3m": number;
  "5m": number;
  "10m": number;
  "20m": number;
  "30m": number;
  "60m": number;
  "2h": number;
  "3h": number;
  "6h": number;
}

const DURATION_LABELS = [
  "5s",
  "30s",
  "1m",
  "3m",
  "5m",
  "20m",
  "60m",
  "2h",
  "3h",
  "6h",
] as const;

const MemoUplotReact = memo(UplotReact);

export function HeartRateChart({ times, sportType }: HeartRateChartProps) {
  const t = useTranslations("GlobalHeartRateChart");
  const tPage = useTranslations("GlobalHeartRatePage");
  const tDate = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { lthr, maxHeartRate } = useUserBasicInfo();
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();

  const {
    data: durationCurveData = [] as DurationCurveDataItem[],
    isLoading,
    error,
  } = useHeartRateDurationCurve(times, sportType);

  const hasData = durationCurveData.length > 0;

  const rangesMeta = useMemo(() => {
    const colors = [
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
    ];

    return times.map((t, i) => ({
      label: getTimeLabel(t, tDate, locale),
      color: colors[i % colors.length],
    }));
  }, [times, tDate, locale]);

  const legendItems = useMemo(() => {
    return rangesMeta.map((m, i) => ({
      key: `series-${i}`,
      label: m.label,
      color: m.color,
    }));
  }, [rangesMeta]);

  // 为 uPlot 转换数据
  // X 轴：持续时间索引
  // Y 轴：每个时间范围对应一条序列
  const chartData = useMemo(() => {
    if (!hasData) return null;

    const xValues = DURATION_LABELS.map((_, i) => i);
    const ySeries = durationCurveData.map((item) => {
      return DURATION_LABELS.map((label) => item[label] || null);
    });

    return [xValues, ...ySeries] as uPlot.AlignedData;
  }, [durationCurveData, hasData]);

  const xCount = DURATION_LABELS.length;
  const shouldScrollX = false;
  const minPxPerPoint = 56;
  const desiredWidth = useMemo(() => {
    if (!shouldScrollX) return chartAreaSize.width;
    return Math.max(chartAreaSize.width, xCount * minPxPerPoint);
  }, [chartAreaSize.width, shouldScrollX, xCount]);

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx === null || idx === undefined) return;

      const durationLabel = DURATION_LABELS[idx];

      const content = (
        <>
          <div className="font-semibold mb-1">{durationLabel}</div>
          <div className="grid gap-1.5">
            {durationCurveData.map((item, i) => {
              const val = item[durationLabel];
              if (val == null) return null;
              return (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: rangesMeta[i]?.color,
                    }}
                  />
                  <span>{rangesMeta[i]?.label}:</span>
                  <span className="font-mono">{val} bpm</span>
                </div>
              );
            })}
          </div>
          {(lthr || maxHeartRate) && (
            <div className="mt-2 pt-2 border-t border-border grid gap-1">
              {maxHeartRate && (
                <div className="flex justify-between items-center text-mobile-caption pc:text-xs">
                  <span className="text-muted-foreground">{t("maxHr")}</span>
                  <span
                    className="font-mono font-medium"
                    style={{ color: "#dc2626" }}
                  >
                    {Math.round(maxHeartRate)} bpm
                  </span>
                </div>
              )}
              {lthr && (
                <div className="flex justify-between items-center text-mobile-caption pc:text-xs">
                  <span className="text-muted-foreground">{t("lthr")}</span>
                  <span
                    className="font-mono font-medium"
                    style={{ color: "#ea580c" }}
                  >
                    {Math.round(lthr)} bpm
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [durationCurveData, rangesMeta, lthr, maxHeartRate, t],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const referenceLinesPlugin = useMemo((): uPlot.Plugin => {
    return {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            const left = u.bbox.left;
            const right = u.bbox.left + u.bbox.width;

            const drawLine = (
              value: number,
              strokeColor: string,
              textColor: string,
              label: string,
            ) => {
              const yPos = u.valToPos(value, "y");
              if (!(yPos >= u.bbox.top && yPos <= u.bbox.top + u.bbox.height))
                return;

              ctx.save();
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(left, yPos);
              ctx.lineTo(right, yPos);
              ctx.stroke();

              ctx.fillStyle = textColor;
              ctx.font = "10px sans-serif";
              ctx.textAlign = "right";
              ctx.textBaseline = "bottom";
              ctx.fillText(`${label} ${Math.round(value)}`, right, yPos - 2);
              ctx.restore();
            };

            if (lthr)
              drawLine(lthr, "rgba(234, 88, 12, 0.4)", "#ea580c", t("lthr"));
            if (maxHeartRate)
              drawLine(
                maxHeartRate,
                "rgba(220, 38, 38, 0.4)",
                "#dc2626",
                t("maxHr"),
              );
          },
        ],
      },
    };
  }, [lthr, maxHeartRate, t]);

  const options = useMemo(() => {
    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => `${Math.round(v)}`,
    });

    const axes = createAxes({
      axisStroke,
      gridStroke,
      formatXValue: (v) => DURATION_LABELS[Math.round(Number(v))] ?? "",
    });

    // Custom x-axis splits
    axes[0].splits = () => DURATION_LABELS.map((_, i) => i);

    return createUplotOptions({
      width: desiredWidth || 0,
      height: chartAreaSize?.height || 0,
      padding: isMobile ? [6, 0, 20, 0] : undefined,
      title: "",
      legend: { show: false },
      series: [
        {
          label: "Duration",
        },
        ...durationCurveData.map((_, i) => ({
          label: rangesMeta[i]?.label || `Series ${i + 1}`,
          stroke: cssVar(rangesMeta[i]?.color),
          width: 2,
          points: {
            show: true,
            size: 6,
            width: 2,
            fill: cssVar(rangesMeta[i]?.color),
          },
        })),
      ],
      scales: {
        x: {
          time: false,
          range: () => [0, DURATION_LABELS.length - 1],
        },
        y: {
          range: (_u: uPlot, min: number, max: number) => {
            let lo = min;
            let hi = max;
            if (lthr) {
              lo = Math.min(lo, lthr);
              hi = Math.max(hi, lthr);
            }
            if (maxHeartRate) {
              lo = Math.min(lo, maxHeartRate);
              hi = Math.max(hi, maxHeartRate);
            }
            const span = hi - lo;
            const pad = span > 0 ? span * 0.08 : 5;
            return [lo - pad, hi + pad];
          },
        } as unknown as uPlot.Scale,
      },
      axes,
      plugins: [tooltipPlugin, referenceLinesPlugin, innerYAxisLabelsPlugin],
    });
  }, [
    chartAreaSize?.height,
    durationCurveData,
    rangesMeta,
    tooltipPlugin,
    referenceLinesPlugin,
    cssVar,
    lthr,
    maxHeartRate,
    isMobile,
    desiredWidth,
  ]);

  const legend = (
    <div className={cn(isMobile ? "max-w-[92vw] overflow-x-auto" : undefined)}>
      <div className="flex items-center gap-4 whitespace-nowrap text-mobile-caption pc:text-xs">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 shrink-0 rounded-micro"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (error) {
    return (
      <ChartContainer
        appearance="mobile-soft"
        isLoading={false}
        title={tPage("tabs.curve")}
        infoContent={legend}
      >
        <div className="flex h-full items-center justify-center text-muted-foreground">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      appearance="mobile-soft"
      isLoading={isLoading}
      title={tPage("tabs.curve")}
      infoContent={legend}
    >
      <div
        ref={chartAreaRef}
        data-uplot-chart
        className={cn(
          "w-full h-full relative",
          shouldScrollX && "overflow-x-auto overflow-y-hidden",
        )}
      >
        <div
          ref={chartWrapperRef}
          className="h-full relative"
          style={{ width: shouldScrollX ? desiredWidth : "100%" }}
        >
          {chartData && chartAreaSize && (
            <MemoUplotReact options={options} data={chartData} />
          )}
          {!hasData && !isLoading && (
            <div className="flex h-full items-center justify-center text-muted-foreground absolute inset-0">
              {t("noData")}
            </div>
          )}
          {tooltip}
        </div>
      </div>
    </ChartContainer>
  );
}
