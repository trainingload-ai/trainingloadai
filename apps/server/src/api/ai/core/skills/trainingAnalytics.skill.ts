import type { CoachSkillDef } from '../skill.types';

export const trainingAnalyticsSkill: CoachSkillDef = {
  name: 'training-analytics',
  aliases: ['training-chart', 'training-visualization', 'training-stats'],
  description:
    'Answer quantitative questions across activities, PMC and stored fitness/body metric history, choosing text, a chart or a table according to the analytical relationship.',
  whenToUse:
    'Use for counts, totals, trends, changes over time, sport composition, period or activity comparisons, distributions, and requests to chart training data.',
  suggestedTools: [
    'training.aggregate',
    'present_training_visualization',
    'activity.search',
    'activity.byHashId',
    'activity.series',
    'pmc.range',
    'metric.history',
    'profile.current',
  ],
  prompt: [
    'First identify the analytical relationship: a single lookup, trend over time, comparison, composition, distribution, relationship, or an activity segment. Use the smallest query that answers it.',
    'Use training.aggregate when a number or short textual comparison is clearer. Use present_training_visualization when shape, change, composition, or repeated values matter. A user asking for a chart is a strong preference, but choose a compatible view rather than forcing a chart type.',
    'Prefer a line or area view for time trends, bars for category or activity comparisons, stacked bars for composition over time, metric strips for one compact result, and tables when exact values or sparse data matter. These are judgment aids, not a required call sequence.',
    'Never calculate totals or averages from truncated activity.search results. The aggregate and visualization tools own grouping, weighted averages, units, timezone boundaries, coverage, and truncation.',
    'For stored user-metric trends (VO2max/VDOT, thresholds, height, weight), choose source METRICS and the corresponding measures. This reads history, not a new fitness assessment. Keep the requested metric, date range and source; a PMC chart cannot substitute for a VO2max chart. No data or a single record calls for an honest sparse-data answer rather than another metric or fabricated points.',
    'For a curve inside one activity or aligned curves from up to three activities, use ACTIVITY_SERIES with actual activity hash IDs, signal measures and elapsed-time, recorded-distance or elapsed-progress alignment. Choose alignment based on the question: time for pacing over time, distance for matched course positions, normalized progress for relative stages. These are different comparisons, not interchangeable scales. To compare signals over time (for example heart rate, pace and elevation), axisLayout OVERLAY combines up to three measures with a shared X axis. Compatible units share a Y scale, otherwise labeled independent Y axes preserve each unit; separate panels may be clearer with many activities or on narrow screens. Choose the initial layout for the user’s question, not a fixed sequence. Users can switch layouts. Use RELATIONSHIP scatter for paired values rather than their time trends. Optional second offsets narrow the evidence. Use activity.series for numerical segment summaries. Do not use whole-activity aggregates to make second-level claims.',
    'ZONE_DISTRIBUTION compares time or percentages in the recorded zones, optionally across two periods. Historical zone boundaries may differ and are kept separate. PLAN_EXECUTION compares prescribed duration, distance or load with explicitly linked actual activities; unlinked workouts are unknown rather than zero. RELATIONSHIP pairs two measurements from the same activity, or the same time bucket with SAMPLE basis; METRIC_HISTORY basis pairs fitness/body records on the same local day without carrying old values forward; a scatter pattern does not establish causation. Read coverage notes before interpreting a plot.',
    'Place a visualization where it supports the explanation: short setup text, the visual, then the conclusion or next action when useful. Do not repeat every plotted value in prose.',
  ].join('\n'),
};
