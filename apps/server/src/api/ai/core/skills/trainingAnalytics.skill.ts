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
    'metric.current',
    'pmc.projection',
    'metric.history',
    'training.readiness',
    'plan.active',
    'metric.forecast',
    'profile.current',
  ],
  prompt: [
    'For a personal interpretation of 最大摄氧量 / VO2max, read metric.current, bounded metric.history and any available metric.forecast. Explain current level and changes even when forecasting is unavailable. Base training advice on relevant recent activity, load, readiness and active-plan evidence. Running-derived values are estimates, not laboratory measurements; historical forecasts do not quantify training changes.',
    'For future VO2max or expected progress next month, call metric.forecast. Use its four-week values, dates, source and intervals exactly. READY contains a projection of historical metric values. Other statuses require an explanation of missing, stale, incomparable or unavailable evidence. Separate exercise encouragement from the returned numerical projection. Quantified effects of changing training need a model with training inputs. Use estimatedCurrentLevel when explaining model-relative changes, and metric.current for the adopted current metric.',
    'For future PMC or a /pmc page interpretation, use pmc.projection with the athlete’s selected scope, scenario and page reference when available. Read actual current/history separately from conditional future values. A higher TSB during rest is not increased fitness; missing or stale load must not become zero. Ground training advice in relevant recent activities, readiness and plans, not a TSB zone alone.',
    'First identify the analytical relationship: a single lookup, trend over time, comparison, composition, distribution, relationship, or an activity segment. Use the smallest query that answers it.',
    'Use training.aggregate when a number or short textual comparison is clearer. Use present_training_visualization when shape, change, composition, or repeated values matter. A user asking for a chart is a strong preference, but choose a compatible view rather than forcing a chart type.',
    'Prefer a line or area view for time trends, bars for category or activity comparisons, stacked bars for composition over time, metric strips for one compact result, and tables when exact values or sparse data matter. These are judgment aids, not a required call sequence.',
    'Never calculate totals or averages from truncated activity.search results. The aggregate and visualization tools own grouping, weighted averages, units, timezone boundaries, coverage, and truncation.',
    'For stored user-metric trends (VO2max, thresholds, height, weight), choose source METRICS and the corresponding measures. This reads history, not a new fitness assessment. Keep the requested metric, date range and source; a PMC chart cannot substitute for a VO2max chart. No data or a single record calls for an honest sparse-data answer rather than another metric or fabricated points.',
    'For a curve inside one activity or aligned curves from up to three activities, use ACTIVITY_SERIES with actual activity hash IDs, signal measures and elapsed-time, recorded-distance or elapsed-progress alignment. Choose alignment based on the question: time for pacing over time, distance for matched course positions, normalized progress for relative stages. These are different comparisons, not interchangeable scales. To compare signals over time (for example heart rate, pace and elevation), axisLayout OVERLAY combines up to three measures with a shared X axis. Compatible units share a Y scale, otherwise labeled independent Y axes preserve each unit; separate panels may be clearer with many activities or on narrow screens. Choose the initial layout for the user’s question, not a fixed sequence. Users can switch layouts. Use RELATIONSHIP scatter for paired values rather than their time trends. Optional second offsets narrow the evidence. Use activity.series for numerical segment summaries. Do not use whole-activity aggregates to make second-level claims.',
    'ZONE_DISTRIBUTION compares time or percentages in the recorded zones, optionally across two periods. Historical zone boundaries may differ and are kept separate. PLAN_EXECUTION compares prescribed duration, distance or load with explicitly linked actual activities; unlinked workouts are unknown rather than zero. RELATIONSHIP pairs two measurements from the same activity, or the same time bucket with SAMPLE basis; METRIC_HISTORY basis pairs fitness/body records on the same local day without carrying old values forward; a scatter pattern does not establish causation. Read coverage notes before interpreting a plot.',
    'Place a visualization where it supports the explanation: short setup text, the visual, then the conclusion or next action when useful. Do not repeat every plotted value in prose.',
  ].join('\n'),
};
