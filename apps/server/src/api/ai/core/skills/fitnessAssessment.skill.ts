import type { CoachSkillDef } from '../skill.types';
export const fitnessAssessmentSkill: CoachSkillDef = {
  name: 'fitness-assessment',
  description:
    'Assess fitness from activity evidence using estimation methods, their physiological context, and deterministic calculations.',
  whenToUse:
    'Estimate any discoverable user fitness metric from bounded evidence; diagnose stale values; resume a pending assessment.',
  suggestedTools: [
    'fitness.methods',
    'fitness.evidence',
    'fitness.calculate',
    'fitness.track',
    'mutation_apply_fitness_calculation',
    'activity.search',
    'activity.byHashId',
    'metric.current',
    'metric.history',
    'profile.current',
    'ask_user_question',
    'plan.active',
    'plan.by_id',
    'plan.day_view',
    'pmc.range',
    'workout.intensity_strategy',
    'coach_decision_draft',
    'coach_decision_apply',
  ],
  prompt: [
    'Complete the requested assessment using the selected evidence and the method catalog, including its rationale and interpretation, not just requirements. Use applicable deterministic calculators when their execution requirements are met. Other evidence-based estimates may be explained with their actual inputs, derivation and assumptions, clearly distinguished from tool results; never fabricate inputs or calculations.',
    'Treat saved metric history as settings/history, not a new assessment. Preserve the confirmed metric, sport, time scope, and user facts when resuming a task; a request to update from recent data creates a new preview rather than write permission.',
    'The catalog describes implemented methods for the requested metric, not an exhaustive account of valid estimation. CSS is swim CS. VO2_MAX is the single stored metric represented to runners as VDOT; VDOT is an alias, not a second profile metric. Unsupported methods are software capability limits.',
    "Inspect available evidence before asking for input and respect the athlete's requested scope. The method descriptions distinguish ordinary-training estimates from protocol-specific tests; for example, the confirmed protocol for lthr-30-minute applies to that test calculation, not every possible LTHR estimate.",
    'A NEEDS_INPUT, WAITING_DATA, UNAVAILABLE, or FAILED tool result blocks that calculation, not every possible assessment from the evidence. Explain the concrete gap in athlete language and, when one fact is required, use ask_user_question. Do not expose activity ids, elapsed-second fields, evidence selectors, or other calculation controls to the athlete.',
    'Finish with a calculated result or explained coaching estimate, a specific blocker and next action, or one necessary question. Clearly distinguish the saved value, evidence date, new result, assessment time, and limitations.',
    "A valid displayed result may be proposed as the athlete's selected estimate/reference, including observed MaxHR. Adoption requires the dedicated fitness calculation confirmation path and does not turn an estimate into laboratory measurement.",
    'When a method needs a future test, use the Workout operation decision guide to create a structured test workout and any related schedule changes. The completed Activity remains evidence and must pass the protocol and signal checks.',
    'Start follow-up tracking only after explicit consent, and never auto-apply a later result.',
  ].join('\n'),
};
