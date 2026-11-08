import { estimateExtendedCP, type ExtendedCPModel } from './cp-estimate';

export const CP_DURATIONS = [30, 45, 60, 120, 180, 600, 900, 1200, 3600, 7200];

/** A sample above this cannot be neuromuscular power on a bike or a run. */
const MAX_PLAUSIBLE_POWER_SAMPLE_WATTS = 3000;
/**
 * One sample at or above this, and several times its neighbors, is a sensor
 * spike. A real sprint stays elevated on the neighboring samples.
 */
const ISOLATED_SAMPLE_SPIKE_WATTS = 2000;
const ISOLATED_SAMPLE_SPIKE_RATIO = 4;

type PowerPoint = { seconds: number; value: number };

const COVERAGE_BANDS: Array<[number, number]> = [
  [30, 60],
  [60, 180],
  [600, 1200],
];

/**
 * A 1–5s point that consumes this fraction of a nearby longer window is one
 * sample diluted by near-rest. Real sprints stay near a quarter of that budget,
 * because the rest of the window is still hard work.
 */
const ISOLATED_SPIKE_WORK_FRACTION = 0.35;
const ISOLATED_SPIKE_MAX_SECONDS = 5;
const ISOLATED_SPIKE_NEIGHBOR_SECONDS = 30;
/** Extended CP can sit a little above the 20-minute mean when 10-minute power is higher. */
const CP_ABOVE_LONG_MEAN = 1.35;
/** Modeled 1s power may overshoot the shortest observed mean, not multiply it. */
const PMAX_ABOVE_SHORT_MEAN = 2.5;
/** Elite peak power is roughly 5–8× CP. Ten times is not a neuromuscular reserve. */
const PMAX_ABOVE_CP = 10;
const W_PRIME_ABOVE_OBSERVED_WORK = 4;
const SHORT_REFIT_SECONDS = 15;

/**
 * A sample above the recording ceiling is unknown. An isolated multi-kW sample
 * between ordinary neighbors is replaced by those neighbors, so the glitch
 * does not become a one-second maximum and does not punch out the only long
 * window. A real sprint stays elevated on the neighboring samples and is kept.
 *
 * This belongs on the series that builds mean-maximal power. The one-second
 * window mean is the sample itself, and the eCP kernel later reads that peak
 * as anaerobic capacity. {@link calculateCp} still cleans merged peak lists.
 */
export function suppressIsolatedPowerSpikes<T extends { power: number | null }>(
  samples: readonly T[],
): Array<Omit<T, 'power'> & { power: number | null }> {
  return samples.map((sample, index) => {
    const power = sample.power;
    if (typeof power !== 'number' || !Number.isFinite(power)) return sample;
    if (power > MAX_PLAUSIBLE_POWER_SAMPLE_WATTS) {
      return { ...sample, power: null };
    }
    if (power < ISOLATED_SAMPLE_SPIKE_WATTS) return sample;
    const neighbors = [
      samples[index - 1]?.power,
      samples[index + 1]?.power,
    ].filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0,
    );
    if (neighbors.length === 0) return sample;
    const baseline =
      neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
    if (power > baseline * ISOLATED_SAMPLE_SPIKE_RATIO) {
      return { ...sample, power: baseline };
    }
    return sample;
  });
}

