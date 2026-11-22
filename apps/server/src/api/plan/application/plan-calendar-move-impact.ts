import { addCalendarDays } from '@shared/plan-calendar';
import type { CalendarMoveWeekTotals, PlanCalendarMoveImpact } from '@shared/plan-proposal';
import { isoWeekStart } from '@shared/rolling-plan';

type ScheduledLoad = {
  id: string;
  scheduledDate: Date | null;
  status: string;
  plannedDurationSeconds: number | null;
  estimatedLoad: number | null;
};

export function calendarWeekTotals(schedule: Array<ScheduledLoad & { day: string }>, weekStart: string): CalendarMoveWeekTotals {
  const week = schedule.filter((w) => isoWeekStart(w.day) === weekStart);
  return {
    sessions: week.length,
    trainingDays: new Set(week.map((w) => w.day)).size,
    durationMinutes: week.some((w) => w.plannedDurationSeconds === null)
      ? null
      : week.reduce((seconds, w) => seconds + w.plannedDurationSeconds!, 0) /
        60,
    estimatedLoad: week.some((w) => w.estimatedLoad === null)
      ? null
      : week.reduce((load, w) => load + w.estimatedLoad!, 0),
  };
}

export function assessCalendarMoveImpact(
  workouts: ScheduledLoad[],
  move: { workoutId: string; from: string; to: string },
  hasCalendarConflict: boolean,
): PlanCalendarMoveImpact {
  const before = workouts.flatMap((workout) =>
    workout.scheduledDate && !['MOVED', 'SKIPPED'].includes(workout.status)
      ? [{ ...workout, day: workout.scheduledDate.toISOString().slice(0, 10) }]
      : [],
  );
  const after = before.map((workout) =>
    workout.id === move.workoutId ? { ...workout, day: move.to } : workout,
  );
  const fromWeek = isoWeekStart(move.from);
  const toWeek = isoWeekStart(move.to);
  const reasons: PlanCalendarMoveImpact['reasons'] = [];
  if (fromWeek !== toWeek) reasons.push('WEEKLY_DISTRIBUTION_CHANGED');
  const oldNeighbors = new Set(
    before
      .filter(
        (w) =>
          w.day >= addCalendarDays(move.from, -1) &&
          w.day <= addCalendarDays(move.from, 1),
      )
      .map((w) => w.id),
  );
  if (
    before.some(
      (w) =>
        !oldNeighbors.has(w.id) &&
        w.id !== move.workoutId &&
        w.day >= addCalendarDays(move.to, -1) &&
        w.day <= addCalendarDays(move.to, 1),
    )
  )
    reasons.push('ADJACENT_TRAINING_CHANGED');
  if (hasCalendarConflict) reasons.push('CALENDAR_CONFLICT');
  return {
    ...move,
    reasons,
    weeks: [...new Set([fromWeek, toWeek])].sort().map((weekStart) => ({
      weekStart,
      before: calendarWeekTotals(before, weekStart),
      after: calendarWeekTotals(after, weekStart),
    })),
  };
}
