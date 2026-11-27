"use client";

import { useTranslations } from "next-intl";
import type { PlanStatus, PlanWorkout } from "@/api/plans";
import { generatedPlanThrough, type PlanPlanning } from "@/lib/rolling-plan";

type CoveragePlan = PlanPlanning & {
  status?: PlanStatus;
  workoutCount?: number;
  workouts?: readonly PlanWorkout[];
};

export function RollingPlanCoverage({ plan }: { plan: CoveragePlan }) {
  const t = useTranslations("RollingPlan");
  const through = generatedPlanThrough(plan);
  const hasStarter = plan.status === "DRAFT" && (plan.workouts?.length ?? plan.workoutCount ?? 0) > 0;
  return (
    <span className="text-mobile-caption pc:text-xs text-muted-foreground">
      {t("title")} ·{" "}
      {through
        ? t("generatedThrough", { date: through.slice(0, 10) })
        : t(hasStarter ? "firstWeekPreview" : "notGenerated")}
    </span>
  );
}
