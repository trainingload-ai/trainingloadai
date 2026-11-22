import { createHash } from 'node:crypto';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezonePlugin = require('dayjs/plugin/timezone');
import isoWeek = require('dayjs/plugin/isoWeek');
import type { PMCData, SportType } from '@prisma/client';
import {
  TRAINING_ANALYSIS_GROUPS,
  TRAINING_ANALYSIS_MEASURES,
  TRAINING_ANALYSIS_SOURCES,
  TRAINING_ACTIVITY_MEASURES,
  TRAINING_PMC_MEASURES,
  TRAINING_METRIC_MEASURES,
  TRAINING_METRIC_SOURCES,
  TRAINING_VISUALIZATION_VIEWS,
  trainingMeasureUnit,
  type TrainingAnalysisMeasure,
  type TrainingAnalysisQuery,
  type TrainingDatasetRow,
  type TrainingDatasetV1,
  type TrainingVisualizationIntent,
  type TrainingVisualizationV1,
  type TrainingVisualizationView,
} from '@shared/training-visualization';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);
dayjs.extend(isoWeek['default'] || isoWeek);

export const MAX_TRAINING_ANALYSIS_DAYS = 365;
export const MAX_TRAINING_ANALYSIS_ACTIVITIES = 5_000;

const ACTIVITY_MEASURES = new Set<TrainingAnalysisMeasure>(
  TRAINING_ACTIVITY_MEASURES,
);
const PMC_MEASURES = new Set<TrainingAnalysisMeasure>(TRAINING_PMC_MEASURES);

export type TrainingAggregateActivity = {
  hashId: string;
  activityName: string | null;
  sportType: SportType | null;
  startTime: Date | null;
  timerTime: number | null;
  elapsedTime: number | null;
  distance: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
};

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

export function stableFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 24);
}

export function assertTrainingAnalysisQuery(query: TrainingAnalysisQuery) {
  const validDate = (value: unknown): value is string =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs.utc(value).format('YYYY-MM-DD') === value;
  if (
    !query ||
    !validDate(query.from) ||
    !validDate(query.to) ||
    query.from > query.to
  ) {
    throw new Error('Invalid date range: use inclusive YYYY-MM-DD dates');
  }
  if (
    dayjs.utc(query.to).diff(dayjs.utc(query.from), 'day') + 1 >
    MAX_TRAINING_ANALYSIS_DAYS
  ) {
    throw new Error(
      `Date range too large (max ${MAX_TRAINING_ANALYSIS_DAYS} days)`,
    );
  }
  if (
    !query ||
    !TRAINING_ANALYSIS_SOURCES.includes(query.source) ||
    !TRAINING_ANALYSIS_GROUPS.includes(query.groupBy) ||
    !Array.isArray(query.measures) ||
    query.measures.some((item) => !TRAINING_ANALYSIS_MEASURES.includes(item))
  ) {
    throw new Error(
      'Required query fields: source, from, to, groupBy (DAY/WEEK/MONTH/SPORT/ACTIVITY), measures',
    );
  }
  const allowed = new Set<TrainingAnalysisMeasure>(
    query.source === 'ACTIVITIES'
      ? ACTIVITY_MEASURES
      : query.source === 'PMC'
        ? PMC_MEASURES
        : TRAINING_METRIC_MEASURES,
  );
  if (
    !query.measures.length ||
    query.measures.length > 6 ||
    new Set(query.measures).size !== query.measures.length ||
    query.measures.some((item) => !allowed.has(item))
  ) {
    throw new Error(
      `Unsupported ${query.source.toLowerCase()} measure: ${query.measures.filter((item) => !allowed.has(item)).join(', ') || 'empty, duplicate or too many measures'}; allowed: ${[...allowed].join(', ')}`,
    );
  }
  if (query.source === 'PMC' && query.groupBy === 'ACTIVITY') {
    throw new Error('PMC data cannot be grouped by activity');
  }
  if (
    query.metricSource &&
    (query.source !== 'METRICS' ||
      !TRAINING_METRIC_SOURCES.includes(query.metricSource))
  ) {
    throw new Error(
      'metricSource is only supported for METRICS: ESTIMATED, AUTO or MANUAL',
    );
  }
  if (query.source === 'METRICS') {
    if (
      !['DAY', 'WEEK', 'MONTH'].includes(query.groupBy) ||
      query.limit != null
    ) {
      throw new Error(
        'Metric history supports DAY, WEEK or MONTH; use the date range rather than an activity limit',
      );
    }
    if (
      query.measures.some(
        (metric) => !['VO2_MAX', 'WEIGHT', 'HEIGHT'].includes(metric),
      ) &&
      query.sportTypes?.length !== 1
    ) {
      throw new Error(
        'Choose one sport for sport-specific metric history; different sports cannot be merged',
      );
    }
  }
  if (
    query.sportTypes &&
    (!Array.isArray(query.sportTypes) ||
      query.sportTypes.some(
        (sport) => !['RUN', 'CYCLING', 'SWIM'].includes(sport),
      ))
  ) {
    throw new Error('Unsupported sport filter');
  }
  if (
    query.source === 'ACTIVITIES' &&
    query.measures.some((item) => !TRAINING_ANALYSIS_MEASURES.includes(item))
  ) {
    throw new Error('Unsupported training analysis measure');
  }
}

