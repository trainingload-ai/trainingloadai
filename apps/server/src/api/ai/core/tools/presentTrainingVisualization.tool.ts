import { publicRuntimeText } from '@/utils/public-runtime-copy';
import {
  isExplorationQuery,
  type ExplorationQuery,
  type TrainingVisualizationV2,
} from '@shared/training-exploration';
import {
  queryTrainingExploration,
  summarizeExploration,
} from '../training-exploration';
import {
  TRAINING_VISUALIZATION_INTENTS,
  TRAINING_VISUALIZATION_VIEWS,
  type TrainingAnalysisQuery,
  type TrainingVisualizationIntent,
  type TrainingVisualizationV1,
  type TrainingVisualizationView,
} from '@shared/training-visualization';
import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import { buildTrainingVisualization } from '../training-analytics';
import { trainingAnalysisQueryProperties } from './trainingAggregate.tool';
import {
  trainingQueryConstraints,
  validateTrainingQuery,
} from './trainingQuery.contract';

type Input = (TrainingAnalysisQuery | ExplorationQuery) & {
  intent: TrainingVisualizationIntent;
  preferredView?: TrainingVisualizationView;
  title?: string;
  subtitle?: string;
  presentation?: 'SUMMARY' | 'CHART';
  currentVo2Max?: boolean;
};

export const presentTrainingVisualizationTool: AiToolDef<
  Input,
  TrainingVisualizationV1 | TrainingVisualizationV2
> = buildAiTool({
  name: 'present_training_visualization',
  description:
    'Query real data and place a chart/table card at this point in the reply. Supports activity statistics, PMC, and METRICS history including VO2_MAX, FTP, CP, heart-rate/pace thresholds, height and weight. Also supports activity signals (single or aligned), historical zone distributions, plan versus linked actual execution, and paired scatter plots. Choose the source and measures that answer the request. The server owns rows, units, coverage and chart compatibility; never pass chart points or calculated values.',
  searchHint:
    'show chart graph visualize trend comparison training analytics fitness metric history VO2max VDOT height weight FTP CP LTHR',
  cost: 'low',
  maxResultChars: 3_500,
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'intent'],
    allOf: trainingQueryConstraints,
    properties: {
      ...trainingAnalysisQueryProperties,
      presentation: {
        type: 'string',
        enum: ['SUMMARY', 'CHART'],
        description: 'SUMMARY for compact aggregate values with a chart link. CHART when the athlete asks for a visualization.',
      },
      currentVo2Max: {
        type: 'boolean',
        description: 'Only for a current VO2 max lookup. Uses the effective record and opens a chart for its source.',
      },
      intent: {
        type: 'string',
        enum: TRAINING_VISUALIZATION_INTENTS,
        description: 'The analytical relationship the visual must communicate.',
      },
      preferredView: {
        type: 'string',
        enum: TRAINING_VISUALIZATION_VIEWS,
        description:
          'Optional preference only. The server may choose a compatible view.',
      },
      title: {
        type: 'string',
        maxLength: 80,
        description:
          'Short title in the user language. Do not include findings.',
      },
      subtitle: {
        type: 'string',
        maxLength: 120,
        description: 'Optional short scope label in the user language.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: (_ctx, input) => {
    if (input.currentVo2Max && (input.source !== 'METRICS' ||
      input.presentation !== 'SUMMARY' || !Array.isArray(input.measures) || input.measures.length !== 1 ||
      input.measures[0] !== 'VO2_MAX' || input.metricSource != null)) {
      return aiToolError('Current VO2 max requires a VO2_MAX-only METRICS summary', 'INVALID_INPUT');
    }
    return validateTrainingQuery(input);
  },
  summarizeForModel: ({ output }) =>
    output.schemaVersion === 2
      ? summarizeExploration(output)
      : {
          title: output.title,
          view: output.view,
          viewAdjustmentReason: output.viewAdjustmentReason,
          summary: output.summary,
          provenance: output.provenance,
          rowCount: output.rows.length,
          rows: output.rows.slice(0, 24),
        },
  execute: async (ctx, input) => {
    if (isExplorationQuery(input)) {
      const chart = await queryTrainingExploration(ctx, input);
      if (input.presentation !== 'SUMMARY' ||
          !['ZONE_DISTRIBUTION', 'POWER_DURATION'].includes(input.source)) return chart;
      const highlights = chart.panels.flatMap((panel) =>
        panel.series.flatMap((series) => {
          const points = series.points.filter((point) => point.y !== null);
          const selected = input.source === 'POWER_DURATION'
            ? points.filter((point) => point.x === 300 || point.x === 1200)
            : points.reduce<typeof points>((top, candidate) =>
              !top.length || candidate.y! > top[0].y! ? [candidate] : top, []);
          return selected.map((point) => ({
            label: [panel.label, series.label, input.source === 'POWER_DURATION'
              ? `${point.x / 60} min` : panel.x.categories?.[point.x]]
              .filter(Boolean).join(' · '),
            value: point.y!,
            unit: panel.y.unit,
          }));
        }),
      ).slice(0, 8);
      return {
        ...chart,
        panels: [],
        detail: chart.notes.includes('NO_DATA') ? undefined : true,
        highlights,
        observedAt: (ctx.currentTurnStartedAt ?? new Date()).toISOString(),
      };
    }
    const current = input.currentVo2Max
      ? (await ctx.coachTools.metricCurrent(ctx, { metrics: ['vo2Max'] })).items
        .find((metric) => metric && 'effectiveCurrent' in metric)
      : undefined;
    const query: TrainingAnalysisQuery = {
      source: input.source,
      from: input.from,
      to: input.to,
      groupBy: input.groupBy,
      measures: input.measures,
      sportTypes: input.sportTypes,
      metricSource: current && 'effectiveSource' in current
        ? current.effectiveSource ?? 'ESTIMATED' : input.metricSource,
      limit: input.limit,
    };
    const dataset = await ctx.coachTools.trainingAggregate(ctx, query);
    const title = String(input.title ?? '')
      .trim()
      .slice(0, 80);
    const subtitle = String(input.subtitle ?? '')
      .trim()
      .slice(0, 120);
    const visualization = buildTrainingVisualization({
      dataset,
      intent: input.intent,
      preferredView: input.preferredView,
      title: title || publicRuntimeText(ctx.lang, 'trainingAnalysis'),
      subtitle: subtitle || undefined,
    });
    const effective = current && 'effectiveCurrent' in current ? current : null;
    const observationDate = effective?.effectiveRecordedAt ?? (
      input.currentVo2Max ? dataset.rows.filter((row) => row.values.VO2_MAX != null).at(-1)?.end : undefined
    );
    return input.presentation === 'SUMMARY' ? {
      ...visualization,
      summary: effective ? {
        ...visualization.summary,
        VO2_MAX: effective.effectiveCurrent ?? visualization.summary.VO2_MAX,
      } : visualization.summary,
      view: 'METRIC_STRIP',
      rows: [],
      detail: (dataset.query.source === 'METRICS' && dataset.query.measures.length === 1 &&
        dataset.query.measures[0] === 'VO2_MAX') || dataset.rows.length && dataset.query.measures.some(
        (measure) => dataset.summary[measure] != null,
      ) ? { limit: dataset.query.limit } : undefined,
      observedAt: (ctx.currentTurnStartedAt ?? new Date()).toISOString(),
      observationDate: observationDate ?? undefined,
    } : visualization;
  },
});
