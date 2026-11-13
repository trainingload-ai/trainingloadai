import type {
  VdotForecastArtifact,
  VdotForecastParameters,
  VdotForecastStatus,
  VdotForecastWeek,
} from '@shared/vdot-forecast';

export const VDOT_FORECAST_VERSION = 'vdot-damped-weekly-v1';
export const VDOT_PERSONAL_FORECAST_VERSION = 'vdot-personal-weekly-v2';
const DAY_MS = 86_400_000;

export type VdotObservation = {
  date: string;
  value: number;
  source: 'FACTOR' | 'RACE';
  seriesKey: string;
};

export function shiftVdotDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function vdotMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function prepareVdotHistory(
  observations: VdotObservation[],
  cutoffDate: string,
) {
  const start = shiftVdotDate(cutoffDate, -83);
  const rows = observations
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        row.date >= start &&
        row.date <= cutoffDate &&
        Number.isFinite(row.value) &&
        row.value >= 10 &&
        row.value <= 100,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows.at(-1);
  let first = rows.length - 1;
  while (first > 0 && rows[first - 1].seriesKey === latest?.seriesKey) first--;
  const comparable = latest ? rows.slice(first) : [];
  const daily = new Map<string, number[]>();
  for (const row of comparable) {
    const values = daily.get(row.date) ?? [];
    values.push(row.value);
    daily.set(row.date, values);
  }
  const weeks: VdotForecastWeek[] = Array.from({ length: 12 }, (_, index) => {
    const endDate = shiftVdotDate(cutoffDate, (index - 11) * 7);
    const startDate = shiftVdotDate(endDate, -6);
    const values = [...daily]
      .filter(([date]) => date >= startDate && date <= endDate)
      .map(([, points]) => vdotMedian(points));
    return {
      startDate,
      endDate,
      value: values.length ? vdotMedian(values) : null,
      observedDays: values.length,
    };
  });
  let status: VdotForecastStatus = 'READY';
  if (
    weeks.filter((week) => week.value !== null).length < 6 ||
    daily.size < 8
  ) {
    status = first > 0 ? 'INCOMPARABLE_HISTORY' : 'INSUFFICIENT_HISTORY';
  } else if (latest && latest.date < shiftVdotDate(cutoffDate, -7)) {
    status = 'STALE_HISTORY';
  }
  return { status, weeks, latest, seriesKey: latest?.seriesKey ?? null };
}

type State = {
  level: number;
  trend: number;
  p00: number;
  p01: number;
  p11: number;
};

function advance(state: State, parameters: VdotForecastParameters): State {
  const { phi, levelVariance, trendVariance } = parameters;
  return {
    level: state.level + phi * state.trend,
    trend: phi * state.trend,
    p00: state.p00 + 2 * phi * state.p01 + phi ** 2 * state.p11 + levelVariance,
    p01: phi * state.p01 + phi ** 2 * state.p11,
    p11: phi ** 2 * state.p11 + trendVariance,
  };
}

export function predictVdotWeeks(
  weeks: VdotForecastWeek[],
  parameters: VdotForecastParameters,
  horizonWeeks = 4,
) {
  const first = weeks.findIndex((week) => week.value !== null);
  if (first < 0) throw new Error('VDOT_FORECAST_NO_OBSERVATIONS');
  const { observationVariance } = parameters;
  let state: State = {
    level: weeks[first].value!,
    trend: 0,
    p00: observationVariance,
    p01: 0,
    p11: observationVariance,
  };
  for (const week of weeks.slice(first + 1)) {
    state = advance(state, parameters);
    if (week.value === null) continue;
    const variance = state.p00 + observationVariance;
    const residual = week.value - state.level;
    const k0 = state.p00 / variance;
    const k1 = state.p01 / variance;
    state = {
      level: state.level + k0 * residual,
      trend: state.trend + k1 * residual,
      p00: (observationVariance * state.p00) / variance,
      p01: (observationVariance * state.p01) / variance,
      p11: Math.max(0, state.p11 - state.p01 ** 2 / variance),
    };
  }
  const currentLevel = state.level;
  const predictions = Array.from({ length: horizonWeeks }, () => {
    state = advance(state, parameters);
    return {
      point: state.level,
      standardDeviation: Math.sqrt(state.p00 + observationVariance),
    };
  });
  return { currentLevel, predictions };
}

