import React from "react";
import uPlot from "uplot";
import { renderToStaticMarkup } from "react-dom/server";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import ChartContainer from "@/components/ChartContainer";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import {
  createUplotOptions,
  createScales,
  DEFAULT_CURSOR,
  DEFAULT_LEGEND,
  resolveAxisColors,
  DEFAULT_PADDING,
} from "@/components/charts/uplot/uPlotConfig";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { createInnerYAxisTickDesign } from "@/components/charts/uplot/uPlotPlugins";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { useStore } from "@/lib/store";
import { MetricHistoryChartCanvas } from "./MetricHistoryChartCanvas";
import { MetricHistoryRangeTabs } from "./MetricHistoryRangeTabs";
import type {
  HistoryItem,
  ManualMetricSegment,
  MetricKey,
  RangeDays,
} from "./metric-history-chart-types";
import {
  buildMetricZones,
  formatMetricRangeLabel,
  formatWeeklyMetricValue,
  getMetricYRange,
} from "./metric-history-chart-view-model";

type MetricHistoryChartViewProps = {
  metricKey: MetricKey;
  history: HistoryItem[] | undefined;
  comparisonHistory?: HistoryItem[];
  periodStart: string;
  comparisonPeriodStart: string;
  isLoading: boolean;
  rangeDays: RangeDays;
  onRangeDaysChange: (rangeDays: RangeDays) => void;
  allowedRangeDays?: readonly RangeDays[];
  showComparison?: boolean;
  color: string;
  dataKey: keyof HistoryItem;
  dataMax: number;
  dataMin: number;
  manualSegments?: ManualMetricSegment[];
  vo2ActivityPoints?: HistoryItem[];
  height?: string;
  title?: string;
  accentColor?: string;
  comparisonColor?: string;
  titleIcon?: React.ReactNode;
  appearance?: "default" | "soft";
};

