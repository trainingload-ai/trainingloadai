"use client";

import React, { memo, useCallback, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import type {
  ParsedPlan,
  WorkRestStep,
  WorkoutStepDurationMeta,
  WorkoutStepTarget,
} from "@/api/workout";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  DEFAULT_AXIS_FONT,
  DEFAULT_PADDING,
} from "@/components/charts/uplot/uPlotConfig";
import {
  useElementSize,
  useThemeColor,
} from "@/components/charts/uplot/useElementSize";
import { cn, formatter } from "@/lib/utils";
import {
  formatPaceKmhForSportDisplay,
  type WorkoutExpressionSportType,
} from "@/components/plan/workout-expression-codec";
import {
  resolveWorkoutSegmentColor,
  resolveWorkoutZoneColor,
  type WorkoutZoneColorMap,
} from "./workout-zone-colors";
import {
  workoutStepIntensityFactor,
  workoutStepSchematicHeight,
  type WorkoutChartThresholds,
} from "./workout-chart-intensity";

const MemoUplotReact = memo(UplotReact);

/** 单段可视化：时间轴 + 可比较的估算 IF；缺少阈值时整图降级为结构示意。 */
type Segment = {
  t0: number;
  t1: number;
  /** IF × 100 或整图一致的示意高度；高于阈值时可超过 100。 */
  displayY: number;
  powerWatts?: number;
  powerPercent?: number;
  heartRateBpm?: number;
  paceKmh?: number;
  rpm?: number;
  gradeDeg?: number;
  zoneLabel?: string;
  zoneIndex?: number;
  zoneTargetKind?: WorkoutStepTarget["kind"];
  stepKind?: WorkRestStep["stepKind"];
};

const POWER_ZONES = [
  { key: "power_Z1", name: "Power Z1", min: 0, max: 55, color: "#94a3b8" },
  { key: "power_Z2", name: "Power Z2", min: 55, max: 75, color: "#3b82f6" },
  { key: "power_Z3", name: "Power Z3", min: 75, max: 90, color: "#10b981" },
  { key: "power_Z4", name: "Power Z4", min: 90, max: 105, color: "#f59e0b" },
  { key: "power_Z5", name: "Power Z5", min: 105, max: 120, color: "#ef4444" },
  { key: "power_Z6", name: "Power Z6", min: 120, max: 150, color: "#dc2626" },
  { key: "power_Z7", name: "Power Z7", min: 150, max: 1000, color: "#7c2d12" },
] as const;

function zoneForPower(p: number) {
  return POWER_ZONES.find((z) => p >= z.min && p < z.max) || POWER_ZONES[0];
}

/** duration 为 0 时按 durationMeta 估时间轴宽度（仅用于横向排布） */
function effectiveDurationSeconds(s: WorkRestStep): number {
  const d = typeof s.duration === "number" ? s.duration : 0;
  if (d > 0) return d;

  const meta = s.durationMeta as WorkoutStepDurationMeta | null | undefined;
  if (!meta || !meta.kind) return 60;

  if (meta.kind === "TIME" && typeof meta.value === "number") {
    return Math.max(1, meta.value);
  }
  if (meta.kind === "DISTANCE" && typeof meta.value === "number") {
    const km =
      meta.unit === "KILOMETERS"
        ? meta.value
        : meta.unit === "METERS"
          ? meta.value / 1000
          : meta.value;
    return Math.max(60, km * 300);
  }
  if (meta.kind === "CALORIES" && typeof meta.value === "number") {
    return Math.max(60, meta.value * 2.5);
  }
  if (
    (meta.kind === "HR_LESS_THAN" ||
      meta.kind === "HR_GREATER_THAN" ||
      meta.kind === "POWER_LESS_THAN" ||
      meta.kind === "POWER_GREATER_THAN" ||
      meta.kind === "CADENCE_LESS_THAN" ||
      meta.kind === "CADENCE_GREATER_THAN") &&
    typeof meta.value === "number"
  ) {
    return 120;
  }
  return 60;
}

