import { combineExplorationAxes } from '@shared/training-chart-model';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import type { SportType } from '@prisma/client';
import {
  EXPLORATION_UNITS,
  type ExplorationNote,
  type ExplorationPanel,
  type ExplorationQuery,
  type TrainingVisualizationV2,
} from '@shared/training-exploration';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { buildPlanExecutionPanels } from '@/api/plan/application/plan-execution-chart';
import type { AiToolContext } from './tool.types';
import { assertExplorationQuery } from './training-exploration-validation';
import { bucketForDate, stableFingerprint } from './training-analytics';
import { buildZoneDistribution } from './training-zone-distribution';
import type { TrainingMetricMeasure } from '@shared/training-visualization';

dayjs.extend(utc);
dayjs.extend(timezone);
const finite = (v: unknown): number | null =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : null;

export async function queryTrainingExploration(
  ctx: AiToolContext,
  input: ExplorationQuery & { title?: string; subtitle?: string },
): Promise<TrainingVisualizationV2> {
  // Only query fields enter provenance; never accept caller-supplied series/values.
  const keys: (keyof ExplorationQuery)[] = [
    'source',
    'from',
    'to',
    'measures',
    'sportTypes',
    'activityHashIds',
    'alignment',
    'axisLayout',
    'fromSecond',
    'toSecond',
    'maxPoints',
    'zoneType',
    'zoneUnit',
    'compareFrom',
    'compareTo',
    'planId',
    'groupBy',
    'relationshipBasis',
    'metricSource',
  ];
  const query = Object.fromEntries(
    keys.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]),
  ) as ExplorationQuery;
  if ('limit' in input && input.limit !== undefined)
    throw new Error(
      'Use explicit activity IDs, maxPoints, or a narrower date range for this source',
    );
  assertExplorationQuery(query);
  const userId = ctx.session.user.id;
  const tz = (await ctx.userService.getPreferredTimezone(userId)) || 'UTC';
  const notes: ExplorationNote[] = [];
  let panels: ExplorationPanel[] = [],
    truncated = false,
    matchedCount = 0,
    missingCount = 0;
  let coverage: Record<string, number> | undefined;
  if (
    query.source === 'ACTIVITY_SERIES' ||
    (query.source === 'RELATIONSHIP' && query.relationshipBasis === 'SAMPLE')
  ) {
    if (!ctx.activitySeries)
      throw new Error('Activity series service is unavailable');
    const groups = new Map<string, ExplorationPanel>();
    coverage = {};
    // Bounded sequential reads keep parquet/DuckDB memory bounded.
    for (const hashId of query.activityHashIds!) {
      ctx.signal?.throwIfAborted();
      const result = await ctx.activitySeries.chart(userId, hashId, query, tz);
      matchedCount++;
      truncated ||= result.truncated;
      for (const panel of result.panels) {
        const key = `${result.sportType}:${panel.id}`;
        const existing = groups.get(key);
        if (existing) existing.series.push(...panel.series);
        else
          groups.set(key, {
            ...panel,
            id: key,
            label: result.sportType ?? undefined,
          });
      }
      if (result.gaps) notes.push('GAPS');
      if (result.distanceUnavailable) notes.push('DISTANCE_UNAVAILABLE');
      if (result.recordedStart) notes.push('RECORDED_START');
      if (
        !result.panels.some((p) =>
          p.series.some((s) => s.points.some((pt) => pt.y !== null)),
        )
      )
        missingCount++;
      Object.entries(result.coverage).forEach(
        ([m, n]) => (coverage![`${hashId}:${m}`] = n),
      );
    }
    panels = [...groups.values()];
    if (query.axisLayout === 'OVERLAY') {
      panels = combineExplorationAxes(panels);
      if (panels.some((p) => p.extraY?.length)) notes.push('MULTI_AXES');
    }
    notes.push('TIME_WEIGHTED');
    if (query.alignment === 'PROGRESS') notes.push('PROGRESS_TIME');
  } else if (
    query.source === 'RELATIONSHIP' &&
    query.relationshipBasis === 'METRIC_HISTORY'
  ) {
    const measures = query.measures as TrainingMetricMeasure[];
    const data = await ctx.coachTools.trainingAggregate(ctx, {
      source: 'METRICS',
      from: query.from!,
      to: query.to!,
      measures,
      groupBy: 'DAY',
      sportTypes: query.sportTypes,
      metricSource: query.metricSource,
    });
    const [mx, my] = measures;
    const points = data.rows.flatMap((r) => {
      const x = finite(r.values[mx]),
        y = finite(r.values[my]);
      if (x === null || y === null) {
        missingCount++;
        return [];
      }
      return [{ x, y, label: r.label }];
    });
    panels = [
      {
        id: 'history-relationship',
        view: 'SCATTER',
        x: {
          kind: 'NUMBER',
          measure: mx,
          unit: EXPLORATION_UNITS[mx],
          reverse: EXPLORATION_UNITS[mx] === 's/km',
        },
        y: {
          kind: 'NUMBER',
          measure: my,
          unit: EXPLORATION_UNITS[my],
          reverse: EXPLORATION_UNITS[my] === 's/km',
        },
        series: [{ id: 'paired-history', points }],
      },
    ];
    matchedCount = data.rows.length;
    truncated = data.truncated;
    coverage = data.coverage;
    query.metricSource = data.query.metricSource;
    notes.push('HISTORY_PAIRS');
  } else if (query.source === 'PLAN_EXECUTION') {
    const result = await ctx.planQuery.readExecutionChart(userId, query);
    panels = buildPlanExecutionPanels(
      result.rows,
      query,
      (date) =>
        bucketForDate(
          new Date(date),
          query.groupBy === 'WORKOUT' ? 'DAY' : (query.groupBy ?? 'DAY'),
          'UTC',
        ).key,
    );
    matchedCount = result.rows.length;
    missingCount = result.missing;
    truncated = result.truncated;
    notes.push('LINKED_ONLY', 'PLAN_DATE');
    if (missingCount) notes.push('MISSING_ACTUAL');
    if (query.measures?.includes('LOAD')) notes.push('LOAD_METHODS');
  } else {
    if (!ctx.activities)
      throw new Error('Activity query service is unavailable');
    const ranges = [
      { from: query.from!, to: query.to! },
      ...(query.compareFrom
        ? [{ from: query.compareFrom, to: query.compareTo! }]
        : []),
    ];
    const cap = 1000;
    const rows = await ctx.activities.findMany({
      where: readyActivityWhere({
        userId,
        ...(query.sportTypes?.length
          ? { sportType: { in: query.sportTypes as SportType[] } }
          : {}),
        OR: ranges.map((r) => ({
          startTime: {
            gte: dayjs.tz(r.from, tz).startOf('day').toDate(),
            lt: dayjs
              .tz(dayjs.utc(r.to).add(1, 'day').format('YYYY-MM-DD'), tz)
              .startOf('day')
              .toDate(),
          },
        })),
      }),
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: cap + 1,
      select: {
        hashId: true,
        activityName: true,
        startTime: true,
        sportType: true,
        timerTime: true,
        distance: true,
        avgSpeed: true,
        avgHeartRate: true,
        avgPower: true,
        avgCadence: true,
        activityZones:
          query.source === 'ZONE_DISTRIBUTION'
            ? {
                where: { zoneType: query.zoneType },
                select: {
                  order: true,
                  name: true,
                  duration: true,
                  min: true,
                  max: true,
                },
              }
            : false,
      },
    });
    const selected = rows.slice(0, cap);
    matchedCount = selected.length;
    truncated = rows.length > cap;
    if (query.source === 'ZONE_DISTRIBUTION') {
      const result = buildZoneDistribution(selected, query, tz);
      panels = result.panels;
      missingCount = result.missing;
      truncated ||= result.truncated;
      notes.push('ZONE_SNAPSHOTS', 'ZONE_COVERAGE');
      if (result.split) notes.push('ZONE_SPLIT');
    } else {
      const [mx, my] = query.measures!;
      const groups = new Map<string, ExplorationPanel['series'][number]>();
      for (const r of selected) {
        const speed = finite(r.avgSpeed);
        const values = {
          HEART_RATE: finite(r.avgHeartRate),
          POWER: finite(r.avgPower),
          CADENCE: finite(r.avgCadence),
          SPEED: speed != null ? speed * 3.6 : null,
          PACE: speed != null && speed > 0 ? 1000 / speed : null,
          DURATION_MIN: r.timerTime != null ? r.timerTime / 60 : null,
          DISTANCE_KM: r.distance != null ? r.distance / 1000 : null,
        };
        const x = values[mx as keyof typeof values],
          y = values[my as keyof typeof values];
        if (x == null || y == null) {
          missingCount++;
          continue;
        }
        const key = r.sportType ?? 'OTHER';
        const series = groups.get(key) ?? { id: key, label: key, points: [] };
        series.points.push({
          x,
          y,
          label: `${r.startTime ? dayjs(r.startTime).tz(tz).format('YYYY-MM-DD') : ''} · ${r.activityName ?? r.hashId}`,
        });
        groups.set(key, series);
      }
      panels = [
        {
          id: 'relationship',
          view: 'SCATTER',
          x: {
            kind: 'NUMBER',
            measure: mx,
            unit: EXPLORATION_UNITS[mx],
            reverse: mx === 'PACE',
          },
          y: {
            kind: 'NUMBER',
            measure: my,
            unit: EXPLORATION_UNITS[my],
            reverse: my === 'PACE',
          },
          series: [...groups.values()],
        },
      ];
    }
  }
  if (query.source === 'RELATIONSHIP') {
    if (query.relationshipBasis !== 'METRIC_HISTORY') notes.push('PAIRED_ONLY');
    notes.push('NOT_CAUSAL');
    panels.forEach(
      (p) =>
        (p.pairedCount = p.series.reduce((n, s) => n + s.points.length, 0)),
    );
  }
  if (
    !panels.some((p) =>
      p.series.some((s) => s.points.some((pt) => pt.y !== null)),
    )
  )
    notes.push('NO_DATA');
  if (truncated) notes.push('PARTIAL_DATA');
  return {
    kind: 'training_visualization',
    schemaVersion: 2,
    title:
      String(input.title ?? '')
        .trim()
        .slice(0, 80) ||
      (ctx.lang.startsWith('zh') ? '训练分析' : 'Training analysis'),
    subtitle:
      String(input.subtitle ?? '')
        .trim()
        .slice(0, 120) || undefined,
    panels,
    notes: [...new Set(notes)],
    provenance: {
      query,
      timezone: tz,
      complete: !truncated,
      truncated,
      matchedCount,
      missingCount,
      coverage,
      fingerprint: stableFingerprint({
        query,
        panels,
        truncated,
        missingCount,
      }),
    },
  };
}

