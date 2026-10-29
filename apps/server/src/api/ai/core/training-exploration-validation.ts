import {
  EXPLORATION_SOURCES,
  SIGNAL_MEASURES,
  type ExplorationQuery,
} from '@shared/training-exploration';
import { TRAINING_METRIC_MEASURES } from '@shared/training-visualization';

export function assertExplorationQuery(q: ExplorationQuery) {
  if (!EXPLORATION_SOURCES.includes(q.source))
    throw new Error('Unsupported exploration source');
  const common = ['source', 'measures'];
  const allowedFields =
    q.source === 'ACTIVITY_SERIES' ||
    (q.source === 'RELATIONSHIP' && q.relationshipBasis === 'SAMPLE')
      ? [
          ...common,
          'activityHashIds',
          'alignment',
          ...(q.source === 'ACTIVITY_SERIES' ? ['axisLayout'] : []),
          'fromSecond',
          'toSecond',
          'maxPoints',
          ...(q.source === 'RELATIONSHIP' ? ['relationshipBasis'] : []),
        ]
      : q.source === 'ZONE_DISTRIBUTION'
        ? [
            'source',
            'from',
            'to',
            'sportTypes',
            'zoneType',
            'zoneUnit',
            'compareFrom',
            'compareTo',
          ]
        : q.source === 'PLAN_EXECUTION'
          ? [...common, 'from', 'to', 'sportTypes', 'planId', 'groupBy']
          : [
              ...common,
              'from',
              'to',
              'sportTypes',
              'relationshipBasis',
              ...(q.relationshipBasis === 'METRIC_HISTORY'
                ? ['metricSource', 'groupBy']
                : []),
            ];
  for (const [field, value] of Object.entries(q))
    if (value !== undefined && !allowedFields.includes(field))
      throw new Error(`${field} is not supported for this source and basis`);
  const range = (a?: string, b?: string) => {
    const valid = (v?: string) =>
      !!v &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v;
    if (
      !valid(a) ||
      !valid(b) ||
      a! > b! ||
      (Date.parse(b!) - Date.parse(a!)) / 86400000 >= 365
    )
      throw new Error('Use an inclusive date range of 1–365 days');
  };
  const signals =
    q.source === 'ACTIVITY_SERIES' ||
    (q.source === 'RELATIONSHIP' && q.relationshipBasis === 'SAMPLE');
  if (signals) {
    if (
      !Array.isArray(q.activityHashIds) ||
      !q.activityHashIds.length ||
      q.activityHashIds.length > 3 ||
      q.activityHashIds.some(
        (id) => typeof id !== 'string' || !id || id.length > 128,
      ) ||
      new Set(q.activityHashIds).size !== q.activityHashIds.length
    )
      throw new Error('Choose 1–3 distinct activity hash IDs');
    if (q.from || q.to || q.sportTypes?.length)
      throw new Error(
        'Activity series uses explicit activity IDs and optional second offsets, not date or sport filters',
      );
    if (
      q.alignment &&
      !['ELAPSED_TIME', 'DISTANCE', 'PROGRESS'].includes(q.alignment)
    )
      throw new Error('Unsupported alignment');
    if (
      q.source === 'RELATIONSHIP' &&
      q.alignment &&
      q.alignment !== 'ELAPSED_TIME'
    )
      throw new Error(
        'Sample relationships pair values in the same elapsed-time bucket',
      );
    for (const v of [q.fromSecond, q.toSecond])
      if (v != null && (!Number.isFinite(v) || v < 0))
        throw new Error('Invalid second offset');
    if (q.toSecond != null && q.toSecond <= (q.fromSecond ?? 0))
      throw new Error('Segment end must follow start');
    if (
      q.maxPoints != null &&
      (!Number.isInteger(q.maxPoints) || q.maxPoints < 20 || q.maxPoints > 500)
    )
      throw new Error('maxPoints must be 20–500');
  } else {
    range(q.from, q.to);
    if (
      q.activityHashIds ||
      q.fromSecond != null ||
      q.toSecond != null ||
      q.alignment
    )
      throw new Error('Use a date range for this source');
  }
  if (
    q.sportTypes &&
    (!Array.isArray(q.sportTypes) ||
      !q.sportTypes.length ||
      q.sportTypes.some((s) => !['RUN', 'CYCLING', 'SWIM'].includes(s)))
  )
    throw new Error('Unsupported sport filter');
  if (q.axisLayout && !['SEPARATE', 'OVERLAY'].includes(q.axisLayout))
    throw new Error('Choose SEPARATE or OVERLAY axisLayout');
  if (
    q.axisLayout === 'OVERLAY' &&
    (!Array.isArray(q.measures) || q.measures.length < 2)
  )
    throw new Error('Overlay requires at least two signals');
  if (q.source === 'ZONE_DISTRIBUTION') {
    if (!q.zoneType || !['HEART_RATE', 'POWER', 'PACE'].includes(q.zoneType))
      throw new Error('Choose zoneType HEART_RATE, POWER or PACE');
    if (q.zoneUnit && !['MINUTES', 'PERCENT'].includes(q.zoneUnit))
      throw new Error('Choose MINUTES or PERCENT');
    if (q.compareFrom || q.compareTo) range(q.compareFrom, q.compareTo);
    if (q.measures?.length)
      throw new Error('Zone distribution uses zoneType, not measures');
  } else {
    const allowed: readonly string[] = signals
      ? SIGNAL_MEASURES
      : q.source === 'PLAN_EXECUTION'
        ? ['DURATION_MIN', 'DISTANCE_KM', 'LOAD']
        : q.relationshipBasis === 'METRIC_HISTORY'
          ? TRAINING_METRIC_MEASURES
          : [
              'HEART_RATE',
              'POWER',
              'SPEED',
              'PACE',
              'CADENCE',
              'DURATION_MIN',
              'DISTANCE_KM',
            ];
    if (
      !Array.isArray(q.measures) ||
      !q.measures.length ||
      q.measures.length > 3 ||
      new Set(q.measures).size !== q.measures.length ||
      q.measures.some((m) => !allowed.includes(m))
    )
      throw new Error(`Supported measures: ${allowed.join(', ')}`);
    if (
      q.source === 'RELATIONSHIP' &&
      (q.measures.length !== 2 ||
        (q.relationshipBasis &&
          !['ACTIVITY', 'SAMPLE', 'METRIC_HISTORY'].includes(
            q.relationshipBasis,
          )))
    )
      throw new Error(
        'Relationships need exactly two measures and ACTIVITY, SAMPLE or METRIC_HISTORY basis',
      );
    if (
      q.relationshipBasis === 'METRIC_HISTORY' &&
      q.groupBy &&
      q.groupBy !== 'DAY'
    )
      throw new Error(
        'Metric relationships pair records on the same local day only',
      );
  }
  if (
    q.source === 'PLAN_EXECUTION' &&
    q.groupBy &&
    !['DAY', 'WEEK', 'MONTH', 'WORKOUT'].includes(q.groupBy)
  )
    throw new Error('Plan execution supports DAY, WEEK, MONTH or WORKOUT');
}