export function bucketForDate(
  date: Date,
  groupBy: TrainingAnalysisQuery['groupBy'],
  timezone: string,
) {
  const local = dayjs(date).tz(timezone);
  if (groupBy === 'WEEK') {
    const start = local.startOf('isoWeek');
    return {
      key: start.format('YYYY-MM-DD'),
      label: start.format('YYYY-MM-DD'),
      start: start.format('YYYY-MM-DD'),
      end: start.endOf('isoWeek').format('YYYY-MM-DD'),
    };
  }
  if (groupBy === 'MONTH') {
    const start = local.startOf('month');
    return {
      key: start.format('YYYY-MM'),
      label: start.format('YYYY-MM'),
      start: start.format('YYYY-MM-DD'),
      end: start.endOf('month').format('YYYY-MM-DD'),
    };
  }
  const key = local.format('YYYY-MM-DD');
  return { key, label: key, start: key, end: key };
}

type ActivityAccumulator = {
  rows: TrainingAggregateActivity[];
  key: string;
  label: string;
  start?: string;
  end?: string;
  sportType?: string;
  activityHashId?: string;
};

function activityDurationSeconds(row: TrainingAggregateActivity): number {
  return Math.max(0, finite(row.timerTime) ?? finite(row.elapsedTime) ?? 0);
}

