import type { CoachSkillDef } from '../skill.types';

export const ROLLING_PLAN_READ_TOOLS = [
  'training.data_coverage',
  'plan.by_id',
  'workout.intensity_strategy',
] as const;
export const ROLLING_PLAN_REQUIRED_TOOLS = [
  'training.data_coverage',
  'plan.by_id',
] as const;

export const rollingPlanSkill: CoachSkillDef = {
  name: 'rolling-plan',
  catalogVisible: false,
  description: 'Propose a rolling month strategy or a bounded future schedule.',
  whenToUse:
    'Server-owned MONTH, WEEK or ADJUST job under an already confirmed rolling policy.',
  suggestedTools: [...ROLLING_PLAN_READ_TOOLS, 'coach_task_submit_result'],
  prompt: [
    'Work on the supplied plan and future window under its confirmed policy. The caller owns publication, eligibility and current policy checks.',
    'Inspect training.data_coverage and plan.by_id for the supplied plan before submitting. Use the complete supplied plan/window inventory, related calendar, date-effective rule periods and athlete evidence; a default background context is not the complete planning window. If tool facts conflict with that snapshot, return NEEDS_INPUT with the specific limitation rather than guessing a new authority.',
    'MONTH proposes the remaining natural month direction, volume ranges and ISO-week focus. Keep unknown load null with its units and coverage. Mid-month work starts from the supplied future range; never compensate for missed past load.',
    'WEEK produces one ISO natural week, even across two months, combining both supplied month strategies. ADJUST changes only justified future courses in the same bounded week. Preserve completed, in-progress, protected and athlete-edited courses, identities and expected revisions; preserve other-plan and standalone calendar commitments.',
    'Use actual recent training, remaining planned estimates and ungenerated forecast as separate evidence. Missing load is unknown, not zero, and forecasts are not completed work or proof of adaptation. Judge progression conservatively from the available baseline and recovery evidence.',
    'Apply each course date’s confirmed constraints and sport authorization. Availability is a ceiling, not a target. Personal setting changes are outside this candidate: if a safe candidate requires new availability, sports, goal, zones or other personal settings, submit NEEDS_INPUT and its reason. Missing optional health measurements alone do not require new settings.',
    'Where training anchors are unknown, use duration-based easy work and RPE/talk-test cues; never invent thresholds or use high intensity as a fallback. If essential evidence cannot support a safe candidate, submit NEEDS_INPUT rather than inventing a prescription.',
    'Complete only with coach_task_submit_result accepting the caller’s MONTH strategy, WEEK/ADJUST schedule candidate, or NEEDS_INPUT blocker. A candidate is ready for domain validation, not published or applied. This background task has no athlete question, decision card, settings write or device delivery.',
  ].join('\n'),
};