export function MetricHistoryChartView({
  metricKey,
  history,
  comparisonHistory,
  periodStart,
  comparisonPeriodStart,
  isLoading,
  rangeDays,
  onRangeDaysChange,
  allowedRangeDays,
  showComparison = false,
  color,
  dataKey,
  dataMax,
  dataMin,
  manualSegments,
  vo2ActivityPoints,
  height = "h-[200px]",
  title,
  accentColor,
  comparisonColor = "#94a3b8",
  titleIcon,
  appearance = "default",
}: MetricHistoryChartViewProps) {
  const t = useTranslations("dashboard.fitnessStatus");
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const { systemUnit } = useStore();
  const chartLabel = title || t(`${metricKey}.title`);
  const isPaceMetric = metricKey === "tp" || metricKey === "cs";
  const isBpmMetric =
    metricKey === "maxHr" || metricKey === "restingHr" || metricKey === "lthr";
  // weekPressure 的 API 返回最近 N 天的每日训练负荷，不是 N 个周聚合点。
  // 其余 week* 指标才使用周粒度和“周”范围标签。
  const isWeeklyMetric =
    metricKey.startsWith("week") && metricKey !== "weekPressure";

  const axisDateFormatter = React.useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
    });
  }, [locale]);

  const tooltipDateFormatter = React.useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [locale]);

  const numberFormatter = React.useMemo(() => {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  }, [locale]);

  const integerFormatter = React.useMemo(() => {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  }, [locale]);

  const yValueFormatter = React.useCallback(
    (v: number) => {
      if (!Number.isFinite(v)) return "--";
      if (isBpmMetric) return integerFormatter.format(Math.round(v));
      if (!isPaceMetric) return numberFormatter.format(v);
      return formatSecondsToTime(v, { showHours: false, roundSeconds: true });
    },
    [integerFormatter, isBpmMetric, isPaceMetric, numberFormatter],
  );

  const weeklyValueFormatter = React.useCallback(
    (v: number) => {
      return formatWeeklyMetricValue({
        integerFormatter,
        metricKey,
        systemUnit,
        value: v,
      });
    },
    [integerFormatter, metricKey, systemUnit],
  );

  const metricValueFormatter = React.useCallback(
    (v: number) => {
      if (isWeeklyMetric) return weeklyValueFormatter(v);
      return yValueFormatter(v);
    },
    [isWeeklyMetric, weeklyValueFormatter, yValueFormatter],
  );

  const rangeLabel = React.useCallback(
    (days: RangeDays) => {
      return formatMetricRangeLabel({
        days,
        isWeeklyMetric,
        locale,
        t,
      });
    },
    [isWeeklyMetric, locale, t],
  );

  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const setChartWrapperNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      chartAreaRef(node);
      chartWrapperRef.current = node;
    },
    [chartAreaRef],
  );
  const cssVar = useCssVarResolver();

  const uplotData = React.useMemo((): uPlot.AlignedData => {
    const hasHistory = !!history && history.length > 0;
    const hasVo2Points =
      metricKey === "vo2Max" &&
      !!vo2ActivityPoints &&
      vo2ActivityPoints.length > 0;

    if (!hasHistory && !hasVo2Points) return [[], []];

    if (metricKey !== "vo2Max") {
      const xVals: number[] = [];
      const yVals: Array<number | null> = [];

      let lastX = -Infinity;
      history?.forEach((row) => {
        const x = dayjs(row.date).valueOf() / 1000;
        if (!Number.isFinite(x)) return;

        let safeX = x;
        if (safeX <= lastX) {
          if (safeX === lastX) safeX += 0.00001;
          else return;
        }

        const raw = row[dataKey];
        const y = typeof raw === "number" && Number.isFinite(raw) ? raw : null;

        xVals.push(safeX);
        yVals.push(y);
        lastX = safeX;
      });

      const previousByDayOffset = new Map(
        (comparisonHistory ?? []).map((row) => [
          dayjs(row.date)
            .startOf("day")
            .diff(dayjs(comparisonPeriodStart), "day"),
          row,
        ]),
      );
      const previousVals = xVals.map((x) => {
        const offset = dayjs(x * 1000)
          .startOf("day")
          .diff(dayjs(periodStart), "day");
        const raw = previousByDayOffset.get(offset)?.[dataKey];
        return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      });
      return [xVals, yVals, previousVals];
    }

    const lineValueByX = new Map<number, number | null>();
    for (const row of history ?? []) {
      const x = dayjs(row.date).valueOf() / 1000;
      if (!Number.isFinite(x)) continue;
      const raw = row[dataKey];
      const y = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      lineValueByX.set(x, y);
    }

    const pointValueByX = new Map<number, number | null>();
    for (const point of vo2ActivityPoints ?? []) {
      const x = dayjs(point.date).valueOf() / 1000;
      if (!Number.isFinite(x)) continue;
      const raw = point.value;
      const y = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      pointValueByX.set(x, y);
    }

    const allX = new Set<number>();
    for (const row of history ?? []) {
      const x = dayjs(row.date).valueOf() / 1000;
      if (Number.isFinite(x)) allX.add(x);
    }
    for (const point of vo2ActivityPoints ?? []) {
      const x = dayjs(point.date).valueOf() / 1000;
      if (Number.isFinite(x)) allX.add(x);
    }

    const xVals = Array.from(allX).sort((a, b) => a - b);
    const yVals = xVals.map((x) => lineValueByX.get(x) ?? null);
    const pointVals = xVals.map((x) => pointValueByX.get(x) ?? null);
    const previousByDayOffset = new Map(
      (comparisonHistory ?? []).map((row) => [
        dayjs(row.date)
          .startOf("day")
          .diff(dayjs(comparisonPeriodStart), "day"),
        row,
      ]),
    );
    const previousVals = xVals.map((x) => {
      const offset = dayjs(x * 1000)
        .startOf("day")
        .diff(dayjs(periodStart), "day");
      const raw = previousByDayOffset.get(offset)?.[dataKey];
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    });
    return [xVals, yVals, pointVals, previousVals];
  }, [
    comparisonHistory,
    comparisonPeriodStart,
    dataKey,
    history,
    metricKey,
    periodStart,
    vo2ActivityPoints,
  ]);

  const renderTooltip = React.useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      const xVal = uplotData[0][idx];
      const yVal = uplotData[1][idx];
      const activityVal =
        metricKey === "vo2Max" && Array.isArray(uplotData[2])
          ? uplotData[2][idx]
          : null;
      const comparisonSeriesIndex = metricKey === "vo2Max" ? 3 : 2;
      const comparisonVal =
        showComparison && Array.isArray(uplotData[comparisonSeriesIndex])
          ? uplotData[comparisonSeriesIndex][idx]
          : null;
      const dateLabel = tooltipDateFormatter.format(
        new Date(Number(xVal) * 1000),
      );

      const content = (
        <>
          <div className="font-medium">{dateLabel}</div>
          <div className="grid gap-1.5">
            <div className="flex w-full flex-wrap gap-2 items-center">
              <div
                className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                style={{ "--color-bg": color } as React.CSSProperties}
              />
              <div className="flex flex-col">
                <div className="flex flex-1 justify-between leading-none items-center gap-4">
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof yVal === "number"
                      ? metricValueFormatter(yVal)
                      : "--"}
                  </span>
                </div>
                <span className="text-[0.70rem] uppercase text-muted-foreground">
                  {chartLabel}
                </span>
              </div>
            </div>
            {typeof comparisonVal === "number" ? (
              <div className="flex w-full flex-wrap gap-2 items-center">
                <div
                  className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                  style={
                    { "--color-bg": comparisonColor } as React.CSSProperties
                  }
                />
                <div className="flex flex-col">
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {metricValueFormatter(comparisonVal)}
                  </span>
                  <span className="text-[0.70rem] uppercase text-muted-foreground">
                    {tDashboard("comparison")}
                  </span>
                </div>
              </div>
            ) : null}
            {typeof activityVal === "number" ? (
              <div className="flex w-full flex-wrap gap-2 items-center">
                <div
                  className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                  style={{ "--color-bg": "#3b82f6" } as React.CSSProperties}
                />
                <div className="flex flex-col">
                  <div className="flex flex-1 justify-between leading-none items-center gap-4">
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {metricValueFormatter(activityVal)}
                    </span>
                  </div>
                  <span className="text-[0.70rem] uppercase text-muted-foreground">
                    {t("activityVo2MaxLabel")}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [
      chartLabel,
      color,
      comparisonColor,
      metricKey,
      metricValueFormatter,
      showComparison,
      tDashboard,
      tooltipDateFormatter,
      uplotData,
    ],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const zonesPlugin = React.useMemo((): uPlot.Plugin => {
    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v));

    const drawZones = (u: uPlot, withLabels: boolean) => {
      const zones = buildMetricZones({
        dataMax,
        dataMin,
        metricKey,
        t,
      });
      if (zones.length === 0) return;

      const { left, top, width, height } = u.bbox;
      const ctx = u.ctx;

      ctx.save();
      zones.forEach((zone) => {
        const y1 = u.valToPos(zone.y1, "y", true);
        const y2 = u.valToPos(zone.y2, "y", true);
        const yTop = clamp(Math.min(y1, y2), top, top + height);
        const yBottom = clamp(Math.max(y1, y2), top, top + height);
        const rectH = Math.max(0, yBottom - yTop);
        if (rectH <= 0) return;

        ctx.globalAlpha = zone.fillOpacity;
        ctx.fillStyle = zone.fill;
        ctx.fillRect(left, yTop, width, rectH);
        ctx.globalAlpha = 1;

        if (!withLabels) return;

        ctx.fillStyle = zone.labelFill;
        ctx.font =
          '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.textAlign = "right";
        ctx.textBaseline =
          zone.labelPosition === "insideBottomRight" ? "bottom" : "top";
        const x = left + width - 6;
        const y =
          zone.labelPosition === "insideBottomRight" ? yBottom - 4 : yTop + 4;
        ctx.fillText(zone.label, x, y);
      });
      ctx.restore();
    };

    return {
      hooks: {
        drawClear: [(u) => drawZones(u, false)],
        draw: [(u) => drawZones(u, true)],
      },
    };
  }, [dataMax, dataMin, metricKey, t]);

  const manualSegmentsPlugin = React.useMemo((): uPlot.Plugin | null => {
    if (!manualSegments || manualSegments.length === 0) return null;

    return {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = cssVar("var(--primary)");
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            manualSegments.forEach((seg) => {
              const x1 = u.valToPos(seg.start, "x", true);
              const x2 = u.valToPos(seg.end, "x", true);
              const y = u.valToPos(seg.value, "y", true);
              if (![x1, x2, y].every((n) => Number.isFinite(n))) return;
              ctx.beginPath();
              ctx.moveTo(x1, y);
              ctx.lineTo(x2, y);
              ctx.stroke();
            });
            ctx.restore();
          },
        ],
      },
    };
  }, [cssVar, manualSegments]);

  const uplotOptions = React.useMemo((): uPlot.Options => {
    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);

    const formatTick = (v: number) => {
      if (!Number.isFinite(v)) return "";
      return metricValueFormatter(v);
    };

    const yRange = (_u: uPlot, min: number, max: number): [number, number] => {
      return getMetricYRange({ max, metricKey, min });
    };

    const { axes, plugins: yAxisPlugins } = createInnerYAxisTickDesign({
      axisStroke,
      gridStroke,
      tickCount: 6,
      yAlign: "left",
      formatXValue: (v) => axisDateFormatter.format(new Date(Number(v) * 1000)),
      formatYValue: formatTick,
    });

    const scales = createScales();
    (scales.y as unknown as uPlot.Scale).range = yRange;

    return createUplotOptions({
      width: chartAreaSize.width,
      height: chartAreaSize.height,
      padding: [0, 0, 10, 0],
      cursor: DEFAULT_CURSOR,
      legend: DEFAULT_LEGEND,
      scales,
      axes,
      series:
        metricKey === "vo2Max"
          ? [
              {},
              {
                label: chartLabel,
                stroke: color,
                width: 2,
                spanGaps: true,
                points: {
                  show: true,
                  size: 4,
                  width: 1,
                  fill: color,
                  stroke: color,
                },
              },
              {
                label: "activity-vo2max",
                stroke: "transparent",
                width: 0,
                paths: () => null,
                points: {
                  show: true,
                  size: 6,
                  width: 1,
                  fill: "#3b82f6",
                  stroke: "#3b82f6",
                },
              },
              {
                label: tDashboard("comparison"),
                stroke: comparisonColor,
                width: 2,
                dash: [5, 5],
                spanGaps: true,
                points: { show: false },
              },
            ]
          : [
              {},
              {
                label: chartLabel,
                stroke: color,
                width: 2,
                spanGaps: true,
              },
              {
                label: tDashboard("comparison"),
                stroke: comparisonColor,
                width: 2,
                dash: [5, 5],
                spanGaps: true,
                points: { show: false },
              },
            ],
      plugins: [
        zonesPlugin,
        tooltipPlugin,
        ...(manualSegmentsPlugin ? [manualSegmentsPlugin] : []),
        ...yAxisPlugins,
      ],
    });
  }, [
    axisDateFormatter,
    chartAreaSize.height,
    chartAreaSize.width,
    chartLabel,
    color,
    comparisonColor,
    cssVar,
    tooltipPlugin,
    zonesPlugin,
    manualSegmentsPlugin,
    metricValueFormatter,
    metricKey,
    tDashboard,
  ]);

  return (
    <ChartContainer
      infoContent={
        isWeeklyMetric ? null : (
          <MetricHistoryRangeTabs
            allowedRangeDays={allowedRangeDays}
            disabled={isLoading}
            onValueChange={onRangeDaysChange}
            rangeDays={rangeDays}
            rangeLabel={rangeLabel}
          />
        )
      }
      height={height}
      isLoading={isLoading}
      title={title}
      accentColor={accentColor}
      titleIcon={titleIcon}
      appearance={appearance}
    >
      <MetricHistoryChartCanvas
        chartAreaSize={chartAreaSize}
        isLoading={isLoading}
        noDataLabel={tDashboard("noData")}
        options={uplotOptions}
        setChartWrapperNode={setChartWrapperNode}
        tooltip={tooltip}
        uplotData={uplotData}
      />
    </ChartContainer>
  );
}
