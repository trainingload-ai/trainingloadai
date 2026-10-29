export type BanisterParams = {
  t1: number;
  t2: number;
  k1: number;
  k2: number;
  p0: number;
};

export type BanisterTestPoint = {
  index: number;
  value: number;
};

export type BanisterDailyPoint = {
  score: number;
  g: number;
  h: number;
  pte: number;
  nte: number;
  perf: number;
  test?: number;
};

export type BanisterFitResult = {
  params: BanisterParams;
  rmse: number;
  usedTests: number;
};

const typical_CP = 261;
const typical_WPrime = 15500;
const typical_Pmax = 1100;

const normalizeParams = (input?: Partial<BanisterParams>): BanisterParams => {
  const t1 = input?.t1 && input.t1 > 0 ? input.t1 : 50;
  const t2 = input?.t2 && input.t2 > 0 ? input.t2 : 11;
  const k1 = Number.isFinite(input?.k1 as number) ? (input?.k1 as number) : 0.2;
  const k2 = Number.isFinite(input?.k2 as number) ? (input?.k2 as number) : 0.2;
  const p0 = Number.isFinite(input?.p0 as number) ? (input?.p0 as number) : 0;
  return { t1, t2, k1, k2, p0 };
};

export const computePowerIndex = (
  averagePower: number,
  durationSec: number,
): number => {
  if (!Number.isFinite(averagePower) || !Number.isFinite(durationSec)) return 0;
  if (averagePower <= 0 || durationSec <= 0) return 0;
  const denom = durationSec - typical_WPrime / (typical_CP - typical_Pmax);
  if (!Number.isFinite(denom) || denom === 0) return 0;
  const typicalPower = typical_WPrime / denom + typical_CP;
  if (typicalPower < 0 || typicalPower > 2500) return 0;
  return (100 * averagePower) / typicalPower;
};

export const computeBanisterSeries = (
  scores: number[],
  params?: Partial<BanisterParams>,
): BanisterDailyPoint[] => {
  const p = normalizeParams(params);
  const gDecay = Math.exp(-1 / p.t1);
  const hDecay = Math.exp(-1 / p.t2);

  const result: BanisterDailyPoint[] = [];
  let g = 0;
  let h = 0;

  for (let i = 0; i < scores.length; i++) {
    const score = Number.isFinite(scores[i]) ? scores[i] : 0;
    if (i === 0) {
      g = 0;
      h = 0;
    } else {
      g = g * gDecay + score;
      h = h * hDecay + score;
    }
    const pte = g * p.k1;
    const nte = h * p.k2;
    const perf = p.p0 + (pte - nte);
    result.push({ score, g, h, pte, nte, perf });
  }
  return result;
};

const solve3x3 = (A: number[][], b: number[]): number[] | null => {
  const M = A.map((row, i) => [row[0], row[1], row[2], b[i]]);
  for (let i = 0; i < 3; i++) {
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let r = i + 1; r < 3; r++) {
      const v = Math.abs(M[r][i]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = r;
      }
    }
    if (!Number.isFinite(maxVal) || maxVal < 1e-12) return null;
    if (maxRow !== i) {
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;
    }
    const pivot = M[i][i];
    for (let c = i; c < 4; c++) M[i][c] /= pivot;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const factor = M[r][i];
      for (let c = i; c < 4; c++) M[r][c] -= factor * M[i][c];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
};

export const fitBanisterParams = (
  scores: number[],
  tests: BanisterTestPoint[],
  params?: Partial<BanisterParams>,
): BanisterFitResult => {
  const base = normalizeParams(params);
  if (!tests || tests.length < 2 || scores.length === 0) {
    return { params: base, rmse: 0, usedTests: 0 };
  }

  const series = computeBanisterSeries(scores, {
    t1: base.t1,
    t2: base.t2,
    k1: 1,
    k2: 1,
    p0: 0,
  });

  const validTests = tests.filter(
    (t) =>
      t.index >= 0 &&
      t.index < series.length &&
      Number.isFinite(t.value) &&
      t.value > 0,
  );
  if (validTests.length < 2) {
    return { params: base, rmse: 0, usedTests: 0 };
  }

  let s00 = 0;
  let s01 = 0;
  let s02 = 0;
  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;

  for (const t of validTests) {
    const row = series[t.index];
    const x0 = row.g;
    const x1 = -row.h;
    const x2 = 1;
    const y = t.value;
    s00 += x0 * x0;
    s01 += x0 * x1;
    s02 += x0 * x2;
    s11 += x1 * x1;
    s12 += x1 * x2;
    s22 += x2 * x2;
    b0 += x0 * y;
    b1 += x1 * y;
    b2 += x2 * y;
  }

  const sol = solve3x3(
    [
      [s00, s01, s02],
      [s01, s11, s12],
      [s02, s12, s22],
    ],
    [b0, b1, b2],
  );

  if (!sol || sol.some((v) => !Number.isFinite(v))) {
    return { params: base, rmse: 0, usedTests: validTests.length };
  }

  const [k1, k2, p0] = sol;
  const fitted = normalizeParams({ ...base, k1, k2, p0 });

  let se = 0;
  for (const t of validTests) {
    const row = series[t.index];
    const perf = fitted.p0 + fitted.k1 * row.g - fitted.k2 * row.h;
    se += Math.pow(perf - t.value, 2);
  }
  const rmse = validTests.length > 0 ? Math.sqrt(se / validTests.length) : 0;

  return { params: fitted, rmse, usedTests: validTests.length };
};

export const computeBanisterWithFit = (
  scores: number[],
  tests: BanisterTestPoint[],
  params?: Partial<BanisterParams>,
): { series: BanisterDailyPoint[]; fit: BanisterFitResult } => {
  const fit = fitBanisterParams(scores, tests, params);
  const series = computeBanisterSeries(scores, fit.params);
  for (const t of tests) {
    if (t.index >= 0 && t.index < series.length && t.value > 0) {
      series[t.index].test = t.value;
    }
  }
  return { series, fit };
};
