import type { CoachSkillDef } from '../skill.types';

export const planCycleReviewSkill: CoachSkillDef = {
  name: 'plan-cycle-review',
  aliases: ['plan-review', 'cycle-review', 'block-review'],
  description:
    'Judge whether an existing or visible draft plan serves its goal.',
  whenToUse:
    'Whole-plan feasibility, race-finish demand or progress across a block; a genuinely new cycle brief uses plan-builder.',
  suggestedTools: [
    'time.current',
    'plan.by_id',
    'plan.recent',
    'training.weekSummary',
    'training.readiness',
    'metric.history',
    'metric.current',
    'bests.summary',
    'activity.search',
    'competition.events.list',
    'competition.impact.resolve',
    'workout.intensity_strategy',
    'integration.status',
    'plan.proposal_preview',
    'coach_decision_draft',
    'coach_decision_apply',
  ],
  prompt: [
    `Evaluate the visible, opened, or most relevant saved plan against its original goal and the athlete's direct question. A visible unsaved draft is valid review material; do not make the athlete restate it or regenerate it merely to answer a feasibility question.`,
    `- Retrieve the full plan when the question depends on its schedule. Use the specifically opened/named plan when present; otherwise the recent plan capability can resolve the active or latest completed plan.`,
    `- Choose supporting evidence according to the judgment: representative weekly load and readiness for execution capacity, metrics or bests for performance signals, and validated competition impact for dated event constraints. Sample long cycles rather than reading every week without purpose.`,
    `- Judge information sufficiency, current base versus goal demand, progression, long-session development, intensity density, recovery, event taper/recovery, completion consistency, missed or moved work, and adaptation or excess-fatigue signals as relevant. No single week count, zone value, or load metric decides feasibility by itself.`,
    `- For a race-finish question, lead with yes, conditional yes, no/not responsibly, or unknown due to a specific missing fact. Zones can improve prescriptions but are not automatically required for a structural feasibility judgment.`,
    `- Keep athlete-set event importance separate from current computed planning impact. Do not infer event constraints from goal prose when the product can resolve them.`,
    `- Complete a review with the direct judgment, decisive evidence and uncertainty, and concrete changes to keep or consider. A new plan draft or applied schedule change is a separate artifact with its own review and confirmation surface.`,
    `- When the review concludes that remaining prescriptions should change, group equivalent sessions, explicitly preserve justified workouts, and use plan.proposal_preview. Use SUPERSEDE only when the coherent coaching solution is a complete successor plan with an explicit effective date.`,
    'For a genuinely new cycle, hand the settled goal, constraints and useful review findings to plan-builder. For saved-DRAFT activation use plan-start; a review alone does not start or replace a plan.',
    'In a server-owned cycle review, submit only the caller-required judgment; its later composer owns any adjustment artifact.',
  ].join('\n'),
};
