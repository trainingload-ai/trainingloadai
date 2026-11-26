"use client";

import { addCalendarDays } from "@shared/plan-calendar";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TrainingPlanDetail } from "@/api/plans";
import { PlanDetailWeekBreakdown } from "./detail/plan-detail-week-breakdown";
import {
  buildWeekGroups,
  type DerivedWorkout,
} from "./detail/plan-detail-utils";
import { ViewWorkoutDialog } from "./view-workout-dialog";

export function RollingPlanCalendar({
  plan,
  pendingStartDate,
}: {
  plan: TrainingPlanDetail;
  pendingStartDate?: string;
}) {
  const t = useTranslations("V2PlanDetailPage");
  const [workout, setWorkout] = useState<DerivedWorkout | null>(null);
  const calendarPlan = pendingStartDate
    ? {
        ...plan,
        startDate: pendingStartDate,
        currentWeekIndex: 1,
        currentDayIndex: 1,
        workouts: plan.workouts.map((item) => ({
          ...item,
          scheduledDate: addCalendarDays(
            pendingStartDate,
            item.dayOffset ?? (item.weekIndex - 1) * 7 + item.dayIndex - 1,
          ),
        })),
      }
    : plan;
  return (
    <>
      <PlanDetailWeekBreakdown
        weeks={buildWeekGroups(t, calendarPlan)}
        planStartDate={calendarPlan.startDate}
        t={t}
        onOpenWorkout={setWorkout}
      />
      {workout ? (
        <ViewWorkoutDialog
          open
          workout={workout}
          planId={plan.id}
          onOpenChange={(open) => {
            if (!open) setWorkout(null);
          }}
        />
      ) : null}
    </>
  );
}
