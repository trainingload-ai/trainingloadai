import type { UserZoneSetting } from "@/api/settings";
import type { WorkRestStep, WorkoutStepTarget } from "@/api/workout";

export type WorkoutZoneMetric = "pace" | "heartRate" | "power";
export type WorkoutZoneColorMap = Partial<
  Record<WorkoutZoneMetric, readonly (string | undefined)[]>
>;

export const DEFAULT_WORKOUT_ZONE_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#9333ea",
  "#ec4899",
] as const;

export const DEFAULT_WORKOUT_STEP_COLORS: Record<
  NonNullable<WorkRestStep["stepKind"]>,
  string
> = {
  WARMUP: "#60a5fa",
  WORK: "#6366f1",
  RECOVERY: "#6ee7b7",
  REST: "#94a3b8",
  COOLDOWN: "#06b6d4",
  OTHER: "#8b5cf6",
};

export function workoutZoneMetric(
  kind: WorkoutStepTarget["kind"] | undefined,
): WorkoutZoneMetric | null {
  if (kind === "POWER_ZONE") return "power";
  if (kind === "HEART_RATE_ZONE") return "heartRate";
  if (kind === "SPEED") return "pace";
  return null;
}

export function resolveWorkoutZoneColor(
  kind: WorkoutStepTarget["kind"] | undefined,
  zoneIndex: number | undefined,
  colors?: WorkoutZoneColorMap,
): string | null {
  const metric = workoutZoneMetric(kind);
  if (
    !metric ||
    typeof zoneIndex !== "number" ||
    !Number.isFinite(zoneIndex) ||
    zoneIndex <= 0
  ) {
    return null;
  }
  const index = Math.floor(zoneIndex) - 1;
  return (
    colors?.[metric]?.[index]?.trim() ||
    DEFAULT_WORKOUT_ZONE_COLORS[index] ||
    DEFAULT_WORKOUT_ZONE_COLORS.at(-1)!
  );
}

/** 区间色优先；没有区间目标时，每种训练步骤也始终拥有可见的默认色。 */
export function resolveWorkoutSegmentColor(
  kind: WorkoutStepTarget["kind"] | undefined,
  zoneIndex: number | undefined,
  stepKind: WorkRestStep["stepKind"] | undefined,
  colors?: WorkoutZoneColorMap,
): string {
  return (
    resolveWorkoutZoneColor(kind, zoneIndex, colors) ??
    DEFAULT_WORKOUT_STEP_COLORS[stepKind ?? "OTHER"]
  );
}

export function workoutZoneColorsFromSettings(
  settings: readonly UserZoneSetting[] | undefined,
  sportType: string,
): WorkoutZoneColorMap {
  const sport = sportType.trim().toUpperCase();
  const colorsFor = (zoneType: "PACE" | "HEART_RATE" | "POWER") =>
    settings
      ?.find(
        (setting) =>
          setting.sportType.trim().toUpperCase() === sport &&
          setting.zoneType.trim().toUpperCase() === zoneType,
      )
      ?.zones.map((zone) => zone.color?.trim() || undefined);

  return {
    pace: colorsFor("PACE"),
    heartRate: colorsFor("HEART_RATE"),
    power: colorsFor("POWER"),
  };
}
