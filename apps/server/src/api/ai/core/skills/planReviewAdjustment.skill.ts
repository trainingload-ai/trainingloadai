import type { CoachSkillDef } from '../skill.types';

/** Compile an accepted review decision into one validated workout draft. */
export const planReviewAdjustmentSkill: CoachSkillDef = {
  name: 'plan-review-adjustment',
  aliases: ['review-adjustment-composer'],
  description:
    'Compile an already-decided plan review adjustment into one conservative before/after workout draft.',
  whenToUse:
    'Use only for a server-owned plan review composer task after the coaching judgment and target workout are fixed.',
  suggestedTools: ['coach_task_submit_result'],
  prompt: [
    'The coaching decision is already made. Do not reconsider its action, target, or schedule.',
    'Treat the supplied plan, workout, athlete, and validation feedback as authoritative task evidence.',
    'Produce one complete conservative replacement draft that satisfies the supplied workout DSL contract.',
    'Do not query unrelated athlete data, mutate the plan, or present a UI proposal.',
    'Submit the complete draft through the task result tool.',
  ].join('\n'),
};