function summarizeActivities(
  rows: TrainingAggregateActivity[],
  measures: TrainingAnalysisMeasure[],
) {
  const totalDurationSec = rows.reduce(
    (sum, row) => sum + activityDurationSeconds(row),
    0,
  );
  let totalDistanceM = 0;
  let distanceDurationSec = 0;
  let pairedDistanceM = 0;
  let pairedActivityCount = 0;
  let distanceActivityCount = 0;
  let durationActivityCount = 0;
  for (const row of rows) {
    const duration = activityDurationSeconds(row);
    if (duration > 0) durationActivityCount += 1;
    const distance = finite(row.distance);
    if (distance == null || distance < 0) continue;
    totalDistanceM += distance;
    distanceActivityCount += 1;
    if (duration > 0) {
      distanceDurationSec += duration;
      pairedDistanceM += distance;
      pairedActivityCount += 1;
    }
  }
  const weighted = (
    getter: (row: TrainingAggregateActivity) => number | null,
  ) => {
    let numerator = 0;
    let denominator = 0;
    for (const row of rows) {
      const value = getter(row);
      const duration = activityDurationSeconds(row);
      if (value == null || duration <= 0) continue;
      numerator += value * duration;
      denominator += duration;
    }
    return {
      value: denominator > 0 ? numerator / denominator : null,
      knownSeconds: denominator,
    };
  };
  const heartRate = weighted((row) => finite(row.avgHeartRate));
  const power = weighted((row) => finite(row.avgPower));

  const allValues: Partial<Record<TrainingAnalysisMeasure, number | null>> = {
    ACTIVITY_COUNT: rows.length,
    DURATION_MIN: durationActivityCount ? rounded(totalDurationSec / 60, 1) : null,
    DISTANCE_KM: distanceActivityCount ? rounded(totalDistanceM / 1_000, 2) : null,
    AVG_SPEED_KMH:
      distanceDurationSec > 0
        ? rounded((pairedDistanceM / distanceDurationSec) * 3.6, 2)
        : null,
    AVG_PACE_SEC_PER_KM:
      pairedDistanceM > 0 && new Set(rows.map((row) => row.sportType)).size === 1
        ? rounded((distanceDurationSec * 1_000) / pairedDistanceM, 1)
        : null,
    AVG_DURATION_MIN: durationActivityCount
      ? rounded(totalDurationSec / durationActivityCount / 60, 1)
      : null,
    AVG_DISTANCE_KM: distanceActivityCount
      ? rounded(totalDistanceM / distanceActivityCount / 1_000, 2)
      : null,
    AVG_HEART_RATE:
      heartRate.value == null ? null : rounded(heartRate.value, 1),
    AVG_POWER: power.value == null ? null : rounded(power.value, 1),
    DAILY_LOAD: null,
    ATL: null,
    CTL: null,
    TSB: null,
    RUNNING_LOAD: null,
    CYCLING_LOAD: null,
    SWIMMING_LOAD: null,
    OTHER_LOAD: null,
  };
  const values = Object.fromEntries(
    measures.map((measure) => [measure, allValues[measure]]),
  ) as Partial<Record<TrainingAnalysisMeasure, number | null>>;
  const coverage: Partial<Record<TrainingAnalysisMeasure, number>> = {};
  const coverageDetails: NonNullable<TrainingDatasetV1['coverageDetails']> = {};
  const byActivity = (known: number) => ({ known, total: rows.length, unit: 'count' as const });
  const byDuration = (seconds: number) => ({
    known: rounded(seconds / 60, 1), total: rounded(totalDurationSec / 60, 1), unit: 'min' as const,
  });
  const allCoverageDetails: NonNullable<TrainingDatasetV1['coverageDetails']> = {
    AVG_HEART_RATE: byDuration(heartRate.knownSeconds),
    AVG_POWER: byDuration(power.knownSeconds),
    AVG_SPEED_KMH: byActivity(pairedActivityCount),
    AVG_PACE_SEC_PER_KM: byActivity(pairedActivityCount),
    DISTANCE_KM: byActivity(distanceActivityCount),
    AVG_DISTANCE_KM: byActivity(distanceActivityCount),
    DURATION_MIN: byActivity(durationActivityCount),
    AVG_DURATION_MIN: byActivity(durationActivityCount),
  };
  for (const measure of measures) {
    const detail = allCoverageDetails[measure];
    if (detail) coverageDetails[measure] = detail;
    if (measure === 'AVG_HEART_RATE' || measure === 'AVG_POWER') {
      const knownSeconds = measure === 'AVG_HEART_RATE' ? heartRate.knownSeconds : power.knownSeconds;
      coverage[measure] = totalDurationSec > 0 ? rounded(knownSeconds / totalDurationSec, 3) : 0;
    } else {
      coverage[measure] = detail?.total ? rounded(detail.known / detail.total, 3) : Number(measure === 'ACTIVITY_COUNT');
    }
  }
  return { values, coverage, coverageDetails };
}

export function buildActivityTrainingDataset(args: {
  query: TrainingAnalysisQuery;
  timezone: string;
  activities: TrainingAggregateActivity[];
  truncated: boolean;
}): TrainingDatasetV1 {
  assertTrainingAnalysisQuery(args.query);
  const buckets = new Map<string, ActivityAccumulator>();
  for (const activity of args.activities) {
    if (!activity.startTime) continue;
    const bucket = (() => {
      if (args.query.groupBy === 'ACTIVITY') {
        const local = dayjs(activity.startTime).tz(args.timezone);
        return {
          key: activity.hashId,
          label:
            activity.activityName?.trim() || local.format('YYYY-MM-DD HH:mm'),
          start: local.format('YYYY-MM-DD'),
          end: local.format('YYYY-MM-DD'),
          sportType: activity.sportType ?? 'UNKNOWN',
          activityHashId: activity.hashId,
        };
      }
      if (args.query.groupBy === 'SPORT') {
        const key = activity.sportType ?? 'UNKNOWN';
        return { key, label: key, sportType: key };
      }
      return bucketForDate(
        activity.startTime,
        args.query.groupBy,
        args.timezone,
      );
    })();
    const existing = buckets.get(bucket.key) ?? { ...bucket, rows: [] };
    existing.rows.push(activity);
    buckets.set(bucket.key, existing);
  }

  const rows: TrainingDatasetRow[] = [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      sportType: bucket.sportType,
      activityHashId: bucket.activityHashId,
      values: summarizeActivities(bucket.rows, args.query.measures).values,
    }));
  const aggregate = summarizeActivities(args.activities, args.query.measures);
  const fingerprint = stableFingerprint({
    query: args.query,
    rows,
    summary: aggregate.values,
    coverageDetails: aggregate.coverageDetails,
    truncated: args.truncated,
  });
  return {
    kind: 'training_dataset',
    schemaVersion: 1,
    query: args.query,
    timezone: args.timezone,
    rows,
    summary: {
      ...aggregate.values,
      matchedActivityCount: args.activities.length,
    },
    coverage: aggregate.coverage,
    coverageDetails: aggregate.coverageDetails,
    complete: !args.truncated,
    truncated: args.truncated,
    fingerprint,
  };
}

