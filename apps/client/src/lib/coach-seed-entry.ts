import { stripAiPlanSeedParams } from "./ai-plan-seed-prompt";

/** Remove an entry's transient target before selecting another conversation. */
export function stripCoachSeedEntryParams(next: URLSearchParams): void {
  stripAiPlanSeedParams(next);
  for (const key of [
    "branch",
    "branchId",
    "contextId",
    "source",
    "date",
    "workoutId",
    "openReason",
    "planId",
    "pending",
    "caseId",
    "todaySuggestionId",
    "starterCode",
    "view",
  ])
    next.delete(key);
}
