import type { CoachSkillDef } from '../skill.types';

/** Review one completed activity from the server-owned evidence snapshot. */
export const activityReviewSkill: CoachSkillDef = {
  name: 'activity-review',
  aliases: ['workout-review', 'session-review'],
  description:
    'Review one completed activity using its recorded session metrics, athlete baseline, and historical load context.',
  whenToUse:
    'Use for a post-activity coaching review of one saved workout, including what happened, what the evidence supports, and what to do next.',
  suggestedTools: ['coach_task_submit_result'],
  prompt: [
    'Treat the supplied activity evidence as authoritative for this run.',
    'Separate recorded measurements, derived training metrics, and coaching judgment.',
    'Respect the sport-specific metric allowlist and forbidden inferences in the supplied review contract.',
    'Do not invent missing sensor data, planned targets, recovery status, injury, or plan compliance.',
    'Finish with a concise, actionable review for the athlete.',
  ].join('\n'),
};
