import type {
  PmcProjectionIssue,
  PmcProjectionPoint,
  PmcProjectionResult,
  PmcProjectionScenario,
} from '@shared/pmc-projection';
import {
  currentTrainingStressBalance,
  nextExponentialLoad,
  PMC_ALGORITHM_VERSION,
  timeConstantDecayFactor,
} from './pmc-formula';

export const projectionModel = {
  version: `${PMC_ALGORITHM_VERSION}:projection-v1`,
  ctlTimeConstant: 42,
  atlTimeConstant: 7,
};
/** Calendar arithmetic, independent of DST and the host's timezone. */
export function shiftPmcDay(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const dayDistance = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );

export function advancePmc(ctl: number, atl: number, load: number) {
  const nextCtl = nextExponentialLoad(ctl, load, timeConstantDecayFactor(42));
  const nextAtl = nextExponentialLoad(atl, load, timeConstantDecayFactor(7));
  return {
    ctl: nextCtl,
    atl: nextAtl,
    tsb: currentTrainingStressBalance(nextCtl, nextAtl),
  };
}

export interface PmcProjectionInputs {
  today: string;
  scenario: PmcProjectionScenario;
  historyStart: string | null;
  /** Actual recorded loads. An absent day means no recorded activity; null is a known gap. */
  loads: Map<string, number | null>;
  plans: Map<string, { load: number | null; approximate: boolean }>;
  yesterday: { ctl: number; atl: number };
  baselineMissing: boolean;
  baselineVersionMismatch?: boolean;
}

/** Conditional load projection. No fitting, account writes, or independent TSB prediction. */
export function projectPmc(
  input: PmcProjectionInputs,
): Pick<
  PmcProjectionResult,
  | 'availability'
  | 'basis'
  | 'todayProjection'
  | 'forecast'
  | 'coverage'
  | 'issues'
> {
  const { today, loads, plans, scenario, historyStart } = input;
  const issues = new Set<PmcProjectionIssue>();
  const historyDays = historyStart
    ? Math.max(0, dayDistance(historyStart, today))
    : 0;
  const weekStart = shiftPmcDay(today, -((weekday(today) + 6) % 7));
  const habitStart = shiftPmcDay(weekStart, -28);
  const habit = new Map<number, number>();
  let habitEligible = !!historyStart && historyStart <= habitStart;
  let latestTraining: string | null = null;
  for (let day = habitStart; day < today; day = shiftPmcDay(day, 1)) {
    if (loads.get(day) === null) habitEligible = false;
    if ((loads.get(day) ?? 0) > 0) latestTraining = day;
  }
  if (!latestTraining || dayDistance(latestTraining, today) > 14) {
    habitEligible = false;
    if (scenario !== 'REST') issues.add('STALE_HISTORY');
  }
  if (habitEligible) {
    for (let day = 0; day < 7; day++) {
      const values: number[] = [];
      for (
        let date = habitStart;
        date < weekStart;
        date = shiftPmcDay(date, 1)
      ) {
        if (weekday(date) === day) values.push(loads.get(date) ?? 0);
      }
      values.sort((a, b) => a - b);
      habit.set(day, (values[1] + values[2]) / 2);
    }
    // With irregular weekdays, all seven medians can be zero despite regular weekly training.
    // Do not silently turn "continue my habits" into "stop training".
    if ([...habit.values()].every((load) => load === 0) && latestTraining) {
      habitEligible = false;
      if (scenario !== 'REST') issues.add('IRREGULAR_HISTORY');
    }
  } else if (scenario !== 'REST') issues.add('INSUFFICIENT_HISTORY');
  const cold = historyDays < 42;
  if (cold) issues.add('COLD_START');
  if (input.baselineMissing) issues.add('ACTUAL_LOAD_MISSING');
  if (input.baselineVersionMismatch) issues.add('BASELINE_VERSION_MISMATCH');
  const blockedBaseline =
    cold || input.baselineMissing || input.baselineVersionMismatch;
  let state = input.yesterday;
  let blocked = blockedBaseline;
  let firstUnknownDate: string | null = null;
  let todayProjection: PmcProjectionPoint | null = null;
  const forecast: PmcProjectionPoint[] = [];
  // Today is advanced once from yesterday's seed, with completed load replacing linked plans.
  for (let i = 0; i <= 28; i++) {
    const date = shiftPmcDay(today, i);
    const actual = i === 0 && loads.has(today) ? loads.get(today)! : 0;
    const plan = plans.get(date);
    let load: number | null = null;
    let basis: PmcProjectionPoint['basis'] = 'UNKNOWN';
    if (actual === null) {
      issues.add('ACTUAL_LOAD_MISSING');
    } else if (scenario === 'REST') {
      load = actual;
      basis = 'REST';
    } else if (scenario === 'AUTO' && plan) {
      load = plan.load === null ? null : actual + plan.load;
      basis = 'PLAN';
      if (load === null) issues.add('PLAN_LOAD_MISSING');
      if (plan.approximate) issues.add('APPROXIMATE_PLAN_LOAD');
    } else if (habitEligible) {
      load = Math.max(actual, habit.get(weekday(date))!);
      basis = 'HABIT';
    } else if (i === 0 && actual > 0) {
      // Current recorded load is a lower bound, not evidence that the day is complete.
      load = null;
    }
    if (load === null) {
      blocked = true;
      firstUnknownDate ??= date;
      if (!plan || scenario !== 'AUTO') issues.add('UNSCHEDULED_DAYS');
    }
    if (!blocked && load !== null)
      state = advancePmc(state.ctl, state.atl, load);
    const point: PmcProjectionPoint = {
      date,
      load,
      basis,
      ctl: blocked ? null : state.ctl,
      atl: blocked ? null : state.atl,
      tsb: blocked ? null : currentTrainingStressBalance(state.ctl, state.atl),
      plannedLoad: basis === 'PLAN' ? plan!.load : null,
      habitLoad:
        basis === 'HABIT'
          ? i === 0
            ? Math.max(0, load! - (actual ?? 0))
            : load
          : null,
    };
    if (i === 0) todayProjection = point;
    else forecast.push(point);
  }
  const projectedDays = forecast.filter((point) => point.ctl !== null).length;
  const planDays = forecast.filter((point) => point.basis === 'PLAN').length;
  const habitDays = forecast.filter((point) => point.basis === 'HABIT').length;
  const unknownDays = forecast.filter((point) => point.load === null).length;
  return {
    availability:
      projectedDays === 28
        ? 'READY'
        : projectedDays
          ? 'PARTIAL'
          : 'UNAVAILABLE',
    basis:
      scenario === 'REST'
        ? 'REST'
        : planDays && habitDays
          ? 'MIXED'
          : planDays
            ? 'PLAN'
            : habitDays
              ? 'HABIT'
              : 'UNKNOWN',
    todayProjection,
    forecast,
    coverage: {
      historyStart,
      historyDays,
      planDays,
      habitDays,
      unknownDays,
      projectedDays,
      firstUnknownDate,
    },
    issues: [...issues],
  };
}
