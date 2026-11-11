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
import ChartExpandDialog from "../charts/chart-expand-dialog";
import { TimelineRowSettings } from "./timeline-row-settings";
import type { TimelineMetric } from "./use-activity-timeline";

const Chart = memo(UplotReact);

type PlotProps = {
  metric: TimelineMetric;
  config: TimelineRowConfig;
  axis: "time" | "distance";
  distance: TimelinePoint[];
  distanceGap: number;
  viewport: TimelineRange;
  expanded?: boolean;
};

const TimelinePlot = memo(function TimelinePlot({
  metric,
  config,
  axis,
  distance,
  distanceGap,
  viewport,
  expanded = false,
}: PlotProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const cssVar = useCssVarResolver();
  const data = useMemo((): uPlot.AlignedData => {
    const points: TimelinePoint[] = [];
    let previous: TimelinePoint | undefined;
    for (const point of smoothTimeline(metric.points, config.smoothing)) {
      const x =
        axis === "time"
          ? point.time
          : timelineValueAt(distance, point.time, distanceGap, true);
      if (x === null) continue;
      if (previous && point.time - previous.time > metric.gap) {
        const lastX = points.at(-1)?.time;
        if (lastX !== undefined && x > lastX)
          points.push({ time: (lastX + x) / 2, value: null });
      }
      if (!points.length || x > points[points.length - 1].time)
        points.push({ time: x, value: point.value });
      previous = point;
    }
    const from = Math.max(0, timelineLowerBound(points, viewport[0]) - 1);
    const to = Math.min(
      points.length,
      timelineLowerBound(points, viewport[1]) + 1,
    );
    const drawn = downsampleTimeline(
      points.slice(from, to),
      Math.max(400, size.width * 3),
    );
    return [
      drawn.map((point) => point.time),
      drawn.map((point) => point.value),
    ];
  }, [
    metric,
    config.smoothing,
    axis,
    distance,
    distanceGap,
    size.width,
    viewport,
  ]);
  const options = useMemo((): uPlot.Options => {
    const { axisStroke, gridStroke } = resolveAxisColors(cssVar);
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
          min: viewport[0],
          max: viewport[1],
          range: expanded
            ? (_plot, min, max) => [min ?? viewport[0], max ?? viewport[1]]
            : [viewport[0], viewport[1]],
        },
        y: { dir: metric.inverted ? -1 : 1 },
      },
      axes: [
        expanded
          ? {
              stroke: axisStroke,
              font: DEFAULT_AXIS_FONT,
              grid: { show: false },
              values: (_u, values) =>
                values.map((value) =>
                  axis === "time"
                    ? formatSecondsToTime(Math.round(value))
                    : String(Math.round(value)),
                ),
            }
          : { show: false },
        {
          size: 36,
          font: DEFAULT_AXIS_FONT,
          stroke: axisStroke,
          ticks: { show: false },
          grid: { show: true, stroke: gridStroke, width: 1 },
          values: (_plot, values) => values.map(metric.format),
          gap: 5,
        },
      ],
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
    viewport,
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
  distance,
  distanceGap,
  viewport,
  current,
  metrics,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: PlotProps & {
  current: number | null;
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
  return (
    <div
      className="group grid grid-cols-[124px_minmax(0,1fr)] border-b border-border/60 pr-3"
      data-timeline-row={config.id}
    >
      <div className="flex flex-col justify-center gap-0.5 pl-3">
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
          >
            <TimelinePlot
              metric={metric}
              config={config}
              axis={axis}
              distance={distance}
              distanceGap={distanceGap}
              viewport={viewport}
              expanded
            />
          </ChartExpandDialog>
        </div>
        <div className="flex items-center gap-1 tabular-nums">
          <span className="text-base font-semibold">
            {value === null ? "—" : metric.format(value)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {metric.unit}
          </span>
        </div>
        {metric.calculated ? (
          <span className="text-[10px] text-muted-foreground">
            {t("calculated")}
          </span>
        ) : null}
      </div>
      <div role="img" aria-label={`${label} (${metric.unit})`}>
        <TimelinePlot
          metric={metric}
          config={config}
          axis={axis}
          distance={distance}
          distanceGap={distanceGap}
          viewport={viewport}
        />
      </div>
    </div>
  );
});
