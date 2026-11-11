import type {
  VdotForecastArtifact,
  VdotForecastParameters,
} from '@shared/vdot-forecast';
import {
  isValidatedVdotArtifact,
  predictVdotWeeks,
  prepareVdotHistory,
  shiftVdotDate,
  vdotMedian,
  VDOT_FORECAST_VERSION,
  type VdotObservation,
} from './vdot-forecast';
import { calculateTimeDecay } from './time-decay';

export type VdotTrainingSeries = {
  id: string;
  observations: VdotObservation[];
};
export type VdotTrainingDates = {
  selectionStart: string;
  trainingEnd: string;
  calibrationEnd: string;
  testEnd: string;
};
type Example = {
  id: string;
  cutoff: string;
  history: ReturnType<typeof prepareVdotHistory>;
  actual: Array<number | null>;
  latest: number;
  smoothed: number;
};

function quantile(values: number[], probability: number) {
  if (!values.length) throw new Error('VDOT_TRAINING_EMPTY_PARTITION');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.ceil(probability * (sorted.length + 1)) - 1,
    )
  ];
}

function examples(series: VdotTrainingSeries[], dates: VdotTrainingDates) {
  const output: Example[] = [];
  for (const user of series) {
    const observations = [...user.observations].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (!observations.length) continue;
    const last = shiftVdotDate(dates.testEnd, -28);
    for (
      let cutoff = shiftVdotDate(observations[0].date, 83);
      cutoff <= last;
      cutoff = shiftVdotDate(cutoff, 7)
    ) {
      const history = prepareVdotHistory(observations, cutoff);
      if (history.status !== 'READY') continue;
      const actual = Array.from({ length: 4 }, (_, index) => {
        const start = shiftVdotDate(cutoff, index * 7 + 1);
        const end = shiftVdotDate(cutoff, (index + 1) * 7);
        const rows = observations.filter(
          (point) => point.date >= start && point.date <= end,
        );
        if (
          !rows.length ||
          rows.some((row) => row.seriesKey !== history.seriesKey)
        )
          return null;
        const week = prepareVdotHistory(observations, end).weeks.at(-1)!;
        return week.value;
      });
      const valid = history.weeks.filter((week) => week.value !== null);
      const smoothed = calculateTimeDecay(
        valid.map((week) => ({ date: week.endDate, value: week.value! })),
        {
          decayDays: 40,
          truncationMultiple: 84 / 40,
          referenceDate: new Date(`${cutoff}T00:00:00Z`),
        },
      )!;
      output.push({
        id: user.id,
        cutoff,
        history,
        actual,
        latest: valid.at(-1)!.value!,
        smoothed,
      });
    }
  }
  return output;
}

type Score = {
  id: string;
  horizon: number;
  error: number;
  standardDeviation: number;
  baselineError: number;
};

function scoreExamples(
  cases: Example[],
  parameters: VdotForecastParameters,
  baseline: 'latest' | 'smoothed',
) {
  const scores: Score[] = [];
  for (const example of cases) {
    const prediction = predictVdotWeeks(example.history.weeks, parameters);
    example.actual.forEach((actual, horizon) => {
      if (actual === null) return;
      scores.push({
        id: example.id,
        horizon,
        error: actual - prediction.predictions[horizon].point,
        standardDeviation: prediction.predictions[horizon].standardDeviation,
        baselineError: actual - example[baseline],
      });
    });
  }
  return scores;
}

function userAverage(scores: Score[], value: (score: Score) => number) {
  const grouped = new Map<string, number[]>();
  for (const score of scores) {
    const points = grouped.get(score.id) ?? [];
    points.push(value(score));
    grouped.set(score.id, points);
  }
  const means = [...grouped.values()].map(
    (values) => values.reduce((sum, value) => sum + value, 0) / values.length,
  );
  if (!means.length) throw new Error('VDOT_TRAINING_EMPTY_PARTITION');
  return means.reduce((sum, value) => sum + value, 0) / means.length;
}

function intervalScore(error: number, width: number) {
  return 2 * width + 10 * Math.max(0, Math.abs(error) - width);
}

function differenceUpper95(scores: Score[]) {
  const ids = [...new Set(scores.map((score) => score.id))];
  const differences = ids.map((id) =>
    userAverage(
      scores.filter((score) => score.id === id),
      (score) => Math.abs(score.error) - Math.abs(score.baselineError),
    ),
  );
  let seed = 739391;
  const means = Array.from({ length: 1000 }, () => {
    let sum = 0;
    for (let index = 0; index < differences.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      sum += differences[Math.floor((seed / 4294967296) * differences.length)];
    }
    return sum / differences.length;
  });
  return quantile(means, 0.975);
}

