import type { PlanWorkout } from "@/api/plans";
import { calendarToday, canMoveCalendarWorkout } from "./calendar-move-model";

export type CalendarDropAppearance = "available" | "blocked" | "target";

export const calendarDropGridClass = "bg-brand/10 dark:bg-brand/15";

export const calendarDropDayClass: Record<CalendarDropAppearance, string> = {
  available: "bg-brand/15 dark:bg-brand/20",
  blocked: "cursor-not-allowed bg-muted/75 text-muted-foreground ring-0 dark:bg-muted/75",
  target: "bg-brand/30 ring-2 ring-inset ring-ring dark:bg-brand/35",
};

export function canDropCalendarWorkout(workout: PlanWorkout | undefined, date: string): workout is PlanWorkout & {
  planId: string;
  revision: number;
  scheduledDate: string;
} {
  if (!canMoveCalendarWorkout(workout)) return false;
  const window = workout.calendarMoveWindow;
  return date >= (window?.from ?? workout.calendarTodayYmd ?? calendarToday()) &&
    date !== workout.scheduledDate && (!window?.through || date <= window.through) &&
    (!window?.before || date < window.before);
}

export function calendarDropAppearance(
  workout: PlanWorkout | undefined,
  date: string,
  hovered: boolean,
): CalendarDropAppearance | undefined {
  if (!workout) return undefined;
  if (!canDropCalendarWorkout(workout, date)) return "blocked";
  return hovered ? "target" : "available";
}
