import { describe, expect, it, jest } from '@jest/globals';
import { PmcProjectionService } from '../pmc-projection.service';

function fixture() {
  const pmc = {
    findMany: jest.fn(async () => [
      {
        date: new Date('2026-08-12T00:00:00Z'),
        CTL: 45,
        ATL: 50,
        version: '2.0-exponential-time-constant',
        runningValue: 40,
        cyclingValue: 10,
        swimmingValue: 0,
      },
    ]),
    findFirst: jest.fn(async () => ({
      date: new Date('2026-01-01T00:00:00Z'),
    })),
  };
  const activities = {
    findMany: jest.fn(async () => [
      {
        id: 1,
        startTime: new Date('2026-11-11T01:00:00Z'),
        elapsedTime: 3600,
        timerTime: 3600,
        timezone: 'Asia/Shanghai',
        fitnessMetricsSnapshot: { pmcLocalDate: '2026-11-11' },
      },
    ]),
  };
  const readouts = new Map([
    [1, { actualLoad: 30, actualLoadSource: 'POWER' }],
  ]);
  const loads = { batchGetActualLoad: jest.fn(async () => readouts) };
  const plans = {
    list: jest.fn(async () => [
      {
        id: 'w',
        scheduledDate: new Date('2026-11-11T00:00:00Z'),
        estimatedLoad: 50,
        estimatedLoadSource: 'POWER',
        estimatedLoadInputs: {},
        estimatedLoadComputedAt: new Date(),
        links: [{ activityId: 1 }, { activityId: 1 }],
      },
    ]),
  };
  const users = { getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai') };
  const service = new PmcProjectionService(
    pmc as never,
    plans as never,
    activities as never,
    loads as never,
    users as never,
  );
  return { service, pmc, plans, activities, loads, readouts };
}

describe('PMC projection evidence service', () => {
  const now = new Date('2026-11-11T04:00:00Z');
  it('scopes actual, historical seed and planned reads to the signed-in athlete and selected sport', async () => {
    const f = fixture();
    const result = await f.service.get('athlete-a', { scope: 'RUN' }, now);
    expect(f.activities.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({ userId: 'athlete-a', sportType: 'RUN' }),
          ]),
        },
      }),
    );
    expect(f.pmc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'athlete-a' }),
        take: 8001,
      }),
    );
    expect(f.plans.list).toHaveBeenCalledWith(
      'athlete-a',
      new Date('2026-11-11T00:00:00Z'),
      new Date('2026-12-09T00:00:00Z'),
      'RUN',
    );
    expect(result.scope).toBe('RUN');
  });
  it('counts each actual activity once and subtracts linked completed load from the remaining plan', async () => {
    const f = fixture();
    const result = await f.service.get('athlete-a', {}, now);
    expect(result.current?.load).toBe(30);
    expect(result.todayProjection?.load).toBe(50);
    expect(result.todayProjection?.plannedLoad).toBe(20);
  });
  it('does not admit activities which finish after the as-of cutoff', async () => {
    const f = fixture();
    f.activities.findMany.mockResolvedValue([
      {
        id: 1,
        startTime: new Date('2026-11-11T03:30:00Z'),
        elapsedTime: 3600,
        timerTime: 3600,
        timezone: 'Asia/Shanghai',
        fitnessMetricsSnapshot: { pmcLocalDate: '2026-11-11' },
      },
    ]);
    const result = await f.service.get('athlete-a', {}, now);
    expect(result.current?.load).toBe(0);
    expect(f.loads.batchGetActualLoad).toHaveBeenCalledWith([]);
    expect(result.todayProjection?.plannedLoad).toBe(50);
  });
  it('preserves unknown actual load and stops metric projections', async () => {
    const f = fixture();
    f.readouts.set(1, {
      actualLoad: null as never,
      actualLoadSource: null as never,
    });
    const result = await f.service.get('athlete-a', { scenario: 'REST' }, now);
    expect(result.current?.load).toBeNull();
    expect(result.current?.ctl).toBeNull();
    expect(result.issues).toContain('ACTUAL_LOAD_MISSING');
    expect(result.availability).toBe('UNAVAILABLE');
  });
  it('withholds metrics when an all-sports historical seed uses an older formula', async () => {
    const f = fixture();
    const rows = await f.pmc.findMany();
    f.pmc.findMany.mockResolvedValue(
      rows.map((row) => ({ ...row, version: 'legacy' })),
    );
    const result = await f.service.get('athlete-a', { scenario: 'REST' }, now);
    expect(result.issues).toContain('BASELINE_VERSION_MISMATCH');
    expect(result.current?.load).toBe(30);
    expect(result.current?.ctl).toBeNull();
    expect(result.forecast.every((point) => point.ctl === null)).toBe(true);
  });
  it('uses a local calendar date and keeps a stable result reference when only the read timestamp changes', async () => {
    const f = fixture();
    const first = await f.service.get(
      'athlete-a',
      { scenario: 'REST' },
      new Date('2026-11-10T23:00:00Z'),
    );
    const second = await f.service.get(
      'athlete-a',
      { scenario: 'REST' },
      new Date('2026-11-10T23:01:00Z'),
    );
    expect(first.today).toBe('2026-11-11');
    expect(first.targetDate).toBe('2026-12-09');
    expect(first.asOf).not.toBe(second.asOf);
    expect(first.projectionId).toBe(second.projectionId);
  });
});
