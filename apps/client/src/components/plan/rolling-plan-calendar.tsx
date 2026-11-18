"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TrainingPlanDetail } from "@/api/plans";
import { PlanDetailWeekBreakdown } from "./detail/plan-detail-week-breakdown";
import {
  buildWeekGroups,
  type DerivedWorkout,
} from "./detail/plan-detail-utils";
import { ViewWorkoutDialog } from "./view-workout-dialog";

export function RollingPlanCalendar({ plan }: { plan: TrainingPlanDetail }) {
  const t = useTranslations("V2PlanDetailPage");
  const [workout, setWorkout] = useState<DerivedWorkout | null>(null);
  return (
    <>
      <PlanDetailWeekBreakdown
        weeks={buildWeekGroups(t, plan)}
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
