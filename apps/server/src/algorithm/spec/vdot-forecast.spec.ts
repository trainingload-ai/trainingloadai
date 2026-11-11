import {
  calculateVdotForecast,
  isValidatedVdotArtifact,
  predictVdotWeeks,
  prepareVdotHistory,
  shiftVdotDate,
  VDOT_FORECAST_VERSION,
  type VdotObservation,
} from '../vdot-forecast';
import { trainVdotArtifact } from '../vdot-forecast-training';
import type { VdotForecastArtifact } from '@shared/vdot-forecast';

const cutoff = '2026-11-10';
const parameters = {
  phi: 0.9,
  levelVariance: 0.02,
  trendVariance: 0.002,
  observationVariance: 0.2,
};
const observations = (slope = 0): VdotObservation[] =>
  Array.from({ length: 36 }, (_, index) => ({
    date: shiftVdotDate(cutoff, -82 + index * 2),
    value: 43 + index * slope,
    source: 'FACTOR',
    seriesKey: 'factor-1',
  }));

function validatedFixture(): VdotForecastArtifact {
  return {
    schemaVersion: 1,
    modelVersion: `${VDOT_FORECAST_VERSION}-fixture`,
    trainedThrough: '2026-10-01',
    parameters,
    intervalScales: [1.4, 1.5, 1.6, 1.7],
    validation: {
      users: 60,
      counts: [250, 250, 250, 250],
      mae: [0.5, 0.5, 0.5, 0.5],
      baselineMae: [1, 1, 1, 1],
      coverage80: [0.8, 0.8, 0.8, 0.8],
      intervalScore: [2, 2, 2, 2],
      baselineIntervalScore: [3, 3, 3, 3],
      pairedDifferenceUpper95: -0.1,
    },
  };
}

describe('weekly VDOT forecasting', () => {
  it('keeps constant observations flat and adds observation noise to future intervals', () => {
    const rows = observations().concat([
      { date: cutoff, value: 43, source: 'FACTOR', seriesKey: 'factor-1' },
    ]);
    const result = calculateVdotForecast(rows, cutoff, validatedFixture());
    expect(result.status).toBe('READY');
    expect(result.forecasts).toHaveLength(4);
    for (const point of result.forecasts) {
      expect(point.point).toBeCloseTo(43, 10);
      expect(point.lower80).toBeLessThan(43);
      expect(point.upper80).toBeGreaterThan(43);
    }
    expect(result.forecasts[3].startDate).toBe('2026-12-02');
    expect(result.forecasts[3].endDate).toBe('2026-12-08');
  });

  it('retains missing calendar weeks and widens uncertainty without inventing zero observations', () => {
    const weeks = prepareVdotHistory(observations(), cutoff).weeks;
    const missing = weeks.map((week, index) =>
      index > 8 ? { ...week, value: null, observedDays: 0 } : week,
    );
    const regular = predictVdotWeeks(weeks, parameters);
    const sparse = predictVdotWeeks(missing, parameters);
    expect(sparse.predictions[3].point).toBeCloseTo(43);
    expect(sparse.predictions[3].standardDeviation).toBeGreaterThan(
      regular.predictions[3].standardDeviation,
    );
  });

  it('uses daily medians before weekly medians and isolates the newest correction segment', () => {
    const rows = observations().concat(
      Array.from({ length: 30 }, () => ({
        date: cutoff,
        value: 80,
        source: 'FACTOR' as const,
        seriesKey: 'factor-2',
      })),
    );
    const prepared = prepareVdotHistory(rows, cutoff);
    expect(prepared.status).toBe('INCOMPARABLE_HISTORY');
    expect(prepared.weeks.at(-1)).toMatchObject({ value: 80, observedDays: 1 });
    expect(prepared.weeks.filter((week) => week.value !== null)).toHaveLength(
      1,
    );
  });

  it('rejects stale, sparse and unvalidated data instead of exposing numerical forecasts', () => {
    expect(calculateVdotForecast(observations(), cutoff, null).status).toBe(
      'STALE_HISTORY',
    );
    expect(calculateVdotForecast([], cutoff, validatedFixture()).status).toBe(
      'INSUFFICIENT_HISTORY',
    );
    const fresh = observations().concat([
      { date: cutoff, value: 44, source: 'FACTOR', seriesKey: 'factor-1' },
    ]);
    expect(calculateVdotForecast(fresh, cutoff, null)).toMatchObject({
      status: 'MODEL_UNAVAILABLE',
      forecasts: [],
    });
    const invalid = validatedFixture();
    invalid.validation.users = 1;
    expect(isValidatedVdotArtifact(invalid)).toBe(false);
    expect(
      isValidatedVdotArtifact({
        ...validatedFixture(),
        parameters: { ...parameters, observationVariance: -1 },
      }),
    ).toBe(false);
  });

  it('excludes later observations and damps both upward and downward trends', () => {
    for (const slope of [-0.1, 0.1]) {
      const history = prepareVdotHistory(observations(slope), cutoff).weeks;
      const result = predictVdotWeeks(history, parameters);
      const changes = result.predictions.map(
        (point, index) =>
          point.point -
          (index === 0
            ? result.currentLevel
            : result.predictions[index - 1].point),
      );
      expect(Math.abs(changes[3])).toBeLessThan(Math.abs(changes[0]));
      expect(Math.sign(changes[0])).toBe(Math.sign(slope));
    }
    const before = prepareVdotHistory(observations(), cutoff);
    const after = prepareVdotHistory(
      [
        ...observations(),
        {
          date: shiftVdotDate(cutoff, 1),
          value: 90,
          source: 'RACE',
          seriesKey: 'future',
        },
      ],
      cutoff,
    );
    expect(after).toEqual(before);
  });

  it('trains deterministically with isolated time partitions and enforces the sample gate', () => {
    const series = Array.from({ length: 3 }, (_, user) => ({
      id: String(user),
      observations: Array.from({ length: 430 }, (_, day) => ({
        date: shiftVdotDate('2025-01-01', day),
        value: 40 + user + day * 0.005 + Math.sin(day) * 0.1,
        source: 'FACTOR' as const,
        seriesKey: 'one',
      })),
    }));
    const dates = {
      selectionStart: '2025-05-01',
      trainingEnd: '2025-08-01',
      calibrationEnd: '2025-11-01',
      testEnd: '2026-02-01',
    };
    const result = trainVdotArtifact(series, dates);
    expect(result.passed).toBe(false);
    expect(result.artifact.validation.users).toBe(3);
    expect(result.artifact.validation.baselineMae.every(Number.isFinite)).toBe(
      true,
    );
    expect(result.partitions.testing).toBeGreaterThan(0);
    expect(trainVdotArtifact(series, dates)).toEqual(result);
  });
});