function flattenSegments(
  plan: ParsedPlan,
  intensity: (step: WorkRestStep) => number,
): Segment[] {
  const out: Segment[] = [];
  let tAcc = 0;

  const emitBlock = (block: { type: string; steps?: WorkRestStep[] }) => {
    const steps = block?.steps || [];
    for (const s of steps) {
      const dur = effectiveDurationSeconds(s);
      const powerWatts =
        typeof s.powerWatts === "number" ? s.powerWatts : undefined;
      const powerPercent =
        typeof s.power === "number" ? Math.round(s.power * 100) : undefined;
      const heartRateBpm =
        typeof s.heartRateBpm === "number" ? s.heartRateBpm : undefined;
      const paceKmh = typeof s.paceKmh === "number" ? s.paceKmh : undefined;
      const rpm = typeof s.cadence === "number" ? s.cadence : undefined;
      const gradeDeg = typeof s.gradeDeg === "number" ? s.gradeDeg : undefined;
      const zoneLabel =
        typeof s.primaryTargetMeta?.zoneIndex === "number"
          ? s.primaryTargetMeta.zoneLabel || `Z${s.primaryTargetMeta.zoneIndex}`
          : undefined;
      const zoneTargetKind = zoneLabel ? s.primaryTargetMeta?.kind : undefined;
      const zoneIndex = s.primaryTargetMeta?.zoneIndex;
      const displayY = intensity(s);

      out.push({
        t0: tAcc,
        t1: tAcc + dur,
        displayY,
        powerWatts,
        powerPercent,
        heartRateBpm,
        paceKmh,
        rpm,
        gradeDeg,
        zoneLabel,
        zoneIndex,
        zoneTargetKind,
        stepKind: s.stepKind,
      });
      tAcc += dur;
    }
  };

  for (const item of plan || []) {
    if (item?.type === "repeat") {
      const children = item.children || [];
      const count = item.count || 0;
      for (let i = 0; i < count; i++) {
        for (const child of children) emitBlock(child);
      }
    } else {
      emitBlock(item);
    }
  }
  return out;
}

function buildUplotAlignedData(segments: Segment[]): {
  data: uPlot.AlignedData;
} | null {
  const valid = segments.filter((s) => s.t1 > s.t0);
  if (valid.length === 0) return null;

  const x: number[] = [valid[0].t0];
  for (const s of valid) x.push(s.t1);

  const y: number[] = valid.map((s) => s.displayY);
  y.push(y[y.length - 1] ?? 0);

  return {
    data: [x, y],
  };
}

function paceOrSpeedLabel(
  sportType: WorkoutExpressionSportType | null | undefined,
  t: (key: string) => string,
): string {
  const st = `${sportType ?? "RUN"}`.toUpperCase();
  return st === "CYCLING" ? t("labels.speed") : t("labels.pace");
}

/** X：累计秒 → 与活动图表一致的时长刻度，不对首个刻度做额外位移。 */
function formatWorkoutTimeAxisValues(_u: uPlot, ticks: number[]): string[] {
  return ticks.map((value) => formatter("elTimeS", Math.round(value)));
}

/** Y：相对强度刻度取整，必要时略微扩展上界便于对齐网格 */
function yScaleRangeWithNiceTicks(
  _u: uPlot,
  min: number,
  max: number,
): [number, number] {
  const lo = Math.min(min, 0);
  let hi = Math.max(max, 10);
  const span = hi - lo;
  const pad = Math.max(span * 0.06, 2);
  hi = hi + pad;
  const step = hi <= 30 ? 5 : hi <= 80 ? 10 : 20;
  hi = Math.ceil(hi / step) * step;
  return [lo, hi];
}

