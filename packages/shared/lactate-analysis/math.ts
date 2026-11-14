/** Cubic coefficients use a normalized intensity axis in [-1, 1]. */
export type Curve = { coefficients: number[]; center: number; scale: number };

export function polynomial(coefficients: readonly number[], x: number): number {
  return coefficients.reduceRight(
    (value, coefficient) => value * x + coefficient,
    0,
  );
}

export function derivative(c: readonly number[]) {
  return c.slice(1).map((value, index) => value * (index + 1));
}

export function predict(curve: Curve, intensity: number) {
  return polynomial(
    curve.coefficients,
    (intensity - curve.center) / curve.scale,
  );
}

/** Reorthogonalized QR avoids normal equations on the unscaled power axis. */
export function fitCubic(
  x: readonly number[],
  y: readonly number[],
): Curve | null {
  const center = (x[0]! + x.at(-1)!) / 2;
  const scale = (x.at(-1)! - x[0]!) / 2;
  if (!(scale > 0) || x.length < 4) return null;
  const z = x.map((value) => (value - center) / scale);
  const q: number[][] = [];
  const r = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
  for (let column = 0; column < 4; column++) {
    const v = z.map((value) => value ** column);
    for (let pass = 0; pass < 2; pass++) {
      for (let previous = 0; previous < column; previous++) {
        const projection = v.reduce(
          (sum, value, row) => sum + value * q[previous]![row]!,
          0,
        );
        r[previous]![column]! += projection;
        for (let row = 0; row < v.length; row++)
          v[row]! -= projection * q[previous]![row]!;
      }
    }
    const norm = Math.hypot(...v);
    if (!Number.isFinite(norm) || norm < 1e-10) return null;
    r[column]![column] = norm;
    q.push(v.map((value) => value / norm));
  }
  const coefficients = q.map((column) =>
    column.reduce((sum, value, row) => sum + value * y[row]!, 0),
  );
  for (let row = 3; row >= 0; row--) {
    for (let column = row + 1; column < 4; column++)
      coefficients[row]! -= r[row]![column]! * coefficients[column]!;
    coefficients[row]! /= r[row]![row]!;
  }
  return coefficients.every(Number.isFinite)
    ? { coefficients, center, scale }
    : null;
}

/** Isolate real roots using derivative partitions, then bisect sign changes. */
export function rootsInRange(
  coefficients: readonly number[],
  low: number,
  high: number,
): number[] {
  const c = [...coefficients];
  const size = Math.max(...c.map(Math.abs), 1);
  while (c.length > 1 && Math.abs(c.at(-1)!) < size * 1e-14) c.pop();
  if (c.length < 2 || !(high > low)) return [];
  if (c.length === 2) {
    const root = -c[0]! / c[1]!;
    return Number.isFinite(root) && root >= low - 1e-12 && root <= high + 1e-12
      ? [Math.min(high, Math.max(low, root))]
      : [];
  }
  const cuts = [
    low,
    ...rootsInRange(derivative(c), low, high).filter(
      (x) => x > low && x < high,
    ),
    high,
  ];
  const roots: number[] = [];
  const add = (value: number) => {
    if (!roots.some((existing) => Math.abs(existing - value) < 1e-8))
      roots.push(value);
  };
  for (const point of cuts)
    if (Math.abs(polynomial(c, point)) <= size * 1e-12) add(point);
  for (let i = 0; i < cuts.length - 1; i++) {
    let a = cuts[i]!;
    let b = cuts[i + 1]!;
    let fa = polynomial(c, a);
    const fb = polynomial(c, b);
    if (fa * fb >= 0) continue;
    for (let iteration = 0; iteration < 80; iteration++) {
      const middle = (a + b) / 2;
      const fm = polynomial(c, middle);
      if (fm === 0) {
        a = middle;
        b = middle;
        break;
      }
      if (fa < 0 === fm < 0) {
        a = middle;
        fa = fm;
      } else b = middle;
    }
    add((a + b) / 2);
  }
  return roots.sort((a, b) => a - b);
}

export function upwardCrossing(
  curve: Curve,
  target: number,
  low: number,
  high: number,
) {
  const c = [...curve.coefficients];
  c[0]! -= target;
  const roots = rootsInRange(
    c,
    (low - curve.center) / curve.scale,
    (high - curve.center) / curve.scale,
  );
  const upward = roots.filter(
    (z) => polynomial(c, z - 1e-6) < 0 && polynomial(c, z + 1e-6) > 0,
  );
  const z = upward.at(-1);
  return z === undefined ? null : curve.center + z * curve.scale;
}

export function maximumDistance(
  curve: Curve,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  if (!(x1 > x0)) return null;
  const slope = (y1 - y0) / (x1 - x0);
  const difference = curve.coefficients.map((value) => -value);
  difference[0]! += y0 + slope * (curve.center - x0);
  difference[1]! += slope * curve.scale;
  const low = (x0 - curve.center) / curve.scale;
  const high = (x1 - curve.center) / curve.scale;
  const candidates = [
    low,
    ...rootsInRange(derivative(difference), low, high),
    high,
  ];
  const best = candidates.reduce((a, b) =>
    polynomial(difference, b) > polynomial(difference, a) ? b : a,
  );
  return polynomial(difference, best) > 1e-10
    ? curve.center + best * curve.scale
    : null;
}

export function lineFit(x: readonly number[], y: readonly number[]) {
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  const variance = x.reduce((sum, value) => sum + (value - mx) ** 2, 0);
  if (variance < 1e-14) return null;
  const slope =
    x.reduce((sum, value, i) => sum + (value - mx) * (y[i]! - my), 0) /
    variance;
  const intercept = my - slope * mx;
  const rss = x.reduce(
    (sum, value, i) => sum + (y[i]! - intercept - slope * value) ** 2,
    0,
  );
  return { slope, intercept, rss };
}
