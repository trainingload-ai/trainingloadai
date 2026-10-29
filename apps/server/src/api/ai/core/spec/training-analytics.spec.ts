import { SportType, type PMCData } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import {
  buildActivityTrainingDataset,
  buildPmcTrainingDataset,
  buildTrainingVisualization,
} from '../training-analytics';

describe('training analytics', () => {
  it('groups activities in the athlete timezone and uses duration-weighted averages', () => {
    const dataset = buildActivityTrainingDataset({
      timezone: 'Asia/Shanghai',
      truncated: false,
      query: {
        source: 'ACTIVITIES',
        from: '2026-09-01',
        to: '2026-09-03',
        groupBy: 'DAY',
        measures: [
          'ACTIVITY_COUNT',
          'DURATION_MIN',
          'DISTANCE_KM',
          'AVG_SPEED_KMH',
          'AVG_HEART_RATE',
        ],
      },
      activities: [
        {
          hashId: 'a',
          activityName: 'Late run',
          sportType: SportType.RUN,
          startTime: new Date('2026-09-01T16:30:00.000Z'),
          timerTime: 3_600,
          elapsedTime: 3_800,
          distance: 10_000,
          avgHeartRate: 140,
          avgPower: null,
        },
        {
          hashId: 'b',
          activityName: 'Morning run',
          sportType: SportType.RUN,
          startTime: new Date('2026-09-02T02:00:00.000Z'),
          timerTime: 1_800,
          elapsedTime: 2_000,
          distance: 5_000,
          avgHeartRate: 160,
          avgPower: null,
        },
      ],
    });

    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0].key).toBe('2026-09-02');
    expect(dataset.summary.ACTIVITY_COUNT).toBe(2);
    expect(dataset.summary.DURATION_MIN).toBe(90);
    expect(dataset.summary.DISTANCE_KM).toBe(15);
    expect(dataset.summary.AVG_SPEED_KMH).toBe(10);
    expect(dataset.summary.AVG_HEART_RATE).toBeCloseTo(146.7, 1);
    expect(dataset.coverage.AVG_HEART_RATE).toBe(1);
    expect(dataset.complete).toBe(true);
  });

  it('reports missing signal coverage without inventing an average', () => {
    const dataset = buildActivityTrainingDataset({
      timezone: 'UTC',
      truncated: true,
      query: {
        source: 'ACTIVITIES',
        from: '2026-09-01',
        to: '2026-09-01',
        groupBy: 'SPORT',
        measures: ['AVG_POWER'],
      },
      activities: [
        {
          hashId: 'a',
          activityName: null,
          sportType: SportType.RUN,
          startTime: new Date('2026-09-01T10:00:00.000Z'),
          timerTime: 1_800,
          elapsedTime: 1_800,
          distance: 5_000,
          avgHeartRate: 145,
          avgPower: null,
        },
      ],
    });

    expect(dataset.summary.AVG_POWER).toBeNull();
    expect(dataset.coverage.AVG_POWER).toBe(0);
    expect(dataset.truncated).toBe(true);
    expect(dataset.complete).toBe(false);
  });

  it('sums load but takes the latest PMC state in a weekly bucket', () => {
    const record = (
      date: string,
      dailyValue: number,
      ATL: number,
      CTL: number,
    ) =>
      ({
        date: new Date(date),
        dailyValue,
        ATL,
        CTL,
        TSB: CTL - ATL,
        runningValue: dailyValue,
        cyclingValue: 0,
        swimmingValue: 0,
        otherValue: 0,
      }) as PMCData;
    const dataset = buildPmcTrainingDataset({
      timezone: 'UTC',
      query: {
        source: 'PMC',
        from: '2026-09-07',
        to: '2026-09-13',
        groupBy: 'WEEK',
        measures: ['DAILY_LOAD', 'ATL', 'CTL'],
      },
      records: [
        record('2026-09-07T00:00:00.000Z', 50, 40, 30),
        record('2026-09-09T00:00:00.000Z', 70, 44, 31),
      ],
    });

    expect(dataset.rows[0].values.DAILY_LOAD).toBe(120);
    expect(dataset.rows[0].values.ATL).toBe(44);
    expect(dataset.rows[0].values.CTL).toBe(31);
  });

  it('downgrades a single point to a metric strip and keeps provenance', () => {
    const dataset = buildActivityTrainingDataset({
      timezone: 'UTC',
      truncated: false,
      query: {
        source: 'ACTIVITIES',
        from: '2026-09-01',
        to: '2026-09-01',
        groupBy: 'DAY',
        measures: ['ACTIVITY_COUNT'],
      },
      activities: [
        {
          hashId: 'a',
          activityName: 'Run',
          sportType: SportType.RUN,
          startTime: new Date('2026-09-01T10:00:00.000Z'),
          timerTime: 1_800,
          elapsedTime: 1_800,
          distance: 5_000,
          avgHeartRate: 145,
          avgPower: null,
        },
      ],
    });
    const visualization = buildTrainingVisualization({
      dataset,
      intent: 'TREND',
      preferredView: 'LINE',
      title: '训练次数',
    });

    expect(visualization.view).toBe('METRIC_STRIP');
    expect(visualization.viewAdjustmentReason).toBe('SINGLE_POINT');
    expect(visualization.rows).toEqual(dataset.rows);
    expect(visualization.provenance.fingerprint).toBe(dataset.fingerprint);
  });

  it('separates series with unlike units instead of sharing a misleading axis', () => {
    const dataset = buildActivityTrainingDataset({
      timezone: 'UTC',
      truncated: false,
      query: {
        source: 'ACTIVITIES',
        from: '2026-09-01',
        to: '2026-09-02',
        groupBy: 'DAY',
        measures: ['DURATION_MIN', 'AVG_HEART_RATE'],
      },
      activities: [
        {
          hashId: 'a',
          activityName: 'Run 1',
          sportType: SportType.RUN,
          startTime: new Date('2026-09-01T10:00:00.000Z'),
          timerTime: 1_800,
          elapsedTime: 1_800,
          distance: 5_000,
          avgHeartRate: 145,
          avgPower: null,
        },
        {
          hashId: 'b',
          activityName: 'Run 2',
          sportType: SportType.RUN,
          startTime: new Date('2026-09-02T10:00:00.000Z'),
          timerTime: 2_400,
          elapsedTime: 2_400,
          distance: 7_000,
          avgHeartRate: 151,
          avgPower: null,
        },
      ],
    });
    const visualization = buildTrainingVisualization({
      dataset,
      intent: 'TREND',
      preferredView: 'LINE',
      title: '时长与心率',
    });

    expect(visualization.view).toBe('SMALL_MULTIPLES');
    expect(visualization.viewAdjustmentReason).toBe('INCOMPATIBLE_VIEW');
  });
});
