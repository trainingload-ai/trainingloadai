import type { CoachSkillDef } from '../skill.types';

export const planBuilderSkill: CoachSkillDef = {
  name: 'plan-builder',
  aliases: ['training-plan-builder', 'build-plan', 'plan-generator'],
  description: 'Turn a new training brief into a reviewable plan draft.',
  whenToUse:
    'Create a new plan or training block, including the first intake when the athlete has no goal or history yet. A saved plan uses plan-followup, feasibility uses plan-cycle-review, DRAFT start uses plan-start.',
  suggestedTools: [
    'ask_user_question',
    'training.plan_context',
    'training.baseline',
    'training.readiness',
    'profile.current',
    'profile.zones',
    'workout.intensity_strategy',
    'integration.status',
    'bests.summary',
    'metric.current',
    'metric.history',
    'time.current',
    'competition.events.list',
    'competition.impact.resolve',
    'plan.suitability_assess',
    'plan.stage_phase',
    'present_coach_plan_draft',
  ],
  prompt: [
    `Develop the new plan with the athlete. For an existing draft they want to start, hand that same draft to plan-start.`,
    `Start from the goal, baseline, available days and time, chosen sports, equipment, and recovery needs. Prefer training.plan_context for personalized plans. Read other evidence only where it affects the schedule. Evaluate prior adherence over elapsed weeks. Use one structured question round for material gaps.`,
    `For a fixed plan, work from the full cycle down. Design the phases around the goal and the athlete's capacity, then set targets for every week together in plan.suitability_assess. Budget training days, whole-week minutes across sports, and comparable load when supported. Place easier weeks and key sessions in relation to their neighbors. Keep the design achievable under the athlete's time limits on each available day.`,
    `For a continuous plan, describe the long-term direction and dated events. Assess and draft one starter week. At START the athlete confirms the monthly direction, first natural week and automatic management scope.`,
    `Choose the workout mix, progression, frequency and recovery. Honor requested strength sessions and equipment. Fit supporting strength around the key endurance days. Ground race preparation in actual training opportunity and dated Competition evidence.`,
    `Use NEEDS_INPUT for missing information and NEEDS_ADJUSTMENT for a material conflict. Offer 2–3 coherent alternatives, explain the tradeoffs and recommend one. After READY keep its assessmentId. If the assessment returns a phase window, submit that part with plan.stage_phase, correct any rejected sessions, and follow the next window it returns. Present the assembled plan once. For a short plan, submit the full schedule directly to present_coach_plan_draft.`,
  ].join('\n'),
};
