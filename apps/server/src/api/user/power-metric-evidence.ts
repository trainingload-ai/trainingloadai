import { MetricSource, UserFitnessMetricType } from '@prisma/client';

const DERIVED_POWER_METRICS = new Set<UserFitnessMetricType>([
  UserFitnessMetricType.CP,
  UserFitnessMetricType.FTP,
  UserFitnessMetricType.W_PRIME,
  UserFitnessMetricType.P_MAX,
]);

export type PowerPeakEvidencePoint = {
  seconds: number;
  watts: number;
  activityId?: number;
};

/** Peak curve required before an automatic power metric can be stored. */
export function powerModelOriginPayload(peaks: PowerPeakEvidencePoint[]) {
  return {
    method: 'CP_MODEL' as const,
    peaks: peaks.map((peak) => ({
      seconds: peak.seconds,
      watts: peak.watts,
      ...(typeof peak.activityId === 'number'
        ? { activityId: peak.activityId }
        : {}),
    })),
  };
}

export function isDerivedPowerMetric(type: UserFitnessMetricType) {
  return DERIVED_POWER_METRICS.has(type);
}

export function derivedPowerMetricNeedsEvidence(
  source: MetricSource,
  type: UserFitnessMetricType,
) {
  return (
    (source === MetricSource.AUTO || source === MetricSource.ESTIMATED) &&
    isDerivedPowerMetric(type)
  );
}

export function hasPowerPeakEvidence(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const peaks = (payload as { peaks?: unknown }).peaks;
  if (!Array.isArray(peaks) || peaks.length === 0) return false;
  return peaks.every((peak) => {
    if (!peak || typeof peak !== 'object') return false;
    const row = peak as { seconds?: unknown; watts?: unknown };
    return (
      typeof row.seconds === 'number' &&
      Number.isInteger(row.seconds) &&
      row.seconds > 0 &&
      row.seconds <= 7200 &&
      typeof row.watts === 'number' &&
      Number.isFinite(row.watts) &&
      row.watts > 0
    );
  });
}