type PmcAccumulator = {
  key: string;
  label: string;
  start?: string;
  end?: string;
  rows: PMCData[];
};

function pmcValue(row: PMCData, measure: TrainingAnalysisMeasure): number | null {
  switch (measure) {
    case 'DAILY_LOAD':
      return row.dailyValue ?? null;
    case 'ATL':
      return row.ATL ?? null;
    case 'CTL':
      return row.CTL ?? null;
    case 'TSB':
      return row.TSB ?? null;
    case 'RUNNING_LOAD':
      return row.runningValue ?? null;
    case 'CYCLING_LOAD':
      return row.cyclingValue ?? null;
    case 'SWIMMING_LOAD':
      return row.swimmingValue ?? null;
    case 'OTHER_LOAD':
      return row.otherValue ?? null;
    default:
      return null;
  }
}

function summarizePmcBucket(
  rows: PMCData[],
  measures: TrainingAnalysisMeasure[],
) {
  return Object.fromEntries(
    measures.map((measure) => {
      const values = rows.map((row) => pmcValue(row, measure)).filter((value) => value !== null);
      const value = measure === 'ATL' || measure === 'CTL' || measure === 'TSB'
        ? values.at(-1) ?? null
        : values.length ? values.reduce((sum, item) => sum + item, 0) : null;
      return [measure, value == null ? null : rounded(value, 1)];
    }),
  ) as Partial<Record<TrainingAnalysisMeasure, number | null>>;
}

export function buildPmcTrainingDataset(args: {
  query: TrainingAnalysisQuery;
  timezone: string;
  records: PMCData[];
}): TrainingDatasetV1 {
  assertTrainingAnalysisQuery(args.query);
  let rows: TrainingDatasetRow[];
  if (args.query.groupBy === 'SPORT') {
    const sportMeasures = [
      ['RUN', 'RUNNING_LOAD'],
      ['CYCLING', 'CYCLING_LOAD'],
      ['SWIM', 'SWIMMING_LOAD'],
      ['OTHER', 'OTHER_LOAD'],
    ] as const;
    rows = sportMeasures.map(([sportType, sourceMeasure]) => ({
      key: sportType,
      label: sportType,
      sportType,
      values: Object.fromEntries(
        args.query.measures.map((measure) => [
          measure,
          measure === 'DAILY_LOAD' || measure === sourceMeasure
            ? rounded(
                args.records.reduce(
                  (sum, record) => sum + (pmcValue(record, sourceMeasure) ?? 0),
                  0,
                ),
                1,
              )
            : 0,
        ]),
      ),
    }));
  } else {
    const buckets = new Map<string, PmcAccumulator>();
    for (const record of args.records) {
      // PMC dates are calendar keys carried at UTC midnight, not activity instants.
      const bucket = bucketForDate(
        record.date,
        args.query.groupBy,
        'UTC',
      );
      const existing = buckets.get(bucket.key) ?? { ...bucket, rows: [] };
      existing.rows.push(record);
      buckets.set(bucket.key, existing);
    }
    if (args.query.groupBy === 'DAY' && args.records.length > 0) {
      for (let cursor = dayjs.utc(args.query.from); cursor.format('YYYY-MM-DD') <= args.query.to; cursor = cursor.add(1, 'day')) {
        const bucket = bucketForDate(cursor.toDate(), 'DAY', 'UTC');
        if (!buckets.has(bucket.key)) buckets.set(bucket.key, { ...bucket, rows: [] });
      }
    }
    rows = [...buckets.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        start: bucket.start,
        end: bucket.end,
        values: summarizePmcBucket(bucket.rows, args.query.measures),
      }));
  }
  const summary = summarizePmcBucket(args.records, args.query.measures);
  const fingerprint = stableFingerprint({ query: args.query, rows });
  return {
    kind: 'training_dataset',
    schemaVersion: 1,
    query: args.query,
    timezone: args.timezone,
    rows,
    summary,
    coverage: Object.fromEntries(args.query.measures.map((item) => [
      item,
      args.records.filter((record) => pmcValue(record, item) !== null).length /
        (dayjs.utc(args.query.to).diff(dayjs.utc(args.query.from), 'day') + 1),
    ])),
    complete: true,
    truncated: false,
    fingerprint,
  };
}

