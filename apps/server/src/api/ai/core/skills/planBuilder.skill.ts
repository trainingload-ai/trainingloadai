import type { CoachSkillDef } from '../skill.types';

export const planBuilderSkill: CoachSkillDef = {
  name: 'plan-builder',
  aliases: ['training-plan-builder', 'build-plan', 'plan-generator'],
  description:
    'Turn an athlete brief and relevant evidence into a structured, reviewable training plan draft.',
  whenToUse:
    'Use when the athlete wants a new training plan, race plan, training block, or weekly schedule. Use plan-cycle-review to evaluate an existing or just-generated plan.',
  suggestedTools: [
    'ask_user_question',
    'training.plan_context',
    'training.baseline',
    'training.readiness',
    'profile.current',
    'profile.zones',
    'workout.intensity_strategy',
    'integration.status',
    'plan.proposal_preview',
    'bests.summary',
    'metric.current',
    'metric.history',
    'time.current',
    'competition.events.list',
    'competition.impact.resolve',
    'plan.suitability_assess',
    'present_coach_plan_draft',
  ],
  prompt: [
    `Create a coherent plan draft that fits the athlete's goal, availability, current capability, and recovery capacity. The plan draft payload contract below defines its machine format.`,
    `- Extract and preserve facts already supplied in the brief. Treat weekly days and session duration as an availability budget rather than a quota, and preserve every selected sport and explicit strength preference.`,
    `- Identify only facts or evidence that could change the schedule. Prefer training.plan_context for personalized plans and narrower tools for unresolved details; generic templates need less evidence than race plans.`,
    `- Ask only decision-critical questions the product cannot answer. Prefer one structured question round with concrete options when choices are needed; otherwise state conservative assumptions and continue.`,
    `- For a dated plan, consider relevant competition events and their validated impact when they can alter build, taper, or recovery. Keep athlete-set event importance separate from computed planning impact.`,
    `- Before the full calendar, call plan.suitability_assess with the whole brief, evidence, and a compact blueprint. Do not call present_coach_plan_draft until it returns READY.`,
    `- Judge whole-brief suitability from goal, schedule, baseline, longest session, recovery, capability and event evidence. Optimize for the athlete, not generator acceptance or one universal metric.`,
    `- maxDailyMinutes limits training, not goal events. Never fake a race duration to fit the budget; use Competition for dated races and an in-budget benchmark for undated goals.`,
    `- Use NEEDS_INPUT for decision-changing gaps. For unsuitable combinations, use NEEDS_ADJUSTMENT with 2–3 coherent multi-condition scenarios: recommend one, state what each preserves/changes/trades off, ask the user to choose, then reassess next turn.`,
    `- Use prior plans as execution evidence, not templates to copy. Interpret active-plan completion relative to elapsed weeks; future sessions are not missed sessions.`,
    `- Choose workout mix, progression, recovery placement, and week-to-week frequency as a coach. Avoid filler sessions, unsupported load jumps, clustered hard work, and strength placement that undermines key endurance sessions.`,
    `- Deliver a ready draft through present_coach_plan_draft. Use reusable session templates when they keep repeated workouts compact. Validation errors are payload feedback: repair and retry without exposing parser or schema details to the athlete.`,
    `- The preview is not saved or activated. The athlete reviews and saves it in the app.`,
  ].join('\n'),
};
