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
    'MONTH forecasts the remaining month and each remaining ISO week, with a focus, a normalized load range and a duration range. Keep unknown ranges null; do not reconstruct missed targets or compensate for missed past load.',
    'WEEK produces one ISO natural week using the matching weekly targets from the supplied month strategies. In a cross-month week combine only the dates covered by each month’s range. ADJUST changes only justified future courses in the bounded week. Preserve completed, in-progress, protected and athlete-edited courses, identities and expected revisions; preserve other-plan and standalone calendar commitments.',
    'Use facts.recentWeeks to compare weekly recorded load, scheduled load and completed/skipped courses. A partial date window or partial activity coverage is not a full-week total. Incorporate current athlete settings, training and recovery before deciding whether to maintain, progress or reduce the forecast. Compare the proposed week to that forecast, and explain material changes using the observed evidence. Keep actual load, planned estimates and forecasts separate; never assume missing load is zero or that a forecast proves adaptation.',
    'Apply each course date’s confirmed constraints and sport authorization. Availability is a ceiling, not a target. Personal setting changes are outside this candidate: if a safe candidate requires new availability, sports, goal, zones or other personal settings, submit NEEDS_INPUT and its reason. Missing optional health measurements alone do not require new settings.',
    'Where training anchors are unknown, use duration-based easy work and RPE/talk-test cues; never invent thresholds or use high intensity as a fallback. If essential evidence cannot support a safe candidate, submit NEEDS_INPUT rather than inventing a prescription.',
    'Complete only with coach_task_submit_result accepting the caller’s MONTH strategy, WEEK/ADJUST schedule candidate, or NEEDS_INPUT blocker. A candidate is ready for domain validation, not published or applied. This background task has no athlete question, decision card, settings write or device delivery.',
  ].join('\n'),
};