export function isValidatedVdotArtifact(
  value: unknown,
): value is VdotForecastArtifact {
  const artifact = value as VdotForecastArtifact | null;
  if (
    !artifact ||
    artifact.schemaVersion !== 1 ||
    typeof artifact.modelVersion !== 'string' ||
    !artifact.modelVersion.startsWith(`${VDOT_FORECAST_VERSION}-`) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(artifact.trainedThrough ?? '')
  )
    return false;
  const parameters = artifact.parameters;
  if (
    !parameters ||
    !(parameters.phi > 0 && parameters.phi < 1) ||
    ![
      parameters.levelVariance,
      parameters.trendVariance,
      parameters.observationVariance,
    ].every((variance) => Number.isFinite(variance) && variance > 0)
  )
    return false;
  const validation = artifact.validation;
  const arrays = [
    artifact.intervalScales,
    validation?.counts,
    validation?.mae,
    validation?.baselineMae,
    validation?.coverage80,
    validation?.intervalScore,
    validation?.baselineIntervalScore,
  ];
  if (
    !arrays.every(
      (items) =>
        Array.isArray(items) &&
        items.length === 4 &&
        items.every((item) => Number.isFinite(item) && item >= 0),
    )
  )
    return false;
  if (
    artifact.intervalScales.some((scale) => scale <= 0) ||
    !Number.isInteger(validation.users) ||
    validation.users < 50 ||
    validation.counts.some(
      (count) => !Number.isInteger(count) || count < 200,
    ) ||
    !Number.isFinite(validation.pairedDifferenceUpper95) ||
    validation.pairedDifferenceUpper95 >= 0
  )
    return false;
  return validation.mae.every(
    (error, index) =>
      error <= validation.baselineMae[index] * (index === 3 ? 0.95 : 1.05) &&
      validation.coverage80[index] >= 0.75 &&
      validation.coverage80[index] <= 0.85 &&
      validation.intervalScore[index] <=
        validation.baselineIntervalScore[index],
  );
}

function emptyForecast(history: ReturnType<typeof prepareVdotHistory>) {
  return {
    ...history,
    currentLevel: null as number | null,
    dailyForecasts: [] as Array<{
      date: string;
      point: number;
      lower80: number;
      upper80: number;
    }>,
    forecasts: [] as Array<{
      week: number;
      startDate: string;
      endDate: string;
      point: number;
      lower80: number;
      upper80: number;
    }>,
  };
}

function forecastWithParameters(
  history: ReturnType<typeof prepareVdotHistory>,
  cutoffDate: string,
  parameters: VdotForecastParameters,
  intervalScales: number[],
  dailyHorizon = 0,
) {
  const result = predictVdotWeeks(
    history.weeks,
    parameters,
    Math.max(4, Math.ceil(dailyHorizon / 7)),
  );
  const forecasts = result.predictions.slice(0, 4).map((prediction, index) => {
    const width = prediction.standardDeviation * intervalScales[index];
    return {
      week: index + 1,
      startDate: shiftVdotDate(cutoffDate, index * 7 + 1),
      endDate: shiftVdotDate(cutoffDate, (index + 1) * 7),
      point: prediction.point,
      lower80: prediction.point - width,
      upper80: prediction.point + width,
    };
  });
  // Interpolate model-computed states; the fifth state supports days 29–30.
  const states = [
    { point: result.currentLevel, standardDeviation: 0 },
    ...result.predictions,
  ];
  const dailyForecasts = Array.from({ length: dailyHorizon }, (_, index) => {
    const day = index + 1;
    const left = Math.floor(day / 7);
    const fraction = day / 7 - left;
    const from = states[left],
      to = states[Math.ceil(day / 7)];
    const point = from.point + fraction * (to.point - from.point);
    const width =
      intervalScales.at(-1)! *
      Math.sqrt(
        (1 - fraction) * from.standardDeviation ** 2 +
          fraction * to.standardDeviation ** 2,
      );
    return {
      date: shiftVdotDate(cutoffDate, day),
      point,
      lower80: point - width,
      upper80: point + width,
    };
  });
  if (
    ![...forecasts, ...dailyForecasts].every(
      (point) =>
        [point.point, point.lower80, point.upper80].every(Number.isFinite) &&
        point.point >= 10 &&
        point.point <= 100 &&
        point.lower80 >= 0,
    )
  ) {
    return { ...emptyForecast(history), status: 'MODEL_UNAVAILABLE' as const };
  }
  return {
    ...history,
    currentLevel: result.currentLevel,
    forecasts,
    dailyForecasts,
  };
}

