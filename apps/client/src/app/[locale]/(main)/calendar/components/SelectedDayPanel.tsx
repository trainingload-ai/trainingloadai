"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import type { SportType } from "@/api/activities";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { ViewWorkoutDialog } from "@/components/plan/view-workout-dialog";
import { cn } from "@/lib/utils";
import {
  getCalendarItemLeadingIcon,
  getCalendarItemTitle,
  getCalendarSportAccentClass,
  getCalendarSportSurfaceClass,
} from "./calendar-ui-utils";
import type { Dayjs } from "dayjs";
import { getSportDisplayName, useSportCatalog } from "@/api/sports";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

function parsePlanBlocks(planWorkout?: PlanWorkout) {
  const blocks = planWorkout?.blocks;
  if (!blocks) return null;
  try {
    if (typeof blocks === "string") {
      const parsed = JSON.parse(blocks);
      return Array.isArray(parsed) ? (parsed as ParsedPlan) : null;
    }
    return Array.isArray(blocks) ? (blocks as ParsedPlan) : null;
  } catch {
    return null;
  }
}

export function SelectedDayPanel({
  selectedDate,
  tss,
  activities,
  planWorkouts = [],
  className,
}: {
  selectedDate: Dayjs;
  tss: number;
  activities: Activity[];
  planWorkouts?: PlanWorkout[];
  className?: string;
}) {
  const t = useTranslations("CalendarExperience");
  const tDay = useTranslations("DayCell");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tSports = useTranslations("SportCatalog");
  const { systemUnit } = useStore();
  const { data: sportCatalog = [] } = useSportCatalog();
  const [selectedPlanWorkout, setSelectedPlanWorkout] =
    React.useState<PlanWorkout | null>(null);
  return (
    <Card className={cn("border-border/70", className)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="text-mobile-caption pc:text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {t("selectedDay")}
        </div>
        <CardTitle className="text-xl">
          {selectedDate.format("MM/DD")} · {selectedDate.format("dddd")}
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          <div className="rounded-full border border-border/70 bg-neutral-100 dark:bg-muted/45 px-2.5 py-1 text-mobile-caption pc:text-xs text-muted-foreground">
            TSS {Math.round(tss)}
          </div>
          <div className="rounded-full border border-border/70 bg-neutral-100 dark:bg-muted/45 px-2.5 py-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {activities.length} {t("activitiesCount")}
          </div>
          {planWorkouts.length > 0 ? (
            <div className="rounded-full border border-violet-300/70 bg-violet-50 px-2.5 py-1 text-mobile-caption pc:text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
              {planWorkouts.length} {t("trainingTab")}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {planWorkouts.length > 0 ? (
          <div className="space-y-3">
            {planWorkouts.map((planWorkout) => {
              return (
                <div
                  key={planWorkout.id}
                  className={cn(
                    "rounded-2xl px-4 py-3",
                    getCalendarSportSurfaceClass(planWorkout.sportType),
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-mobile-caption pc:text-[11px] uppercase tracking-[0.16em] opacity-70">
                        {t("plannedTraining")} #{planWorkout.sessionIndex ?? 1}
                      </div>
                      <div className="mt-1 font-medium">
                        {getCalendarItemTitle(planWorkout)}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "rounded-full px-2 py-1 text-mobile-unit pc:text-[10px] font-semibold uppercase tracking-[0.12em]",
                        getCalendarSportAccentClass(planWorkout.sportType),
                        "text-white",
                      )}
                    >
                      {getSportDisplayName(sportCatalog, planWorkout, tSports)}
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-white/30 bg-white/40 p-2 dark:border-black/20 dark:bg-black/10">
                    <WorkoutRenderer workout={planWorkout} density="CARD" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPlanWorkout(planWorkout)}
                    className="mt-3 text-sm font-medium underline underline-offset-4"
                  >
                    {t("openPlan")}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-neutral-100 dark:bg-muted/45 px-4 py-5 text-sm text-muted-foreground">
            {t("noPlannedTraining")}
          </div>
        )}

        <div className="space-y-3">
          <div className="text-sm font-semibold">{t("activitiesTitle")}</div>
          {activities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-neutral-100 dark:bg-muted/45 px-4 py-5 text-sm text-muted-foreground">
              {t("noActivities")}
            </div>
          ) : (
            activities.map((activity) => {
              const LeadingIcon = getCalendarItemLeadingIcon(
                activity.sportType,
              );
              return (
                <Link
                  key={activity.hashId}
                  href={`/activities/${activity.hashId}`}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-neutral-200 dark:hover:bg-muted",
                    getCalendarSportSurfaceClass(activity.sportType),
                  )}
                >
                  <div className="mt-0.5 rounded-md bg-white/70 p-2 text-current dark:bg-black/10">
                    <LeadingIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {getLocalizedActivityTitle(
                        activity,
                        tActivityTitle,
                        tDay("activity"),
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-mobile-caption pc:text-xs opacity-80">
                      <span>
                        {formatValue(
                          activity.distance || 0,
                          "distance",
                          systemUnit,
                        )}{" "}
                        {getUnit("distance", systemUnit)}
                      </span>
                      <span>
                        {formatValue(
                          activity.duration || 0,
                          "duration",
                          systemUnit,
                        )}
                      </span>
                      {activity.sportType ? (
                        <span>
                          {getSportDisplayName(sportCatalog, activity, tSports)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {selectedPlanWorkout ? (
          <ViewWorkoutDialog
            open={Boolean(selectedPlanWorkout)}
            onOpenChange={(open) => {
              if (!open) setSelectedPlanWorkout(null);
            }}
            planId={selectedPlanWorkout.planId ?? undefined}
            workoutId={selectedPlanWorkout.id}
            weekIndex={Math.max(0, (selectedPlanWorkout.weekIndex ?? 1) - 1)}
            dayIndex={Math.max(0, (selectedPlanWorkout.dayIndex ?? 1) - 1)}
            notes={selectedPlanWorkout.notes}
            text={selectedPlanWorkout.text}
            sportType={selectedPlanWorkout.sportType as SportType}
            plan={parsePlanBlocks(selectedPlanWorkout)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
