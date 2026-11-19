/** Platform-independent recovery for committed calendar plan decisions. */
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function isCalendarPlanDecisionType(value: unknown): boolean {
  return value === "PLAN_START" || value === "PLAN_SCHEDULE";
}
export function getRestoredPlanDecisionApply(input: unknown) {
  const card = record(input);
  const receipt = record(record(card?.payload)?.appliedReceipt);
  const expectedMode =
    card?.decisionType === "PLAN_START" ? "START" : "SCHEDULE";
  if (
    card?.kind !== "coach_decision_draft" ||
    !isCalendarPlanDecisionType(card.decisionType) ||
    card.state !== "APPLIED" ||
    typeof card.decisionId !== "string" ||
    receipt?.mode !== expectedMode ||
    receipt.readbackVerified !== true
  )
    return null;
  return {
    kind: "coach_decision_apply" as const,
    decisionId: card.decisionId,
    branchId: typeof card.branchId === "string" ? card.branchId : null,
    result: "APPLIED",
    receipt,
  };
}