/** Fit only to this user's comparable, pre-cutoff weekly observations. */
function fitPersonalParameters(weeks: VdotForecastWeek[]) {
  const observed = weeks.flatMap((week, index) =>
    week.value === null ? [] : [{ index, value: week.value }],
  );
  const slopes = observed
    .slice(1)
    .map(
      (point, index) =>
        (point.value - observed[index].value) /
        (point.index - observed[index].index),
    );
  const typicalSlope = vdotMedian(slopes);
  const deviation = vdotMedian(
    slopes.map((slope) => Math.abs(slope - typicalSlope)),
  );
  // A robust scale estimate, with a non-zero floor for constant or rounded data.
  const observationVariance = Math.max(0.04, (1.4826 * deviation) ** 2 / 2);
  let bestError = Infinity;
  let chosen!: VdotForecastParameters;
  // Level-only is a real candidate: weak/noisy evidence need not imply a trend.
  for (const phi of [0, 0.8, 0.9, 0.98]) {
    for (const levelRatio of [0.01, 0.1, 1]) {
      for (const trendRatio of phi === 0 ? [0] : [0.001, 0.01]) {
        const parameters = {
          phi,
          observationVariance,
          levelVariance: observationVariance * levelRatio,
          trendVariance: observationVariance * trendRatio,
        };
        // Every validation target is forecast from earlier calendar weeks only.
        // The common variance scale cancels from the point predictions.
        const errors = observed.slice(3).map((point) => {
          const predicted = predictVdotWeeks(
            weeks.slice(0, point.index),
            parameters,
          );
          return Math.abs(predicted.predictions[0].point - point.value);
        });
        const error =
          errors.reduce((sum, value) => sum + value, 0) / errors.length;
        if (error < bestError) {
          bestError = error;
          chosen = parameters;
        }
      }
    }
  }
  return chosen;
}

/** Built-in personal trend model; its model-based range is not empirically calibrated. */
export function calculatePersonalVdotForecast(
  observations: VdotObservation[],
  cutoffDate: string,
) {
  const history = prepareVdotHistory(observations, cutoffDate);
  if (history.status !== 'READY')
    return { ...emptyForecast(history), parameters: null };
  const parameters = fitPersonalParameters(history.weeks);
  return {
    ...forecastWithParameters(
      history,
      cutoffDate,
      parameters,
      [1.281552, 1.281552, 1.281552, 1.281552],
      30,
    ),
    parameters,
  };
}

export function calculateVdotForecast(
  observations: VdotObservation[],
  cutoffDate: string,
  artifact: VdotForecastArtifact | null,
) {
  const history = prepareVdotHistory(observations, cutoffDate);
  if (history.status !== 'READY') return emptyForecast(history);
  if (!isValidatedVdotArtifact(artifact))
    return { ...emptyForecast(history), status: 'MODEL_UNAVAILABLE' as const };
  return forecastWithParameters(
    history,
    cutoffDate,
    artifact.parameters,
    artifact.intervalScales,
  );
}
