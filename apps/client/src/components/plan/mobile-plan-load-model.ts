import type { PlanWorkout, TrainingPlanDetail } from "@/api/plans";

export type PlanLoadPoint = {
  key: string;
  load: number;
  ctl: number;
  atl: number;
};

export function normalizeDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parsePlanDate(value: string | null | undefined) {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
      ? date
      : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function workoutDateKey(workout: Pick<PlanWorkout, "scheduledDate">) {
  const date = parsePlanDate(workout.scheduledDate);
  return date ? localDateKey(normalizeDay(date)) : null;
}

function isOpenWorkout(workout: PlanWorkout) {
  return !["DONE", "SKIPPED", "MOVED"].includes(workout.status);
}

function sortWorkouts(workouts: PlanWorkout[]) {
  return [...workouts].sort((a, b) => {
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1);
  });
}

export function getPlanFocusWorkouts(
  plan: TrainingPlanDetail,
  today = new Date(),
) {
  const todayKey = localDateKey(normalizeDay(today));
  const workouts = sortWorkouts(plan.workouts);
  const todaysWorkouts = workouts.filter(
    (workout) => workoutDateKey(workout) === todayKey,
  );
  const openWorkouts = workouts.filter(isOpenWorkout);
  const currentWorkout =
    todaysWorkouts.find((workout) => workout.status === "IN_PROGRESS") ??
    todaysWorkouts.find(isOpenWorkout) ??
    [...todaysWorkouts]
      .reverse()
      .find((workout) => workout.status === "DONE") ??
    todaysWorkouts.at(-1) ??
    null;
  const actionableOpenWorkouts = openWorkouts.filter((workout) => {
    const scheduledKey = workoutDateKey(workout);
    return scheduledKey == null || scheduledKey >= todayKey;
  });
  const nextWorkout =
    actionableOpenWorkouts.find(
      (workout) => workout.id !== currentWorkout?.id,
    ) ?? null;
  return { currentWorkout, nextWorkout };
}

export function planTimelineBounds(
  plan: TrainingPlanDetail,
  today = new Date(),
) {
  const datedWorkouts = plan.workouts
    .map((workout) => parsePlanDate(workout.scheduledDate))
    .filter((date): date is Date => Boolean(date))
    .map(normalizeDay)
    .sort((a, b) => a.getTime() - b.getTime());
  const start = normalizeDay(
    parsePlanDate(plan.startDate) ?? datedWorkouts[0] ?? today,
  );
  const inferredEnd = plan.periodWeeks
    ? addDays(start, plan.periodWeeks * 7 - 1)
    : null;
  const lastWorkoutDate = datedWorkouts.at(-1);
  const end = normalizeDay(
    parsePlanDate(plan.endDate) ?? lastWorkoutDate ?? inferredEnd ?? start,
  );
  const currentDay = normalizeDay(today);
  const firstVisibleEnd = addDays(currentDay, 6);
  const timelineStart = start > currentDay ? currentDay : start;
  const timelineEnd = end < firstVisibleEnd ? firstVisibleEnd : end;

  return timelineEnd < timelineStart
    ? { start: timelineEnd, end: timelineStart }
    : { start: timelineStart, end: timelineEnd };
}

export function buildPlanLoadPoints(
  plan: TrainingPlanDetail,
  today = new Date(),
  maxDays = 180,
) {
  const { start, end } = planTimelineBounds(plan, today);
  const loadsByDate = new Map<string, number>();

  for (const workout of plan.workouts) {
    const key = workoutDateKey(workout);
    if (!key) continue;
    const estimatedLoad = workout.estimatedLoad;
    const load =
      typeof estimatedLoad === "number" && Number.isFinite(estimatedLoad)
        ? Math.max(0, estimatedLoad)
        : 0;
    loadsByDate.set(key, (loadsByDate.get(key) ?? 0) + load);
  }

  const points: PlanLoadPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (
    let date = start, index = 0;
    date <= end && index < maxDays;
    date = addDays(date, 1), index += 1
  ) {
    const key = localDateKey(date);
    const load = loadsByDate.get(key) ?? 0;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    points.push({ key, load, ctl, atl });
  }
  return points;
}

export function niceAxisStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return magnitude * 2;
  if (normalized <= 5) return magnitude * 5;
  return magnitude * 10;
}

export function planLoadAxisMax(points: PlanLoadPoint[]) {
  const maxValue = Math.max(
    0,
    ...points.flatMap((point) => [point.load, point.ctl, point.atl]),
  );
  const step = niceAxisStep(Math.max(30, maxValue * 1.18) / 3);
  return step * 3;
}
