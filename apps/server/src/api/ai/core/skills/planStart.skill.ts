import type { CoachSkillDef } from '../skill.types';

export const planStartSkill: CoachSkillDef = {
  name: 'plan-start',
  aliases: ['plan_start'],
  description: 'Review and start a saved draft.',
  whenToUse: 'Saved-draft starts or date changes.',
  suggestedTools: [
    'plan.by_id',
    'time.current',
    'training.baseline',
    'training.plan_context',
    'training.readiness',
    'profile.current',
    'profile.zones',
    'activity.search',
    'plan.proposal_preview',
    'coach_decision_draft',
    'coach_decision_apply',
    'ask_user_question',
  ],
  prompt: [
    `After the same plan has a committed START receipt it is already running: use plan-followup/SCHEDULE for new availability or remaining-course changes, preserve its original start and history, and never repeat activation.`,
    `This is preparation to start the exact saved DRAFT bound to this conversation. Selecting a date asks for assessment; it is not permission to activate. Do not create a new plan, call a direct lifecycle activation, or present a generic save-new-plan card.`,
    `Read the opened plan with plan.by_id including its workouts, source identities/revisions, generationMetadata and existing constraints. Read relevant actual training, readiness/recovery, personal constraints and calendar facts; explicitly distinguish missing evidence from no fatigue. Ask only for personal information that changes the judgment and cannot be read from tools.`,
    `Evaluate the complete candidate at the selected date and calendar timezone. An initial rest day is allowed; do not mechanically move a fixed competition date. Discuss and revise the same draft in this conversation when needed.`,
    `plan.by_id returns paginated source inventory with workoutInventory.total/hasMore/nextOffset. Use subsequent pages to inspect all workouts needed for a whole-plan assessment. Never claim the first page covers the whole plan. START preserveUnmentioned:true explicitly preserves every omitted source on the server; canonical preview lists the complete changed/added/deleted/preserved scope.`,
    `Use plan.proposal_preview with mode START, planId, the selected startDate, evidenceRefs and rationale. List explicit changes {sourceWorkoutId,expectedRevision,workout}, additions {candidateKey,workout}, deletions {sourceWorkoutId,expectedRevision}; preserveUnmentioned:true is appropriate for every unaffected source. Preserve valid ENDURANCE, STRENGTH and FREEFORM definitions. A zero-change START is valid.`,
    `Fixed ISO rest weekdays and legacy relative allowedDays are distinct. Inherit existing constraints unless the athlete explicitly settles a replacement. Any changed scheduleConstraints and qualityContractTransition must be shown with the final candidate; audit references do not grant execution authority.`,
    `Pass the returned decisionType PLAN_START and decisionPayload unchanged into coach_decision_draft. Wait for the athlete to use that actual card confirmation in a later turn; coach_decision_apply cannot use seed text or invented consent. After an expired or superseded preview, reassess rather than retrying its old card.`,
    `Only a committed apply receipt/readback establishes the same plan was started. Describe the real resulting dates and synchronization status without exposing database IDs or internal schema details.`,
  ].join('\n'),
};
