"use client";

import React from "react";
import type { Dayjs } from "dayjs";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import {
  getPlanWorkoutDisplayKind,
  type PlanWorkoutDisplayKind,
} from "@/components/plan/detail/plan-detail-utils";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

function workoutStatusClassName(kind: PlanWorkoutDisplayKind) {
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

type CalendarDayButtonProps = {
  date: Dayjs;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  activities?: Activity[];
  planWorkouts?: PlanWorkout[];
  competitionLaneCount?: number;
  tss?: number;
  inPlanRange?: boolean;
  onSelect: () => void;
  onSelectWorkout?: (workout: PlanWorkout) => void;
};

export function CalendarDayButton({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  activities = [],
  planWorkouts = [],
  competitionLaneCount = 0,
  tss = 0,
  inPlanRange = false,
  onSelect,
  onSelectWorkout,
}: CalendarDayButtonProps) {
  const t = useTranslations("CalendarExperience");
  const hasPlan = planWorkouts.length > 0;
  const primaryPlanWorkout = planWorkouts[0];
  const planDetailTitle =
    primaryPlanWorkout?.notes?.trim() ||
    primaryPlanWorkout?.name?.trim() ||
    primaryPlanWorkout?.text?.trim() ||
    t("plannedTraining");
  const getSportLabel = React.useCallback(
    (sportType?: string) => {
      switch (sportType) {
        case "RUN":
          return t("sportLabels.run");
        case "CYCLING":
          return t("sportLabels.cycling");
        case "SWIM":
          return t("sportLabels.swim");
        case "STRENGTH":
          return t("sportLabels.strength");
        default:
          return t("sportLabels.other");
      }
    },
    [t],
  );
  const primaryWorkoutKind = primaryPlanWorkout
    ? getPlanWorkoutDisplayKind(primaryPlanWorkout)
    : "upcoming";
  const primaryWorkoutLabel = t("sportTrainingName", {
    sport: getSportLabel(primaryPlanWorkout?.sportType),
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex h-[100px] flex-col items-center rounded-md p-1 text-center transition-all md:h-[112px] md:items-stretch md:px-2.5 md:py-2 md:text-left",
        "touch-manipulation select-none",
        isSelected
          ? "bg-background text-foreground ring-1 ring-[hsl(var(--emerald-300)/0.7)] dark:bg-neutral-950/90 dark:ring-[hsl(var(--emerald-700)/0.6)]"
          : inPlanRange
            ? "bg-[hsl(var(--emerald-100)/0.75)] text-foreground hover:bg-[hsl(var(--emerald-100)/0.9)] dark:bg-[hsl(var(--emerald-900)/0.32)] dark:hover:bg-[hsl(var(--emerald-900)/0.42)]"
            : "bg-background/45 text-foreground hover:bg-background/80 dark:bg-neutral-950/25 dark:hover:bg-neutral-950/55",
        !isCurrentMonth && "opacity-35",
      )}
    >
      <div className="relative z-10 flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[15px] font-semibold tracking-tight md:text-[15px]",
              isSelected ? "text-foreground" : "text-foreground",
            )}
          >
            {date.format("D")}
          </span>
          {isToday ? (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isSelected
                  ? "bg-[hsl(var(--emerald-500))]"
                  : "bg-foreground/50",
              )}
            />
          ) : null}
        </div>
        <div className="text-mobile-unit pc:text-[10px] font-medium tabular-nums text-muted-foreground">
          {tss > 0 ? Math.round(tss) : "--"}
        </div>
      </div>

      <div className="relative z-10 mt-auto flex min-h-1 items-center justify-center gap-1 md:hidden">
        {hasPlan ? (
          <span
            className={cn(
              "h-1.5 w-4 rounded-full bg-slate-300 opacity-90 dark:bg-slate-700",
            )}
          />
        ) : null}

        {activities.length > 0 ? (
          <span
            className="text-mobile-micro font-semibold leading-none text-muted-foreground pc:text-[9px]"
            aria-label={`${t("activityTab")} +${activities.length}`}
          >
            +{activities.length}
          </span>
        ) : null}
      </div>

      <div className="relative z-10 hidden md:flex md:h-full md:flex-col">
        <div
          className="mt-1 flex flex-1 flex-col gap-1"
          style={
            competitionLaneCount > 0
              ? { paddingTop: competitionLaneCount * 22 }
              : undefined
          }
        >
          {hasPlan ? (
            <div
              role={onSelectWorkout ? "button" : undefined}
              tabIndex={onSelectWorkout ? 0 : undefined}
              onClick={
                onSelectWorkout && primaryPlanWorkout
                  ? (event) => {
                      event.stopPropagation();
                      onSelectWorkout(primaryPlanWorkout);
                    }
                  : undefined
              }
              onKeyDown={
                onSelectWorkout && primaryPlanWorkout
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectWorkout(primaryPlanWorkout);
                      }
                    }
                  : undefined
              }
              className={cn(
                "rounded-r-xs border-l-2 px-1.5 py-1 text-mobile-caption pc:text-[11px] font-medium",
                workoutStatusClassName(primaryWorkoutKind),
                onSelectWorkout && "cursor-pointer hover:text-foreground",
              )}
              title={`${primaryWorkoutLabel} · ${planDetailTitle}`}
            >
              <div className="truncate">{primaryWorkoutLabel}</div>
              {planWorkouts.length > 1 ? (
                <div className="mt-0.5 text-mobile-unit pc:text-[10px] text-muted-foreground">
                  +{planWorkouts.length - 1} {t("trainingTab")}
                </div>
              ) : null}
            </div>
          ) : null}

          {activities.length > 0 ? (
            <div className="flex h-5 min-w-0 items-center truncate whitespace-nowrap rounded-md bg-neutral-100 px-2 text-mobile-unit pc:text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-neutral-200 dark:bg-muted/45 dark:group-hover:bg-muted md:text-mobile-caption">
              {t("activityTab")} +{activities.length}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
