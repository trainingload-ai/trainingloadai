import type { PlanWorkout } from "@/api/plans";
import { WorkoutMiniChart } from "@/components/plan/mobile-plan-workout-row";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";

export function CalendarWorkoutPreview({
  workout,
  title,
  caption,
}: {
  workout: PlanWorkout;
  title: string;
  caption?: string;
}) {
  return (
    <>
      {caption ? <span className="truncate text-[10px]">{caption}</span> : null}
      <span className="truncate text-[11px] font-medium" title={title}>{title}</span>
      {workout.structure?.kind === "ENDURANCE" && workout.structure.blocks.length ? (
        <WorkoutMiniChart workout={workout} className="min-h-7 w-full" />
      ) : workout.summary?.durationSeconds ? (
        <span className="text-[10px] text-muted-foreground">
          {formatWorkoutDuration(workout.summary.durationSeconds)}
        </span>
      ) : null}
    </>
  );
}
