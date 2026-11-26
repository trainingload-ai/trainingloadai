import type { CoachSkillDef } from '../skill.types';

export const planFollowupSkill: CoachSkillDef = {
  name: 'plan-followup',
  aliases: ['plan_followup', 'followup-plan', 'training-plan-followup'],
  description: 'Continue work on the specific saved plan the athlete opened.',
  whenToUse:
    'Opened-plan progress, remaining sessions or next steps, including DRAFT plans; keep that object when another plan is active.',
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
    `Treat the plan opened by the athlete as the primary object. Retrieve that exact plan via plan.by_id (using planId from context when present; plan.active may point to another plan). Use includeAllWorkouts when whole-plan or remaining-schedule context is needed. If plan.by_id returns nothing, say it could not be loaded and suggest checking the app—never quote an ID. Draft plans may have no startDate and empty today/tomorrow buckets while allWorkouts lists all sessions.`,
    `- Schedule/availability changes on an ACTIVE/PAUSED plan: read every page of plan.by_id and relevant calendar, then use SCHEDULE preview + PLAN_SCHEDULE decision with explicit future range, complete changes/additions/deletions and preserveUnmentioned:true. Preserve historical, linked, non-PLANNED and successor-covered workouts; do not infer ISO weekdays from allowedDays. Fixed plans require confirmation of the card in a later turn.`,
    `- Revising an existing calendar adjustment: read plan.by_id with includePendingCalendarAdjustments:true; if clear and READY, pass its exact id/versionId as calendarAdjustment.id/baseVersionId in SCHEDULE with only the requested delta. Start a new proposal for a separate adjustment; if stale/expired, have the athlete reload the latest schedule.`,
    `- Starting a saved DRAFT belongs to plan-start (START preview / PLAN_START confirmation on that same plan; never generic lifecycle activation or a successor).`,
    `- Read additional baseline, profile, metric, readiness or activity facts only when they can materially change the judgment or proposal. For prescription changes across one or more sessions, group equivalent families and use plan.proposal_preview under the Workout operation decision guide—never turn athlete pace/HR/power/RPE wording straight into a write without coaching judgment.`,
    `Delegate day/week implications to plan-day-review/plan-week-review and whole-plan feasibility to plan-cycle-review while carrying the opened plan and settled constraints. Finish with a direct answer, a complete preview, a committed receipt, one necessary question or the loading limitation.`,
  ].join('\n'),
};
