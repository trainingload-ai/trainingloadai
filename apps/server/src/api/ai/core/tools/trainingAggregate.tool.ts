import {
  EXPLORATION_SOURCES,
  SIGNAL_MEASURES,
  isExplorationQuery,
  type ExplorationQuery,
  type TrainingVisualizationV2,
} from '@shared/training-exploration';
import {
  queryTrainingExploration,
  summarizeExploration,
} from '../training-exploration';
import {
  TRAINING_ANALYSIS_GROUPS,
  TRAINING_ANALYSIS_MEASURES,
  TRAINING_ANALYSIS_SOURCES,
  TRAINING_METRIC_SOURCES,
  type TrainingAnalysisQuery,
  type TrainingDatasetV1,
} from '@shared/training-visualization';
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
  type JsonSchemaObject,
} from '../tool.types';
import {
  trainingQueryConstraints,
  validateTrainingQuery,
} from './trainingQuery.contract';

export const trainingAnalysisQueryProperties = {
  source: {
    type: 'string',
    enum: [...TRAINING_ANALYSIS_SOURCES, ...EXPLORATION_SOURCES],
    description:
      'ACTIVITIES for workout statistics; PMC for load/ATL/CTL/TSB; METRICS for stored fitness or body history, including VO2_MAX, FTP, CP, heart-rate/pace thresholds, HEIGHT and WEIGHT. ACTIVITY_SERIES: 1–3 activities, signal measures and optional alignment/second range (no date range). ZONE_DISTRIBUTION: date range, zoneType, optional comparison period. PLAN_EXECUTION: date range, optional planId, measures DURATION_MIN/DISTANCE_KM/LOAD and DAY/WEEK/MONTH/WORKOUT grouping. RELATIONSHIP: exactly 2 measures with ACTIVITY date range, SAMPLE activity IDs, or METRIC_HISTORY date range for same-day body/fitness records. Other sources require from/to/groupBy/measures.',
  },
  from: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description: 'Inclusive local date YYYY-MM-DD',
  },
  to: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description: 'Inclusive local date YYYY-MM-DD',
  },
  groupBy: {
    type: 'string',
    enum: [...TRAINING_ANALYSIS_GROUPS, 'WORKOUT'],
    description: 'Bucket rows by day, ISO week, month, sport, or activity.',
  },
  measures: {
    type: 'array',
    minItems: 1,
    maxItems: 6,
    uniqueItems: true,
    items: {
      type: 'string',
      enum: [
        ...new Set([...TRAINING_ANALYSIS_MEASURES, ...SIGNAL_MEASURES, 'LOAD']),
      ],
    },
    description:
      'ACTIVITIES supports ACTIVITY_COUNT, DURATION_MIN, DISTANCE_KM, AVG_SPEED_KMH, AVG_HEART_RATE, AVG_POWER. PMC supports DAILY_LOAD, ATL, CTL, TSB and sport loads. METRICS supports CP, W_PRIME, FTP, MAX_HR, RESTING_HR, LTHR, AET_HR, CS, TP, AET_PACE, VO2_MAX (the product VDOT), P_MAX, HEIGHT (cm), WEIGHT (kg). Metric buckets use the latest record, never sums or invented daily values. ACTIVITY_SERIES supports up to 3 signal measures: HEART_RATE, POWER, SPEED, PACE, CADENCE, ELEVATION, GRADE. RELATIONSHIP uses exactly 2 measures.',
  },
  sportTypes: {
    type: 'array',
    uniqueItems: true,
    items: { type: 'string', enum: ['RUN', 'CYCLING', 'SWIM'] },
    description:
      'Activity sport filters; METRICS requires exactly one sport for sport-specific fitness metrics. VO2_MAX, HEIGHT and WEIGHT are global and ignore sport filters.',
  },
  activityHashIds: {
    type: 'array',
    minItems: 1,
    maxItems: 3,
    items: { type: 'string' },
    description:
      'ACTIVITY_SERIES or SAMPLE relationship: actual owned activity hash IDs, 1–3. Discover via activity.search.',
  },
  alignment: {
    type: 'string',
    enum: ['ELAPSED_TIME', 'DISTANCE', 'PROGRESS'],
    description:
      'Align actual seconds from recorded start, recorded distance in km, or elapsed-time progress %. Progress is not distance or intensity equivalence.',
  },
  axisLayout: {
    type: 'string',
    enum: ['SEPARATE', 'OVERLAY'],
    description:
      'ACTIVITY_SERIES: SEPARATE panels by default; OVERLAY combines up to three signals on a shared X axis. Compatible units share a Y scale; different units use independently labeled Y axes. Useful for heart rate, pace and elevation over time. Choose SEPARATE when clarity benefits from individual panels.',
  },
  fromSecond: { type: 'number', minimum: 0 },
  toSecond: { type: 'number', minimum: 0 },
  maxPoints: { type: 'integer', minimum: 20, maximum: 500 },
  zoneType: { type: 'string', enum: ['HEART_RATE', 'POWER', 'PACE'] },
  zoneUnit: {
    type: 'string',
    enum: ['MINUTES', 'PERCENT'],
    description:
      'Share of recorded zone time; missing zone data is excluded, not zero.',
  },
  compareFrom: {
    type: 'string',
    description: 'Optional comparison period local YYYY-MM-DD, for zones.',
  },
  compareTo: { type: 'string' },
  planId: {
    type: 'string',
    description: 'Optional existing plan ID, scoped to the signed-in user.',
  },
  relationshipBasis: {
    type: 'string',
    enum: ['ACTIVITY', 'SAMPLE', 'METRIC_HISTORY'],
    description:
      'ACTIVITY pairs two summaries of the same activity; SAMPLE pairs signals within the same time bucket. METRIC_HISTORY pairs two fitness/body records on the same local day only; no carry-forward. Relationships do not establish causation.',
  },
  metricSource: {
    type: 'string',
    enum: TRAINING_METRIC_SOURCES,
    description:
      'METRICS fitness history only: ESTIMATED (default) for calculated trends, AUTO for automatically adopted/imported settings, MANUAL for user settings. Sources are never silently merged or substituted. HEIGHT/WEIGHT use body records independently of this field.',
  },
  limit: {
    type: 'number',
    description:
      'Optional recent activity limit, 1-200. Use with groupBy ACTIVITY for requests such as recent 10 workouts.',
  },
} satisfies NonNullable<JsonSchemaObject['properties']>;

