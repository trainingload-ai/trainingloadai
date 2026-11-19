import type { TrainingPlanDetail } from "@/api/plans";
import type { CoachPlanDraftData } from "@shared/ai-coach-schema";
import { parseScheduleConstraints } from "@shared/plan-calendar";
import { isRollingPlan } from "./rolling-plan";

/** Project the persisted source without creating new workout identities. */
export function savedPlanToCoachDraft(
  plan: TrainingPlanDetail,
): CoachPlanDraftData {
  if (isRollingPlan(plan))
    throw new Error("Continuous plans require a bounded calendar window");
  return {
    title: plan.title,
    description: plan.description ?? undefined,
    periodWeeks: plan.periodWeeks ?? 1,
    scheduleConstraints: parseScheduleConstraints(
      plan.generationMetadata?.scheduleConstraints,
    ),
    workouts: plan.workouts.map((workout) => ({
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      sessionIndex: workout.sessionIndex,
      text: workout.text,
      name: workout.name ?? undefined,
      notes: workout.notes ?? undefined,
      sportType: workout.sportType,
      sportDefinitionCode: workout.sportDefinitionCode ?? undefined,
      structureKind: workout.structureKind,
      dslVersion: workout.dslVersion,
      structure: workout.structure,
      summary: workout.summary,
      blocks: workout.blocks,
    })),
  };
}
