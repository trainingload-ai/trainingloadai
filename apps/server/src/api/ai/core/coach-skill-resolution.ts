import type { CoachUserMessageBody } from './coach-query-yield';
import { getCoachSkillByName } from './skill.registry';
import type { ActiveCoachSkill } from './skill.types';

export function hasCoachQuestionReplyToolResult(
  message?: CoachUserMessageBody | null,
): boolean {
  return Boolean(
    message?.content.some((block) => {
      if (block.type !== 'tool_result') return false;
      const content = block.content;
      return (
        content !== null &&
        typeof content === 'object' &&
        !Array.isArray(content) &&
        ((content as Record<string, unknown>).kind === 'coach_question_reply' ||
          (content as Record<string, unknown>).kind === 'coach_question_skip')
      );
    }),
  );
}

export function detectPlanBuilderIntentFromPrompt(prompt: string): boolean {
  const p = String(prompt ?? '');
  if (!p) return false;
  return (
    p.includes('"kind":"ai_plan_seed"') ||
    p.includes('Structured plan brief from the product UI')
  );
}

export function resolveCoachActiveSkill(args: {
  prompt: string;
  intent?: string;
  message?: CoachUserMessageBody | null;
  restoredSkill?: string | null;
}): ActiveCoachSkill | null {
  const prompt = String(args.prompt ?? '').trim();
  const explicitSkill = args.intent ? getCoachSkillByName(args.intent) : null;
  const inferredPlanBuilder = detectPlanBuilderIntentFromPrompt(prompt)
    ? getCoachSkillByName('plan-builder')
    : null;

  // Ordinary natural-language turns deliberately start without a preselected
  // skill. The model sees the compact catalog and may activate domain guidance
  // or call a direct tool after understanding the user's current objective.
  // Only server-owned continuation state or an explicit product entry point is
  // allowed to preload a skill.
  return (
    (args.restoredSkill ? getCoachSkillByName(args.restoredSkill) : null) ??
    explicitSkill ??
    inferredPlanBuilder
  );
}
