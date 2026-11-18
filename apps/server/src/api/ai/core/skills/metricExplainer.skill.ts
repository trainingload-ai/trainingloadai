import type { CoachSkillDef } from '../skill.types';

export const metricExplainerSkill: CoachSkillDef = {
  name: 'metric-explainer',
  aliases: ['metrics', 'explain-metric'],
  description:
    'Explain metric meaning, product methodology and personal implications.',
  whenToUse:
    'Definitions, current references or why a metric changed; new calculations use fitness-assessment, charts use training-analytics.',
  suggestedTools: [
    'fitness.methods',
    'skill.activate',
    'docs.search',
    'docs.get',
    'profile.current',
    'metric.current',
    'metric.compare',
    'metric.history',
    'metric.forecast',
    'training.aggregate',
    'present_training_visualization',
    'training.readiness',
    'pmc.range',
    'pmc.projection',
    'plan.active',
    'activity.search',
    'activity.byHashId',
    'activity.series',
  ],
  prompt: [
    `Answer the athlete's actual question: a stable concept may need only a concise definition, while product methodology or a personal interpretation should be grounded in official docs and relevant athlete data.`,
    `- Available evidence includes docs for product definitions, profile.current for threshold/zone/load context, metric.current for the current snapshot, metric.compare for manual-versus-estimated values, metric.history for change over time, and activity/readiness tools for personal implications. Choose only what can change the answer.`,
    `- Prefer official Trainingload.ai docs over general internet knowledge when both are available.`,
    `- Keep definition, observed athlete facts, and coaching interpretation distinguishable in natural prose. State any uncertainty that changes how the metric should be used.`,
    'Complete with the requested meaning, personal implication and the limitation that changes its use. A stable definition needs no personal lookup; future projections need the relevant forecast capability.',
  ].join('\n'),
};
