import type { CoachSkillDef } from '../skill.types';

export const workoutManagementSkill: CoachSkillDef = {
  name: 'workout-management',
  aliases: ['workout-scheduling', 'workout-editor'],
  description:
    'Prepare a complete proposal to add or change concrete planned sessions.',
  whenToUse:
    'Add, move, edit, replace, postpone or remove sessions; an entire saved plan discussion starts with plan-followup.',
  suggestedTools: [
    'time.current',
    'plan.active',
    'plan.by_id',
    'plan.day_view',
    'pmc.range',
    'training.readiness',
    'profile.zones',
    'workout.intensity_strategy',
    'integration.status',
    'plan.proposal_preview',
    'ask_user_question',
    'coach_decision_draft',
    'coach_decision_apply',
  ],
  prompt: [
    `Use the Workout operation decision guide below to understand the requested result, choose decision-relevant evidence, and form one complete proposal.`,
    `Use the athlete's explicit date, workout type, and constraints as settled inputs unless a material conflict or safety issue changes the recommendation.`,
    `Use plan.proposal_preview for prescription replacement or a coordinated remaining-plan rewrite. Use legacy workout decisions only for ordinary add/move/status operations that are not prescription replacement.`,
    `When connected-device delivery matters, inspect integration.status directly and report any unsupported target as synchronization impact; keep the internally correct prescription intact.`,
    'Complete with one concrete, internally coherent preview, one necessary question, or the committed receipt after its actual confirmation. For an ACTIVE/PAUSED remaining-calendar rewrite, keep plan-followup as the saved-plan entry; a single session operation does not restart a plan.',
  ].join('\n'),
};
