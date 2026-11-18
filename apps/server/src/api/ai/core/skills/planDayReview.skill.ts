import {
  PLAN_REVIEW_COMPLETION_PROMPT,
  PLAN_REVIEW_TARGET_CONTEXT_PROMPT,
} from '../prompt-contracts/plan-review-judgment.contract';
import type { CoachSkillDef } from '../skill.types';

export const planDayReviewSkill: CoachSkillDef = {
  name: 'plan-day-review',
  aliases: ['daily-plan-review', 'plan-daily-review', 'day-review'],
  description:
    'Judge how a planned day and its actual execution affect the next session.',
  whenToUse:
    'A requested day in a plan or whether the next planned session should change; general readiness uses readiness-check.',
  suggestedTools: [
    'plan.by_id',
    'plan.proposal_preview',
    'workout.intensity_strategy',
    'profile.zones',
    'integration.status',
    'time.current',
    'plan.active',
    'activity.search',
    'activity.byHashId',
    'activity.series',
    'coach_decision_draft',
    'training.readiness',
    'profile.current',
    'competition.impact.resolve',
    'plan.execution_context',
    'present_plan_workout_adjustment_draft',
  ],
  prompt: [
    PLAN_REVIEW_TARGET_CONTEXT_PROMPT,
    `Review the requested athlete-local day in the context of what was planned, what was actually completed, and the next relevant planned work. Resolve relative dates in the athlete's timezone; an explicit user date is already settled.`,
    `- Possible evidence includes the target-day plan, actual activities, execution context, readiness/load, subjective feedback, and validated competition impact. Choose the subset that can materially change the judgment; use activity detail only when aggregate facts are insufficient.`,
    `- Product-known plan and activity facts should be retrieved rather than asked back. Ask about soreness, sleep, RPE, pain, motivation, availability, or preference only when that missing athlete fact changes the recommendation.`,
    `- Athlete-set event importance and current computed event impact are distinct. Use competition impact when an event or phase can change the day's recommendation, rather than as a mandatory read for every daily question.`,
    `- Lead with the practical judgment for today or the next session. Explain the key mismatch, load, recovery, or execution facts without forcing a report template.`,
    `- When a schedule change is the best recommendation, use the Workout operation decision guide: show the complete local change set as a structured proposal and rely on product confirmation before applying it. If no change is needed, say what to do and what signal would change that decision.`,
    PLAN_REVIEW_COMPLETION_PROMPT,
  ].join('\n'),
};
