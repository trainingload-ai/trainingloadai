import { describe, expect, it, jest } from '@jest/globals';
import { $Enums } from '@prisma/client';
import { ChartsService } from '../charts.service';

function createService(
  rows: Array<Record<string, unknown>>,
  calculatedSummary: Record<string, unknown> | null = {
    model: 'GRIBBLE',
    modelVersion: 1,
  },
) {
  const sensorDataService = {
    getRecordSeriesMulti: jest.fn(async () => rows),
  };
  const activityService = {
    getActivityByHashId: jest.fn(async () => ({
      id: 42,
      userId: 'user-1',
      sportType: $Enums.SportType.RUN,
      timezone: 'UTC',
    })),
  };
  const prisma = {
    activityCalculatedPower: {
      findUnique: jest.fn(async () => calculatedSummary),
    },
  };
  const pmc = {
    sumLoadBySport: jest.fn(async () => ({
      dailyValue: 0,
      runningValue: 0,
      cyclingValue: 0,
      swimmingValue: 0,
    })),
  };
  const service = new ChartsService(
    sensorDataService as never,
    {} as never,
    activityService as never,
    prisma as never,
    {} as never,
    { t: jest.fn(() => 'not found') } as never,
    pmc as never,
    {} as never,
  );
  return { service, sensorDataService };
}

describe('ChartsService power source selection', () => {
  it('uses calculatedPower when measured coverage is below 50%', async () => {
    const { service, sensorDataService } = createService([
      { time: '1', power: 250, calculatedPower: 120 },
      { time: '2', calculatedPower: 130 },
      { time: '3', calculatedPower: 140 },
    ]);

    const result = await service.executeChartForActivity('activity-1', 'power');

    expect(sensorDataService.getRecordSeriesMulti).toHaveBeenCalledWith(
      42,
      ['power', 'calculatedPower'],
      'UTC',
    );
    expect(result.metadata).toMatchObject({
      powerSource: 'CALCULATED',
      measuredCoverage: 0.3333,
      avg: 130,
      calculatedPowerModel: 'GRIBBLE',
      calculatedPowerModelVersion: 1,
    });
    expect(result.rows[0]).toMatchObject({ power: 250, calculatedPower: 120 });
  });

  it('keeps measured power authoritative at 50% coverage', async () => {
    const { service } = createService(
      [
        { time: '1', power: 250, calculatedPower: 120 },
        { time: '2', power: 270, calculatedPower: 130 },
        { time: '3', calculatedPower: 140 },
        { time: '4', calculatedPower: 150 },
      ],
      null,
    );

    const result = await service.executeChartForActivity('activity-1', 'power');

    expect(result.metadata).toMatchObject({
      powerSource: 'MEASURED',
      measuredCoverage: 0.5,
      avg: 260,
    });
    expect(result.metadata.calculatedPowerModel).toBeUndefined();
  });

  it('counts zero watts as measured power and ignores a stale calculated summary', async () => {
    const { service } = createService([
      { time: '1', power: 0, calculatedPower: 120 },
      { time: '2', power: 0, calculatedPower: 130 },
      { time: '3', power: 250, calculatedPower: 140 },
      { time: '4', calculatedPower: 150 },
    ]);

    const result = await service.executeChartForActivity('activity-1', 'power');

    expect(result.metadata).toMatchObject({
      powerSource: 'MEASURED',
      measuredCoverage: 0.75,
      min: 0,
      max: 250,
      avg: 83.33,
      count: '3',
    });
    expect(result.metadata.calculatedPowerModel).toBeUndefined();
  });
});