function defaultVisualizationView(args: {
  intent: TrainingVisualizationIntent;
  dataset: TrainingDatasetV1;
}): TrainingVisualizationView {
  if (args.dataset.rows.length <= 1 || args.intent === 'LOOKUP') {
    return 'METRIC_STRIP';
  }
  if (args.intent === 'COMPOSITION' && args.dataset.query.source !== 'METRICS')
    return 'STACKED_BAR';
  if (args.intent === 'COMPARISON' || args.intent === 'DISTRIBUTION') {
    return 'BAR';
  }
  return 'LINE';
}

function resolveVisualizationView(args: {
  intent: TrainingVisualizationIntent;
  dataset: TrainingDatasetV1;
  preferredView?: TrainingVisualizationView;
}) {
  const fallback = defaultVisualizationView(args);
  if (args.dataset.rows.length === 0) {
    return {
      view: 'TABLE' as const,
      reason: 'NO_DATA' as const,
    };
  }
  if (args.dataset.rows.length === 1) {
    return {
      view: 'METRIC_STRIP' as const,
      reason:
        args.preferredView && args.preferredView !== 'METRIC_STRIP'
          ? ('SINGLE_POINT' as const)
          : undefined,
    };
  }
  const unitCount = new Set(
    args.dataset.query.measures.map((measure) => trainingMeasureUnit(measure)),
  ).size;
  if (
    unitCount > 1 &&
    args.preferredView !== 'TABLE' &&
    args.preferredView !== 'METRIC_STRIP'
  ) {
    return {
      view: 'SMALL_MULTIPLES' as const,
      reason:
        args.preferredView && args.preferredView !== 'SMALL_MULTIPLES'
          ? ('INCOMPATIBLE_VIEW' as const)
          : undefined,
    };
  }
  if (!args.preferredView) return { view: fallback, reason: undefined };
  const requested = args.preferredView;
  if (args.dataset.query.source === 'METRICS' && requested === 'STACKED_BAR') {
    return { view: 'LINE' as const, reason: 'INCOMPATIBLE_VIEW' as const };
  }
  const timeGroup = ['DAY', 'WEEK', 'MONTH'].includes(
    args.dataset.query.groupBy,
  );
  const compatible =
    requested === 'TABLE' ||
    requested === 'METRIC_STRIP' ||
    ((requested === 'LINE' || requested === 'AREA') && timeGroup) ||
    ((requested === 'BAR' || requested === 'STACKED_BAR') &&
      args.dataset.rows.length <= 60) ||
    (requested === 'SMALL_MULTIPLES' && args.dataset.query.measures.length > 1);
  return compatible
    ? { view: requested, reason: undefined }
    : { view: fallback, reason: 'INCOMPATIBLE_VIEW' as const };
}

export function buildTrainingVisualization(args: {
  dataset: TrainingDatasetV1;
  intent: TrainingVisualizationIntent;
  preferredView?: TrainingVisualizationView;
  title: string;
  subtitle?: string;
}): TrainingVisualizationV1 {
  const resolved = resolveVisualizationView(args);
  return {
    kind: 'training_visualization',
    schemaVersion: 1,
    title: args.title,
    subtitle: args.subtitle,
    intent: args.intent,
    view: resolved.view,
    requestedView: args.preferredView,
    viewAdjustmentReason: resolved.reason,
    x: {
      key: 'label',
      type: ['DAY', 'WEEK', 'MONTH'].includes(args.dataset.query.groupBy)
        ? 'TIME'
        : 'CATEGORY',
    },
    series: args.dataset.query.measures.map((measure) => ({
      key: measure,
      unit: trainingMeasureUnit(measure),
    })),
    rows: args.dataset.rows,
    summary: args.dataset.summary,
    provenance: {
      source: args.dataset.query.source,
      from: args.dataset.query.from,
      to: args.dataset.query.to,
      timezone: args.dataset.timezone,
      groupBy: args.dataset.query.groupBy,
      sportTypes: args.dataset.query.sportTypes ?? [],
      ...(args.dataset.query.metricSource
        ? { metricSource: args.dataset.query.metricSource }
        : {}),
      complete: args.dataset.complete,
      truncated: args.dataset.truncated,
      coverage: args.dataset.coverage,
      coverageDetails: args.dataset.coverageDetails,
      fingerprint: args.dataset.fingerprint,
    },
  };
}

export function isTrainingVisualizationView(
  value: unknown,
): value is TrainingVisualizationView {
  return TRAINING_VISUALIZATION_VIEWS.includes(
    value as TrainingVisualizationView,
  );
}
