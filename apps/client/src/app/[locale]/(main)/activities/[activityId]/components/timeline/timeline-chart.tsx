"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import {
  DEFAULT_AXIS_FONT,
  resolveAxisColors,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisTickDesign } from "@/components/charts/uplot/uPlotPlugins";
import { getMetricColor } from "@/lib/chart-data-utils";
import {
  downsampleTimeline,
  smoothTimeline,
  timelineLowerBound,
  timelineValueAt,
  type TimelinePoint,
  type TimelineRange,
} from "@/lib/activity-timeline";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import type { TimelineRowConfig } from "@/hooks/useActivityTimelineLayout";
import {
  timelineMetricStatistics,
  type TimelineScale,
} from "@/lib/activity-timeline-segments";
import ChartExpandDialog from "../charts/chart-expand-dialog";
import { TimelineRowSettings } from "./timeline-row-settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimelineMetric } from "./use-activity-timeline";
import { TIMELINE_END_PADDING, TIMELINE_LABEL_WIDTH } from "./timeline-layout";

const Chart = memo(UplotReact);

type PlotProps = {
  metric: TimelineMetric;
  config: TimelineRowConfig;
  axis: "time" | "distance";
  scale: TimelineScale;
  plotViewport: TimelineRange;
  expanded?: boolean;
};

const TimelinePlot = memo(function TimelinePlot({
  metric,
  config,
  axis,
  scale,
  plotViewport,
  expanded = false,
}: PlotProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const cssVar = useCssVarResolver();
  const xRange = useMemo<TimelineRange>(
    () => (expanded ? [0, scale.width] : plotViewport),
    [expanded, scale.width, plotViewport],
  );
  const projected = useMemo(() => {
    const points: TimelinePoint[] = [];
    let previous: TimelinePoint | undefined;
    let disconnected = false;
    for (const point of smoothTimeline(metric.points, config.smoothing)) {
      const x = scale.positionAt(point.time);
      if (x === null) {
        disconnected = true;
        continue;
      }
      if (
        previous &&
        (disconnected || point.time - previous.time > metric.gap)
      ) {
        const lastX = points.at(-1)?.time;
        if (lastX !== undefined && x > lastX)
          points.push({ time: (lastX + x) / 2, value: null });
      }
      if (!points.length || x > points[points.length - 1].time)
        points.push({ time: x, value: point.value });
      previous = point;
      disconnected = false;
    }
    return points;
  }, [metric, config.smoothing, scale]);
  const data = useMemo((): uPlot.AlignedData => {
    const from = Math.max(0, timelineLowerBound(projected, xRange[0]) - 1);
    const to = Math.min(
      projected.length,
      timelineLowerBound(projected, xRange[1]) + 1,
    );
    const drawn = downsampleTimeline(
      projected.slice(from, to),
      Math.max(400, size.width * 3),
    );
    return [
      drawn.map((point) => point.time),
      drawn.map((point) => point.value),
    ];
  }, [projected, size.width, xRange]);
  const options = useMemo((): uPlot.Options => {
    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
    const inner = createInnerYAxisTickDesign({
      axisStroke,
      gridStroke,
      formatXValue: (value) =>
        axis === "time"
          ? formatSecondsToTime(Math.round(scale.coordinateAt(value)))
          : String(Math.round(scale.coordinateAt(value))),
      formatYValue: metric.format,
      tickCount: expanded ? 5 : config.height >= 128 ? 3 : 2,
      fontSizePx: 11,
      yAlign: "left",
      labelInset: 8,
      labelBackground: `color-mix(in srgb, ${cssVar("var(--card)")} 80%, ${cssVar("var(--muted)")} 20%)`,
    });
    return {
      width: Math.max(1, size.width),
      height: expanded ? Math.max(320, size.height) : config.height,
      padding: [7, 0, 7, 0],
      legend: { show: false },
      cursor: expanded
        ? { y: false, drag: { x: true, y: false, setScale: true } }
        : { show: false },
      select: { show: expanded, left: 0, top: 0, width: 0, height: 0 },
      scales: {
        x: {
          time: false,
          auto: false,
          min: xRange[0],
          max: xRange[1],
          range: expanded
            ? (_plot, min, max) => [min ?? xRange[0], max ?? xRange[1]]
            : [xRange[0], xRange[1]],
        },
        y: { dir: metric.inverted ? -1 : 1 },
      },
      axes: [
        expanded
          ? {
              ...inner.axes[0],
              stroke: axisStroke,
              font: DEFAULT_AXIS_FONT,
              grid: { show: false },
              values: (_u, values) =>
                values.map((value) =>
                  axis === "time"
                    ? formatSecondsToTime(Math.round(scale.coordinateAt(value)))
                    : String(Math.round(scale.coordinateAt(value))),
                ),
            }
          : { show: false },
        {
          ...inner.axes[1],
          size: 0,
          font: DEFAULT_AXIS_FONT,
          stroke: axisStroke,
          ticks: { show: false },
          grid: {
            show: true,
            stroke: `color-mix(in srgb, ${gridStroke} 55%, transparent)`,
            width: 1,
            dash: [3, 4],
          },
          values: () => [],
          gap: 5,
        },
      ],
      plugins: inner.plugins,
      series: [
        {},
        {
          stroke: config.color ?? getMetricColor(metric.colorMetric),
          width: 1.5,
          spanGaps: false,
          points: { show: false },
        },
      ],
    };
  }, [
    cssVar,
    config.height,
    config.color,
    expanded,
    xRange,
    scale,
    metric,
    size.width,
    size.height,
    axis,
  ]);
  return (
    <div
      ref={ref}
      className="min-w-0"
      style={{ height: expanded ? "100%" : config.height }}
    >
      {size.width > 0 ? <Chart options={options} data={data} /> : null}
    </div>
  );
});

