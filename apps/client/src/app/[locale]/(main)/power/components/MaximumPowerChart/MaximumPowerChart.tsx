"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { renderToStaticMarkup } from "react-dom/server";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTranslations } from "next-intl";

import ChartContainer from "@/components/ChartContainer";
import {
  PowerMmpBucket,
  PowerMmpDuration,
  usePowerMmpHistory,
} from "@/api/use-power";
import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  createUplotOptions,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import {
  useCssVarResolver,
  useElementSize,
} from "@/components/charts/uplot/useElementSize";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS: PowerMmpDuration[] = [
  "5s",
  "10s",
  "30s",
  "1m",
  "5m",
  "20m",
  "60m",
];

const BUCKET_OPTIONS: PowerMmpBucket[] = ["day", "week", "month"];

export function MaximumPowerChart({
  times,
  sportType,
}: {
  times: Time[];
  sportType: SportType;
}) {
  const t = useTranslations("power");
  const tDate = useTranslations("dateSelector");
  const isMobile = useIsMobile();
  const [bucket, setBucket] = useState<PowerMmpBucket>("week");
  const [duration, setDuration] = useState<PowerMmpDuration>("5s");
  const selectedTime = times[0] ?? null;
  const {
    data = [],
    isLoading,
    error,
  } = usePowerMmpHistory(selectedTime, sportType, bucket, duration);
  const { ref: viewportRef, size } = useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  const sortedData = useMemo(() => {
    return [...data].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }, [data]);

  const alignedData = useMemo<uPlot.AlignedData>(() => {
    const xVals = sortedData.map((d) => new Date(d.time).getTime() / 1000);
    const yVals = sortedData.map((d) =>
      typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0,
    );
    return [xVals, yVals];
  }, [sortedData]);

  const bestIdx = useMemo(() => {
    const y = alignedData[1] as number[] | undefined;
    if (!y || y.length === 0) return null;
    let best = -Infinity;
    let idx = 0;
    for (let i = 0; i < y.length; i++) {
      const v = Number(y[i]);
      if (!Number.isFinite(v)) continue;
      if (v > best) {
        best = v;
        idx = i;
      }
    }
    return Number.isFinite(best) ? idx : null;
  }, [alignedData]);

  const renderTooltip = useCallback(
    ({
      idx,
      contentEl,
    }: {
      idx: number;
      u: uPlot;
      contentEl: HTMLDivElement;
    }) => {
      const tsSec = Number(alignedData[0]?.[idx]);
      const tsMs = tsSec * 1000;
      const value = Number(alignedData[1]?.[idx] ?? 0);

      const timeLabel =
        bucket === "month"
          ? dayjs(tsMs).format("YYYY-MM")
          : dayjs(tsMs).format("YYYY-MM-DD");

      const content = (
        <>
          <div className="font-medium">{timeLabel}</div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">{duration}</span>
            <span className="text-foreground font-mono font-medium tabular-nums">
              {Math.round(value).toLocaleString()}W
            </span>
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [alignedData, bucket, duration],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const xCount = (alignedData[0] as number[] | undefined)?.length ?? 0;
  const shouldScrollX = false;
  const minPxPerBar = 68; // 移动端：更粗的柱子 + 更易读的数值
  const desiredWidth = useMemo(() => {
    if (!shouldScrollX) return size.width;
    return Math.max(size.width, xCount * minPxPerBar);
  }, [shouldScrollX, size.width, xCount]);

  const uplotOptions = useMemo<uPlot.Options | null>(() => {
    const width = desiredWidth;
    const height = size.height;
    if (width <= 0 || height <= 0) return null;

    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");
    const baseOrange = cssVar("var(--chart-1)");

    const withAlpha = (color: string, alpha: number) => {
      const c = (color || "").trim();
      if (!c || c.startsWith("var(")) return c;
      if (alpha >= 1) return c;
      if (c.startsWith("oklch(") && c.endsWith(")")) {
        const inner = c.slice(6, -1).trim();
        const innerNoAlpha = inner.split("/")[0]?.trim() ?? inner;
        return `oklch(${innerNoAlpha} / ${alpha})`;
      }
      return c;
    };

    const barColor60 = withAlpha(baseOrange, 0.6);
    const barColor100 = withAlpha(baseOrange, 1);

    const formatXValue = (v: number) => {
      const tsMs = Number(v) * 1000;
      if (!Number.isFinite(tsMs)) return "";
      if (bucket === "month") return dayjs(tsMs).format("YYYY-MM");
      return dayjs(tsMs).format("MM-DD");
    };

    const axes = createAxes({
      axisStroke,
      gridStroke,
      formatXValue,
    });

    const xValues = alignedData[0] as number[];
    if (bucket === "month" && xValues.length > 0) {
      axes[0] = {
        ...axes[0],
        splits: () => xValues,
      };
    }

    axes[0] = {
      ...axes[0],
      values: (_u, vals) => vals.map((v) => formatXValue(Number(v))),
    };

    const drawBars = (
      u: uPlot,
      seriesIdx: number,
      idx0: number,
      idx1: number,
    ) => {
      const { ctx } = u;
      const xs = u.data[0] as number[];
      const ys = u.data[seriesIdx] as number[];

      const y0 = u.valToPos(0, "y", true);

      ctx.save();
      ctx.globalAlpha = 1;

      const showValueLabels = isMobile;
      if (showValueLabels) {
        ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
      }

      for (let i = idx0; i <= idx1; i++) {
        const xVal = xs[i];
        const yVal = ys[i];
        if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) continue;

        const xPos = u.valToPos(xVal, "x", true);
        const yPos = u.valToPos(yVal, "y", true);

        let intervalPx = 12;
        if (xs.length > 1) {
          const xPrev = i > 0 ? u.valToPos(xs[i - 1]!, "x", true) : null;
          const xNext =
            i < xs.length - 1 ? u.valToPos(xs[i + 1]!, "x", true) : null;
          const dPrev = xPrev != null ? Math.abs(xPos - xPrev) : Infinity;
          const dNext = xNext != null ? Math.abs(xNext - xPos) : Infinity;
          const d = Math.min(dPrev, dNext);
          if (Number.isFinite(d) && d > 0) intervalPx = d;
        }

        const xCount = xs.length;
        const minBarWidth = isMobile ? 30 : xCount <= 4 ? 8 : 4;
        let maxBarWidth = 18;
        if (xCount <= 1) {
          maxBarWidth = Math.min(80, u.bbox.width * 0.6);
        } else if (xCount === 2) {
          maxBarWidth = Math.min(64, u.bbox.width * 0.35);
        } else if (xCount <= 4) {
          maxBarWidth = 42;
        } else if (xCount <= 8) {
          maxBarWidth = isMobile ? 46 : 30;
        } else if (isMobile) {
          maxBarWidth = 42;
        }

        let barWidth = Math.min(
          maxBarWidth,
          Math.max(minBarWidth, intervalPx * 0.82),
        );
        if (xCount > 1) {
          barWidth = Math.min(barWidth, intervalPx * 0.92);
        }
        const barHeight = Math.max(1, y0 - yPos);

        ctx.fillStyle = i === bestIdx ? barColor100 : barColor60;
        ctx.beginPath();
        ctx.roundRect(xPos - barWidth / 2, yPos, barWidth, barHeight, 2);
        ctx.fill();

        if (showValueLabels) {
          const label = `${Math.round(yVal).toLocaleString()}`;
          const labelY = Math.max(u.bbox.top + 14, yPos - 6);
          ctx.fillStyle =
            i === bestIdx ? cssVar("var(--foreground)") : axisStroke;
          ctx.fillText(label, xPos, labelY);
        }
      }

      ctx.restore();
      return null;
    };

    const series: uPlot.Series[] = [
      {},
      {
        label: duration,
        width: 0,
        stroke: barColor60,
        fill: barColor60,
        paths: drawBars,
        points: { show: false },
      },
    ];

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => `${Math.round(v).toLocaleString()}W`,
      tickCount: 5,
      align: "right",
    });

    return createUplotOptions({
      width,
      height,
      padding: [12, 18, 25, 18],
      legend: { show: false },
      scales: {
        x: {
          time: true,
          range: (_u: uPlot, min: number, max: number) => {
            const span = Math.max(1, max - min);
            const xCount =
              (alignedData[0] as number[] | undefined)?.length ?? 0;
            const pad =
              xCount <= 2 ? span * 0.5 : Math.max(24 * 3600, span * 0.03);
            return [min - pad, max + pad];
          },
        },
        y: {
          auto: true,
          range: (_u: uPlot, _min: number, max: number) => {
            const newMax = max <= 0 ? 1 : max * 1.1;
            return [0, newMax];
          },
        } as unknown as uPlot.Scale,
      },
      axes,
      series,
      plugins: [tooltipPlugin, innerYAxisLabelsPlugin],
    });
  }, [
    alignedData,
    bestIdx,
    bucket,
    cssVar,
    desiredWidth,
    duration,
    size.height,
    size.width,
    isMobile,
    tooltipPlugin,
  ]);

  const Controls = isMobile ? (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={tDate("week")}
        value={bucket}
        onChange={(event) => setBucket(event.target.value as PowerMmpBucket)}
        className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs"
      >
        {BUCKET_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {tDate(option)}
          </option>
        ))}
      </select>
      <select
        aria-label={t("duration")}
        value={duration}
        onChange={(event) =>
          setDuration(event.target.value as PowerMmpDuration)
        }
        className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs"
      >
        {DURATION_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div>
        <ButtonGroup>
          {BUCKET_OPTIONS.map((b) => (
            <Button
              key={b}
              variant={bucket === b ? "default" : "outline"}
              size="compact"
              className="px-2"
              onClick={() => setBucket(b)}
            >
              {tDate(b)}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      <div>
        <ButtonGroup>
          {DURATION_OPTIONS.map((d) => (
            <Button
              key={d}
              variant={duration === d ? "default" : "outline"}
              size="compact"
              className="px-2"
              onClick={() => setDuration(d)}
            >
              {d}
            </Button>
          ))}
        </ButtonGroup>
      </div>
    </div>
  );

  const bestValue =
    bestIdx == null ? null : Number((alignedData[1] as number[])[bestIdx]);
  const mobileSummary =
    data.length > 0 ? (
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <div className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
          <p className="text-xs text-muted-foreground">
            {t("mobile.bestPeak")}
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {bestValue != null && Number.isFinite(bestValue)
              ? `${Math.round(bestValue).toLocaleString()} W`
              : "--"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{duration}</p>
        </div>
        <div className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
          <p className="text-xs text-muted-foreground">
            {t("mobile.dataPoints")}
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {data.length}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {tDate(bucket)}
          </p>
        </div>
      </div>
    ) : null;

  if (error || data.length === 0) {
    return (
      <div className="space-y-2">
        {mobileSummary}
        <ChartContainer
          appearance="mobile-soft"
          isLoading={isLoading}
          title={t("maximumPower")}
          infoContent={Controls}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t("noData")}
          </div>
        </ChartContainer>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mobileSummary}
      <ChartContainer
        appearance="mobile-soft"
        isLoading={isLoading}
        title={t("maximumPower")}
        infoContent={Controls}
      >
        <div
          className={cn(
            "h-full w-full relative",
            shouldScrollX && "overflow-x-auto overflow-y-hidden",
          )}
          ref={viewportRef}
        >
          <div
            ref={chartWrapperRef}
            className="h-full relative"
            style={{ width: shouldScrollX ? desiredWidth : "100%" }}
          >
            {uplotOptions ? (
              <UplotReact options={uplotOptions} data={alignedData} />
            ) : null}
            {tooltip}
          </div>
        </div>
      </ChartContainer>
    </div>
  );
}

export default MaximumPowerChart;
