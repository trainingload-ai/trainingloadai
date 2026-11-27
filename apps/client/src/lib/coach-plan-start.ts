import type { TrainingPlanDetail } from "@/api/plans";
import type { CoachPlanDraftData } from "@shared/ai-coach-schema";
import { addCalendarDays, parseScheduleConstraints, scheduleDateConflict } from "@shared/plan-calendar";
import { isoWeekStart } from "@shared/rolling-plan";
import { isRollingPlan } from "./rolling-plan";

export function workoutsForPlanStart(
  plan: TrainingPlanDetail,
  startDate: string,
  earliestStartDate: string,
) {
  const rolling = isRollingPlan(plan);
  const constraints = rolling
    ? parseScheduleConstraints(plan.generationMetadata?.scheduleConstraints)
    : undefined;
  return plan.workouts.flatMap((workout) => {
    const scheduledDate = addCalendarDays(startDate, workout.dayOffset);
    if (rolling && scheduleDateConflict(scheduledDate, constraints)) return [];
    return [{ ...workout, scheduledDate, calendarTodayYmd: earliestStartDate }];
  });
}

export function rollingStartCarryoverInfo(
  plan: TrainingPlanDetail,
  startDate: string,
): { firstWeekThrough: string; carryoverDates: string[] } | null {
  if (!isRollingPlan(plan)) return null;
  const firstWeekThrough = addCalendarDays(isoWeekStart(startDate), 6);
  const constraints = parseScheduleConstraints(
    plan.generationMetadata?.scheduleConstraints,
  );
  const carryoverDates = [
    ...new Set(
      plan.workouts
        .map((workout) => addCalendarDays(startDate, workout.dayOffset))
        .filter(
          (date) =>
            date > firstWeekThrough &&
            !scheduleDateConflict(date, constraints),
        ),
    ),
  ].sort();
  if (!carryoverDates.length) return null;
  return { firstWeekThrough, carryoverDates };
}

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
