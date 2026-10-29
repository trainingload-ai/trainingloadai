import {
  TRAINING_ACTIVITY_MEASURES,
  TRAINING_PMC_MEASURES,
  TRAINING_METRIC_MEASURES,
  type TrainingAnalysisQuery,
} from '@shared/training-visualization';
import {
  SIGNAL_MEASURES,
  isExplorationQuery,
  type ExplorationQuery,
} from '@shared/training-exploration';
import { assertTrainingAnalysisQuery } from '../training-analytics';
import { assertExplorationQuery } from '../training-exploration-validation';
import { aiToolError, type AiToolValidationResult } from '../tool.types';

const when = (
  source: string,
  required: string[],
  properties: Record<string, unknown>,
) => ({
  if: { properties: { source: { const: source } }, required: ['source'] },
  then: { required, properties },
});
const measures = (values: readonly string[], maxItems = 6) => ({
  type: 'array',
  minItems: 1,
  maxItems,
  uniqueItems: true,
  items: { type: 'string', enum: values },
});
const groups = (values: string[]) => ({ type: 'string', enum: values });
const dated = ['from', 'to', 'groupBy', 'measures'];

/** Source-specific constraints shared by both model-visible tools. */
export const trainingQueryConstraints: Record<string, unknown>[] = [
  when('ACTIVITIES', dated, {
    measures: measures(TRAINING_ACTIVITY_MEASURES),
    metricSource: false,
  }),
  when('PMC', dated, {
    measures: measures(TRAINING_PMC_MEASURES),
    groupBy: groups(['DAY', 'WEEK', 'MONTH', 'SPORT']),
    metricSource: false,
    limit: false,
  }),
  when('METRICS', dated, {
    measures: measures(TRAINING_METRIC_MEASURES),
    groupBy: groups(['DAY', 'WEEK', 'MONTH']),
    limit: false,
  }),
  when('ACTIVITY_SERIES', ['activityHashIds', 'measures'], {
    measures: measures(SIGNAL_MEASURES, 3),
    from: false,
    to: false,
    groupBy: false,
    limit: false,
  }),
  when('ZONE_DISTRIBUTION', ['from', 'to', 'zoneType'], {
    measures: false,
    groupBy: false,
    limit: false,
  }),
  when('PLAN_EXECUTION', ['from', 'to', 'measures'], {
    measures: measures(['DURATION_MIN', 'DISTANCE_KM', 'LOAD'], 3),
    groupBy: groups(['DAY', 'WEEK', 'MONTH', 'WORKOUT']),
    limit: false,
  }),
  when('RELATIONSHIP', ['measures'], {
    measures: { minItems: 2, maxItems: 2 },
    limit: false,
  }),
];

export function validateTrainingQuery(
  input: TrainingAnalysisQuery | ExplorationQuery,
): AiToolValidationResult {
  try {
    // Presentation metadata is not part of the authenticated query contract.
    const {
      intent: _intent,
      preferredView: _view,
      title: _title,
      subtitle: _subtitle,
      ...query
    } = input as unknown as Record<string, unknown>;
    if (isExplorationQuery(query)) assertExplorationQuery(query);
    else assertTrainingAnalysisQuery(query as unknown as TrainingAnalysisQuery);
    return { ok: true };
  } catch (error) {
    return aiToolError(
      error instanceof Error ? error.message : 'Invalid training query',
      'INVALID_INPUT',
    );
  }
}
