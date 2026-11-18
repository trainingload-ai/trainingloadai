import { addCalendarDays, calendarIsoWeekday } from "@shared/plan-calendar";
import type { GenerationCoverage } from "@shared/rolling-plan";

export type PlanGenerationCoverage = GenerationCoverage;

export type PlanPlanning = {
  planningMode?: "FIXED" | "ROLLING";
  startDate?: string | null;
  generatedThrough?: string | null;
  generationCoverage?: PlanGenerationCoverage;
};

export function isRollingPlan(plan: PlanPlanning | null | undefined): boolean {
  return plan?.planningMode === "ROLLING";
}

export function generatedPlanThrough(plan: PlanPlanning): string | null {
  return (
    plan.generatedThrough ??
    plan.generationCoverage?.intervals?.reduce<string | null>(
      (latest, interval) =>
        !latest || interval.through > latest ? interval.through : latest,
      null,
    ) ??
    null
  );
}

export function isPlanDateNotGenerated(
  plan: PlanPlanning,
  date: string,
): boolean {
  if (
    !isRollingPlan(plan) ||
    (plan.startDate && date < plan.startDate.slice(0, 10))
  )
    return false;
  return !plan.generationCoverage?.intervals?.some(
    (interval) => date >= interval.from && date <= interval.through,
  );
}

export function naturalWeekStart(date: string): string {
  return addCalendarDays(date, 1 - calendarIsoWeekday(date));
}
