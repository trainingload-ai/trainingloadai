import type { WorkRestStep } from "@/api/workout";
import type { PlanWorkoutEstimatedLoadInputs } from "@/api/plans";
import {
  workoutStepIntensityFactor as sharedWorkoutStepIntensityFactor,
  workoutStepSchematicHeight as sharedWorkoutStepSchematicHeight,
} from "@shared/workout-chart-intensity";

export type WorkoutChartThresholds =
  PlanWorkoutEstimatedLoadInputs["thresholds"];
/** Same threshold ratios as the load estimator. Never divide watts/bpm/speed
 * by unrelated global constants, and never treat cadence as intensity. */
export function workoutStepIntensityFactor(
  step: WorkRestStep,
  sport: string,
  thresholds?: WorkoutChartThresholds | null,
): number | null {
  return sharedWorkoutStepIntensityFactor(step, sport, thresholds);
}

/** Whole-chart fallback: an explicitly schematic phase/zone profile, without a
 * numeric intensity axis or tooltip. Do not mix it with calibrated IF values. */
export function workoutStepSchematicHeight(step: WorkRestStep): number {
  return sharedWorkoutStepSchematicHeight(step);
}