/** Whole contiguous wall-clock seconds, preserving zero power. No calculated-power fallback. */
export function measuredPowerPeaks(
  samples: Array<{ seconds: number; power: number | null }>,
  cadence = 1,
) {
  if (
    samples.length < 2 ||
    !samples.every(
      (sample, index) =>
        Number.isFinite(sample.seconds) &&
        (index === 0 || sample.seconds > samples[index - 1].seconds),
    )
  ) {
    return [];
  }
  const cleaned = suppressIsolatedPowerSpikes(samples);
  const first = cleaned[0].seconds;
  const last = cleaned[cleaned.length - 1].seconds;
  const length = Math.floor(last - first);
  if (length > 100000 || length < 1) return [];
  const sum = new Float64Array(length + 1);
  const count = new Uint32Array(length + 1);
  let cursor = 0;
  for (let index = 0; index < length; index++) {
    const at = first + index + 0.5;
    while (
      cursor + 1 < cleaned.length - 1 &&
      cleaned[cursor + 1].seconds < at
    ) {
      cursor++;
    }
    const left = cleaned[cursor];
    const right = cleaned[cursor + 1];
    const dt = right.seconds - left.seconds;
    const valid =
      left.power !== null &&
      right.power !== null &&
      Number.isFinite(left.power) &&
      Number.isFinite(right.power) &&
      left.power >= 0 &&
      right.power >= 0 &&
      left.power <= MAX_PLAUSIBLE_POWER_SAMPLE_WATTS &&
      right.power <= MAX_PLAUSIBLE_POWER_SAMPLE_WATTS &&
      dt <= Math.min(30, cadence * 1.5) &&
      left.seconds <= at &&
      right.seconds >= at;
    const value = valid
      ? left.power! + ((right.power! - left.power!) * (at - left.seconds)) / dt
      : 0;
    sum[index + 1] = sum[index] + value;
    count[index + 1] = count[index] + (valid ? 1 : 0);
  }
  return CP_DURATIONS.filter((duration) => duration <= length).flatMap(
    (seconds) => {
      let best = -1;
      for (let index = seconds; index <= length; index++) {
        if (count[index] - count[index - seconds] === seconds) {
          best = Math.max(best, (sum[index] - sum[index - seconds]) / seconds);
        }
      }
      return best > 0 ? [{ seconds, value: best }] : [];
    },
  );
}

function hasCoverage(points: PowerPoint[]): boolean {
  return (
    points.length >= 5 &&
    COVERAGE_BANDS.every(([start, end]) =>
      points.some((point) => point.seconds >= start && point.seconds <= end),
    )
  );
}

function normalizePeaks(
  peaks: Array<{ seconds: number; value: number }>,
): PowerPoint[] {
  const unique = new Map<number, number>();
  for (const peak of peaks) {
    if (Number.isFinite(peak.value)) {
      unique.set(
        peak.seconds,
        Math.max(unique.get(peak.seconds) ?? 0, peak.value),
      );
    }
  }
  return [...unique]
    .map(([seconds, value]) => ({ seconds, value }))
    .filter(
      (point) =>
        Number.isFinite(point.value) &&
        point.value > 0 &&
        Number.isInteger(point.seconds) &&
        point.seconds > 0 &&
        point.seconds <= 7200,
    )
    .sort((left, right) => left.seconds - right.seconds);
}

/**
 * A mean-maximal curve from non-negative power is non-increasing, and a short
 * window cannot contain more work than any longer maximum mean allows:
 * MMP(s) * s <= MMP(t) * t. Points that break either identity did not come
 * from one physical curve. Drop them instead of letting the kernel treat the
 * contradiction as anaerobic capacity or critical power.
 */
function sanitizeMeanMaximalPower(points: PowerPoint[]): PowerPoint[] {
  let rows = points;
  let changed = true;
  while (changed && rows.length > 1) {
    changed = false;
    const drop = new Set<number>();
    for (let shorterIndex = 0; shorterIndex < rows.length; shorterIndex++) {
      for (
        let longerIndex = shorterIndex + 1;
        longerIndex < rows.length;
        longerIndex++
      ) {
        const shorter = rows[shorterIndex];
        const longer = rows[longerIndex];
        const durationRatio = longer.seconds / shorter.seconds;
        const monotoneSlack = Math.max(1, shorter.value * 0.01);
        if (longer.value > shorter.value + monotoneSlack) {
          drop.add(longerIndex);
          continue;
        }
        const workCeiling = longer.value * durationRatio;
        if (shorter.value > workCeiling + Math.max(1, workCeiling * 0.02)) {
          drop.add(shorterIndex);
          continue;
        }
        if (
          shorter.seconds <= ISOLATED_SPIKE_MAX_SECONDS &&
          longer.seconds <= ISOLATED_SPIKE_NEIGHBOR_SECONDS &&
          shorter.value > workCeiling * ISOLATED_SPIKE_WORK_FRACTION
        ) {
          drop.add(shorterIndex);
        }
      }
    }
    if (drop.size > 0) {
      rows = rows.filter((_, index) => !drop.has(index));
      changed = true;
    }
  }
  return rows;
}

function denseMeanMaximalPower(points: PowerPoint[]): number[] {
  // The eCP kernel uses index = seconds. Index zero is a sentinel; no one-second shift.
  const mmp = new Array(points[points.length - 1].seconds + 1).fill(
    points[0].value,
  );
  let index = 0;
  for (let second = 1; second < mmp.length; second++) {
    while (index < points.length - 2 && second > points[index + 1].seconds) {
      index++;
    }
    const left = points[index];
    const right = points[Math.min(index + 1, points.length - 1)];
    mmp[second] =
      second <= left.seconds
        ? left.value
        : left.value +
          ((right.value - left.value) * (second - left.seconds)) /
            (right.seconds - left.seconds || 1);
  }
  return mmp;
}

