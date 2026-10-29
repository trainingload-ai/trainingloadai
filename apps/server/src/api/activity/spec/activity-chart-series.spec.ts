import { describe, expect, it, jest } from '@jest/globals';
import { buildActivityChartSeries } from '../activity-chart-series';
import { ActivitySeriesQueryService } from '../activity-series-query.service';
const start = new Date('2026-09-26T00:00:00Z');
const activity = {
  hashId: 'a',
  activityName: 'Run',
  sportType: 'RUN',
  startTime: start,
  elapsedTime: 100,
};
const row = (second: number, values: Record<string, unknown> = {}) => ({
  time: new Date(+start + second * 1000).toISOString(),
  ...values,
});
const query = {
  source: 'ACTIVITY_SERIES' as const,
  activityHashIds: ['a'],
  measures: ['HEART_RATE' as const],
  maxPoints: 20,
};
describe('Activity chart evidence', () => {
  it('weights irregular samples by real time, not sample count', () => {
    const result = buildActivityChartSeries(
      [
        row(0, { heartRate: 100 }),
        row(1, { heartRate: 200 }),
        row(5, { heartRate: 150 }),
        row(100),
      ],
      activity,
      query,
    );
    expect(result.panels[0].series[0].points[0]).toMatchObject({
      y: 180,
      min: 100,
      max: 200,
      coverage: 1,
      from: 0,
      to: 5,
    });
  });
  it('breaks the line over gaps and missing signals; measured zero power is valid', () => {
    const result = buildActivityChartSeries(
      [
        row(0, { power: 0 }),
        row(5, { power: 200 }),
        row(50, { power: 300 }),
        row(55),
      ],
      activity,
      { ...query, measures: ['POWER'] },
    );
    expect(result.gaps).toBe(true);
    expect(result.panels[0].series[0].points.some((p) => p.y === 0)).toBe(true);
    expect(result.panels[0].series[0].points.some((p) => p.y === null)).toBe(
      true,
    );
  });
  it('does not invent distance or turn speed zero into infinite pace', () => {
    const rows = [row(0, { speed: 0 }), row(5, { speed: 0 })];
    expect(
      buildActivityChartSeries(rows, activity, {
        ...query,
        alignment: 'DISTANCE',
      }).distanceUnavailable,
    ).toBe(true);
    expect(
      buildActivityChartSeries(rows, activity, {
        ...query,
        measures: ['PACE'],
      }).panels[0].series[0].points.every((p) => p.y === null),
    ).toBe(true);
  });
  it('retains true coordinates for a segment between samples and rejects distance resets', () => {
    const rows = [
      row(0, { heartRate: 140, distance: 100 }),
      row(5, { heartRate: 150, distance: 50 }),
      row(10, { heartRate: 160, distance: 80 }),
    ];
    const result = buildActivityChartSeries(rows, activity, {
      ...query,
      fromSecond: 2,
      toSecond: 4,
    });
    expect(result.panels[0].series[0].points).toHaveLength(2);
    expect(result.panels[0].series[0].points[0]).toMatchObject({
      from: 2,
      to: 3,
      y: 140,
    });
    const invalid = buildActivityChartSeries(rows, activity, {
      ...query,
      alignment: 'DISTANCE',
    });
    expect(invalid.distanceUnavailable).toBe(true);
    expect(invalid.panels[0].series[0].points.every((p) => p.y === null)).toBe(
      true,
    );
  });
  it('bounds raw reads and marks truncation before charting', async () => {
    const rows = Array.from({ length: 120001 }, (_, i) =>
      row(i, { heartRate: 140 }),
    );
    const reader = {
      findReadyByHashId: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({ ...activity, id: 1 }),
    };
    const sensors = {
      getRecordSeriesMulti: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue(rows),
    };
    const service = new ActivitySeriesQueryService(
      reader as never,
      sensors as never,
    );
    const result = await service.chart('owner', 'a', query);
    expect(result.truncated).toBe(true);
    expect(sensors.getRecordSeriesMulti.mock.calls[0][3]).toBe(120001);
    expect(result.panels[0].series[0].points.length).toBeLessThanOrEqual(20);
  });
  it('normalizes progress using the activity duration, not the truncated records', () => {
    const result = buildActivityChartSeries(
      [row(0, { heartRate: 100 }), row(5, { heartRate: 100 }), row(10)],
      activity,
      { ...query, alignment: 'PROGRESS' },
    );
    expect(
      Math.max(...result.panels[0].series[0].points.map((p) => p.x)),
    ).toBeLessThan(11);
  });
  it('pairs only simultaneously present signals', () => {
    const result = buildActivityChartSeries(
      [
        row(0, { heartRate: 100 }),
        row(1, { speed: 3 }),
        row(5, { heartRate: 150, speed: 4 }),
        row(10),
      ],
      activity,
      {
        ...query,
        source: 'RELATIONSHIP',
        relationshipBasis: 'SAMPLE',
        measures: ['HEART_RATE', 'SPEED'],
      },
    );
    const pairs = result.panels[0].series[0].points;
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((p) => p.x === 150 && p.y === 14.4)).toBe(true);
  });
  it('checks owner and READY visibility before reading sensors', async () => {
    const reader = {
        findReadyByHashId: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue(null),
      },
      sensors = { getRecordSeriesMulti: jest.fn() };
    const service = new ActivitySeriesQueryService(
      reader as never,
      sensors as never,
    );
    await expect(service.chart('owner', 'foreign', query)).rejects.toThrow(
      'Activity not found',
    );
    expect(reader.findReadyByHashId).toHaveBeenCalledWith('owner', 'foreign');
    expect(sensors.getRecordSeriesMulti).not.toHaveBeenCalled();
  });
});
