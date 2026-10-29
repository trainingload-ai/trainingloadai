import {
  BodyMetricType,
  MetricSource,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';
import type { UserQueryService } from '@/api/user/user-query.service';
import type {
  TrainingAnalysisQuery,
  TrainingDatasetRow,
  TrainingDatasetV1,
  TrainingMetricMeasure,
} from '@shared/training-visualization';
import dayjs = require('dayjs');
import {
  assertTrainingAnalysisQuery,
  bucketForDate,
  stableFingerprint,
} from './training-analytics';

export const MAX_METRIC_HISTORY_RECORDS = 1_000;

export type TrainingMetricHistory = {
  measure: TrainingMetricMeasure;
  points: { id: string; date: string; value: number }[];
  truncated: boolean;
};

/** Read stored history only. No estimation, source fallback, or profile writes. */
export async function readTrainingMetricHistory(args: {
  users: Pick<UserQueryService, 'bodyMetrics' | 'fitnessMetrics'>;
  userId: string;
  query: TrainingAnalysisQuery;
  timezone: string;
}): Promise<TrainingDatasetV1> {
  assertTrainingAnalysisQuery(args.query);
  if (args.query.source !== 'METRICS')
    throw new Error('Expected METRICS history query');
  const { query, userId, users, timezone } = args;
  const histories = await Promise.all(
    query.measures.map(async (key): Promise<TrainingMetricHistory> => {
      const measure = key as TrainingMetricMeasure;
      const body = measure === 'WEIGHT' || measure === 'HEIGHT';
      // Fitness history uses effective calendar dates, encoded as UTC dates by
      // the write adapter. Converting those dates to the viewer's timezone would
      // shift midnight records into the previous day in the Americas.
      // Body records are actual effective timestamps and use the user's timezone.
      const nextDay = dayjs.utc(query.to).add(1, 'day').format('YYYY-MM-DD');
      const range = body
        ? {
            gte: dayjs.tz(query.from, timezone).toDate(),
            lt: dayjs.tz(nextDay, timezone).toDate(),
          }
        : {
            gte: dayjs.utc(query.from).toDate(),
            lt: dayjs.utc(nextDay).toDate(),
          };
      const rows = body
        ? (
            await users.bodyMetrics().findMany({
              where: {
                userId,
                type: measure as BodyMetricType,
                effectiveDate: range,
              },
              orderBy: [
                { effectiveDate: 'desc' },
                { createdAt: 'desc' },
                { id: 'desc' },
              ],
              take: MAX_METRIC_HISTORY_RECORDS + 1,
              select: { id: true, effectiveDate: true, value: true },
            })
          ).map((row) => ({
            id: row.id,
            date: dayjs(row.effectiveDate).tz(timezone).format('YYYY-MM-DD'),
            value: row.value,
          }))
        : (
            await users.fitnessMetrics().findMany({
              where: {
                userId,
                type: measure as UserFitnessMetricType,
                source: query.metricSource ?? MetricSource.ESTIMATED,
                sport:
                  measure === 'VO2_MAX'
                    ? SportType.UNKNOWN
                    : (query.sportTypes![0] as SportType),
                recordedAt: range,
              },
              orderBy: [
                { recordedAt: 'desc' },
                { createdAt: 'desc' },
                { id: 'desc' },
              ],
              take: MAX_METRIC_HISTORY_RECORDS + 1,
              select: { id: true, recordedAt: true, value: true },
            })
          ).map((row) => ({
            id: row.id,
            date: dayjs.utc(row.recordedAt).format('YYYY-MM-DD'),
            value: row.value,
          }));
      return {
        measure,
        truncated: rows.length > MAX_METRIC_HISTORY_RECORDS,
        points: rows
          .slice(0, MAX_METRIC_HISTORY_RECORDS)
          .reverse()
          .flatMap((row) => {
            const storedValue = Number(row.value);
            // TP is persisted as speed (m/s); chart values use the public pace unit.
            const value = measure === 'TP' ? 1000 / storedValue : storedValue;
            return Number.isFinite(value) && value > 0
              ? [{ ...row, value }]
              : [];
          }),
      };
    }),
  );
  return buildMetricTrainingDataset({ query, timezone, histories });
}

export function buildMetricTrainingDataset(args: {
  query: TrainingAnalysisQuery;
  timezone: string;
  histories: TrainingMetricHistory[];
}): TrainingDatasetV1 {
  assertTrainingAnalysisQuery(args.query);
  if (args.query.source !== 'METRICS')
    throw new Error('Expected METRICS history query');
  const rows = new Map<string, TrainingDatasetRow>();
  const summary: TrainingDatasetV1['summary'] = {};
  const coverage: TrainingDatasetV1['coverage'] = {};
  const allBuckets = new Set<string>();
  for (
    let date = dayjs.utc(args.query.from);
    date.format('YYYY-MM-DD') <= args.query.to;
    date = date.add(1, 'day')
  ) {
    allBuckets.add(bucketForDate(date.toDate(), args.query.groupBy, 'UTC').key);
  }
  for (const history of args.histories) {
    const observedBuckets = new Set<string>();
    summary[history.measure] = null;
    // Keep the latest observation in each bucket. Thresholds and body measures
    // are states, not quantities to sum or average together.
    for (const point of [...history.points].sort((a, b) =>
      a.date.localeCompare(b.date),
    )) {
      if (
        point.date < args.query.from ||
        point.date > args.query.to ||
        !Number.isFinite(point.value) ||
        point.value <= 0
      )
        continue;
      const bucket = bucketForDate(
        dayjs.utc(point.date).toDate(),
        args.query.groupBy,
        'UTC',
      );
      const row = rows.get(bucket.key) ?? {
        ...bucket,
        values: Object.fromEntries(
          args.query.measures.map((measure) => [measure, null]),
        ),
      };
      row.values[history.measure] = point.value;
      rows.set(bucket.key, row);
      observedBuckets.add(bucket.key);
      summary[history.measure] = point.value;
    }
    coverage[history.measure] =
      observedBuckets.size / Math.max(1, allBuckets.size);
  }
  const datasetRows = [...rows.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  const truncated = args.histories.some((history) => history.truncated);
  return {
    kind: 'training_dataset',
    schemaVersion: 1,
    query: args.query,
    timezone: args.timezone,
    rows: datasetRows,
    summary,
    coverage,
    complete: !truncated,
    truncated,
    fingerprint: stableFingerprint({
      query: args.query,
      timezone: args.timezone,
      histories: args.histories,
    }),
  };
}
