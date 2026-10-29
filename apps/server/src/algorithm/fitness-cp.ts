import { estimateExtendedCP } from './cp-estimate';
export const CP_DURATIONS = [30, 45, 60, 120, 180, 600, 900, 1200, 3600, 7200];
/** Whole contiguous wall-clock seconds, preserving zero power. No calculated-power fallback. */
export function measuredPowerPeaks(
  samples: Array<{ seconds: number; power: number | null }>,
  cadence = 1,
) {
  if (
    samples.length < 2 ||
    !samples.every(
      (s, i) =>
        Number.isFinite(s.seconds) &&
        (i === 0 || s.seconds > samples[i - 1].seconds),
    )
  )
    return [];
  const first = samples[0].seconds,
    last = samples[samples.length - 1].seconds;
  const length = Math.floor(last - first);
  if (length > 100000 || length < 1) return [];
  const sum = new Float64Array(length + 1),
    count = new Uint32Array(length + 1);
  let j = 0;
  for (let i = 0; i < length; i++) {
    const t = first + i + 0.5;
    while (j + 1 < samples.length - 1 && samples[j + 1].seconds < t) j++;
    const a = samples[j],
      b = samples[j + 1],
      dt = b.seconds - a.seconds;
    const valid =
      a.power !== null &&
      b.power !== null &&
      Number.isFinite(a.power) &&
      Number.isFinite(b.power) &&
      a.power >= 0 &&
      b.power >= 0 &&
      a.power <= 3000 &&
      b.power <= 3000 &&
      dt <= Math.min(30, cadence * 1.5) &&
      a.seconds <= t &&
      b.seconds >= t;
    const v = valid
      ? a.power! + ((b.power! - a.power!) * (t - a.seconds)) / dt
      : 0;
    sum[i + 1] = sum[i] + v;
    count[i + 1] = count[i] + (valid ? 1 : 0);
  }
  return CP_DURATIONS.filter((d) => d <= length).flatMap((seconds) => {
    let best = -1;
    for (let i = seconds; i <= length; i++)
      if (count[i] - count[i - seconds] === seconds)
        best = Math.max(best, (sum[i] - sum[i - seconds]) / seconds);
    return best > 0 ? [{ seconds, value: best }] : [];
  });
}
export function calculateCp(peaks: Array<{ seconds: number; value: number }>) {
  const unique = new Map<number, number>();
  for (const p of peaks)
    if (Number.isFinite(p.value))
      unique.set(p.seconds, Math.max(unique.get(p.seconds) ?? 0, p.value));
  const points = [...unique]
    .map(([seconds, value]) => ({ seconds, value }))
    .filter(
      (p) =>
        Number.isFinite(p.value) &&
        p.value > 0 &&
        Number.isInteger(p.seconds) &&
        p.seconds > 0 &&
        p.seconds <= 7200,
    )
    .sort((a, b) => a.seconds - b.seconds);
  const coverage =
    points.length >= 5 &&
    [
      [30, 60],
      [60, 180],
      [600, 1200],
    ].every(([a, b]) => points.some((p) => p.seconds >= a && p.seconds <= b));
  if (!coverage) return { valid: false, reason: 'MISSING_SIGNAL' as const };
  // The eCP kernel uses index=seconds. Index zero is a sentinel; no one-second shift.
  const mmp = new Array(points[points.length - 1].seconds + 1).fill(
    points[0].value,
  );
  let j = 0;
  for (let t = 1; t < mmp.length; t++) {
    while (j < points.length - 2 && t > points[j + 1].seconds) j++;
    const a = points[j],
      b = points[Math.min(j + 1, points.length - 1)];
    mmp[t] =
      t <= a.seconds
        ? a.value
        : a.value +
          ((b.value - a.value) * (t - a.seconds)) /
            (b.seconds - a.seconds || 1);
  }
  let converged = false,
    iterations = 0;
  const model = estimateExtendedCP(mmp, {
    onDiagnostics: (d) => {
      converged = d.converged;
      iterations = d.iterations;
    },
  });
  const valid =
    converged &&
    [model.ecp, model.wPrime, model.pMax].every(
      (v) => Number.isFinite(v) && v > 0,
    ) &&
    model.ecp <= 1000 &&
    model.pMax >= model.ecp;
  return {
    valid,
    reason: valid ? undefined : ('NON_CONVERGENCE' as const),
    cp: Math.round(model.ecp),
    ftp: Math.round(model.ecp * 0.95),
    wPrime: Math.round(model.wPrime),
    pMax: Math.round(model.pMax),
    iterations,
    converged,
  };
}
