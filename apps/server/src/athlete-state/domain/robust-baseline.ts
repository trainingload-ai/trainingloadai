import type {
  RecordedMetricPoint,
  RobustBaseline,
} from './athlete-state.contracts';

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function medianAbsoluteDeviation(values: number[], center: number) {
  return median(values.map((value) => Math.abs(value - center)));
}

export function buildRobustBaseline(args: {
  metric: string;
  points: RecordedMetricPoint[];
  baselineEndDate: string;
  recentStartDate: string;
  minimumSamples: number;
}): RobustBaseline {
  const recent = args.points.filter(
    (point) => point.date >= args.recentStartDate,
  );
  const recentProviders = new Set(recent.map((point) => point.provider));
  const provider =
    recentProviders.size === 1
      ? [...recentProviders][0]
      : recent.length === 0
        ? null
        : null;
  const providerContinuous = provider !== null;
  const baseline = args.points.filter(
    (point) =>
      point.date <= args.baselineEndDate &&
      (provider === null || point.provider === provider),
  );
  const baselineMedian = median(baseline.map((point) => point.value));
  const recentMedian = median(
    recent
      .filter((point) => provider === null || point.provider === provider)
      .map((point) => point.value),
  );
  const mad =
    baselineMedian === null
      ? null
      : medianAbsoluteDeviation(
          baseline.map((point) => point.value),
          baselineMedian,
        );
  const robustZ =
    !providerContinuous ||
    baseline.length < args.minimumSamples ||
    baselineMedian === null ||
    recentMedian === null ||
    mad === null ||
    mad === 0
      ? null
      : (0.6745 * (recentMedian - baselineMedian)) / mad;
  return {
    metric: args.metric,
    provider,
    sampleCount: baseline.length,
    requiredSampleCount: args.minimumSamples,
    median: baselineMedian,
    mad,
    recentMedian,
    robustZ: robustZ === null ? null : Number(robustZ.toFixed(4)),
    providerContinuous,
  };
}
