import type { CoachSkillDef } from '../skill.types';

export const periodReviewSkill: CoachSkillDef = {
  name: 'period-review',
  aliases: ['daily-review', 'monthly-review', 'review-digest'],
  description:
    'Explain a completed daily, weekly, or monthly training window from recorded activity, load, plan execution, and relevant athlete context.',
  whenToUse:
    'Use for a server-owned daily, weekly, or monthly review that summarizes what happened, why it matters, and what the athlete should observe next without modifying the plan.',
  suggestedTools: [
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
  ].join('\n'),
};
