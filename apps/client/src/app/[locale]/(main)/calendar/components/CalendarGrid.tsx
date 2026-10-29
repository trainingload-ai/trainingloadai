"use client";

import React from "react";
import dayjs, { Dayjs } from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import DayCell from "./DayCell";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import { cn } from "@/lib/utils";
import { useSportCatalog } from "@/api/sports";

import "dayjs/locale/zh-cn";

const WeekdaysHeader: React.FC = () => {
  const locale = useLocale();
  const labels = React.useMemo(() => {
    const dayjsLocale = locale.startsWith("zh") ? "zh-cn" : "en";
    dayjs.locale(dayjsLocale);
    const startOfWeek = dayjs().startOf("week");
    return Array.from({ length: 7 }, (_, i) =>
      startOfWeek.add(i, "day").format("ddd"),
    );
  }, [locale]);
  return (
    <>
      {labels.map((w, i) => (
        <div key={`${w}-${i}`} className="p-2 text-sm text-muted-foreground">
          {w}
        </div>
      ))}
    </>
  );
};

const CalendarGrid: React.FC<{
  currentMonth: Dayjs;
  weeks: Dayjs[][];
  selectedDate: Dayjs;
  onSelectDate: (date: Dayjs) => void;
  activitiesByDate: Record<string, Activity[]>;
  workoutsByDate: Record<string, PlanWorkout[]>;
  tssByDate: Record<string, number>;
  range?: {
    startOfWeek: Dayjs;
    end: Dayjs;
  } | null;
  className?: string;
}> = ({
  currentMonth,
  weeks,
  selectedDate,
  onSelectDate,
  activitiesByDate,
  workoutsByDate,
  tssByDate,
  range,
  className,
}) => {
  const t = useTranslations("CalendarExperience");
  const { data: sportCatalog = [] } = useSportCatalog();

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <div className="text-mobile-caption pc:text-xs uppercase tracking-[0.18em] text-muted-foreground md:hidden">
          {t("monthOverview")}
        </div>
      </div>
      <div className="grid grid-cols-7 shrink-0 rounded-t-xl border border-b-0 border-border/70 bg-neutral-100 dark:bg-muted/45">
        <WeekdaysHeader />
      </div>

      <div className="overflow-hidden rounded-b-xl border border-border/70 bg-border/70">
        {weeks.map((week, idx) => {
          return (
            <div
              key={idx}
              className={cn(
                "grid grid-cols-7 gap-px",
                idx !== 0 && "border-t border-border/70",
              )}
            >
              {week.map((d) => {
                const isHighlighted =
                  range &&
                  (d.isSame(range.startOfWeek, "day") ||
                    d.isAfter(range.startOfWeek)) &&
                  (d.isSame(range.end, "day") || d.isBefore(range.end));

                return (
                  <div
                    key={d.toString()}
                    className={`min-h-0 bg-background ${
                      isHighlighted
                        ? "bg-[hsl(var(--emerald-50))] dark:bg-[hsl(var(--emerald-950))]/55"
                        : "dark:bg-neutral-950"
                    }`}
                  >
                    <DayCell
                      date={d}
                      isCurrentMonth={d.month() === currentMonth.month()}
                      isToday={d.isSame(dayjs(), "day")}
                      isSelected={d.isSame(selectedDate, "day")}
                      onSelect={() => onSelectDate(d)}
                      activities={
                        (activitiesByDate || {})[d.format("YYYY-MM-DD")]
                      }
                      planWorkouts={workoutsByDate[d.format("YYYY-MM-DD")]}
                      tss={tssByDate[d.format("YYYY-MM-DD")] || 0}
                      sportCatalog={sportCatalog}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarGrid;