export function trainVdotArtifact(
  series: VdotTrainingSeries[],
  dates: VdotTrainingDates,
) {
  const boundaries = [
    dates.selectionStart,
    dates.trainingEnd,
    dates.calibrationEnd,
    dates.testEnd,
  ];
  if (
    !boundaries.every(
      (date, index) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        shiftVdotDate(date, 0) === date &&
        (index === 0 || date > boundaries[index - 1]),
    )
  ) {
    throw new Error('VDOT_TRAINING_INVALID_DATES');
  }
  if (new Set(series.map((user) => user.id)).size !== series.length)
    throw new Error('VDOT_TRAINING_DUPLICATE_USER');
  const cases = examples(series, dates);
  const selection = cases.filter(
    (example) =>
      example.cutoff >= dates.selectionStart &&
      shiftVdotDate(example.cutoff, 28) <= dates.trainingEnd,
  );
  const calibration = cases.filter(
    (example) =>
      example.cutoff >= dates.trainingEnd &&
      shiftVdotDate(example.cutoff, 28) <= dates.calibrationEnd,
  );
  const testing = cases.filter(
    (example) =>
      example.cutoff >= dates.calibrationEnd &&
      shiftVdotDate(example.cutoff, 28) <= dates.testEnd,
  );
  const differences = series.flatMap((user) => {
    const weeks = prepareVdotHistory(
      user.observations,
      dates.selectionStart,
    ).weeks;
    return weeks
      .slice(1)
      .flatMap((week, index) =>
        week.value !== null && weeks[index].value !== null
          ? [Math.abs(week.value - weeks[index].value!)]
          : [],
      );
  });
  const observationVariance = Math.max(0.01, vdotMedian(differences) ** 2 / 2);
  if (!Number.isFinite(observationVariance))
    throw new Error('VDOT_TRAINING_INSUFFICIENT_HISTORY');
  let chosen: VdotForecastParameters | null = null;
  let bestError = Infinity;
  let baseline: 'latest' | 'smoothed' = 'latest';
  // Select the baseline using the same development origins as the model.
  const placeholder = {
    phi: 0.9,
    levelVariance: 0.01,
    trendVariance: 0.001,
    observationVariance,
  };
  const baselineCases = scoreExamples(selection, placeholder, 'latest').filter(
    (score) => score.horizon === 3,
  );
  const smoothedCases = scoreExamples(
    selection,
    placeholder,
    'smoothed',
  ).filter((score) => score.horizon === 3);
  if (
    userAverage(smoothedCases, (score) => Math.abs(score.baselineError)) <
    userAverage(baselineCases, (score) => Math.abs(score.baselineError))
  )
    baseline = 'smoothed';
  for (const phi of [0.8, 0.9, 0.98]) {
    for (const levelRatio of [0.01, 0.1]) {
      for (const trendRatio of [0.001, 0.01]) {
        const parameters = {
          phi,
          observationVariance,
          levelVariance: observationVariance * levelRatio,
          trendVariance: observationVariance * trendRatio,
        };
        const scores = scoreExamples(selection, parameters, baseline).filter(
          (score) => score.horizon === 3,
        );
        const error = userAverage(scores, (score) => Math.abs(score.error));
        if (error < bestError) {
          chosen = parameters;
          bestError = error;
        }
      }
    }
  }
  if (!chosen) throw new Error('VDOT_TRAINING_NO_MODEL');
  const calibrationScores = scoreExamples(calibration, chosen, baseline);
  const testingScores = scoreExamples(testing, chosen, baseline);
  const intervalScales = Array.from({ length: 4 }, (_, horizon) =>
    Math.max(
      0.001,
      quantile(
        calibrationScores
          .filter((score) => score.horizon === horizon)
          .map((score) => Math.abs(score.error) / score.standardDeviation),
        0.8,
      ),
    ),
  );
  const baselineWidths = Array.from({ length: 4 }, (_, horizon) =>
    quantile(
      calibrationScores
        .filter((score) => score.horizon === horizon)
        .map((score) => Math.abs(score.baselineError)),
      0.8,
    ),
  );
  const byHorizon = Array.from({ length: 4 }, (_, horizon) =>
    testingScores.filter((score) => score.horizon === horizon),
  );
  const artifact: VdotForecastArtifact = {
    schemaVersion: 1,
    modelVersion: `${VDOT_FORECAST_VERSION}-${dates.testEnd}`,
    trainedThrough: dates.testEnd,
    parameters: chosen,
    intervalScales,
    validation: {
      users: new Set(byHorizon[3].map((score) => score.id)).size,
      counts: byHorizon.map((scores) => scores.length),
      mae: byHorizon.map((scores) =>
        userAverage(scores, (score) => Math.abs(score.error)),
      ),
      baselineMae: byHorizon.map((scores) =>
        userAverage(scores, (score) => Math.abs(score.baselineError)),
      ),
      coverage80: byHorizon.map((scores, index) =>
        userAverage(scores, (score) =>
          Number(
            Math.abs(score.error) <=
              intervalScales[index] * score.standardDeviation,
          ),
        ),
      ),
      intervalScore: byHorizon.map((scores, index) =>
        userAverage(scores, (score) =>
          intervalScore(
            score.error,
            intervalScales[index] * score.standardDeviation,
          ),
        ),
      ),
      baselineIntervalScore: byHorizon.map((scores, index) =>
        userAverage(scores, (score) =>
          intervalScore(score.baselineError, baselineWidths[index]),
        ),
      ),
      pairedDifferenceUpper95: differenceUpper95(byHorizon[3]),
    },
  };
  return {
    artifact,
    passed: isValidatedVdotArtifact(artifact),
    baseline,
    partitions: {
      selection: selection.length,
      calibration: calibration.length,
      testing: testing.length,
    },
    dates,
  };
}
