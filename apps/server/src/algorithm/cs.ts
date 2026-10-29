export type CSPoint = { distance_m: number; time_s: number; weight?: number };

export interface CSComputeOptions {
  windowDays?: number; // 采样窗口，默认 90 天
  minPoints?: number; // 最少样本数，默认 2
  method?: 'two-point' | 'multi-point-ols'; // 拟合方法
}

/**
 * Weighted Least Squares fitting D = a*T + b, returns CS=a (m/s), D'=b (m), R²
 */
export const computeCriticalSpeed = (points: CSPoint[]) => {
  const pts = points
    .filter((p) => p.distance_m > 0 && p.time_s > 0)
    .sort((a, b) => a.time_s - b.time_s);

  const n = pts.length;
  let S_w = 0,
    S_wT = 0,
    S_wD = 0,
    S_wTT = 0,
    S_wTD = 0;

  for (const p of pts) {
    const w = p.weight ?? 1;
    S_w += w;
    S_wT += w * p.time_s;
    S_wD += w * p.distance_m;
    S_wTT += w * p.time_s * p.time_s;
    S_wTD += w * p.time_s * p.distance_m;
  }

  const denom = S_w * S_wTT - S_wT * S_wT;
  if (denom === 0) {
    return { cs: null, dPrimeM: null, r2: null, sampleCount: n };
  }

  const a = (S_w * S_wTD - S_wT * S_wD) / denom; // CS
  const b = (S_wD - a * S_wT) / S_w; // D'

  const meanD = S_wD / S_w;
  let SSE = 0,
    SST = 0;
  for (const p of pts) {
    const w = p.weight ?? 1;
    const pred = a * p.time_s + b;
    SSE += w * Math.pow(p.distance_m - pred, 2);
    SST += w * Math.pow(p.distance_m - meanD, 2);
  }
  const r2 = SST === 0 ? 0 : Math.max(0, Math.min(1, 1 - SSE / SST));

  const cs = a > 0 ? a : null;
  const dPrimeM = b >= 0 ? b : null;
  return { cs, dPrimeM, r2, sampleCount: n };
};
