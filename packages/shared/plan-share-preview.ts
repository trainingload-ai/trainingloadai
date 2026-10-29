import type { WorkoutStructure } from "./workout-structure";
import { previewMetricsFromStructure } from "./plan-share";

export const SHARE_PREVIEW_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type SharePreviewWorkout = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex: number;
  sportType: string;
  name: string | null;
  notes: string | null;
  structureKind: string;
  structure?: WorkoutStructure;
  durationSeconds?: number | null;
  previewLoad?: number | null;
};

export type SharePreviewDay = {
  dayIndex: number;
  workouts: SharePreviewWorkout[];
};

export type SharePreviewWeek = {
  weekIndex: number;
  days: SharePreviewDay[];
  sessionCount: number;
  previewLoad: number;
};

function clampWeekCount(periodWeeks: number, workouts: SharePreviewWorkout[]) {
  const fromWorkouts = workouts.reduce(
    (max, workout) => Math.max(max, workout.weekIndex),
    0,
  );
  const weeks = Math.max(periodWeeks, fromWorkouts, 1);
  return Math.min(weeks, 52);
}

export function groupSharePreviewWeeks(
  workouts: SharePreviewWorkout[],
  periodWeeks: number,
): SharePreviewWeek[] {
  const weekCount = clampWeekCount(periodWeeks, workouts);
  const byWeekDay = new Map<string, SharePreviewWorkout[]>();

  for (const workout of workouts) {
    if (workout.weekIndex < 1 || workout.dayIndex < 1 || workout.dayIndex > 7) {
      continue;
    }
    const metrics = previewMetricsFromStructure(workout.structure);
    const enriched: SharePreviewWorkout = {
      ...workout,
      durationSeconds: workout.durationSeconds ?? metrics.durationSeconds,
      previewLoad: workout.previewLoad ?? metrics.previewLoad,
    };
    const key = `${workout.weekIndex}-${workout.dayIndex}`;
    const list = byWeekDay.get(key);
    if (list) list.push(enriched);
    else byWeekDay.set(key, [enriched]);
  }

  const weeks: SharePreviewWeek[] = [];
  for (let weekIndex = 1; weekIndex <= weekCount; weekIndex += 1) {
    const days = SHARE_PREVIEW_DAYS.map((dayIndex) => {
      const list = byWeekDay.get(`${weekIndex}-${dayIndex}`) ?? [];
      return {
        dayIndex,
        workouts: list.toSorted(
          (a, b) => a.sessionIndex - b.sessionIndex,
        ),
      };
    });
    weeks.push({
      weekIndex,
      days,
      sessionCount: days.reduce((sum, day) => sum + day.workouts.length, 0),
      previewLoad: roundPreviewLoad(
        days.reduce(
          (sum, day) =>
            sum +
            day.workouts.reduce(
              (daySum, workout) => daySum + workoutPreviewLoad(workout),
              0,
            ),
          0,
        ),
      ),
    });
  }
  return weeks;
}

export function firstBusyWeekIndex(weeks: SharePreviewWeek[]) {
  return weeks.find((week) => week.sessionCount > 0)?.weekIndex ?? weeks[0]?.weekIndex ?? 1;
}

export function uniqueSportTypes(sportTypes: string[], workouts: SharePreviewWorkout[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const sport of [...sportTypes, ...workouts.map((item) => item.sportType)]) {
    const key = sport.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered;
}

function roundPreviewLoad(value: number) {
  return Math.round(value * 10) / 10;
}

function workoutPreviewLoad(workout: SharePreviewWorkout) {
  if (typeof workout.previewLoad === "number" && workout.previewLoad > 0) {
    return workout.previewLoad;
  }
  return previewMetricsFromStructure(workout.structure).previewLoad ?? 0;
}
