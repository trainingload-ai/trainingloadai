import type { CoachSkillDef } from '../skill.types';

export const workoutManagementSkill: CoachSkillDef = {
  name: 'workout-management',
  aliases: ['workout-scheduling', 'workout-editor'],
  description:
    'Add, schedule, move, edit, replace, postpone, or remove planned workouts through a coherent coaching proposal.',
  whenToUse:
    'Use when the athlete asks to change one or more planned workouts or add a concrete session to a plan.',
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
    `The structured proposal should show the resulting Workout and any related schedule changes together; the athlete confirms the concrete change before it is applied.`,
    `Use plan.proposal_preview for prescription replacement or a coordinated remaining-plan rewrite. Use legacy workout decisions only for ordinary add/move/status operations that are not prescription replacement.`,
    `When connected-device delivery matters, inspect integration.status directly and report any unsupported target as synchronization impact; keep the internally correct prescription intact.`,
    `Keep proposal evidence athlete-facing: describe the data used and the coaching conclusion, without database IDs, internal DSL/schema details, algorithm or model brands, or confidence scores.`,
  ].join('\n'),
};
