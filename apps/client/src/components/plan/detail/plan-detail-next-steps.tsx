import { Sparkles } from "lucide-react";
import {
  isWorkoutPlannedOrInProgress,
  type TrainingPlanDetail,
} from "@/api/plans";
import {
  getWorkoutDate,
  rollupPlanDetailExecution,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";
import { Panel, SectionTitle } from "@/components/plan/detail/plan-detail-panel";

export function PlanDetailNextSteps({
  plan,
  t,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
}) {
  const ws = rollupPlanDetailExecution(plan);
  const doneCount = ws.done;
  const totalCount = plan.workouts.length;
  const completionPercent =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const nextPlanned = plan.workouts
    .filter((item) => isWorkoutPlannedOrInProgress(item.status))
    .sort((a, b) => {
      const aDate =
        getWorkoutDate(plan, a)?.valueOf() ?? Number.MAX_SAFE_INTEGER;
      const bDate =
        getWorkoutDate(plan, b)?.valueOf() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    })[0];
  const nextPlannedTitle =
    nextPlanned?.notes?.trim() ||
    nextPlanned?.name?.trim() ||
    nextPlanned?.text ||
    t("workout.unscheduled");
  const nextPlannedDate = nextPlanned
    ? (getWorkoutDate(plan, nextPlanned)?.format("M/D") ??
      t("workout.unscheduled"))
    : t("workout.unscheduled");
  const weekLabel =
    typeof plan.currentWeekIndex === "number"
      ? t("weekBreakdown.weekLabel", { week: plan.currentWeekIndex + 1 })
      : t("header.notActivated");

  const items = [
    `${t("overview.completionRate")}: ${completionPercent}% (${doneCount}/${totalCount})`,
    `${t("workoutStatus.upcoming")}: ${nextPlannedTitle} · ${nextPlannedDate}`,
    `${weekLabel} · ${t("execution.incomplete")}: ${ws.incomplete} · ${t("execution.skipped")}: ${ws.skipped}`,
  ];

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("nextSteps.title")} />
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-start gap-2 rounded-md bg-neutral-100 px-3 py-2.5 text-sm dark:bg-muted/45"
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
