"use client";

import React from "react";
import type { Dayjs } from "dayjs";
import { cn } from "@/lib/utils";

export function WeekStrip({
  days,
  selectedDate,
  onSelectDate,
  activitiesByDate,
  workoutsByDate,
  tssByDate,
}: {
  days: Dayjs[];
  selectedDate: Dayjs;
  onSelectDate: (date: Dayjs) => void;
  activitiesByDate: Record<string, unknown[]>;
  workoutsByDate: Record<string, unknown[]>;
  tssByDate: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex min-w-max gap-2">
        {days.map((day) => {
          const key = day.format("YYYY-MM-DD");
          const isSelected = day.isSame(selectedDate, "day");
          const isToday = day.isSame(new Date(), "day");
          const hasActivity = (activitiesByDate[key] || []).length > 0;
          const hasPlan = (workoutsByDate[key] || []).length > 0;
          const tss = tssByDate[key] || 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(day)}
              className={cn(
                "min-w-[72px] rounded-2xl border px-3 py-2 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card hover:bg-neutral-200 dark:hover:bg-muted",
              )}
            >
              <div
                className={cn(
                  "text-mobile-caption pc:text-[11px] uppercase tracking-[0.14em]",
                  isSelected
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {day.format("ddd")}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-lg font-semibold">{day.format("DD")}</div>
                {isToday ? (
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-primary",
                    )}
                  />
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {hasPlan ? (
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-violet-500",
                    )}
                  />
                ) : null}
                {hasActivity ? (
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground/80" : "bg-emerald-500",
                    )}
                  />
                ) : null}
                {tss > 0 ? (
                  <span
                    className={cn(
                      "text-mobile-unit pc:text-[10px] tabular-nums",
                      isSelected
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {Math.round(tss)}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
