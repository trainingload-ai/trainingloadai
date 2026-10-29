/** All timestamps are elapsed seconds on the original wall-clock timeline. */
export type HeartRateSample = { seconds: number; heartRate: number | null };
export function calculateFieldLthr(
  samples: HeartRateSample[],
  start: number,
  sampleSeconds = 1,
) {
  const end = start + 1800;
  const checks: Array<{
    code: string;
    passed: boolean;
    observed?: number;
    required?: number;
  }> = [];
  const ordered = samples.every(
    (p, i) =>
      Number.isFinite(p.seconds) &&
      (i === 0 || p.seconds > samples[i - 1].seconds),
  );
  checks.push({ code: 'ORDERED_TIMESTAMPS', passed: ordered });
  const cadence =
    Number.isFinite(sampleSeconds) && sampleSeconds > 0 ? sampleSeconds : 1;
  const valid = (n: number | null) =>
    n !== null && Number.isFinite(n) && n >= 30 && n <= 240;
  const integrate = (from: number, to: number) => {
    let covered = 0,
      integral = 0,
      lastCovered = from,
      maxGap = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i],
        b = samples[i + 1];
      const lo = Math.max(from, a.seconds),
        hi = Math.min(to, b.seconds);
      if (hi <= lo || !valid(a.heartRate) || !valid(b.heartRate)) continue;
      const dt = b.seconds - a.seconds;
      // Interpolation is allowed only over the observed sampling cadence, never over missing stretches.
      if (dt > Math.min(30, cadence * 1.5)) continue;
      maxGap = Math.max(maxGap, lo - lastCovered);
      const left =
        a.heartRate! + ((b.heartRate! - a.heartRate!) * (lo - a.seconds)) / dt;
      const right =
        a.heartRate! + ((b.heartRate! - a.heartRate!) * (hi - a.seconds)) / dt;
      integral += ((left + right) / 2) * (hi - lo);
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
    : { coverage: 0, mean: null, maxGap: 1800 };
  const tail = ordered
    ? integrate(start + 600, end)
    : { coverage: 0, mean: null, maxGap: 1200 };
  checks.push(
    {
      code: 'FULL_COVERAGE',
      passed: full.coverage >= 0.95,
      observed: full.coverage,
      required: 0.95,
    },
    {
      code: 'TAIL_COVERAGE',
      passed: tail.coverage >= 0.95,
      observed: tail.coverage,
      required: 0.95,
    },
    {
      code: 'MAX_GAP_SECONDS',
      passed: full.maxGap <= 30,
      observed: full.maxGap,
      required: 30,
    },
  );
  return {
    valid: checks.every((c) => c.passed),
    value: tail.mean === null ? null : Math.round(tail.mean),
    rawMean: tail.mean,
    checks,
  };
}

export const LTHR_OBSERVATION_ALGORITHM_VERSION = 1;
export const LTHR_OBSERVATION_SCAN_STEP_SECONDS = 30;

export type ObservedLthrCandidate = {
  value: number;
  rawMean: number;
  windowStartSec: number;
  windowEndSec: number;
  measureStartSec: number;
  measureEndSec: number;
  fullCoverageRatio: number;
  tailCoverageRatio: number;
  maxGapSeconds: number;
  checks: ReturnType<typeof calculateFieldLthr>['checks'];
  algorithmVersion: number;
};

/**
 * Finds the strongest quality-qualified 30-minute observation in an activity.
 * Scan candidates are ranked on a one-second interpolation grid; the selected
 * values and quality checks always come from the exact wall-clock integrator.
 */
export function calculateObservedLthrCandidate(
  samples: HeartRateSample[],
  sampleSeconds = 1,
): ObservedLthrCandidate | null {
  if (samples.length < 2) return null;
  if (
    samples.some(
      (sample, index) =>
        !Number.isFinite(sample.seconds) ||
        (index > 0 && sample.seconds <= samples[index - 1].seconds),
    )
  ) {
    return null;
  }

  const firstSecond = Math.ceil(samples[0].seconds);
  const lastSecond = Math.floor(samples[samples.length - 1].seconds);
  const durationSeconds = lastSecond - firstSecond;
  if (durationSeconds < 1800 || durationSeconds > 100_000) return null;

  const cadence =
    Number.isFinite(sampleSeconds) && sampleSeconds > 0 ? sampleSeconds : 1;
  const maxInterpolationGap = Math.min(30, cadence * 1.5);
  const values: Array<number | null> = new Array(durationSeconds + 1).fill(
    null,
  );
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
    const validHeartRate = (value: number | null) =>
      value != null && Number.isFinite(value) && value >= 30 && value <= 240;
    if (left.seconds === right.seconds) {
      if (second === left.seconds && validHeartRate(left.heartRate)) {
        values[offset] = left.heartRate;
      }
      continue;
    }
    const gap = right.seconds - left.seconds;
    if (
      gap > maxInterpolationGap ||
      second < left.seconds ||
      second > right.seconds ||
      !validHeartRate(left.heartRate) ||
      !validHeartRate(right.heartRate)
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
    start + 1800 <= lastSecond;
    start += LTHR_OBSERVATION_SCAN_STEP_SECONDS
  ) {
    const fullFrom = start - firstSecond;
    const fullTo = fullFrom + 1800;
    const tailFrom = fullFrom + 600;
    const fullCount = countPrefix[fullTo] - countPrefix[fullFrom];
    const tailCount = countPrefix[fullTo] - countPrefix[tailFrom];
    if (fullCount < 1800 * 0.95 || tailCount < 1200 * 0.95) continue;
    const tailSum = sumPrefix[fullTo] - sumPrefix[tailFrom];
    approximate.push({ start, mean: tailSum / tailCount });
  }
  approximate.sort((a, b) => b.mean - a.mean);

  let best: ObservedLthrCandidate | null = null;
  for (const candidate of approximate.slice(0, 32)) {
    const exact = calculateFieldLthr(samples, candidate.start, cadence);
    if (!exact.valid || exact.value == null || exact.rawMean == null) continue;
    const fullCoverage = exact.checks.find(
      (check) => check.code === 'FULL_COVERAGE',
    )?.observed;
    const tailCoverage = exact.checks.find(
      (check) => check.code === 'TAIL_COVERAGE',
    )?.observed;
    const maxGap = exact.checks.find(
      (check) => check.code === 'MAX_GAP_SECONDS',
    )?.observed;
    const result: ObservedLthrCandidate = {
      value: exact.value,
      rawMean: exact.rawMean,
      windowStartSec: candidate.start,
      windowEndSec: candidate.start + 1800,
      measureStartSec: candidate.start + 600,
      measureEndSec: candidate.start + 1800,
      fullCoverageRatio: fullCoverage ?? 0,
      tailCoverageRatio: tailCoverage ?? 0,
      maxGapSeconds: maxGap ?? 1800,
      checks: exact.checks,
      algorithmVersion: LTHR_OBSERVATION_ALGORITHM_VERSION,
    };
    if (!best || result.rawMean > best.rawMean) best = result;
  }
  return best;
}
