import { AiUsageKind } from '@prisma/client';

type AssistantEvent = {
  type: 'assistant';
  message: {
    content: Array<{ type: string; name?: string }>;
  };
};

const PLAN_ADJUSTMENT_TOOLS = new Set([
  'present_plan_workout_adjustment_draft',
  'coach_decision_apply',
]);

/** Classifies the delivered coach operation from the tools actually used. */
export function resolveCoachUsageKind(
  events: Array<AssistantEvent | { type: string }>,
): AiUsageKind {
  const toolNames = events
    .filter((event): event is AssistantEvent => event.type === 'assistant')
    .flatMap((event) => event.message.content)
    .filter((block) => block.type === 'tool_use')
    .map((block) => String(block.name ?? '').trim());

  if (toolNames.includes('present_coach_plan_draft')) {
    return AiUsageKind.PLAN_GENERATION;
  }
  if (
    toolNames.some(
      (name) =>
        PLAN_ADJUSTMENT_TOOLS.has(name) || name.startsWith('mutation_plan_'),
    )
  ) {
    return AiUsageKind.PLAN_ADJUSTMENT;
  }
  return AiUsageKind.COACH_CHAT;
}