function fitExtendedCp(points: PowerPoint[]) {
  let converged = false;
  let iterations = 0;
  const model = estimateExtendedCP(denseMeanMaximalPower(points), {
    onDiagnostics: (diagnostics) => {
      converged = diagnostics.converged;
      iterations = diagnostics.iterations;
    },
  });
  return { model, converged, iterations };
}

function finiteModel(model: ExtendedCPModel): boolean {
  return [model.ecp, model.wPrime, model.pMax].every(
    (value) => Number.isFinite(value) && value > 0,
  );
}

/** Joules above CP on the observed curve, including the flat fill before the first point. */
function observedWorkAboveCp(points: PowerPoint[], cp: number): number {
  let work =
    points[0].value > cp ? (points[0].value - cp) * points[0].seconds : 0;
  for (let index = 0; index < points.length - 1; index++) {
    const left = points[index];
    const right = points[index + 1];
    const surplus = Math.max(left.value, right.value) - cp;
    if (surplus > 0) work += surplus * (right.seconds - left.seconds);
  }
  return work;
}

function modelAgrees(model: ExtendedCPModel, points: PowerPoint[]): boolean {
  const sustained = points.filter((point) => point.seconds >= 1200);
  const longBand = sustained.length
    ? sustained
    : points.filter((point) => point.seconds >= 600);
  const longAnchor = Math.max(...longBand.map((point) => point.value));
  const brief = points.filter((point) => point.seconds <= 30);
  const shortAnchor = Math.max(
    ...(brief.length ? brief : points.slice(0, 1)).map((point) => point.value),
  );
  if (!(model.ecp <= 1000 && model.ecp <= longAnchor * CP_ABOVE_LONG_MEAN)) {
    return false;
  }
  if (!(model.pMax >= model.ecp)) return false;
  if (model.pMax > shortAnchor * PMAX_ABOVE_SHORT_MEAN) return false;
  if (model.pMax > model.ecp * PMAX_ABOVE_CP) return false;
  const work = observedWorkAboveCp(points, model.ecp);
  return !(work > 0 && model.wPrime > work * W_PRIME_ABOVE_OBSERVED_WORK);
}

function solve(points: PowerPoint[]) {
  const fitted = fitExtendedCp(points);
  const finite = finiteModel(fitted.model);
  const valid = fitted.converged && finite && modelAgrees(fitted.model, points);
  const reason = valid
    ? undefined
    : !fitted.converged || !finite
      ? ('NON_CONVERGENCE' as const)
      : ('QUALITY_REJECTED' as const);
  return { ...fitted, valid, reason };
}

export function calculateCp(peaks: Array<{ seconds: number; value: number }>) {
  const points = sanitizeMeanMaximalPower(normalizePeaks(peaks));
  if (!hasCoverage(points)) {
    return { valid: false, reason: 'MISSING_SIGNAL' as const };
  }
  let solved = solve(points);
  // A short spike can survive the work test when a separate effort keeps the
  // longer mean high, then blow up P_MAX or W′. Refit once without those
  // seconds; sub-15s points are not part of the required coverage bands.
  if (
    !solved.valid &&
    points.some((point) => point.seconds < SHORT_REFIT_SECONDS)
  ) {
    const trimmed = points.filter(
      (point) => point.seconds >= SHORT_REFIT_SECONDS,
    );
    if (trimmed.length !== points.length && hasCoverage(trimmed)) {
      const retry = solve(trimmed);
      if (retry.valid) solved = retry;
    }
  }
  const valid = solved.valid;
  return {
    valid,
    reason: valid
      ? undefined
      : solved.reason === 'QUALITY_REJECTED'
        ? ('QUALITY_REJECTED' as const)
        : ('NON_CONVERGENCE' as const),
    cp: Math.round(solved.model.ecp),
    ftp: Math.round(solved.model.ecp * 0.95),
    wPrime: Math.round(solved.model.wPrime),
    pMax: Math.round(solved.model.pMax),
    iterations: solved.iterations,
    converged: solved.converged,
  };
}
