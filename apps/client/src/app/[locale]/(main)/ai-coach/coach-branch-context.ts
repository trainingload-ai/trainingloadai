import type { CoachBranchRequestContext } from "@/lib/ai-coach-stream";

export function getBranchContextFromSearchParams(
  searchParams: URLSearchParams,
  args: {
    intent: string;
    source: string;
    planId: string;
    pending: string;
  },
): CoachBranchRequestContext | null {
  const branchId =
    searchParams.get("branchId")?.trim() ||
    searchParams.get("branch")?.trim() ||
    "";
  const contextId = searchParams.get("contextId")?.trim() || "";
  const caseId = searchParams.get("caseId")?.trim() || "";
  const date = searchParams.get("date")?.trim() || "";
  const workoutId = searchParams.get("workoutId")?.trim() || "";

  if (branchId) return { branchId, ...(caseId ? { caseId } : {}) };
  // An Athlete State Case without an active plan has neither contextId nor
  // planId. caseId is still authoritative request context and must survive
  // through the first structured answer.
  if (!contextId && !args.planId && !caseId) return null;

  return {
    ...(caseId ? { caseId } : {}),
    ...(contextId ? { contextId } : {}),
    ...(args.planId ? { planId: args.planId } : {}),
    openReason:
      searchParams.get("openReason")?.trim() || args.intent || "coach_seed",
    sourceNode: {
      page: args.source,
      ...(args.intent ? { intent: args.intent } : {}),
      ...(args.planId ? { planId: args.planId } : {}),
      ...(contextId ? { contextId } : {}),
      ...(date ? { date } : {}),
      ...(workoutId ? { workoutId } : {}),
      ...(args.pending ? { pending: args.pending } : {}),
    },
  };
}
