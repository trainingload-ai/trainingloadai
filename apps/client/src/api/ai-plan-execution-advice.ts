import { apiFetch } from "@/lib/api";

export type PlanExecutionAdviceSurface =
  | "HOME_TODAY"
  | "PLAN_SIDEBAR"
  | "DAY"
  | "WORKOUT"
  | "ACTIVITY"
  | "COACH_CHAT";

export type PlanExecutionAdviceRequest = {
  surface: PlanExecutionAdviceSurface;
  anchorDate?: string;
  planId?: string | null;
  planWorkoutId?: string | null;
  activityId?: string | number | null;
  fallbackSummary?: string | null;
  fallbackTags?: string[];
  locale?: string;
  timezone?: string;
};

export type PlanExecutionAdviceResponse = {
  summary: string;
  tags: string[];
  source: "generated" | "fallback" | "cache";
  shouldRefresh: boolean;
  generatedAt: string | null;
  factHash: string;
};

export async function generatePlanExecutionAdvice(
  request: PlanExecutionAdviceRequest,
) {
  return apiFetch<PlanExecutionAdviceResponse>("/ai/plan-execution-advice", {
    method: "POST",
    body: JSON.stringify({
      ...request,
      planId: request.planId || undefined,
      planWorkoutId: request.planWorkoutId || undefined,
      activityId: request.activityId || undefined,
      fallbackSummary: request.fallbackSummary || undefined,
    }),
  });
}
