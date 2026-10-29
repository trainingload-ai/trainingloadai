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
  validateInput: (_ctx, input) => validateTrainingQuery(input),
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
    if (isExplorationQuery(input)) return queryTrainingExploration(ctx, input);
    const query: TrainingAnalysisQuery = {
      source: input.source,
      from: input.from,
      to: input.to,
      groupBy: input.groupBy,
      measures: input.measures,
      sportTypes: input.sportTypes,
      metricSource: input.metricSource,
      limit: input.limit,
    };
    const dataset = await ctx.coachTools.trainingAggregate(ctx, query);
    const isChinese = String(ctx.lang ?? '')
      .toLowerCase()
      .startsWith('zh');
    const title = String(input.title ?? '')
      .trim()
      .slice(0, 80);
    const subtitle = String(input.subtitle ?? '')
      .trim()
      .slice(0, 120);
    return buildTrainingVisualization({
      dataset,
      intent: input.intent,
      preferredView: input.preferredView,
      title: title || (isChinese ? '训练分析' : 'Training analysis'),
      subtitle: subtitle || undefined,
    });
  },
});
