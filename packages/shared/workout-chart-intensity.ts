import { resolveLthrForCalculation } from "./lthr";

export type WorkoutChartThresholds = {
  ftp?: number | null;
  cp?: number | null;
  maxHeartRate?: number | null;
  lthr?: number | null;
  runThresholdPaceSecPerKm?: number | null;
  swimThresholdPaceSecPer100m?: number | null;
};

export type WorkoutChartIntensityStep = {
  powerWatts?: number | null;
  power?: number | null;
  heartRateBpm?: number | null;
  heartRatePercent?: number | null;
  paceKmh?: number | null;
  stepKind?: string | null;
  primaryTargetMeta?: { zoneIndex?: number | null } | null;
};

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Normalize a structured target against the threshold snapshot used by load
 * estimation. Cadence is deliberately excluded because it is not intensity.
 */
export function workoutStepIntensityFactor(
  step: WorkoutChartIntensityStep,
  sport: string,
  thresholds?: WorkoutChartThresholds | null,
): number | null {
  if (positive(step.powerWatts)) {
    const threshold = thresholds?.ftp ?? thresholds?.cp;
    return positive(threshold) ? step.powerWatts / threshold : null;
  }
  if (positive(step.power)) return step.power;
  if (positive(step.heartRateBpm)) {
    const lthr = resolveLthrForCalculation({
      lthr: thresholds?.lthr,
      maxHeartRate: thresholds?.maxHeartRate,
    });
    return lthr ? step.heartRateBpm / lthr.value : null;
  }
  if (positive(step.heartRatePercent)) return step.heartRatePercent / 100;
  if (positive(step.paceKmh)) {
    const pace =
      sport === "SWIM"
        ? thresholds?.swimThresholdPaceSecPer100m
        : sport === "RUN"
          ? thresholds?.runThresholdPaceSecPerKm
          : null;
    return positive(pace)
      ? (pace * step.paceKmh) / (sport === "SWIM" ? 360 : 3600)
      : null;
  }
  if (positive(step.primaryTargetMeta?.zoneIndex)) return null;
  switch (String(step.stepKind ?? "").toUpperCase()) {
    case "WARMUP":
    case "COOLDOWN":
      return 0.55;
    case "RECOVERY":
    case "REST":
      return 0.45;
    case "WORK":
      return 0.7;
    case "OTHER":
      return 0.65;
    default:
      return null;
  }
}

/** Schematic-only profile for a chart without calibrated threshold inputs. */
export function workoutStepSchematicHeight(
  step: WorkoutChartIntensityStep,
): number {
  const zone = step.primaryTargetMeta?.zoneIndex;
  if (positive(zone)) return 65 + (zone - 1) * 10;
  switch (String(step.stepKind ?? "").toUpperCase()) {
    case "WARMUP":
    case "COOLDOWN":
      return 55;
    case "REST":
    case "RECOVERY":
      return 45;
    default:
      return 70;
  }
}
