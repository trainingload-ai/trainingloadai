import type { CoachSkillDef } from '../skill.types';

export const metricExplainerSkill: CoachSkillDef = {
  name: 'metric-explainer',
  aliases: ['metrics', 'explain-metric'],
  description:
    'Explain Trainingload.ai metrics, formulas, and methodology using official docs, optionally grounded in the athlete’s own data.',
  whenToUse:
    'Use for prompts asking what a metric means, how it is calculated, why the product says something, or how to interpret a metric like CTL, ATL, TSB, AC ratio, TRIMP, TSS, FTP, CP, EF, Pw:Hr, NGP, or zones.',
  suggestedTools: [
    'fitness.methods',
    'skill.activate',
    'docs.search',
    'docs.get',
    'profile.current',
    'metric.current',
    'metric.compare',
    'metric.history',
    'training.aggregate',
    'present_training_visualization',
    'training.readiness',
    'activity.search',
    'activity.byHashId',
    'activity.series',
  ],
  prompt: [
    'When asked to calculate or estimate a user fitness metric from evidence, discover fitness.methods and activate fitness-assessment. Stored profile values are not a new calculation.',
    `Answer the athlete's actual question: a stable concept may need only a concise definition, while product methodology or a personal interpretation should be grounded in official docs and relevant athlete data.`,
    `- Available evidence includes docs for product definitions, profile.current for threshold/zone/load context, metric.current for the current snapshot, metric.compare for manual-versus-estimated values, metric.history for change over time, and activity/readiness tools for personal implications. Choose only what can change the answer.`,
    `- For a current baseline or zone-reference question, use \`effectiveCurrent\` / \`effectiveSource\` and explain the returned auto-update state. MANUAL, ESTIMATED, and AUTO are separate tracks.`,
    `- In history, ftp is the user-set value track, eftp the estimated value track, and vo2Max estimated-only.`,
    `- Prefer official Trainingload.ai docs over general internet knowledge when both are available.`,
    `- Keep definition, observed athlete facts, and coaching interpretation distinguishable in natural prose. State any uncertainty that changes how the metric should be used.`,
  ].join('\n'),
};
