import type { CoachSkillDef } from '../skill.types';

/** Compile an accepted review decision into one validated workout draft. */
export const planReviewAdjustmentSkill: CoachSkillDef = {
  name: 'plan-review-adjustment',
  catalogVisible: false,
  aliases: ['review-adjustment-composer'],
  description:
    'Compile an accepted review decision into one validated replacement Workout.',
  whenToUse:
    'Server-owned adjustment compilation after the action, target and schedule are fixed.',
  suggestedTools: ['coach_task_submit_result'],
  prompt: [
    'The coaching decision is already made. Do not reconsider its action, target, or schedule.',
    'Treat the supplied plan, workout, athlete, and validation feedback as authoritative task evidence.',
    'Produce one complete conservative replacement draft that satisfies the supplied workout DSL contract.',
    'Do not query unrelated athlete data, mutate the plan, or present a UI proposal.',
    'Submit the complete draft through the task result tool.',
    'Finish only when the task result tool accepts that one complete replacement. Validation feedback repairs the artifact; it does not reopen the accepted coaching decision.',
  ].join('\n'),
};
