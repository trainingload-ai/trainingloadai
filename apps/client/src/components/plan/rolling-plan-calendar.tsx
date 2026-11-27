"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PlanStartConversation, TrainingPlanDetail } from "@/api/plans";
import { workoutsForPlanStart } from "@/lib/coach-plan-start";
import { PlanDetailWeekBreakdown } from "./detail/plan-detail-week-breakdown";
import {
  buildWeekGroups,
  type DerivedWorkout,
} from "./detail/plan-detail-utils";
import { ViewWorkoutDialog } from "./view-workout-dialog";

export function RollingPlanCalendar({
  plan,
  pendingStart,
}: {
  plan: TrainingPlanDetail;
  pendingStart?: Pick<PlanStartConversation, "startDate" | "earliestStartDate">;
}) {
  const t = useTranslations("V2PlanDetailPage");
  const [workout, setWorkout] = useState<DerivedWorkout | null>(null);
  const calendarPlan = pendingStart
    ? {
        ...plan,
        startDate: pendingStart.startDate,
        currentWeekIndex: 1,
        currentDayIndex: 1,
        workouts: workoutsForPlanStart(plan, pendingStart.startDate, pendingStart.earliestStartDate),
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
