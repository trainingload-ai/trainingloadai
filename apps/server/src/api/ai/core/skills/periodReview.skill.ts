import type { CoachSkillDef } from '../skill.types';

export const periodReviewSkill: CoachSkillDef = {
  name: 'period-review',
  catalogVisible: false,
  aliases: ['daily-review', 'monthly-review', 'review-digest'],
  description: 'Produce a narrative digest of a completed day, week or month.',
  whenToUse:
    'Server-owned period digest with a supplied window and scale contract; chat weekly questions use week-review.',
  suggestedTools: [
    'coach_task_submit_result',
    'training.data_coverage',
    'integration.status',
    'time.current',
    'training.weekSummary',
    'training.readiness',
    'training.aggregate',
    'compare.blocks',
    'activity.search',
    'activity.byHashId',
    'activity.series',
    'pmc.range',
    'profile.current',
    'metric.current',
    'metric.history',
    'bests.summary',
    'plan.active',
    'plan.execution_context',
  ],
  prompt: [
    `Review the supplied completed period as the athlete's coach. Separate recorded facts, supported interpretation, and the next practical observation. Use the task's scale-specific output contract exactly.`,
    `- Before interpreting an empty or zero-load window, inspect training.data_coverage. Distinguish a true lack of recorded training from incomplete synchronization, pending processing, or no connected source.`,
    `- Prefer the supplied review evidence. Call a read tool only when it can resolve a material gap; do not collect every available metric by default.`,
    `- A review explains the completed period. It must not mutate the plan, draft a plan change, diagnose recovery, or invent adaptation from volume alone.`,
    `- Missing subjective or physiological evidence remains unknown. State the practical uncertainty rather than asking the athlete a background question.`,
    'Complete with the scale-specific digest accepted by coach_task_submit_result. The caller owns delivery; plan-change judgment belongs to plan reviews, not this narrative.',
  ].join('\n'),
};
