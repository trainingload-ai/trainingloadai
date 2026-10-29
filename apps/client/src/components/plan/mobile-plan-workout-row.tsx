"use client";

import type { WorkRestStep } from "@/api/workout";
import {
  workoutStepIntensityFactor,
  workoutStepSchematicHeight,
} from "@/components/workout/workout-chart-intensity";

import { memo, useMemo } from "react";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import type { PlanWorkout, TrainingPlanDetail } from "@/api/plans";
import {
  buildWorkoutListNotes,
  buildWorkoutListTitle,
  formatSportTypeLabel,
  getPlanWorkoutDisplayKind,
  getPlanWorkoutMovedByLabel,
  getPlanWorkoutStatusLabel,
  getWorkoutDate,
} from "@/components/plan/detail/plan-detail-utils";
import { PlanWorkoutListRow } from "@/components/plan/plan-workout-list-row";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";

export type MobileWorkoutSegment = {
  duration: number;
  intensity: number;
  color: string;
  targetKind?: "SPEED" | "HEART_RATE_ZONE" | "POWER_ZONE";
  zoneIndex?: number;
};

const STEP_COLORS: Record<string, string> = {
  WARMUP: "#60a5fa",
  WORK: "#6366f1",
  RECOVERY: "#6ee7b7",
  REST: "#94a3b8",
  COOLDOWN: "#06b6d4",
  OTHER: "#8b5cf6",
};

const ZONE_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#9333ea",
  "#ec4899",
] as const;

function finiteNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function zoneTarget(step: Record<string, unknown>) {
  const primaryTarget = step.primaryTargetMeta;
  if (!primaryTarget || typeof primaryTarget !== "object") {
    return { targetKind: undefined, zoneIndex: undefined };
  }
  const target = primaryTarget as Record<string, unknown>;
  const kind = String(target.kind ?? "").toUpperCase();
  const targetKind =
    kind === "POWER_ZONE" || kind === "HEART_RATE_ZONE" || kind === "SPEED"
      ? kind
      : undefined;
  const zoneIndex = finiteNumber(target, ["zoneIndex"]);
  return {
    targetKind: targetKind as MobileWorkoutSegment["targetKind"],
    zoneIndex: zoneIndex ?? undefined,
  };
}

function segmentColor(kind: string, target: ReturnType<typeof zoneTarget>) {
  if (target.targetKind && target.zoneIndex && target.zoneIndex > 0) {
    const index = Math.floor(target.zoneIndex) - 1;
    return ZONE_COLORS[index] ?? ZONE_COLORS.at(-1)!;
  }
  return STEP_COLORS[kind] ?? STEP_COLORS.OTHER;
}

function stepDuration(step: Record<string, unknown>) {
  const direct = step.duration ?? step.durationSeconds ?? step.durationSec;
  if (typeof direct === "number" && direct > 0) return direct;
  const meta = step.durationMeta;
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    if (record.kind === "TIME" && typeof record.value === "number") {
      return Math.max(1, record.value);
    }
    if (record.kind === "DISTANCE" && typeof record.value === "number") {
      const kilometers =
        record.unit === "KILOMETERS"
          ? record.value
          : record.unit === "METERS"
            ? record.value / 1000
            : record.value;
      return Math.max(60, kilometers * 300);
    }
    if (record.kind === "CALORIES" && typeof record.value === "number") {
      return Math.max(60, record.value * 2.5);
    }
  }
  return 60;
}

