import type { WorkoutStructure } from "@shared/workout-structure";
import type { DemoWorkoutSegment } from "@/components/charts/demo-workout-plan-chart";

const STEP_KIND_INTENSITY: Record<string, number> = {
  WARMUP: 34,
  COOLDOWN: 34,
  RECOVERY: 32,
  REST: 12,
  WORK: 72,
  INTERVAL: 88,
  OTHER: 46,
};

/** 与 App `workout-zone-colors.ts` 同一套默认色，公开预览没有用户自定义区间。 */
const ZONE_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#9333ea",
  "#ec4899",
] as const;

const STEP_COLORS: Record<string, string> = {
  WARMUP: "#60a5fa",
  WORK: "#6366f1",
  INTERVAL: "#6366f1",
  RECOVERY: "#6ee7b7",
  REST: "#94a3b8",
  COOLDOWN: "#06b6d4",
  OTHER: "#8b5cf6",
};

function zoneTarget(step: Record<string, unknown>) {
  const target = step.primaryTargetMeta;
  if (!target || typeof target !== "object") {
    return { kind: "", zoneIndex: 0 };
  }
  const meta = target as { kind?: unknown; zoneIndex?: unknown };
  return {
    kind: String(meta.kind ?? "").toUpperCase(),
    zoneIndex: Number(meta.zoneIndex ?? 0),
  };
}

function stepIntensity(step: Record<string, unknown>) {
  const zone = zoneTarget(step).zoneIndex;
  if (zone >= 1 && zone <= 6) return Math.min(100, 18 + zone * 14);
  const kind = String(step.stepKind ?? "").toUpperCase();
  return STEP_KIND_INTENSITY[kind] ?? 52;
}

function stepColor(step: Record<string, unknown>) {
  const target = zoneTarget(step);
  if (
    (target.kind === "HEART_RATE_ZONE" ||
      target.kind === "POWER_ZONE" ||
      target.kind === "SPEED") &&
    target.zoneIndex >= 1
  ) {
    const index = Math.floor(target.zoneIndex) - 1;
    return ZONE_COLORS[index] ?? ZONE_COLORS[ZONE_COLORS.length - 1];
  }
  const kind = String(step.stepKind ?? "").toUpperCase();
  return STEP_COLORS[kind] ?? STEP_COLORS.OTHER;
}

function visitBlocks(
  blocks: unknown[],
  elapsed: { value: number },
  segments: DemoWorkoutSegment[],
) {
  for (const block of blocks) {
    const row = block as {
      type?: string;
      count?: number;
      children?: unknown[];
      steps?: unknown[];
    };
    if (row?.type === "repeat") {
      const count = Math.max(0, Number(row.count ?? 0));
      for (let index = 0; index < count; index += 1) {
        visitBlocks(
          Array.isArray(row.children) ? row.children : [],
          elapsed,
          segments,
        );
      }
      continue;
    }
    for (const step of Array.isArray(row?.steps) ? row.steps : []) {
      const record = (step ?? {}) as Record<string, unknown>;
      const duration = Number(record.duration ?? 0);
      if (!Number.isFinite(duration) || duration <= 0) continue;
      const meta = record.durationMeta as { kind?: string } | null | undefined;
      if (meta?.kind && meta.kind !== "TIME") continue;
      segments.push({
        t0: elapsed.value,
        t1: elapsed.value + duration,
        displayY: stepIntensity(record),
        color: stepColor(record),
      });
      elapsed.value += duration;
    }
  }
}

export function enduranceStructureToChartSegments(
  structure?: WorkoutStructure,
): DemoWorkoutSegment[] {
  if (!structure || structure.kind !== "ENDURANCE") return [];
  const segments: DemoWorkoutSegment[] = [];
  visitBlocks(
    Array.isArray(structure.blocks) ? structure.blocks : [],
    { value: 0 },
    segments,
  );
  return segments;
}
