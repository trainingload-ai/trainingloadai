import type { PlanWorkoutStatus } from "@/api/plans";

export type PlanCyclePhase = "past" | "current" | "future";

export type PlanCycleProgressCounts = {
  completed: number;
  missed: number;
  skipped: number;
  moved: number;
  pending: number;
  total: number;
};

export type PlanCycleProgressWorkout = {
  status: PlanWorkoutStatus;
  dateKey: string | null;
  dayIndex: number;
};

export function summarizePlanCycleProgress(
  workouts: PlanCycleProgressWorkout[],
  options: {
    phase: PlanCyclePhase;
    todayKey: string;
    currentDayIndex: number | null;
  },
): PlanCycleProgressCounts {
  const result: PlanCycleProgressCounts = {
    completed: 0,
    missed: 0,
    skipped: 0,
    moved: 0,
    pending: 0,
    total: workouts.length,
  };

  for (const workout of workouts) {
    if (workout.status === "DONE") {
      result.completed += 1;
      continue;
    }
    if (workout.status === "SKIPPED") {
      result.skipped += 1;
      continue;
    }
    if (workout.status === "MOVED") {
      result.moved += 1;
      continue;
    }

    const dateHasPassed = Boolean(
      workout.dateKey && workout.dateKey < options.todayKey,
    );
    const dayHasPassedWithoutDate =
      !workout.dateKey &&
      options.currentDayIndex != null &&
      workout.dayIndex < options.currentDayIndex;
    const isMissed =
      options.phase === "past" ||
      (options.phase === "current" &&
        workout.status === "PLANNED" &&
        (dateHasPassed || dayHasPassedWithoutDate));

    if (isMissed) result.missed += 1;
    else result.pending += 1;
  }

  return result;
}
