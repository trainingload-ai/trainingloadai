import type { SensorData } from '@/analyze/analyze.interface';

interface DecouplingOptions {
  warmUpSeconds?: number;
  minHr?: number;
  minMetric?: number;
  maxGapSeconds?: number;
  minHalfCoveredSeconds?: number;
}

type Half = {
  seconds: number;
  metricSum: number;
  heartRateSum: number;
};

function add(half: Half, metric: number, heartRate: number, seconds: number) {
  half.seconds += seconds;
  half.metricSum += metric * seconds;
  half.heartRateSum += heartRate * seconds;
}

/**
 * Time-weighted aerobic decoupling. Missing HR/metric and recording gaps are
 * unknown, and the half boundary is based on wall-clock time after warm-up
 * rather than on the number of device samples.
 */
export function computeAerobicDecoupling(
  sensorData: SensorData[],
  metricKey: 'power' | 'speed',
  options: DecouplingOptions = {},
): number | undefined {
  const {
    warmUpSeconds = 600,
    minHr = 1,
    minMetric = 1,
    maxGapSeconds = 10,
    minHalfCoveredSeconds = 60,
  } = options;
  const points = sensorData
    .map((record) => ({
      tMs: Number.isFinite(record.tMs)
        ? record.tMs
        : new Date(record.time).getTime(),
      heartRate: record.heartRate,
      metric: record[metricKey],
    }))
    .filter((point) => Number.isFinite(point.tMs))
    .sort((a, b) => a.tMs - b.tMs)
    .filter(
      (point, index, rows) => index === 0 || point.tMs > rows[index - 1].tMs,
    );
  if (points.length < 2) return undefined;

  const activityStartMs = points[0].tMs;
  const analysisStartMs = activityStartMs + warmUpSeconds * 1000;
  const analysisEndMs = points[points.length - 1].tMs;
  if (analysisEndMs <= analysisStartMs) return undefined;
  const midpointMs = analysisStartMs + (analysisEndMs - analysisStartMs) / 2;
  const first: Half = { seconds: 0, metricSum: 0, heartRateSum: 0 };
  const second: Half = { seconds: 0, metricSum: 0, heartRateSum: 0 };

  for (let index = 0; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    const rawSeconds = (next.tMs - current.tMs) / 1000;
    if (rawSeconds <= 0 || rawSeconds > maxGapSeconds) continue;
    const heartRate = current.heartRate;
    const metric = current.metric;
    if (
      typeof heartRate !== 'number' ||
      !Number.isFinite(heartRate) ||
      heartRate < minHr ||
      typeof metric !== 'number' ||
      !Number.isFinite(metric) ||
      metric < minMetric
    ) {
      continue;
    }
    const left = Math.max(current.tMs, analysisStartMs);
    const right = Math.min(next.tMs, analysisEndMs);
    if (right <= left) continue;
    const firstSeconds = Math.max(0, Math.min(right, midpointMs) - left) / 1000;
    const secondSeconds =
      Math.max(0, right - Math.max(left, midpointMs)) / 1000;
    if (firstSeconds > 0) add(first, metric, heartRate, firstSeconds);
    if (secondSeconds > 0) add(second, metric, heartRate, secondSeconds);
  }

  if (
    first.seconds < minHalfCoveredSeconds ||
    second.seconds < minHalfCoveredSeconds
  ) {
    return undefined;
  }
  const firstEf =
    first.metricSum / first.seconds / (first.heartRateSum / first.seconds);
  const secondEf =
    second.metricSum / second.seconds / (second.heartRateSum / second.seconds);
  if (!(firstEf > 0) || !(secondEf > 0)) return undefined;
  return Math.round(((100 * (firstEf - secondEf)) / firstEf) * 100) / 100;
}
