import { describe, expect, it, jest } from '@jest/globals';
import {
  TRAINING_METRIC_MEASURES,
  trainingMeasureUnit,
  type TrainingAnalysisQuery,
} from '@shared/training-visualization';
import {
  buildMetricTrainingDataset,
  readTrainingMetricHistory,
  MAX_METRIC_HISTORY_RECORDS,
} from '../training-metric-history';
import {
  assertTrainingAnalysisQuery,
  buildTrainingVisualization,
} from '../training-analytics';
import type { UserQueryService } from '@/api/user/user-query.service';

const query = (
  overrides: Partial<TrainingAnalysisQuery> = {},
): TrainingAnalysisQuery => ({
  source: 'METRICS',
  from: '2026-08-28',
  to: '2026-09-26',
  groupBy: 'DAY',
  measures: ['VO2_MAX'],
  metricSource: 'ESTIMATED',
  ...overrides,
});

function reader(fitnessRows: unknown[] = [], bodyRows: unknown[] = []) {
  const fitness = jest.fn(async () => fitnessRows);
  const body = jest.fn(async () => bodyRows);
  const users = {
    fitnessMetrics: () => ({ findMany: fitness }),
    bodyMetrics: () => ({ findMany: body }),
  } as unknown as UserQueryService;
  return {
    fitness,
    body,
    read: (q = query(), timezone = 'America/Los_Angeles') =>
      readTrainingMetricHistory({
        users,
        userId: 'athlete-1',
        query: q,
        timezone,
      }),
  };
}

