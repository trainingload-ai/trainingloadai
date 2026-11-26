import type { CoachSkillDef } from '../skill.types';

export const trainingAnalyticsSkill: CoachSkillDef = {
  name: 'training-analytics',
  aliases: ['training-chart', 'training-visualization', 'training-stats'],
  description:
    'Answer quantitative training relationships with numbers or visualizations.',
  whenToUse:
    'Lookups, trends, comparisons, composition, distributions, paired relationships or activity segments; progress judgment uses performance-review.',
  suggestedTools: [
    'training.aggregate',
    'present_training_visualization',
    'activity.search',
    'activity.byHashId',
    'activity.series',
    'pmc.range',
    'metric.current',
    'pmc.projection',
    'metric.history',
    'training.readiness',
    'plan.active',
    'metric.forecast',
    'profile.current',
  ],
  prompt: [
    'Identify the analytical relationship (lookup, trend, comparison, composition, distribution, relationship, or activity segment) and run the smallest query that answers it. Use training.aggregate when numbers/short text are clearer, and present_training_visualization when shape, composition, or repeated values matter (honor explicit chart requests with a compatible view). Never compute totals/averages from truncated activity.search results.',
    '- Visual mapping: line/area for trends, bars for comparisons, stacked bars for composition over time, metric strips for compact summaries, tables for exact/sparse values. Place short setup text before the visual and the conclusion/next action after it without repeating every plotted number.',
    '- METRICS (VO2max, thresholds, height, weight): reads stored history, not a new assessment. Keep the requested metric, range and source (never substitute PMC for VO2max; answer sparse/missing data honestly rather than fabricating points).',
    '- ACTIVITY_SERIES (1–3 activity hash IDs): choose alignment for the question (elapsed time for pacing, recorded distance for course position, elapsed progress for relative stages—these are not interchangeable). Use axisLayout OVERLAY for up to 3 measures on a shared X axis (separate panels when clearer with many activities or narrow screens); use RELATIONSHIP scatter for paired values rather than time trends; use activity.series for numerical segment summaries rather than whole-activity averages.',
    '- ZONE_DISTRIBUTION compares recorded zone time/percentages (historical boundaries stay separate). PLAN_EXECUTION compares planned vs explicitly linked actual activities (unlinked = unknown, not zero). RELATIONSHIP pairs same-activity/same-bucket samples (SAMPLE) or same-local-day records without carry-forward (METRIC_HISTORY); scatter never proves causation. Always check coverage notes.',
    'Complete with the right metric, scope and coverage (or explicit sparse/no-data limitation). Hand readiness interpretation to readiness-check and new fitness estimation to fitness-assessment.',
  ].join('\n'),
};
