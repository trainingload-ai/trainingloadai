type DeliveryStep = {
  toolResults?: Array<{ toolName?: string; output?: unknown }>;
};
const draftKinds: Record<string, string> = {
  present_coach_plan_draft: 'coach_plan_draft',
  present_plan_workout_adjustment_draft: 'plan_workout_adjustment_draft',
  coach_decision_draft: 'coach_decision_draft',
};

export function isCoachDraftDelivery(result: {
  toolName?: string;
  output?: unknown;
}): boolean {
  const kind = draftKinds[result.toolName ?? ''];
  const output = result.output as { kind?: unknown; error?: unknown } | null;
  return Boolean(kind && output?.kind === kind && !output.error);
}

export function needsCoachDeliverySummary(steps: DeliveryStep[]): boolean {
  return steps.at(-1)?.toolResults?.some(isCoachDraftDelivery) ?? false;
}

/** Reserve at most one extra step, only for a successfully delivered draft. */
export function coachStepBudgetReached(
  steps: DeliveryStep[],
  maxSteps: number,
): boolean {
  return (
    steps.length >= maxSteps &&
    !(steps.length === maxSteps && needsCoachDeliverySummary(steps))
  );
}

export const COACH_DELIVERY_SUMMARY_INSTRUCTION = `
Final delivery phase: the draft has already been rendered to the user. Do not call any tools, create another artifact, or save/apply anything.
Write a concise coaching explanation in the user's language after the card. Ground it exclusively in the confirmed brief, evidence already returned, and the actual successful tool output (including description, schedule and qualityReport).
Explain why this specific structure fits the athlete's goal and current context, the key frequency/intensity/progression/recovery choices actually present, and any material uncertainty or quality warning. Do not invent evidence, medical claims, guaranteed outcomes, or design choices absent from the draft. Do not restate the whole calendar or expose internal reasoning/tool diagnostics.
Clearly say it is a draft/proposal, not saved, activated or applied. End with the matching next action: review and use the card's Save/Apply/Confirm control, or tell the coach what to revise. Use a few short paragraphs or bullets, not a generic 'done' acknowledgement. A plan card's description does not replace this final response.
`;
