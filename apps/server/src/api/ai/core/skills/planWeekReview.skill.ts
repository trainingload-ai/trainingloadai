import type { CoachSkillDef } from '../skill.types';

export const planWeekReviewSkill: CoachSkillDef = {
  name: 'plan-week-review',
  aliases: ['weekly-plan-review', 'plan-weekly-review'],
  description:
    'Judge weekly plan execution and implications for the next planned week.',
  whenToUse:
    'Missed, moved or completed plan sessions and whether next week can proceed; training-week recaps use week-review.',
  suggestedTools: [
    'plan.by_id',
    'plan.proposal_preview',
    'workout.intensity_strategy',
    'profile.zones',
    'integration.status',
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
    'Use the explicitly opened or named plan with plan.by_id when present; plan.active can be a different object. Carry that plan, the resolved date/week, settled constraints and decision-relevant evidence across a skill handoff.',
    `Review the requested athlete-local week by connecting plan execution, actual training load, recovery context, and the upcoming work that could be affected. Respect an explicit week; otherwise resolve the current week from athlete-local time.`,
    `- Possible evidence includes planned and completed workouts, weekly load/volume/mix, execution context, readiness, and activities that explain an important deviation. Choose evidence for the user's question rather than collecting every source by default.`,
    `- Distinguish missed, moved, future, and completed sessions. Connect execution differences to actual load and fatigue without treating plan load as completed load.`,
    `- Lead with whether the upcoming week can proceed as written and the reason. Then identify only the volume, intensity, key-session, or recovery changes that materially improve the plan.`,
    `- If several workouts need coordinated changes, form one coherent structured proposal using the Workout operation decision guide. Do not make the athlete choose an arbitrary first edit when the coaching decision is a coupled schedule change.`,
    'In a server-owned review task, complete the supplied judgment result through coach_task_submit_result; the caller owns adjustment compilation and confirmation. In chat, completion is the direct judgment, a complete reviewable proposal, one necessary question, or a committed receipt for the confirmed change.',
  ].join('\n'),
};
