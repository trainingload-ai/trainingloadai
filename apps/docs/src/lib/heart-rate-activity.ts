/**
 * Ordinary-activity heart-rate estimates. Aligned with the product's
 * `lthr-activity-observation` integrator: basic recording quality is enough
 * to calculate. Maximal effort, a race, or a user-marked test start are
 * interpretation limits, not execution gates.
 *
 * LTHR: scan every complete 30-minute window on a 30-second step. Rank by the
 * last 20 minutes' time-weighted mean. Both the full window and the last 20
 * minutes need ≥95% heart-rate coverage, and the full window cannot contain
 * a gap over 30 seconds. Interpolation never crosses a dropout longer than
 * the sampling cadence (capped at 30 seconds). One qualifying window is enough.
 * An explicit window the user chooses replaces the automatic pick. The number
 * is an activity-based LTHR estimate. A finishing surge does not prove that
 * LTHR is higher, and a lower easy-day estimate does not prove it fell.
 *
 * Observed max HR: prefer a 1-second peak. Skip 0, negatives, and non-finite
 * samples. An isolated spike — a jump of more than 15 bpm above surrounding
 * samples that is not held for at least three samples spanning 2 seconds — is
 * excluded. The result is an observed peak, not a physiological maximum.
 * Only a peak above the current reference suggests that reference may be low.
 */

export type HeartRateSample = { seconds: number; heartRate: number | null };

export type FieldLthrResult = {
  valid: boolean;
  value: number | null;
  rawMean: number | null;
  checks: Array<{
    code: string;
    passed: boolean;
    observed?: number;
    required?: number;
  }>;
};

export type ObservedLthr = {
  value: number;
  rawMean: number;
  windowStartSec: number;
  windowEndSec: number;
  measureStartSec: number;
  measureEndSec: number;
  fullCoverageRatio: number;
  tailCoverageRatio: number;
  maxGapSeconds: number;
};

export type ObservedMaxHr = {
  bpm: number;
  instantaneous: boolean;
  sustainedSeconds: number;
};

export const LTHR_WINDOW_SECONDS = 1800;
export const LTHR_TAIL_SECONDS = 1200;
export const LTHR_SCAN_STEP_SECONDS = 30;
export const OBSERVED_MAX_HR_SPIKE_JUMP_BPM = 15;
export const OBSERVED_MAX_HR_MIN_SAMPLES = 3;
export const OBSERVED_MAX_HR_MIN_SPAN_SECONDS = 2;

const VALID_LTHR = (value: number | null) =>
  value != null && Number.isFinite(value) && value >= 30 && value <= 240;

function orderedSamples(samples: HeartRateSample[]) {
  return (
    samples.length >= 2 &&
    samples.every(
      (sample, index) =>
        Number.isFinite(sample.seconds) &&
        (index === 0 || sample.seconds > samples[index - 1].seconds),
    )
  );
}

/** Last-20-minute field LTHR for one 30-minute window starting at `start`. */
export function calculateFieldLthr(
  samples: HeartRateSample[],
  start: number,
  sampleSeconds = 1,
): FieldLthrResult {
  const end = start + LTHR_WINDOW_SECONDS;
  const checks: FieldLthrResult["checks"] = [];
  const ordered = orderedSamples(samples);
  checks.push({ code: "ORDERED_TIMESTAMPS", passed: ordered });
  const cadence =
    Number.isFinite(sampleSeconds) && sampleSeconds > 0 ? sampleSeconds : 1;
  const integrate = (from: number, to: number) => {
    let covered = 0;
    let integral = 0;
    let lastCovered = from;
    let maxGap = 0;
    for (let index = 0; index < samples.length - 1; index++) {
      const left = samples[index];
      const right = samples[index + 1];
      const lo = Math.max(from, left.seconds);
      const hi = Math.min(to, right.seconds);
      if (hi <= lo || !VALID_LTHR(left.heartRate) || !VALID_LTHR(right.heartRate)) {
        continue;
      }
      const dt = right.seconds - left.seconds;
      if (dt > Math.min(30, cadence * 1.5)) continue;
      maxGap = Math.max(maxGap, lo - lastCovered);
      const leftValue =
        left.heartRate! +
        ((right.heartRate! - left.heartRate!) * (lo - left.seconds)) / dt;
      const rightValue =
        left.heartRate! +
        ((right.heartRate! - left.heartRate!) * (hi - left.seconds)) / dt;
      integral += ((leftValue + rightValue) / 2) * (hi - lo);
      covered += hi - lo;
      lastCovered = hi;
    }
    maxGap = Math.max(maxGap, to - lastCovered);
    return {
      coverage: covered / (to - from),
      mean: covered > 0 ? integral / covered : null,
      maxGap,
    };
  };
  const full = ordered
    ? integrate(start, end)
    : { coverage: 0, mean: null, maxGap: LTHR_WINDOW_SECONDS };
  const tail = ordered
    ? integrate(start + (LTHR_WINDOW_SECONDS - LTHR_TAIL_SECONDS), end)
    : { coverage: 0, mean: null, maxGap: LTHR_TAIL_SECONDS };
  checks.push(
    {
      code: "FULL_COVERAGE",
      passed: full.coverage >= 0.95,
      observed: full.coverage,
      required: 0.95,
    },
    {
      code: "TAIL_COVERAGE",
      passed: tail.coverage >= 0.95,
      observed: tail.coverage,
      required: 0.95,
    },
    {
      code: "MAX_GAP_SECONDS",
      passed: full.maxGap <= 30,
      observed: full.maxGap,
      required: 30,
    },
  );
  return {
    valid: checks.every((check) => check.passed),
    value: tail.mean == null ? null : Math.round(tail.mean),
    rawMean: tail.mean,
    checks,
  };
}

