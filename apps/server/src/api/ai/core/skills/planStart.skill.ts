import type { CoachSkillDef } from '../skill.types';

export const planStartSkill: CoachSkillDef = {
  name: 'plan-start',
  aliases: ['plan_start'],
  description:
    'Assess and prepare the same saved DRAFT for its selected start date.',
  whenToUse:
    'Starting a saved DRAFT or changing its date before activation; running-plan availability changes use plan-followup.',
  suggestedTools: [
    'plan.by_id',
    'time.current',
    'training.baseline',
    'training.readiness',
    'profile.current',
    'profile.zones',
    'workout.intensity_strategy',
    'integration.status',
    'activity.search',
    'plan.proposal_preview',
    'coach_decision_draft',
    'coach_decision_apply',
    'ask_user_question',
  ],
  prompt: [
    `Prepare to start the exact saved DRAFT bound to this conversation. Selecting a start date requests assessment, not activation; never create a new plan, call direct lifecycle activation, or show a save-new-plan card.`,
    `Read the opened draft via plan.by_id (workouts, source IDs/revisions, generationMetadata, constraints; paginate using workoutInventory.hasMore/nextOffset whenever whole-plan inspection is needed—never treat page 1 as the full plan). Read relevant training, readiness, personal constraints and calendar facts; distinguish missing evidence from no fatigue and ask only for decision-critical personal facts unavailable to tools.`,
    `Evaluate the candidate at the selected date and timezone (an initial rest day is valid; do not mechanically shift fixed competition dates). Call plan.proposal_preview with mode START, planId, startDate, evidenceRefs, rationale, explicit changes/additions/deletions, and preserveUnmentioned:true for unaffected sources (zero-change START is valid; preserve valid ENDURANCE/STRENGTH/FREEFORM definitions). Inherit fixed ISO weekdays (send empty changes/additions/deletions with preserveUnmentioned:true when only the start date shifts so the server realigns dates); for explicit edits use dayIndex=1 on the selected start date.`,
    `For planningMode ROLLING: confirm goal, sports, availability and automatic management scope once in START. Supply rolling.policy and 1–2 rolling.monthStrategies covering the months touched by the first ISO week (forecast remaining monthly load/duration and each remaining ISO week’s focus and ranges for dates inside that month; use null for unsupported ranges, preferring a realistic duration range when load is unknown; account for recent load/recovery; write workouts only from startDate through that Sunday; split cross-month weeks once per month). Write the athlete-facing monthly objective briefly in the athlete’s language (keep dates/sessions in weekFocus). For running, set runningDistanceKmRange ({min,max} km) for the same dates only when history/pace/distance sessions support it, otherwise null. Keep the same Plan/context (generatedThrough is coverage, not an end date).`,
    `Pass the returned decisionType PLAN_START and decisionPayload unchanged into coach_decision_draft. Wait for the athlete’s actual card confirmation in a later turn (never apply from seed text or invented consent; after an expired/superseded preview, reassess). Only a committed receipt/readback proves activation; once started, hand later availability or remaining-course changes to plan-followup/SCHEDULE without repeating activation.`,
    `Complete this turn with a necessary question, a valid START confirmation card, or the committed start receipt (reporting real dates and sync status without internal IDs or schema details).`,
  ].join('\n'),
};