export function buildMobileWorkoutSegments(workout: PlanWorkout) {
  if (workout.structure.kind !== "ENDURANCE") return [];
  const segments: MobileWorkoutSegment[] = [];
  const steps: WorkRestStep[] = [];
  const emitBlock = (block: unknown) => {
    if (!block || typeof block !== "object") return;
    const record = block as Record<string, unknown>;
    if (record.type === "repeat" && Array.isArray(record.children)) {
      const count =
        typeof record.count === "number" ? Math.max(1, record.count) : 1;
      for (let repeat = 0; repeat < count; repeat += 1) {
        record.children.forEach(emitBlock);
      }
      return;
    }
    if (!Array.isArray(record.steps)) return;
    for (const rawStep of record.steps) {
      if (!rawStep || typeof rawStep !== "object") continue;
      const step = rawStep as Record<string, unknown>;
      const kind = String(step.stepKind ?? "OTHER").toUpperCase();
      const target = zoneTarget(step);
      steps.push(step as WorkRestStep);
      segments.push({
        duration: stepDuration(step),
        intensity: 0,
        color: segmentColor(kind, target),
        ...target,
      });
    }
  };
  workout.structure.blocks.forEach(emitBlock);
  const factors = steps.map((step) =>
    workoutStepIntensityFactor(
      step,
      workout.sportType,
      workout.estimatedLoadInputs?.thresholds,
    ),
  );
  const schematic = factors.some((factor) => factor == null);
  const heights = steps.map((step, index) =>
    schematic ? workoutStepSchematicHeight(step) : factors[index]! * 100,
  );
  const ceiling = Math.max(100, ...heights);
  return segments
    .map((segment, index) => ({
      ...segment,
      intensity: (heights[index] / ceiling) * 100,
    }))
    .slice(0, 18);
}

function buildFallbackWorkoutSegments(text: string | null | undefined) {
  const normalized = String(text ?? "");
  const readMinutes = (pattern: RegExp, fallback: number) => {
    const match = normalized.match(pattern);
    const minutes = match?.[1] ? Number(match[1]) : fallback;
    return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback;
  };

  return [
    {
      duration: readMinutes(/(?:warm\s*up|warmup|热身)\D{0,8}(\d+)/i, 5) * 60,
      intensity: 38,
      color: STEP_COLORS.WARMUP,
    },
    {
      duration: readMinutes(/(?:work|main|主课|训练)\D{0,8}(\d+)/i, 20) * 60,
      intensity: 72,
      color: STEP_COLORS.WORK,
    },
    {
      duration:
        readMinutes(/(?:cool\s*down|cooldown|放松)\D{0,8}(\d+)/i, 5) * 60,
      intensity: 42,
      color: STEP_COLORS.COOLDOWN,
    },
  ] satisfies MobileWorkoutSegment[];
}

export const WorkoutMiniChart = memo(function WorkoutMiniChart({
  fallbackText,
  workout,
}: {
  fallbackText?: string | null;
  workout: PlanWorkout | null;
}) {
  const segments = useMemo(() => {
    const structured = workout ? buildMobileWorkoutSegments(workout) : [];
    return structured.length > 0
      ? structured
      : buildFallbackWorkoutSegments(fallbackText ?? workout?.text);
  }, [fallbackText, workout]);
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(1, segment.duration),
    0,
  );
  let elapsed = 0;

  return (
    <div
      data-testid="workout-mini-chart"
      className="relative min-h-12 w-24 self-stretch shrink-0 overflow-hidden rounded-control bg-background/70 dark:bg-black/20"
    >
      {["25%", "50%", "75%"].map((top) => (
        <span
          key={top}
          className="absolute inset-x-1 border-t border-dashed border-zinc-300 dark:border-zinc-700"
          style={{ top }}
        />
      ))}
      {segments.length > 0 && total > 0 ? (
        segments.map((segment, index) => {
          const start = elapsed;
          elapsed += Math.max(1, segment.duration);
          return (
            <span
              key={`${index}-${start}`}
              className="absolute opacity-55"
              style={{
                backgroundColor: segment.color,
                bottom: "10%",
                left: `${5 + (start / total) * 90}%`,
                top: `${8 + ((100 - segment.intensity) / 100) * 62}%`,
                width: `${Math.max(2, (segment.duration / total) * 90)}%`,
              }}
            />
          );
        })
      ) : (
        <span className="absolute inset-x-[5%] bottom-[10%] top-[48%] rounded-compact bg-zinc-300/70 dark:bg-zinc-700/70" />
      )}
    </div>
  );
});