function checkRatio(
  result: FieldLthrResult,
  code: string,
) {
  return result.checks.find((check) => check.code === code)?.observed ?? 0;
}

function toObserved(
  result: FieldLthrResult,
  start: number,
): ObservedLthr | null {
  if (!result.valid || result.value == null || result.rawMean == null) return null;
  return {
    value: result.value,
    rawMean: result.rawMean,
    windowStartSec: start,
    windowEndSec: start + LTHR_WINDOW_SECONDS,
    measureStartSec: start + (LTHR_WINDOW_SECONDS - LTHR_TAIL_SECONDS),
    measureEndSec: start + LTHR_WINDOW_SECONDS,
    fullCoverageRatio: checkRatio(result, "FULL_COVERAGE"),
    tailCoverageRatio: checkRatio(result, "TAIL_COVERAGE"),
    maxGapSeconds: checkRatio(result, "MAX_GAP_SECONDS"),
  };
}

/** User-selected 30-minute window. Explicit choice wins over the auto scan. */
export function estimateLthrAtWindow(
  samples: HeartRateSample[],
  start: number,
  sampleSeconds = 1,
): ObservedLthr | null {
  if (!Number.isFinite(start) || start < 0) return null;
  return toObserved(calculateFieldLthr(samples, start, sampleSeconds), start);
}

/**
 * Strongest quality-qualified 30-minute window in the recording.
 * Returns null when no window meets the coverage and gap rules.
 */
export function estimateActivityLthr(
  samples: HeartRateSample[],
  sampleSeconds = 1,
): ObservedLthr | null {
  if (!orderedSamples(samples)) return null;
  const firstSecond = Math.ceil(samples[0].seconds);
  const lastSecond = Math.floor(samples[samples.length - 1].seconds);
  const durationSeconds = lastSecond - firstSecond;
  if (durationSeconds < LTHR_WINDOW_SECONDS || durationSeconds > 100_000) {
    return null;
  }
  const cadence =
    Number.isFinite(sampleSeconds) && sampleSeconds > 0 ? sampleSeconds : 1;
  const maxInterpolationGap = Math.min(30, cadence * 1.5);
  const values: Array<number | null> = new Array(durationSeconds + 1).fill(null);
  let sourceIndex = 0;
  for (let offset = 0; offset <= durationSeconds; offset++) {
    const second = firstSecond + offset;
    while (
      sourceIndex + 1 < samples.length - 1 &&
      samples[sourceIndex + 1].seconds < second
    ) {
      sourceIndex++;
    }
    const left = samples[sourceIndex];
    const right = samples[Math.min(sourceIndex + 1, samples.length - 1)];
    if (left.seconds === right.seconds) {
      if (second === left.seconds && VALID_LTHR(left.heartRate)) {
        values[offset] = left.heartRate;
      }
      continue;
    }
    const gap = right.seconds - left.seconds;
    if (
      gap > maxInterpolationGap ||
      second < left.seconds ||
      second > right.seconds ||
      !VALID_LTHR(left.heartRate) ||
      !VALID_LTHR(right.heartRate)
    ) {
      continue;
    }
    values[offset] =
      left.heartRate! +
      ((right.heartRate! - left.heartRate!) * (second - left.seconds)) / gap;
  }
  const sumPrefix = new Float64Array(values.length + 1);
  const countPrefix = new Uint32Array(values.length + 1);
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    sumPrefix[index + 1] = sumPrefix[index] + (value ?? 0);
    countPrefix[index + 1] = countPrefix[index] + (value == null ? 0 : 1);
  }
  const approximate: Array<{ start: number; mean: number }> = [];
  for (
    let start = firstSecond;
    start + LTHR_WINDOW_SECONDS <= lastSecond;
    start += LTHR_SCAN_STEP_SECONDS
  ) {
    const fullFrom = start - firstSecond;
    const fullTo = fullFrom + LTHR_WINDOW_SECONDS;
    const tailFrom = fullFrom + (LTHR_WINDOW_SECONDS - LTHR_TAIL_SECONDS);
    const fullCount = countPrefix[fullTo] - countPrefix[fullFrom];
    const tailCount = countPrefix[fullTo] - countPrefix[tailFrom];
    if (
      fullCount < LTHR_WINDOW_SECONDS * 0.95 ||
      tailCount < LTHR_TAIL_SECONDS * 0.95
    ) {
      continue;
    }
    const tailSum = sumPrefix[fullTo] - sumPrefix[tailFrom];
    approximate.push({ start, mean: tailSum / tailCount });
  }
  approximate.sort((left, right) => right.mean - left.mean);
  let best: ObservedLthr | null = null;
  for (const candidate of approximate.slice(0, 32)) {
    const exact = toObserved(
      calculateFieldLthr(samples, candidate.start, cadence),
      candidate.start,
    );
    if (!exact) continue;
    if (!best || exact.rawMean > best.rawMean) best = exact;
  }
  return best;
}

