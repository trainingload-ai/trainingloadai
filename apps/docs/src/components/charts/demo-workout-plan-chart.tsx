"use client";

import * as React from "react";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTheme } from "next-themes";

import {
  DEFAULT_AXIS_FONT,
  DEFAULT_PADDING,
} from "./uplot/uPlotConfig";
import { useElementSize } from "./uplot/useElementSize";

export type DemoWorkoutSegment = {
  t0: number;
  t1: number;
  displayY: number;
  color?: string;
};

function workoutBlocksPlugin(segments: DemoWorkoutSegment[]): uPlot.Plugin {
  return {
    hooks: {
      drawClear: [
        (chart) => {
          const ctx = chart.ctx;
          const baseline = chart.valToPos(0, "y", true);
          ctx.save();
          ctx.beginPath();
          ctx.rect(
            chart.bbox.left,
            chart.bbox.top,
            chart.bbox.width,
            chart.bbox.height,
          );
          ctx.clip();
          ctx.globalAlpha = 0.5;
          for (const segment of segments) {
            if (!segment.color) continue;
            const left = chart.valToPos(segment.t0, "x", true);
            const right = chart.valToPos(segment.t1, "x", true);
            const top = chart.valToPos(segment.displayY, "y", true);
            ctx.fillStyle = segment.color;
            ctx.fillRect(
              Math.min(left, right),
              Math.min(top, baseline),
              Math.max(1, Math.abs(right - left)),
              Math.max(1, Math.abs(baseline - top)),
            );
          }
          ctx.restore();
        },
      ],
    },
  };
}

function buildUplotAlignedData(segments: DemoWorkoutSegment[]) {
  const valid = segments.filter((segment) => segment.t1 > segment.t0);
  if (valid.length === 0) return null;

  const x: number[] = [valid[0]!.t0];
  for (const segment of valid) x.push(segment.t1);

  const y: number[] = valid.map((segment) => segment.displayY);
  y.push(y[y.length - 1] ?? 0);

  return {
    data: [x, y] as uPlot.AlignedData,
  };
}

function formatDurationSeconds(totalSeconds: number) {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m${remainder.toString().padStart(2, "0")}s`;
}

function yScaleRangeWithNiceTicks(_chart: uPlot, min: number, max: number) {
  const low = Math.min(min, 0);
  let high = Math.max(max, 10);
  const span = high - low;
  const pad = Math.max(span * 0.06, 2);
  high = high + pad;
  const step = high <= 30 ? 5 : high <= 80 ? 10 : 20;
  high = Math.ceil(high / step) * step;
  return [low, high] as [number, number];
}

const MemoUplotReact = React.memo(UplotReact);

export function DemoWorkoutPlanChart({
  segments,
  height = 132,
  compact = true,
  hideAxes = false,
}: {
  segments: DemoWorkoutSegment[];
  height?: number;
  compact?: boolean;
  hideAxes?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const { ref: chartAreaRef, size } = useElementSize<HTMLDivElement>();
  const built = React.useMemo(() => buildUplotAlignedData(segments), [segments]);
  const isDark = resolvedTheme === "dark";
  const hasSegmentColors = segments.some((segment) => Boolean(segment.color));
  const axisStroke = isDark ? "#a3a3a3" : "#737373";
  const gridStroke = isDark ? "#404040" : "#e5e5e5";
  const strokeMain = isDark ? "#e5e7eb" : "#111827";

  const options = React.useMemo((): uPlot.Options | null => {
    const width = size.width;
    if (width <= 0 || height <= 0 || !built) return null;

    const stepped = uPlot.paths.stepped!({ align: 1 });
    const fillPrimarySoft = isDark
      ? "rgba(229, 231, 235, 0.14)"
      : "rgba(17, 24, 39, 0.12)";

    const axisXFull: uPlot.Axis = {
      stroke: axisStroke,
      grid: { show: false },
      ticks: { stroke: axisStroke, width: 1 },
      font: DEFAULT_AXIS_FONT,
      gap: compact ? 4 : 8,
      size: compact ? 20 : 28,
      values: (_chart, ticks) =>
        ticks.map((value) => formatDurationSeconds(value)),
    };

    const axisHidden: uPlot.Axis = { show: false };

    const axisYFull: uPlot.Axis = {
      stroke: axisStroke,
      grid: {
        show: true,
        stroke: gridStroke,
        width: 1,
        dash: [3, 3],
      },
      ticks: { stroke: axisStroke, width: 1 },
      font: DEFAULT_AXIS_FONT,
      gap: compact ? 4 : 8,
      size: compact ? 28 : 40,
      values: (_chart, ticks) =>
        ticks.map((value) => `${Math.round(Number(value))}`),
    };

    const padding: [number, number, number, number] = hideAxes
      ? [4, 4, 4, 4]
      : compact
        ? [
            Math.min(DEFAULT_PADDING[0], 8),
            Math.min(DEFAULT_PADDING[1], 6),
            Math.max(DEFAULT_PADDING[2], 22),
            Math.min(DEFAULT_PADDING[3], 8),
          ]
        : DEFAULT_PADDING;

    return {
      width,
      height,
      legend: { show: false },
      padding,
      cursor: {
        show: false,
        drag: { x: false, y: false, setScale: false },
      },
      scales: {
        x: { time: false },
        y: {
          auto: true,
          range: yScaleRangeWithNiceTicks,
        },
      },
      axes: hideAxes ? [axisHidden, axisHidden] : [axisXFull, axisYFull],
      plugins: hasSegmentColors ? [workoutBlocksPlugin(segments)] : [],
      series: [
        {},
        {
          label: "Intensity",
          stroke: strokeMain,
          width: 1.25,
          fill: hasSegmentColors ? undefined : fillPrimarySoft,
          paths: stepped,
          spanGaps: false,
        },
      ],
    };
  }, [
    size.width,
    height,
    built,
    axisStroke,
    gridStroke,
    strokeMain,
    compact,
    hideAxes,
    isDark,
    hasSegmentColors,
    segments,
  ]);

  if (!built) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        —
      </div>
    );
  }

  return (
    <div ref={chartAreaRef} className="relative w-full" style={{ height }}>
      {size.width > 0 && options ? (
        <MemoUplotReact options={options} data={built.data} />
      ) : null}
    </div>
  );
}