function finitePositive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function collectPlannedDistance(blocks: unknown[]): number {
  let total = 0;
  for (const rawBlock of blocks) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const block = rawBlock as Record<string, unknown>;
    const repeatCount =
      block.type === "repeat"
        ? Math.max(1, Math.floor(finitePositive(block.count) || 1))
        : 1;
    if (Array.isArray(block.children)) {
      total += collectPlannedDistance(block.children) * repeatCount;
    }
    if (!Array.isArray(block.steps)) continue;
    let blockDistance = 0;
    for (const rawStep of block.steps) {
      if (!rawStep || typeof rawStep !== "object") continue;
      const step = rawStep as Record<string, unknown>;
      const rawMeta = step.durationMeta;
      if (!rawMeta || typeof rawMeta !== "object") continue;
      const durationMeta = rawMeta as Record<string, unknown>;
      if (String(durationMeta.kind ?? "").toUpperCase() !== "DISTANCE") {
        continue;
      }
      const value = finitePositive(durationMeta.value);
      const unit = String(durationMeta.unit ?? "").toUpperCase();
      blockDistance +=
        unit === "KILOMETERS" || unit === "KM" ? value * 1000 : value;
    }
    total += blockDistance * repeatCount;
  }
  return total;
}

function formatPlannedDistance(workout: PlanWorkout) {
  const distanceMeters =
    workout.structure.kind === "ENDURANCE"
      ? collectPlannedDistance(workout.structure.blocks)
      : 0;
  if (!distanceMeters) return "—";
  const kilometers = distanceMeters / 1000;
  return `${kilometers >= 10 ? kilometers.toFixed(0) : kilometers.toFixed(1)} km`;
}

export function MobilePlanWorkoutRow({
  emptyDetail,
  emptyTitle,
  onClick,
  plan,
  showChart = true,
  showDateBlock = true,
  showMetrics = true,
  workout,
}: {
  emptyDetail: string;
  emptyTitle: string;
  onClick?: (workout: PlanWorkout) => void;
  plan?: TrainingPlanDetail;
  showChart?: boolean;
  showDateBlock?: boolean;
  showMetrics?: boolean;
  workout: PlanWorkout | null;
}) {
  const t = useTranslations("V2PlanDetailPage");
  const tActivities = useTranslations("activities");
  const tLoad = useTranslations("V2PlanDetailPage.mobile.loadChart");
  const locale = useLocale();
  const date = workout
    ? plan
      ? getWorkoutDate(plan, workout)
      : workout.scheduledDate
        ? dayjs(String(workout.scheduledDate).slice(0, 10))
        : null
    : null;
  const dateLabel = date
    ? new Intl.DateTimeFormat(locale, { month: "short" }).format(date.toDate())
    : t("mobile.unscheduled");
  const displayKind = workout
    ? getPlanWorkoutDisplayKind({
        status: workout.status,
        scheduledDate: date?.format("YYYY-MM-DD") ?? workout.scheduledDate,
      })
    : "upcoming";
  const statusLabel = workout ? getPlanWorkoutStatusLabel(t, displayKind) : "";
  const movedByLabel = workout
    ? getPlanWorkoutMovedByLabel(t, workout.movedBy)
    : null;
  const title = workout ? buildWorkoutListTitle(t, workout) : emptyTitle;
  const notes = workout ? buildWorkoutListNotes(workout) : emptyDetail;
  const detail = workout
    ? notes && notes !== title
      ? notes
      : ""
    : emptyDetail;
  const sportLabel = workout ? formatSportTypeLabel(t, workout.sportType) : "";
  const duration = workout
    ? formatWorkoutDuration(workout.summary.durationSeconds)
    : "";
  const meta = [sportLabel, duration !== "--" ? duration : null]
    .filter(Boolean)
    .join(" · ");
  const metrics =
    workout && showMetrics
      ? [
          {
            label: tActivities("distance"),
            value: formatPlannedDistance(workout),
          },
          {
            label: tActivities("duration"),
            value: duration !== "--" ? duration : "—",
          },
          {
            label: tLoad("plannedLoad"),
            value:
              typeof workout.estimatedLoad === "number" &&
              workout.estimatedLoad > 0
                ? String(Math.round(workout.estimatedLoad))
                : "—",
          },
        ]
      : undefined;

  return (
    <PlanWorkoutListRow
      dateLabel={showDateBlock ? (date?.format("DD") ?? "--") : undefined}
      dayLabel={showDateBlock ? dateLabel : undefined}
      displayKind={displayKind}
      onOpen={workout && onClick ? () => onClick(workout) : undefined}
      statusLabel={statusLabel}
      subtitle={detail}
      title={title}
      meta={
        movedByLabel && displayKind === "moved"
          ? movedByLabel
          : meta || t("mobile.session")
      }
      chart={showChart ? <WorkoutMiniChart workout={workout} /> : undefined}
      metrics={metrics}
    />
  );
}