export const trainingAggregateTool: AiToolDef<
  TrainingAnalysisQuery | ExplorationQuery,
  TrainingDatasetV1 | TrainingVisualizationV2
> = buildAiTool({
  name: 'training.aggregate',
  description:
    'Query real activity, PMC, fitness and body history for trends, comparisons and summaries. Use METRICS for VO2max, height, weight and threshold history. Use this when text is enough; use present_training_visualization for a chart. Also supports within-activity curves, aligned activities, zone distributions, planned versus linked actual execution, and paired metric relationships. Never compute these aggregates from activity.search snippets.',
  searchHint:
    'training stats trend chart count duration distance speed heart rate power load pmc vo2max vdot fitness height weight body metric history',
  cost: 'low',
  maxResultChars: 8_000,
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['source'],
    allOf: trainingQueryConstraints,
    properties: trainingAnalysisQueryProperties,
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: (_ctx, input) => validateTrainingQuery(input),
  summarizeForModel: ({ output }) =>
    output.schemaVersion === 2
      ? summarizeExploration(output)
      : {
          query: output.query,
          timezone: output.timezone,
          summary: output.summary,
          coverage: output.coverage,
          complete: output.complete,
          truncated: output.truncated,
          rowCount: output.rows.length,
          rows: output.rows.slice(0, 24),
        },
  execute: async (ctx, input) =>
    isExplorationQuery(input)
      ? queryTrainingExploration(ctx, input)
      : ctx.coachTools.trainingAggregate(ctx, input),
});