export function summarizeExploration(output: TrainingVisualizationV2) {
  return {
    title: output.title,
    notes: output.notes,
    provenance: output.provenance,
    panels: output.panels.map((p) => ({
      measure: p.measure,
      view: p.view,
      x: p.x,
      y: p.y,
      extraY: p.extraY,
      pairedCount: p.pairedCount,
      series: p.series.map((s) => {
        const valid = s.points.filter((point) => point.y !== null);
        const ys = valid.map((point) => point.y!);
        const xs = valid.map((point) => point.x);
        const avgX = xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);
        const avgY = ys.reduce((sum, y) => sum + y, 0) / Math.max(1, ys.length);
        const covariance = valid.reduce(
          (sum, point) => sum + (point.x - avgX) * (point.y! - avgY),
          0,
        );
        const denominator = Math.sqrt(
          xs.reduce((sum, x) => sum + (x - avgX) ** 2, 0) *
            ys.reduce((sum, y) => sum + (y - avgY) ** 2, 0),
        );
        return {
          label: s.label,
          role: s.role,
          axisIndex: s.axisIndex,
          measure: s.measure,
          activityHashId: s.activityHashId,
          pointCount: s.points.length,
          validPoints: valid.length,
          plottedRange: ys.length
            ? {
                min: Math.min(...ys),
                max: Math.max(...ys),
                first: valid[0],
                last: valid.at(-1),
              }
            : null,
          ...(p.view === 'SCATTER'
            ? {
                descriptivePearsonR:
                  valid.length >= 3 && denominator > 0
                    ? Number((covariance / denominator).toFixed(4))
                    : null,
              }
            : {}),
        };
      }),
    })),
  };
}