describe('ChartsService running dynamics derivation', () => {
  it('uses recorded step length and otherwise derives it from speed and cadence', async () => {
    const { service } = createService([
      {
        time: '2026-08-01 08:00:00',
        stepLength: 1050,
        speed: 3,
        cadence: 90,
      },
      {
        time: '2026-08-01 08:00:01',
        speed: 3,
        cadence: 90,
      },
    ]);

    const result = await service.executeChartForActivity(
      'activity-1',
      'stepLength',
    );

    expect(result.rows).toEqual([
      expect.objectContaining({ stepLength: 1050 }),
      expect.objectContaining({ stepLength: 1000 }),
    ]);
  });

  it('uses recorded vertical ratio and derives it from oscillation and step length when absent', async () => {
    const { service, sensorDataService } = createService([
      {
        time: '2026-08-01 08:00:00',
        distance: '0',
        verticalRatio: 7.8,
        verticalOscillation: 80,
        stepLength: 1000,
      },
      {
        time: '2026-08-01 08:00:01',
        distance: '3',
        verticalOscillation: 82,
        stepLength: 1000,
      },
    ]);

    const result = await service.executeChartForActivity(
      'activity-1',
      'verticalRatio',
    );

    expect(sensorDataService.getRecordSeriesMulti).toHaveBeenCalledWith(
      42,
      [
        'verticalRatio',
        'verticalOscillation',
        'stepLength',
        'speed',
        'cadence',
      ],
      'UTC',
    );
    expect(result.rows).toEqual([
      expect.objectContaining({ verticalRatio: 7.8 }),
      expect.objectContaining({ verticalRatio: 8.2 }),
    ]);
    expect(result.metadata).toMatchObject({ avg: 8, derived: 1 });
  });

  it('derives flight time and flight ratio from cadence and ground contact time', async () => {
    const sourceRows = [
      {
        time: '2026-08-01 08:00:00',
        distance: '0',
        cadence: 90,
        stanceTime: 250,
      },
    ];
    const { service } = createService(sourceRows);

    const flightTime = await service.executeChartForActivity(
      'activity-1',
      'flightTime',
    );
    const flightRatio = await service.executeChartForActivity(
      'activity-1',
      'flightRatio',
    );

    expect(flightTime.rows[0]).toMatchObject({ flightTime: 83.33 });
    expect(flightRatio.rows[0]).toMatchObject({ flightRatio: 25 });
  });

  it('prefers recorded stance percentage when deriving flight ratio', async () => {
    const { service } = createService([
      {
        time: '2026-08-01 08:00:00',
        cadence: 90,
        stanceTime: 250,
        stanceTimePercent: 70,
      },
    ]);

    const result = await service.executeChartForActivity(
      'activity-1',
      'flightRatio',
    );

    expect(result.rows[0]).toMatchObject({ flightRatio: 30 });
  });

  it('prefers recorded cumulative cycles for total steps', async () => {
    const { service } = createService([
      { time: '2026-08-01 08:00:00', totalCycles: 1 },
      { time: '2026-08-01 08:00:01', totalCycles: 90 },
    ]);

    const result = await service.executeChartForActivity(
      'activity-1',
      'totalSteps',
    );

    expect(result.metadata).toMatchObject({
      sum: 180,
      source: 'RECORDED_CYCLES',
    });
  });

  it('integrates total steps over timestamped cadence samples', async () => {
    const { service } = createService([
      { time: '2026-08-01 08:00:00', distance: '0', cadence: 90 },
      { time: '2026-08-01 08:00:01', distance: '3', cadence: 90 },
      { time: '2026-08-01 08:00:02', distance: '6', cadence: 90 },
    ]);

    const result = await service.executeChartForActivity(
      'activity-1',
      'totalSteps',
    );

    expect(result.metadata).toMatchObject({ sum: 6, max: 6, derived: 1 });
    expect(result.rows.at(-1)).toMatchObject({ totalSteps: 6 });
  });
});

describe('ChartsService weekPressure', () => {
  it('loads both weeks with two activity aggregates and two PMC aggregates', async () => {
    const sumLoadBySport = jest.fn(async () => ({
      dailyValue: 10,
      runningValue: 42,
      cyclingValue: 7,
      swimmingValue: 0,
    }));
    const aggregate = jest.fn(async () => ({
      _count: { _all: 3 },
      _sum: {
        elapsedTime: 3600,
        distance: 10000,
        ascent: 120,
        calories: 600,
      },
      _avg: { avgSpeed: 3.2, avgPower: 210, avgHeartRate: 148 },
    }));
    const service = new ChartsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { t: jest.fn(() => 'not found') } as never,
      { sumLoadBySport } as never,
      { aggregate } as never,
    );

    const result = await service.getWeeklySummaryPair('user-1', {
      end: '2026-08-16',
      sportType: 'RUN',
    });

    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(sumLoadBySport).toHaveBeenCalledTimes(2);
    expect(result.weekCount).toEqual({ current: 3, previous: 3 });
    expect(result.weekPower).toEqual({ current: 210, previous: 210 });
    expect(result.weekPressure.current).toBe(42);
    expect(result.weekPressure.previous).toBe(42);
  });
});
