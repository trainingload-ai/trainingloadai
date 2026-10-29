import { describe, expect, it, jest } from '@jest/globals';
import { ActivitySeriesQueryService } from '../activity-series-query.service';
import { summarizeActivitySeries } from '../activity-series-summary';

const row = (seconds: number, values: Record<string, unknown> = {}) => ({
  time: new Date(Date.UTC(2026, 0, 1) + seconds * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('.000Z', ''),
  ...values,
});

describe('activity series evidence', () => {
  it('time-weights irregular samples before downsampling and retains real zeros', () => {
    const result = summarizeActivitySeries(
      [row(0, { power: 100 }), row(1, { power: 200 }), row(10, { power: 999 })],
      { maxPoints: 1 },
    );
    expect(result.summary.power).toMatchObject({
      average: 190,
      coveredSeconds: 10,
      max: 200,
    });
    expect(result.points).toHaveLength(1);
  });
  it('filters before averaging and reports missing filter signals separately', () => {
    const result = summarizeActivitySeries(
      [
        row(0, { power: 0, speed: 5 }),
        row(1, { power: 100, speed: 0 }),
        row(2, { power: 200, speed: 5 }),
        row(3, { speed: 5 }),
        row(4),
      ],
      { movingOnly: true, excludeZeroPower: true },
    );
    expect(result.summary.power).toMatchObject({
      average: 200,
      coveredSeconds: 1,
    });
    expect(result.coverage).toMatchObject({
      includedSeconds: 1,
      filteredSeconds: 2,
      unknownFilterSeconds: 1,
    });
  });
  it('does not fill missing power with zero or calculated power', () => {
    const result = summarizeActivitySeries([
      row(0, { calculatedPower: 300, heartRate: 120 }),
      row(1, { power: 0 }),
      row(2),
    ]);
    expect(result.summary.power).toMatchObject({
      average: 0,
      coveredSeconds: 1,
    });
    expect(result.coverage.zeroPowerSeconds).toBe(1);
  });
  it('reports pauses and invalid timestamps instead of bridging them', () => {
    const result = summarizeActivitySeries([
      row(0, { power: 100 }),
      row(1, { power: 200 }),
      row(100, { power: 300 }),
      { time: 'invalid', power: 999 },
    ]);
    expect(result.coverage).toMatchObject({
      gapSeconds: 99,
      includedSeconds: 1,
      validTimestampRows: 3,
    });
  });
  it('supports climbing and partial interval bounds without inferring downhill from power', () => {
    const result = summarizeActivitySeries(
      [
        row(0, { grade: -2, cadence: 50 }),
        row(5, { grade: 4, cadence: 80 }),
        row(10),
      ],
      { fromSecond: 3, toSecond: 8, minGrade: 2 },
    );
    expect(result.coverage).toMatchObject({
      includedSeconds: 3,
      filteredSeconds: 2,
    });
    expect(result.summary.cadence).toMatchObject({ average: 80 });
  });
  it.each([{ rows: [] }, { rows: [row(0)] }])(
    'returns no usable samples without inventing averages',
    ({ rows }) => {
      const result = summarizeActivitySeries(rows);
      expect(result.status).toBe('NO_USABLE_SAMPLES');
      expect(result.summary.power).toMatchObject({ average: null });
    },
  );
  it('bounds output while preserving the complete summary', () => {
    const result = summarizeActivitySeries(
      Array.from({ length: 1001 }, (_, i) => row(i, { power: 100 })),
      { maxPoints: 120 },
    );
    expect(result.points.length).toBeLessThanOrEqual(120);
    expect(result.coverage.includedSeconds).toBe(1000);
  });
  it('checks ownership before touching sensor storage', async () => {
    const activities = { findReadyByHashId: jest.fn(async () => null) };
    const sensors = { getRecordSeriesMulti: jest.fn(async () => []) };
    const service = new ActivitySeriesQueryService(
      activities as never,
      sensors as never,
    );
    await expect(
      service.query('user-a', 'other-user-activity'),
    ).rejects.toThrow('Activity not found');
    expect(activities.findReadyByHashId).toHaveBeenCalledWith(
      'user-a',
      'other-user-activity',
    );
    expect(sensors.getRecordSeriesMulti).not.toHaveBeenCalled();
  });
  it('reads only owned sensor metrics without location and preserves query failures', async () => {
    const activities = {
      findReadyByHashId: jest.fn(async () => ({
        id: 12,
        sportType: 'CYCLING',
      })),
    };
    const sensors = {
      getRecordSeriesMulti: jest.fn(async () => {
        throw new Error('storage unavailable');
      }),
    };
    const service = new ActivitySeriesQueryService(
      activities as never,
      sensors as never,
    );
    await expect(service.query('user-a', 'hash')).rejects.toThrow(
      'storage unavailable',
    );
    expect(sensors.getRecordSeriesMulti).toHaveBeenCalledWith(12, [
      'heartRate',
      'power',
      'enhancedSpeed',
      'speed',
      'cadence',
      'grade',
    ]);
  });
});