function validPeak(value: number | null) {
  return value != null && Number.isFinite(value) && value >= 80 && value <= 240;
}

/**
 * Highest credible recorded heart rate.
 * A 1-second series is preferred over coarse window means.
 */
export function observeMaxHeartRate(
  samples: HeartRateSample[],
): ObservedMaxHr | null {
  if (!orderedSamples(samples)) return null;
  const points = samples.filter((sample) => validPeak(sample.heartRate));
  if (points.length === 0) return null;
  const instantaneous = points.filter((sample, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const nearPrevious =
      previous != null && sample.seconds - previous.seconds <= 1.5;
    const nearNext = next != null && next.seconds - sample.seconds <= 1.5;
    return nearPrevious || nearNext;
  });
  if (instantaneous.length === 0) {
    // Coarse samples are window means, not 1-second peaks. A spike shorter
    // than the sample interval cannot be seen, so report the highest reading.
    let best = points[0];
    for (const sample of points) {
      if (sample.heartRate! > best.heartRate!) best = sample;
    }
    return {
      bpm: Math.round(best.heartRate!),
      instantaneous: false,
      sustainedSeconds: 0,
    };
  }
  let best: { bpm: number; span: number } | null = null;
  for (const sample of instantaneous) {
    const near = instantaneous.filter(
      (other) =>
        Math.abs(other.heartRate! - sample.heartRate!) <= 8 &&
        Math.abs(other.seconds - sample.seconds) <=
          OBSERVED_MAX_HR_MIN_SPAN_SECONDS,
    );
    const span =
      near.length === 0
        ? 0
        : Math.max(...near.map((other) => other.seconds)) -
          Math.min(...near.map((other) => other.seconds));
    const sustained =
      near.length >= OBSERVED_MAX_HR_MIN_SAMPLES &&
      span >= OBSERVED_MAX_HR_MIN_SPAN_SECONDS;
    if (!sustained) continue;
    if (!best || sample.heartRate! > best.bpm) {
      best = { bpm: Math.round(sample.heartRate!), span };
    }
  }
  if (!best) return null;
  return {
    bpm: best.bpm,
    instantaneous: true,
    sustainedSeconds: best.span,
  };
}

export type MaxHrReferenceNote = "may_be_low" | "not_a_decline" | "matches" | "no_reference";

export function compareObservedMaxHr(
  observed: number,
  reference: number | null,
): MaxHrReferenceNote {
  if (reference == null || !Number.isFinite(reference)) return "no_reference";
  if (observed > reference) return "may_be_low";
  if (observed < reference) return "not_a_decline";
  return "matches";
}

export function activitySamplesFromRecords(
  records: Array<{ seconds: number; heartRate?: number }>,
): HeartRateSample[] {
  return records.map((record) => ({
    seconds: record.seconds,
    heartRate:
      record.heartRate != null &&
      Number.isFinite(record.heartRate) &&
      record.heartRate > 0
        ? record.heartRate
        : null,
  }));
}
