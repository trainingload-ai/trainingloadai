import type { CoachSkillDef } from '../skill.types';

export const planFollowupSkill: CoachSkillDef = {
  name: 'plan-followup',
  aliases: ['plan_followup', 'followup-plan', 'training-plan-followup'],
  description:
    'Follow up on a saved training plan the user opened in the app: execution progress, remaining sessions, load context, and schedule adjustments — including drafts not yet activated.',
  whenToUse:
    'Use when the user opens AI Coach from a specific plan (intent plan-followup) or asks to discuss a plan they are viewing, remaining workouts, or next steps for that plan.',
  suggestedTools: [
    'plan.by_id',
    'plan.active',
    'time.current',
    'training.baseline',
    'profile.current',
    'profile.zones',
    'profile.zone_ranges',
    'metric.current',
    'training.readiness',
    'activity.search',
    'workout.intensity_strategy',
    'integration.status',
    'plan.proposal_preview',
    'coach_decision_draft',
    'coach_decision_apply',
  ],
  prompt: [
    `Treat the plan opened by the athlete as the primary object for this turn. A plan_followup_seed or equivalent product context may contain its planId; retrieve that exact signed-in user's plan with plan.by_id when its contents or status are needed. plan.active is for the active plan generally and may refer to a different plan.`,
    `Use includeAllWorkouts when the question needs the complete remaining schedule or whole-plan context; a narrow question may need less data.`,
    `Draft plans may have no startDate; "today / tomorrow" buckets may be empty while \`allWorkouts\` still lists all sessions — that is expected; analyze from \`allWorkouts\` and statuses.`,
    `Never paste internal database IDs into athlete-facing prose. Refer to this plan, its visible title, or the plan the athlete opened.`,
    `If \`plan.by_id\` returns no plan, say it could not be loaded for this account and suggest checking the plan in the app — without quoting any id.`,
    `Choose additional baseline, profile, metric, readiness, plan-day, or activity evidence only when it can materially change the requested judgment or proposal. For schedule changes, use the Workout operation decision guide and present one coherent change set.`,
    `For prescription changes across one workout or the remaining plan, assess equivalent workout families together and use plan.proposal_preview. Do not turn the athlete's requested pace/HR/power/RPE wording directly into a write without coaching judgment.`,
    `When connected-device delivery matters, inspect integration.status directly and explain any synchronization limitation without changing the internally correct prescription.`,
    `In proposal rationale and evidence, explain what athlete data was used and what conclusion follows; never expose database IDs, internal DSL/schema details, algorithm or model brands, or confidence scores.`,
  ].join('\n'),
};
