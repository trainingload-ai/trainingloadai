import dayjs from "dayjs";
import type { TrainingPlanDetail, TrainingPlanSummary } from "@/api/plans";

export function formatPlanUpdatedAt(value?: string) {
  return dayjs(value).format("YYYY-MM-DD");
}

export function buildPlanListItemMeta(plan: TrainingPlanSummary) {
  const workoutCount = plan.completedWorkoutCount ?? plan.workoutCount ?? 0;
  const updatedAt = formatPlanUpdatedAt(plan.updatedAt || plan.createdAt);
  const weeks = plan.periodWeeks ?? 0;
  const description = plan.description ?? "";
  const isActive = plan.status === "ACTIVE";

  return {
    workoutCount,
    updatedAt,
    weeks,
    description,
    isActive,
    status: plan.status,
    titleText: `${plan.title} · ${workoutCount} workouts · ${updatedAt}`,
  };
}

export function toExistingPlanDraft(plan: TrainingPlanDetail) {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description ?? "",
    periodWeeks: plan.periodWeeks ?? 1,
    workouts: plan.workouts,
  };
}
