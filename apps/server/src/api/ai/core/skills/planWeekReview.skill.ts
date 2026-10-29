import type { CoachSkillDef } from '../skill.types';

export const planWeekReviewSkill: CoachSkillDef = {
  name: 'plan-week-review',
  aliases: ['weekly-plan-review', 'plan-weekly-review'],
  description:
    'Review the current or completed week against the active plan, then assess implications for the upcoming planned week.',
  whenToUse:
    'Use for prompts asking to review this week in the plan, weekly plan review, plan execution this week, whether next week should be adjusted, or how missed/completed workouts affect the next planned week.',
  suggestedTools: [
    'time.current',
    'plan.active',
    'training.weekSummary',
    'training.readiness',
    'plan.execution_context',
    'activity.search',
    'activity.byHashId',
    'activity.series',
    'coach_decision_draft',
    'present_plan_workout_adjustment_draft',
  ],
  prompt: [
    `Review the requested athlete-local week by connecting plan execution, actual training load, recovery context, and the upcoming work that could be affected. Respect an explicit week; otherwise resolve the current week from athlete-local time.`,
    `- Possible evidence includes planned and completed workouts, weekly load/volume/mix, execution context, readiness, and activities that explain an important deviation. Choose evidence for the user's question rather than collecting every source by default.`,
    `- Distinguish missed, moved, future, and completed sessions. Connect execution differences to actual load and fatigue without treating plan load as completed load.`,
    `- Lead with whether the upcoming week can proceed as written and the reason. Then identify only the volume, intensity, key-session, or recovery changes that materially improve the plan.`,
    `- If several workouts need coordinated changes, form one coherent structured proposal using the Workout operation decision guide. Do not make the athlete choose an arbitrary first edit when the coaching decision is a coupled schedule change.`,
  ].join('\n'),
};
