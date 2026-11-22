"use client";

import type { SportType } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import { ViewWorkoutDialog } from "@/components/plan/view-workout-dialog";
import { canMoveCalendarWorkout } from "./calendar-move-model";

function parsePlanBlocks(workout: PlanWorkout) {
  if (workout.structure?.kind === "ENDURANCE") return workout.structure.blocks as ParsedPlan;
  try {
    const blocks: unknown = typeof workout.blocks === "string" ? JSON.parse(workout.blocks) : workout.blocks;
    return Array.isArray(blocks) ? (blocks as ParsedPlan) : null;
  } catch {
    return null;
  }
}

export function CalendarWorkoutDialog({
  workout,
  onOpenChange,
  onMoveWorkout,
}: {
  workout: PlanWorkout;
  onOpenChange: (open: boolean) => void;
  onMoveWorkout?: (workout: PlanWorkout) => void;
}) {
  return (
    <ViewWorkoutDialog
      open
      onOpenChange={onOpenChange}
      planId={workout.planId ?? undefined}
      workoutId={workout.id}
      weekIndex={Math.max(0, (workout.weekIndex ?? 1) - 1)}
      dayIndex={Math.max(0, (workout.dayIndex ?? 1) - 1)}
      notes={workout.notes}
      text={workout.text}
      sportType={workout.sportType as SportType}
      plan={parsePlanBlocks(workout)}
      workout={workout}
      onMoveWorkout={canMoveCalendarWorkout(workout) ? onMoveWorkout : undefined}
    />
  );
}
