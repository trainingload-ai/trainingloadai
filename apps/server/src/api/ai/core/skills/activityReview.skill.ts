import type { CoachSkillDef } from '../skill.types';

/** Review one completed activity from the server-owned evidence snapshot. */
export const activityReviewSkill: CoachSkillDef = {
  name: 'activity-review',
  catalogVisible: false,
  aliases: ['workout-review', 'session-review'],
  description:
    'Produce a completed-activity review from a supplied evidence snapshot.',
  whenToUse:
    'Server-owned single-activity review with its sport-specific evidence and output contract.',
  suggestedTools: ['coach_task_submit_result'],
  prompt: [
    'Treat the supplied activity evidence as authoritative for this run.',
    'Separate recorded measurements, derived training metrics, and coaching judgment.',
    'Respect the sport-specific metric allowlist and forbidden inferences in the supplied review contract.',
    'Do not invent missing sensor data, planned targets, recovery status, injury, or plan compliance.',
    'Finish with a concise, actionable review for the athlete.',
    'Complete this task only when coach_task_submit_result accepts the Markdown review required by the supplied contract. A snapshot review does not create a plan change.',
  ].join('\n'),
};