function workoutBlocksPlugin(
  segments: Segment[],
  zoneColors?: WorkoutZoneColorMap,
): uPlot.Plugin {
  return {
    hooks: {
      drawClear: [
        (u) => {
          const ctx = u.ctx;
          const baseline = u.valToPos(0, "y", true);
          ctx.save();
          ctx.beginPath();
          ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          ctx.clip();
          ctx.globalAlpha = 0.5;
          for (const segment of segments) {
            const color = resolveWorkoutSegmentColor(
              segment.zoneTargetKind,
              segment.zoneIndex,
              segment.stepKind,
              zoneColors,
            );
            const left = u.valToPos(segment.t0, "x", true);
            const right = u.valToPos(segment.t1, "x", true);
            const top = u.valToPos(segment.displayY, "y", true);
            ctx.fillStyle = color;
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

const WorkoutPlanChartComponent: React.FC<{
  plan: ParsedPlan | null;
  /** 用于 Tooltip 配速/速度文案（跑：分秒/km；游：/100m；骑：km/h） */
  sportType?: WorkoutExpressionSportType | null;
  hideAxes?: boolean;
  /** 为 true 时不挂载 hover tooltip（与 hideAxes 独立） */
  hideTooltip?: boolean;
  /** 嵌入可点击卡片时设为 true，避免 uPlot 拦截点击 */
  nonInteractive?: boolean;
  height?: number;
  /** 填满父容器并根据 ResizeObserver 的高度重绘，避免固定高度产生内部滚动。 */
  fillHeight?: boolean;
  /** 弹窗等窄容器：收紧坐标轴占位与 padding，避免绘图区显得向右挤 */
  compact?: boolean;
  /** 用户配置的配速/心率/功率区间颜色；未配置时使用标准区间色板。 */
  zoneColors?: WorkoutZoneColorMap;
  thresholds?: WorkoutChartThresholds | null;
}> = ({
  plan,
  sportType = "RUN",
  hideAxes = false,
  hideTooltip = false,
  nonInteractive = false,
  height = 240,
  fillHeight = false,
  compact = false,
  zoneColors,
  thresholds,
}) => {
  const t = useTranslations("WorkoutPlanChart");
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const resolveColor = useThemeColor();
  const stepKindLabel = useMemo(
    () => ({
      WARMUP: t("stepKind.WARMUP"),
      WORK: t("stepKind.WORK"),
      RECOVERY: t("stepKind.RECOVERY"),
      REST: t("stepKind.REST"),
      COOLDOWN: t("stepKind.COOLDOWN"),
      OTHER: t("stepKind.OTHER"),
    }),
    [t],
  );

  const { segments, schematic } = useMemo(() => {
    if (!plan) return { segments: [], schematic: false };
    const factors = flattenSegments(
      plan,
      (step) =>
        workoutStepIntensityFactor(step, sportType ?? "RUN", thresholds) ?? NaN,
    );
    const schematic = factors.some(
      (segment) => !Number.isFinite(segment.displayY),
    );
    return {
      segments: schematic
        ? flattenSegments(plan, workoutStepSchematicHeight)
        : factors.map((s) => ({ ...s, displayY: s.displayY * 100 })),
      schematic,
    };
  }, [plan, sportType, thresholds]);

  const built = useMemo(() => buildUplotAlignedData(segments), [segments]);
  const tooltipDisabled = hideTooltip;

  const uplotData = built?.data ?? [[], []];

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (idx == null || idx < 0) return;
      const tSec = Number(uplotData[0]?.[idx]);
      if (!Number.isFinite(tSec)) return;

      const segIdx = Math.min(idx, Math.max(0, segments.length - 1));
      const seg = segments[segIdx];
      if (!seg) return;
      const segmentColor = resolveWorkoutSegmentColor(
        seg.zoneTargetKind,
        seg.zoneIndex,
        seg.stepKind,
        zoneColors,
      );

      const rows: { color: string; label: string; text: string }[] = [];

      if (seg.stepKind) {
        rows.push({
          color: segmentColor,
          label: t("labels.type"),
          text: stepKindLabel[seg.stepKind] ?? seg.stepKind,
        });
      }
      if (typeof seg.powerWatts === "number") {
        rows.push({
          color: resolveColor("--chart-1"),
          label: t("labels.power"),
          text: `${Math.round(seg.powerWatts)} W`,
        });
      }
      if (typeof seg.powerPercent === "number") {
        const z = zoneForPower(seg.powerPercent);
        rows.push({
          color: z.color,
          label: z.name,
          text: `${Math.round(seg.powerPercent)}%`,
        });
      }
      if (typeof seg.heartRateBpm === "number") {
        rows.push({
          color: resolveColor("--destructive"),
          label: t("labels.heartRate"),
          text: `${Math.round(seg.heartRateBpm)} bpm`,
        });
      }
      if (typeof seg.paceKmh === "number") {
        rows.push({
          color: resolveColor("--primary"),
          label: paceOrSpeedLabel(sportType, t),
          text: formatPaceKmhForSportDisplay(seg.paceKmh, sportType),
        });
      }
      if (seg.zoneLabel) {
        const label =
          seg.zoneTargetKind === "POWER_ZONE"
            ? t("labels.power")
            : seg.zoneTargetKind === "HEART_RATE_ZONE"
              ? t("labels.heartRate")
              : paceOrSpeedLabel(sportType, t);
        rows.push({
          color:
            resolveWorkoutZoneColor(
              seg.zoneTargetKind,
              seg.zoneIndex,
              zoneColors,
            ) ?? resolveColor("--primary"),
          label,
          text: seg.zoneLabel,
        });
      }
      if (typeof seg.rpm === "number") {
        rows.push({
          color: resolveColor("--muted-foreground"),
          label: "RPM",
          text: `${Math.round(seg.rpm)}`,
        });
      }
      if (typeof seg.gradeDeg === "number") {
        rows.push({
          color: resolveColor("--muted-foreground"),
          label: t("labels.grade"),
          text: `${seg.gradeDeg.toFixed(1)}°`,
        });
      }

      if (!schematic)
        rows.push({
          color: segmentColor,
          label: t("labels.estimatedIf"),
          text: `${(seg.displayY / 100).toFixed(2)}`,
        });

      const content = (
        <div className="grid min-w-36 items-start gap-1.5">
          <div className="font-medium">
            {t("labels.time")} {formatter("elTimeS", Math.round(tSec))}
          </div>
          <div className="grid gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex w-full items-center gap-2">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-micro"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-muted-foreground">{r.label}</span>
                <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                  {r.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [
      resolveColor,
      segments,
      schematic,
      sportType,
      stepKindLabel,
      t,
      uplotData,
      zoneColors,
    ],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const workoutBlocks = useMemo(
    () => workoutBlocksPlugin(segments, zoneColors),
    [segments, zoneColors],
  );
  const uplotPlugins = useMemo(
    () => (tooltipDisabled ? [workoutBlocks] : [workoutBlocks, tooltipPlugin]),
    [tooltipDisabled, tooltipPlugin, workoutBlocks],
  );

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const w = chartAreaSize.width;
    const h = fillHeight ? chartAreaSize.height : height;
    if (w <= 0 || h <= 0) return null;
    if (!built) return null;

    const axisStroke = resolveColor("--muted-foreground");
    const gridStroke = resolveColor("--border");
    const strokeMain = resolveColor("--primary");

    const stepped = uPlot.paths.stepped!({ align: 1 });

    const series: uPlot.Series[] = [
      {},
      {
        label: t(schematic ? "labels.schematic" : "labels.estimatedIf"),
        stroke: strokeMain,
        width: 1.25,
        fill: undefined,
        paths: stepped,
        spanGaps: false,
      } as uPlot.Series,
    ];

    const gridStyle = {
      show: true as const,
      stroke: gridStroke,
      width: 1,
      dash: [3, 3] as [number, number],
    };
    const axisTicks = {
      show: false as const,
    };
    const axisGap = compact ? 4 : 6;

    const axisXFull: uPlot.Axis = {
      stroke: axisStroke,
      grid: { show: false },
      ticks: axisTicks,
      font: DEFAULT_AXIS_FONT,
      gap: axisGap,
      size: compact ? 22 : 24,
      values: formatWorkoutTimeAxisValues,
    };

    const axisHidden: uPlot.Axis = { show: false };

    const axisYFull: uPlot.Axis = {
      stroke: axisStroke,
      grid: gridStyle,
      ticks: axisTicks,
      font: DEFAULT_AXIS_FONT,
      gap: axisGap,
      size: compact ? 28 : 32,
      values: (_u, ticks) => ticks.map((v) => (Number(v) / 100).toFixed(1)),
    };

    const padding: [number, number, number, number] = hideAxes
      ? [4, 4, 4, 4]
      : compact
        ? [
            Math.min(DEFAULT_PADDING[0], 8),
            Math.min(DEFAULT_PADDING[1], 6),
            Math.min(DEFAULT_PADDING[2], 6),
            Math.min(DEFAULT_PADDING[3], 6),
          ]
        : [
            DEFAULT_PADDING[0],
            DEFAULT_PADDING[1],
            Math.max(DEFAULT_PADDING[2], 28),
            Math.min(DEFAULT_PADDING[3], 10),
          ];

    return {
      width: w,
      height: h,
      legend: { show: false },
      padding,
      cursor: hideTooltip
        ? {
            show: false,
            drag: { x: false, y: false, setScale: false },
          }
        : {
            y: false,
            drag: { x: true, y: false, setScale: true },
          },
      scales: {
        x: { time: false },
        y: {
          auto: true,
          range: yScaleRangeWithNiceTicks,
        },
      },
      axes: hideAxes
        ? [axisHidden, axisHidden]
        : [axisXFull, schematic ? axisHidden : axisYFull],
      series,
      plugins: uplotPlugins,
    };
  }, [
    built,
    schematic,
    chartAreaSize.height,
    chartAreaSize.width,
    fillHeight,
    height,
    hideAxes,
    hideTooltip,
    compact,
    resolveColor,
    t,
    uplotPlugins,
  ]);

  const alignedForPlot = useMemo((): uPlot.AlignedData => {
    if (!built) return [[], []];
    return built.data;
  }, [built]);

  if (!plan || segments.length === 0 || !built) {
    return (
      <div className="text-sm text-muted-foreground h-full flex items-center justify-center">
        {t("empty")}
      </div>
    );
  }

  return (
    <div
      ref={chartWrapperRef}
      className={cn(
        "relative w-full",
        fillHeight && "h-full",
        nonInteractive && "pointer-events-none",
      )}
      style={fillHeight ? undefined : { height }}
      data-uplot-chart
    >
      {!hideAxes && (
        <span className="absolute right-2 top-0 z-10 text-[10px] text-muted-foreground">
          {t(schematic ? "labels.schematic" : "labels.estimatedIf")}
        </span>
      )}
      <div ref={chartAreaRef} className="h-full w-full min-h-[1px] min-w-[1px]">
        {uplotOptions && alignedForPlot[0].length > 0 ? (
          <MemoUplotReact options={uplotOptions} data={alignedForPlot} />
        ) : null}
      </div>
      {tooltipDisabled ? null : tooltip}
    </div>
  );
};

export const WorkoutPlanChart = React.memo(
  WorkoutPlanChartComponent,
  (prev, next) =>
    prev.plan === next.plan &&
    prev.sportType === next.sportType &&
    prev.hideAxes === next.hideAxes &&
    prev.hideTooltip === next.hideTooltip &&
    prev.nonInteractive === next.nonInteractive &&
    prev.height === next.height &&
    prev.fillHeight === next.fillHeight &&
    prev.compact === next.compact &&
    prev.zoneColors === next.zoneColors &&
    prev.thresholds === next.thresholds,
);