export const TimelineChart = memo(function TimelineChart({
  metric,
  config,
  axis,
  scale,
  plotViewport,
  viewWidth,
  current,
  statisticsRange,
  metrics,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: PlotProps & {
  viewWidth: number;
  current: number | null;
  statisticsRange: TimelineRange | null;
  metrics: TimelineMetric[];
  onChange: (change: Partial<TimelineRowConfig>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const t = useTranslations("ActivityTimeline");
  const label = t(`metrics.${metric.id}`);
  const value =
    current === null
      ? null
      : timelineValueAt(metric.points, current, metric.gap);
  const statistics = useMemo(() => {
    if (!statisticsRange) return null;
    const values = timelineMetricStatistics(
      metric.points,
      statisticsRange,
      metric.gap,
    );
    return (
      values && {
        ...values,
        average: metric.average
          ? metric.average(statisticsRange)
          : values.average,
      }
    );
  }, [metric, statisticsRange]);
  const plotWidth = Math.max(
    1,
    viewWidth - TIMELINE_LABEL_WIDTH - TIMELINE_END_PADDING,
  );
  const cursorPosition = current === null ? null : scale.positionAt(current);
  const readingX =
    cursorPosition === null
      ? null
      : ((cursorPosition - plotViewport[0]) /
          (plotViewport[1] - plotViewport[0])) *
        plotWidth;
  const showReading =
    metric.hasData &&
    readingX !== null &&
    readingX >= 0 &&
    readingX <= plotWidth;
  return (
    <div
      className="group grid border-b border-border/35 bg-muted/20 dark:bg-muted/25"
      style={{
        gridTemplateColumns: `${TIMELINE_LABEL_WIDTH}px minmax(0,1fr)`,
        paddingRight: TIMELINE_END_PADDING,
      }}
      data-timeline-row={config.id}
      data-metric-state={metric.state}
    >
      <div className="sticky left-0 z-10 flex flex-col justify-center gap-1 bg-card px-3 py-1">
        <div className="flex min-w-0 items-center gap-1">
          <TimelineRowSettings
            config={config}
            metrics={metrics}
            color={config.color ?? getMetricColor(metric.colorMetric)}
            onChange={onChange}
            onRemove={onRemove}
            onMove={onMove}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
          />
          <ChartExpandDialog
            title={label}
            triggerLabel={t("expandChart", { metric: label })}
            triggerClassName="size-7 rounded-control text-muted-foreground/60 hover:text-foreground pc:size-7 [&_svg]:size-3.5"
          >
            <TimelinePlot
              metric={metric}
              config={config}
              axis={axis}
              scale={scale}
              plotViewport={plotViewport}
              expanded
            />
          </ChartExpandDialog>
        </div>
        <div className="h-6">
          {statisticsRange ? (
            <dl
              data-timeline-statistics
              data-statistics-start={statisticsRange[0]}
              data-statistics-end={statisticsRange[1]}
              aria-label={`${t("statistics.range")} · ${label} (${metric.unit})`}
              className="grid grid-cols-3 gap-1 tabular-nums"
              title={`${metric.unit}${metric.calculated ? ` · ${t("calculated")}` : ""}`}
            >
              {(["average", "minimum", "maximum"] as const).map((key) => {
                const stat = statistics?.[key] ?? null;
                return (
                  <div key={key} className="min-w-0">
                    <dt className="truncate text-[10px] leading-3 text-muted-foreground">
                      {t(`statistics.${key}`)}
                    </dt>
                    <dd
                      className="truncate text-xs font-medium leading-3"
                      aria-label={`${t(`statistics.${key}`)} ${stat === null ? "—" : metric.format(stat)} ${metric.unit}`}
                    >
                      {stat === null ? "—" : metric.format(stat)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "sticky justify-self-start overflow-hidden",
          metric.state === "error" && "pointer-events-none z-20",
        )}
        style={{
          left: TIMELINE_LABEL_WIDTH,
          width: plotWidth,
        }}
      >
        <div
          role="img"
          aria-label={`${label} (${metric.unit})`}
          style={{ height: config.height }}
        >
          {metric.hasData ? (
            <TimelinePlot
              metric={metric}
              config={config}
              axis={axis}
              scale={scale}
              plotViewport={plotViewport}
            />
          ) : null}
        </div>
        {metric.state !== "ready" ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-20 flex px-3",
              metric.hasData
                ? "items-start justify-end pt-1.5"
                : "items-center justify-center",
            )}
          >
            <div
              role={metric.state === "error" ? "alert" : "status"}
              className={cn(
                "flex min-w-0 items-center gap-2 text-xs text-muted-foreground",
                metric.hasData &&
                  "rounded-control border border-border/60 bg-card/95 px-2 py-1",
              )}
            >
              <span>
                {t(
                  metric.state === "error"
                    ? metric.hasData
                      ? "metricStale"
                      : "metricError"
                    : metric.state === "loading"
                      ? "metricLoading"
                      : "metricEmpty",
                  { metric: label },
                )}
              </span>
              {metric.state === "error" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto h-7 shrink-0"
                  aria-label={t("retryMetric", { metric: label })}
                  disabled={metric.retrying}
                  onClick={metric.retry}
                >
                  {t("retry")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {showReading ? (
          <div
            data-timeline-reading
            className="pointer-events-none absolute top-1.5 z-20 flex items-baseline gap-1 whitespace-nowrap rounded-control border border-foreground bg-foreground px-2 py-1 text-xs text-background tabular-nums"
            style={{
              left:
                readingX! > plotWidth * 0.65
                  ? readingX! - 8
                  : Math.max(44, readingX! + 8),
              transform:
                readingX! > plotWidth * 0.65 ? "translateX(-100%)" : undefined,
            }}
          >
            <span className="font-semibold">
              {value === null ? "—" : metric.format(value)}
            </span>
            <span className="text-[10px] text-background/75">
              {metric.unit}
            </span>
            {metric.calculated ? (
              <span className="text-[10px] text-background/75">
                {t("calculated")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
