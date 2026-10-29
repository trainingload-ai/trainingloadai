import type { V2HomePlanWorkout } from "@/api/v2-home";

export type HomeWeeklySessionBar = {
  completed: number;
  planned: number;
};

export type HomeWeeklySummary = {
  completedSessions: number;
  plannedLoad: number;
  plannedSessions: number;
  sessionBars: HomeWeeklySessionBar[];
};

export function formatHomeWeekday(locale: string, dateKey: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
    homeDate(dateKey),
  );
}

export function formatHomeMonthDay(locale: string, dateKey: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(homeDate(dateKey));
}

function homeDate(dateKey: string) {
  const [year, month, day] = dateKey
    .slice(0, 10)
    .split("-")
    .map((value) => Number(value));
  return new Date(year, month - 1, day, 12);
}

/**
 * `currentWeekWorkouts` 已由首页 API 限定到当前计划周；这里统一 Web 与
 * mobile 的统计口径：MOVED 不计入目标，DONE 计入已完成。
 */
export function buildHomeWeeklySummary(
  workouts: V2HomePlanWorkout[] | undefined,
): HomeWeeklySummary {
  const sessionBars = Array.from({ length: 7 }, () => ({
    completed: 0,
    planned: 0,
  }));
  let completedSessions = 0;
  let plannedLoad = 0;
  let plannedSessions = 0;

  for (const workout of workouts ?? []) {
    if (workout.status === "MOVED") continue;

    plannedSessions += 1;
    if (
      typeof workout.estimatedLoad === "number" &&
      Number.isFinite(workout.estimatedLoad)
    ) {
      plannedLoad += Math.max(0, workout.estimatedLoad);
    }

    const dayIndex = Math.min(7, Math.max(1, workout.dayIndex)) - 1;
    const bar = sessionBars[dayIndex];
    if (bar) bar.planned += 1;

    if (workout.status === "DONE") {
      completedSessions += 1;
      if (bar) bar.completed += 1;
    }
  }

  return {
    completedSessions,
    plannedLoad: Math.round(plannedLoad),
    plannedSessions,
    sessionBars,
  };
}