describe('metric history visualization', () => {
  it('reads VO2_MAX for the authenticated athlete, explicit source and exact calendar range', async () => {
    const r = reader([
      { id: 'last', recordedAt: new Date('2026-09-26T00:00:00Z'), value: 47 },
      { id: 'first', recordedAt: new Date('2026-08-28T00:00:00Z'), value: 45 },
    ]);
    const dataset = await r.read();
    expect(r.fitness).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'athlete-1',
          type: 'VO2_MAX',
          sport: 'UNKNOWN',
          source: 'ESTIMATED',
          recordedAt: {
            gte: new Date('2026-08-28T00:00:00Z'),
            lt: new Date('2026-09-27T00:00:00Z'),
          },
        },
        take: MAX_METRIC_HISTORY_RECORDS + 1,
      }),
    );
    expect(dataset.rows.map((row) => row.key)).toEqual([
      '2026-08-28',
      '2026-09-26',
    ]);
    const card = buildTrainingVisualization({
      dataset,
      title: 'VO2max',
      intent: 'TREND',
    });
    expect(card.view).toBe('LINE');
    expect(card.series).toEqual([{ key: 'VO2_MAX', unit: 'ml/kg/min' }]);
    expect(card.provenance).toMatchObject({
      source: 'METRICS',
      metricSource: 'ESTIMATED',
    });
    expect(r.body).not.toHaveBeenCalled();
  });

  it('uses local body-record timestamps across DST, keeps height in cm and rejects invalid values', async () => {
    const r = reader(
      [],
      [
        {
          id: 'invalid',
          effectiveDate: new Date('2026-03-09T00:00:00Z'),
          value: 'not-a-number',
        },
        {
          id: 'height',
          effectiveDate: new Date('2026-03-09T00:30:00Z'),
          value: '178',
        },
      ],
    );
    const dataset = await r.read(
      query({ from: '2026-03-08', to: '2026-03-08', measures: ['HEIGHT'] }),
    );
    expect(r.body).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'athlete-1',
          type: 'HEIGHT',
          effectiveDate: {
            gte: new Date('2026-03-08T08:00:00Z'),
            lt: new Date('2026-03-09T07:00:00Z'),
          },
        },
      }),
    );
    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0]).toMatchObject({
      key: '2026-03-08',
      values: { HEIGHT: 178 },
    });
    expect(r.fitness).not.toHaveBeenCalled();
  });

  it('converts persisted threshold speed to seconds/km without changing source or sport', async () => {
    const r = reader([
      { id: 'tp', recordedAt: new Date('2026-09-01T00:00:00Z'), value: 4 },
    ]);
    const dataset = await r.read(
      query({ measures: ['TP'], sportTypes: ['RUN'], metricSource: 'MANUAL' }),
    );
    expect(r.fitness).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'MANUAL',
          sport: 'RUN',
          type: 'TP',
        }),
      }),
    );
    expect(dataset.summary.TP).toBe(250);
    expect(trainingMeasureUnit('TP')).toBe('s/km');
  });

  it.each(TRAINING_METRIC_MEASURES)(
    'supports stored %s history using the same result contract',
    async (measure) => {
      const r = reader(
        [
          {
            id: 'fitness',
            recordedAt: new Date('2026-09-01T00:00:00Z'),
            value: 50,
          },
        ],
        [
          {
            id: 'body',
            effectiveDate: new Date('2026-09-01T12:00:00Z'),
            value: '70',
          },
        ],
      );
      const dataset = await r.read(
        query({ measures: [measure], sportTypes: ['RUN'] }),
      );
      const card = buildTrainingVisualization({
        dataset,
        title: measure,
        intent: 'TREND',
        preferredView: 'LINE',
      });
      expect(card.series).toEqual([
        { key: measure, unit: trainingMeasureUnit(measure) },
      ]);
      expect(card.view).toBe('METRIC_STRIP');
      expect(card.viewAdjustmentReason).toBe('SINGLE_POINT');
    },
  );

  it('takes the latest weekly state, does not sum values or invent missing records', () => {
    const dataset = buildMetricTrainingDataset({
      query: query({ measures: ['WEIGHT', 'HEIGHT'], groupBy: 'WEEK' }),
      timezone: 'UTC',
      histories: [
        {
          measure: 'WEIGHT',
          truncated: false,
          points: [
            { id: '1', date: '2026-08-27', value: 99 },
            { id: '2', date: '2026-08-28', value: 73 },
            { id: '3', date: '2026-08-29', value: 72 },
            { id: '4', date: '2026-09-25', value: 71 },
            { id: '5', date: '2026-09-27', value: 99 },
          ],
        },
        {
          measure: 'HEIGHT',
          truncated: false,
          points: [{ id: 'h', date: '2026-08-28', value: 178 }],
        },
      ],
    });
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0].values).toEqual({ WEIGHT: 72, HEIGHT: 178 });
    expect(dataset.rows[1].values).toEqual({ WEIGHT: 71, HEIGHT: null });
    expect(dataset.summary).toEqual({ WEIGHT: 71, HEIGHT: 178 });
    expect(
      buildTrainingVisualization({
        dataset,
        title: '身体指标',
        intent: 'TREND',
      }).view,
    ).toBe('SMALL_MULTIPLES');
  });

  it('reports an empty requested history without substituting PMC or zero values', async () => {
    const dataset = await reader().read();
    const card = buildTrainingVisualization({
      dataset,
      title: 'VO2max',
      intent: 'TREND',
    });
    expect(card.rows).toEqual([]);
    expect(card.summary.VO2_MAX).toBeNull();
    expect(card.viewAdjustmentReason).toBe('NO_DATA');
    expect(card.provenance.source).toBe('METRICS');
  });

  it('reports read limits and changes the fingerprint when evidence changes', async () => {
    const records = Array.from(
      { length: MAX_METRIC_HISTORY_RECORDS + 1 },
      (_, index) => ({
        id: String(index),
        value: 45,
        recordedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    );
    const truncated = await reader(records).read();
    expect(truncated).toMatchObject({ complete: false, truncated: true });
    const different = await reader([{ ...records[0], value: 46 }]).read();
    expect(different.fingerprint).not.toBe(truncated.fingerprint);
  });

  it.each<Partial<TrainingAnalysisQuery>>([
    { from: '2026-02-30' },
    { to: '2026-01-01' },
    { from: '2024-01-01' },
    { source: 'PMC' },
    { groupBy: 'ACTIVITY' },
    { limit: 10 },
    { measures: ['FTP'] },
    { measures: ['FTP'], sportTypes: ['RUN', 'CYCLING'] },
    { metricSource: 'SNAPSHOT' as never },
    { measures: ['VO2_MAX', 'VO2_MAX'] },
  ])(
    'rejects ambiguous or incompatible requests before reading: %j',
    (overrides) => {
      expect(() => assertTrainingAnalysisQuery(query(overrides))).toThrow();
    },
  );
});
