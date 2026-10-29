export type TimedValueSample = { tMs: number; value: number | null };

export const DEFAULT_MAX_OBSERVATION_GAP_SECONDS = 10;
export const STANDARD_PEAK_DURATIONS: Record<string, number> = {
  '1s': 1,
  '5s': 5,
  '10s': 10,
  '20s': 20,
  '30s': 30,
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '10m': 600,
  '20m': 1200,
  '30m': 1800,
  '60m': 3600,
  '2h': 7200,
  '3h': 10800,
  '6h': 21600,
};

export type ObservedTimeline = {
  values: Array<number | null>;
  durationSec: number;
  coveredSeconds: number;
};

export type BestObservedWindow = {
  value: number;
  startMs: number;
  endMs: number;
  durationSec: number;
  coveredSeconds: number;
  coverageRatio: number;
};

/**
 * Resample observations to wall-clock seconds without bridging pauses or long
 * recording gaps. The left sample describes the interval until the next
 * sample; zero is a valid observation and null remains unknown.
 */
export function resampleObservedValues(
  samples: TimedValueSample[],
  maxGapSeconds = DEFAULT_MAX_OBSERVATION_GAP_SECONDS,
): ObservedTimeline {
  const ordered = [...samples]
    .filter((sample) => Number.isFinite(sample.tMs))
    .sort((a, b) => a.tMs - b.tMs)
    .filter(
      (sample, index, rows) => index === 0 || sample.tMs > rows[index - 1].tMs,
    );
  if (ordered.length < 2) {
    return { values: [], durationSec: 0, coveredSeconds: 0 };
  }

  const startMs = ordered[0].tMs;
  const durationSec = Math.max(
    0,
    Math.floor((ordered[ordered.length - 1].tMs - startMs) / 1000),
  );
  const values: Array<number | null> = new Array(durationSec).fill(null);
  let sampleIndex = 0;
  for (let second = 0; second < durationSec; second++) {
    const atMs = startMs + second * 1000;
    while (
      sampleIndex + 1 < ordered.length &&
      ordered[sampleIndex + 1].tMs <= atMs
    ) {
      sampleIndex++;
    }
    const current = ordered[sampleIndex];
    const next = ordered[sampleIndex + 1];
    if (!next) continue;
    const gapSeconds = (next.tMs - current.tMs) / 1000;
    if (
      gapSeconds <= 0 ||
      gapSeconds > maxGapSeconds ||
      current.value == null ||
      !Number.isFinite(current.value)
    ) {
      continue;
    }
    values[second] = current.value;
  }

  return {
    values,
    durationSec,
    coveredSeconds: values.reduce(
      (count, value) => count + (value == null ? 0 : 1),
      0,
    ),
  };
}

export function averageKnownValues(values: Array<number | null>): number {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    sum += value;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** Fourth-power normalized value using only complete observed windows. */
export function computeNormalizedRollingValue(
  values: Array<number | null>,
  windowSeconds = 30,
): { value: number; completeWindows: number } {
  const window = Math.max(1, Math.round(windowSeconds));
  if (values.length < window) return { value: 0, completeWindows: 0 };

  let sum = 0;
  let missing = 0;
  let fourthPowerSum = 0;
  let completeWindows = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value == null || !Number.isFinite(value)) missing++;
    else sum += value;
    if (index >= window) {
      const removed = values[index - window];
      if (removed == null || !Number.isFinite(removed)) missing--;
      else sum -= removed;
    }
    if (index >= window - 1 && missing === 0) {
      fourthPowerSum += Math.pow(sum / window, 4);
      completeWindows++;
    }
  }
  return {
    value:
      completeWindows > 0
        ? Math.pow(fourthPowerSum / completeWindows, 0.25)
        : 0,
    completeWindows,
  };
}

/**
 * Finds maximum time-window averages on the same observed timeline contract.
 * A candidate is accepted only when every second in the requested window is
 * known, so pauses and recording gaps can never inflate a peak.
 */
export function computeMaxMeanObservedWindows(
  samples: TimedValueSample[],
  durations: Record<string, number>,
  maxGapSeconds = DEFAULT_MAX_OBSERVATION_GAP_SECONDS,
): Record<string, BestObservedWindow | undefined> {
  const validTimes = samples
    .map((sample) => sample.tMs)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const startMs = validTimes[0];
  const timeline = resampleObservedValues(samples, maxGapSeconds);
  const result: Record<string, BestObservedWindow | undefined> = {};
  if (startMs == null) return result;

  for (const [key, requestedDuration] of Object.entries(durations)) {
    const durationSec = Math.max(1, Math.round(requestedDuration));
    if (timeline.values.length < durationSec) {
      result[key] = undefined;
      continue;
    }
    let sum = 0;
    let missing = 0;
    let bestValue = -Infinity;
    let bestStart = -1;
    for (let index = 0; index < timeline.values.length; index++) {
      const value = timeline.values[index];
      if (value == null || !Number.isFinite(value)) missing++;
      else sum += value;
      if (index >= durationSec) {
        const removed = timeline.values[index - durationSec];
        if (removed == null || !Number.isFinite(removed)) missing--;
        else sum -= removed;
      }
      if (index >= durationSec - 1 && missing === 0) {
        const average = sum / durationSec;
        if (average > bestValue) {
          bestValue = average;
          bestStart = index - durationSec + 1;
        }
      }
    }
    result[key] =
      bestStart >= 0
        ? {
            value: bestValue,
            startMs: startMs + bestStart * 1000,
            endMs: startMs + (bestStart + durationSec) * 1000,
            durationSec,
            coveredSeconds: durationSec,
            coverageRatio: 1,
          }
        : undefined;
  }
  return result;
}
