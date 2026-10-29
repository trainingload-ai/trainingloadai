"use client";

import React from "react";
import dayjs, { type Dayjs } from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import type { CompetitionEvent } from "@/api/competition-events";
import type { PlanWorkout } from "@/api/plans";
import { cn } from "@/lib/utils";
import {
  getPlannedWorkoutLoad,
  MobileCalendarDayLoad,
} from "./MobileCalendarDayLoad";
import { MobileCalendarDayContent } from "./MobileCalendarSessionCards";

const MONTH_MARKER_COLORS = {
  activity: "#0ea5e9",
  competition: "#93c5fd",
  workout: "#009689",
} as const;

export function MobileCalendarMonthPanel({
  activitiesByDate,
  competitionEventsByDate,
  currentMonth,
  onNavigateMonth,
  onSelectActivity,
  onSelectCompetition,
  onSelectDate,
  onSelectWorkout,
  range,
  selectedDate,
  tssByDate,
  weeks,
  workoutsByDate,
}: {
  activitiesByDate: Record<string, Activity[]>;
  competitionEventsByDate: Record<string, CompetitionEvent[]>;
  currentMonth: Dayjs;
  onNavigateMonth: (direction: 1 | -1) => void;
  onSelectActivity: (activity: Activity) => void;
  onSelectCompetition: (event: CompetitionEvent) => void;
  onSelectDate: (date: Dayjs) => void;
  onSelectWorkout: (workout: PlanWorkout, date: Dayjs) => void;
  range?: { startOfWeek: Dayjs; end: Dayjs } | null;
  selectedDate: Dayjs;
  tssByDate: Record<string, number>;
  weeks: Dayjs[][];
  workoutsByDate: Record<string, PlanWorkout[]>;
}) {
  const locale = useLocale();
  const t = useTranslations("MobileCalendarTimeline");
  const monthSwipeStartRef = React.useRef<{ x: number; y: number } | null>(
    null,
  );
  const selectedKey = selectedDate.format("YYYY-MM-DD");
  const selectedActivities = activitiesByDate[selectedKey] ?? [];
  const selectedWorkouts = workoutsByDate[selectedKey] ?? [];
  const selectedEvents = competitionEventsByDate[selectedKey] ?? [];
  const selectedTss = tssByDate[selectedKey] ?? 0;
  const selectedPlannedLoad = getPlannedWorkoutLoad(selectedWorkouts);
  const hasSelectedContent =
    selectedActivities.length > 0 ||
    selectedWorkouts.length > 0 ||
    selectedEvents.length > 0;

  const monthTitle = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(currentMonth.toDate()),
    [currentMonth, locale],
  );
  const selectedDateLine = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        weekday: "short",
      }).format(selectedDate.toDate()),
    [locale, selectedDate],
  );
  const weekdayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const gridDays = React.useMemo(() => {
    const visible = weeks.flat();
    const first = visible[0] ?? currentMonth.startOf("month").startOf("week");
    return Array.from({ length: 42 }, (_, index) => first.add(index, "day"));
  }, [currentMonth, weeks]);
  const weekdays = gridDays.slice(0, 7);

  return (
    <section
      aria-label={monthTitle}
      className="flex h-full min-h-0 flex-col gap-3 bg-background px-4 pb-safe-or-3 pt-[calc(env(safe-area-inset-top,0px)+16px)]"
    >
      <div
        className="shrink-0 touch-pan-y"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          monthSwipeStartRef.current = touch
            ? { x: touch.clientX, y: touch.clientY }
            : null;
        }}
        onTouchEnd={(event) => {
          const start = monthSwipeStartRef.current;
          monthSwipeStartRef.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dy) < 52 || Math.abs(dy) <= Math.abs(dx)) return;
          onNavigateMonth(dy < 0 ? 1 : -1);
        }}
      >
        <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-foreground">
          {monthTitle}
        </h2>

        <div className="mt-4 grid grid-cols-7">
          {weekdays.map((date) => (
            <div
              key={date.format("d")}
              className="pb-2 text-center text-mobile-unit pc:text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {weekdayFormatter.format(date.toDate())}
            </div>
          ))}
        </div>

        <div className="relative grid grid-cols-7 border-t border-border/70 pt-2">
          {gridDays.map((date) => {
            const key = date.format("YYYY-MM-DD");
            const activities = activitiesByDate[key] ?? [];
            const workouts = workoutsByDate[key] ?? [];
            const events = competitionEventsByDate[key] ?? [];
            const selected = key === selectedKey;
            const today = date.isSame(dayjs(), "day");
            const inMonth = date.month() === currentMonth.month();
            const inPlanRange = Boolean(
              range &&
              !date.isBefore(range.startOfWeek, "day") &&
              !date.isAfter(range.end, "day"),
            );
            return (
              <button
                key={key}
                data-tap-feedback="false"
                type="button"
                onClick={() => onSelectDate(date)}
                aria-pressed={selected}
                style={{ WebkitTapHighlightColor: "transparent" }}
                className={cn(
                  "flex h-12 min-w-0 touch-manipulation flex-col items-center justify-center rounded-compact px-0.5 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !inMonth && "opacity-30",
                  inPlanRange && !selected && "bg-emerald-500/[0.055]",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full",
                    selected && "bg-emerald-600 text-white",
                    today &&
                      !selected &&
                      "border border-emerald-500 text-emerald-600",
                  )}
                >
                  {date.date()}
                </span>
                <span className="mt-1.5 flex h-2.5 w-9 flex-wrap content-center items-center justify-center gap-0.5">
                  {events.length > 0 ? (
                    <span
                      data-calendar-marker="competition"
                      className="size-1.5 rounded-full"
                      style={{
                        backgroundColor: MONTH_MARKER_COLORS.competition,
                      }}
                    />
                  ) : null}
                  {Array.from({ length: Math.min(workouts.length, 4) }).map(
                    (_, index) => (
                      <span
                        key={`workout-${index}`}
                        data-calendar-marker="workout"
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: MONTH_MARKER_COLORS.workout }}
                      />
                    ),
                  )}
                  {Array.from({ length: Math.min(activities.length, 4) }).map(
                    (_, index) => (
                      <span
                        key={`activity-${index}`}
                        data-calendar-marker="activity"
                        className="size-1.5 rounded-full"
                        style={{
                          backgroundColor: MONTH_MARKER_COLORS.activity,
                        }}
                      />
                    ),
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border/70 pt-3">
        <div className="flex shrink-0 items-center justify-between gap-3 pb-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-mobile-caption pc:text-xs font-medium text-muted-foreground">
              {selectedDateLine}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {hasSelectedContent ? t("dayContent") : t("noSchedule")}
            </div>
          </div>
          {hasSelectedContent ? (
            <MobileCalendarDayLoad
              actualLoad={selectedTss}
              plannedLoad={selectedPlannedLoad}
            />
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <MobileCalendarDayContent
            activities={selectedActivities}
            events={selectedEvents}
            workouts={selectedWorkouts}
            onActivityPress={onSelectActivity}
            onEventPress={onSelectCompetition}
            onWorkoutPress={(workout) => onSelectWorkout(workout, selectedDate)}
          />
        </div>
      </div>
    </section>
  );
}
