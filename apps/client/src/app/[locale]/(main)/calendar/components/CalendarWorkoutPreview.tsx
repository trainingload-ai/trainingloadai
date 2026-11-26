import type { PlanWorkout } from "@/api/plans";
import type { PlanWorkoutDisplayKind } from "@/components/plan/detail/plan-detail-utils";
import { WorkoutMiniChart } from "@/components/plan/mobile-plan-workout-row";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";

export function calendarWorkoutStatusClassName(kind: PlanWorkoutDisplayKind) {
  switch (kind) {
    case "done":
      return "border-[hsl(var(--emerald-500))] bg-[hsl(var(--emerald-100)/0.9)] text-[hsl(var(--emerald-900))] dark:border-[hsl(var(--emerald-400))] dark:bg-[hsl(var(--emerald-500)/0.2)] dark:text-[hsl(var(--emerald-100))]";
    case "incomplete":
      return "border-[hsl(var(--amber-500))] bg-[hsl(var(--amber-100)/0.95)] text-[hsl(var(--amber-900))] dark:border-[hsl(var(--amber-400))] dark:bg-[hsl(var(--amber-500)/0.2)] dark:text-[hsl(var(--amber-100))]";
    case "inProgress":
      return "border-[hsl(var(--sky-500))] bg-[hsl(var(--sky-100)/0.95)] text-[hsl(var(--sky-900))] dark:border-[hsl(var(--sky-400))] dark:bg-[hsl(var(--sky-500)/0.2)] dark:text-[hsl(var(--sky-100))]";
    case "moved":
      return "border-[hsl(var(--violet-300)/0.45)] bg-[hsl(var(--violet-50)/0.3)] text-muted-foreground opacity-60 dark:border-[hsl(var(--violet-400)/0.25)] dark:bg-[hsl(var(--violet-500)/0.06)]";
    case "skipped":
      return "border-neutral-300/55 bg-neutral-100/40 text-muted-foreground opacity-55 dark:border-neutral-700/50 dark:bg-muted/15";
    default:
      return "border-[hsl(var(--teal-500))] bg-[hsl(var(--teal-100)/0.95)] text-[hsl(var(--teal-900))] dark:border-[hsl(var(--teal-400))] dark:bg-[hsl(var(--teal-500)/0.2)] dark:text-[hsl(var(--teal-100))]";
  }
}

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
