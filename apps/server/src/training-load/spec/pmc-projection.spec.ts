import { describe, expect, it } from '@jest/globals';
import {
  advancePmc,
  dayDistance,
  projectPmc,
  shiftPmcDay,
  type PmcProjectionInputs,
} from '../pmc-projection';

function input(
  overrides: Partial<PmcProjectionInputs> = {},
): PmcProjectionInputs {
  const loads = new Map<string, number | null>();
  for (let i = 1; i <= 90; i++) loads.set(shiftPmcDay('2026-11-11', -i), 60);
  loads.set('2026-11-11', 20);
  return {
    today: '2026-11-11',
    scenario: 'AUTO',
    historyStart: '2026-08-01',
    loads,
    plans: new Map(),
    yesterday: { ctl: 45, atl: 50 },
    baselineMissing: false,
    ...overrides,
  };
}

describe('conditional PMC projection', () => {
  it('preserves the exact exponential time constants and the TSB identity', () => {
    const next = advancePmc(45, 50, 0);
    expect(next.ctl).toBeCloseTo(45 * Math.exp(-1 / 42), 12);
    expect(next.atl).toBeCloseTo(50 * Math.exp(-1 / 7), 12);
    expect(next.tsb).toBe(next.ctl - next.atl);
  });
  it('uses a calendar horizon across DST transitions, not 24-hour local increments', () => {
    expect(shiftPmcDay('2026-03-07', 2)).toBe('2026-03-09');
    expect(dayDistance('2026-10-31', '2026-11-02')).toBe(2);
  });
  it('converges to constant load without independently forecasting form', () => {
    let state = { ctl: 0, atl: 0, tsb: 0 };
    for (let i = 0; i < 1500; i++) state = advancePmc(state.ctl, state.atl, 60);
    expect(state.ctl).toBeCloseTo(60, 10);
    expect(state.atl).toBeCloseTo(60, 10);
    expect(state.tsb).toBeCloseTo(0, 10);
  });
  it('can project without a plan, retaining weekday habits and today’s completed training', () => {
    const result = projectPmc(input());
    expect(result.availability).toBe('READY');
    expect(result.basis).toBe('HABIT');
    expect(result.todayProjection?.load).toBe(60); // Not 60 + the completed 20.
    expect(result.todayProjection?.habitLoad).toBe(40);
    expect(result.forecast).toHaveLength(28);
    expect(result.forecast.at(-1)?.date).toBe('2026-12-09');
    expect(
      result.forecast.every((point) => point.tsb === point.ctl! - point.atl!),
    ).toBe(true);
  });
  it('computes days 29 and 30 when a detail dialog requests a month', () => {
    const result = projectPmc(input({ scenario: 'REST', forecastDays: 30 }));
    const start = advancePmc(45, 50, 20);
    expect(result.forecast).toHaveLength(30);
    expect(result.availability).toBe('READY');
    expect(result.forecast.at(-1)?.date).toBe('2026-12-11');
    expect(result.forecast.at(-1)?.ctl).toBeCloseTo(
      start.ctl * Math.exp(-30 / 42),
      12,
    );
    expect(result.forecast.at(-1)?.atl).toBeCloseTo(
      start.atl * Math.exp(-30 / 7),
      12,
    );
  });
  it('overrides, rather than adds, habit load on a scheduled day and preserves explicit zero', () => {
    const result = projectPmc(
      input({
        plans: new Map([
          ['2026-11-11', { load: 100, approximate: false }],
          ['2026-11-12', { load: 0, approximate: false }],
        ]),
      }),
    );
    expect(result.todayProjection?.load).toBe(120);
    expect(result.forecast[0]).toMatchObject({
      basis: 'PLAN',
      load: 0,
      habitLoad: null,
    });
    expect(result.basis).toBe('MIXED');
  });
  it('never replaces an unknown plan load with habits or bridges it with zero', () => {
    const result = projectPmc(
      input({
        plans: new Map([['2026-11-13', { load: null, approximate: false }]]),
      }),
    );
    expect(result.availability).toBe('PARTIAL');
    expect(result.coverage.projectedDays).toBe(1);
    expect(result.forecast[1]).toMatchObject({ load: null, ctl: null });
    expect(result.forecast[2]).toMatchObject({ load: 60, ctl: null });
    expect(result.issues).toContain('PLAN_LOAD_MISSING');
  });
  it('makes a pause an explicit scenario, retaining actual load already done today', () => {
    const result = projectPmc(input({ scenario: 'REST' }));
    const start = advancePmc(45, 50, 20);
    const end = result.forecast.at(-1)!;
    expect(end.ctl).toBeCloseTo(start.ctl * Math.exp(-28 / 42), 12);
    expect(end.atl).toBeCloseTo(start.atl * Math.exp(-28 / 7), 12);
    expect(end.tsb).toBeGreaterThan(start.tsb);
    expect(end.ctl).toBeLessThan(start.ctl);
  });
  it('withholds a precise future baseline when actual load is missing or history is short', () => {
    for (const args of [
      { baselineMissing: true },
      { historyStart: '2026-11-10' },
    ]) {
      const result = projectPmc(input({ scenario: 'REST', ...args }));
      expect(result.availability).toBe('UNAVAILABLE');
      expect(result.forecast.every((point) => point.ctl === null)).toBe(true);
    }
  });
  it('ignores plans in HABIT mode and will not extend long-stale training habits', () => {
    const recent = input({
      scenario: 'HABIT',
      plans: new Map([['2026-11-12', { load: 300, approximate: false }]]),
    });
    expect(projectPmc(recent).forecast[0].load).toBe(60);
    for (let i = 1; i <= 20; i++)
      recent.loads.set(shiftPmcDay(recent.today, -i), 0);
    const result = projectPmc(recent);
    expect(result.availability).toBe('UNAVAILABLE');
    expect(result.issues).toContain('STALE_HISTORY');
  });
  it('does not turn sparse training on different weekdays into a zero-load habit', () => {
    const loads = new Map<string, number | null>([
      ['2026-10-13', 60],
      ['2026-10-21', 70],
      ['2026-10-29', 80],
      ['2026-11-06', 90],
    ]);
    const result = projectPmc(input({ loads, scenario: 'HABIT' }));
    expect(result.issues).toContain('IRREGULAR_HISTORY');
    expect(result.availability).toBe('UNAVAILABLE');
    expect(result.forecast.every((point) => point.load === null)).toBe(true);
  });
  it('preserves an unknown actual load in today’s projection even in the pause scenario', () => {
    const args = input({ scenario: 'REST' });
    args.loads.set(args.today, null);
    const result = projectPmc(args);
    expect(result.todayProjection).toMatchObject({
      load: null,
      ctl: null,
      atl: null,
      tsb: null,
    });
    expect(result.issues).toContain('ACTUAL_LOAD_MISSING');
    expect(result.availability).toBe('UNAVAILABLE');
  });
});
