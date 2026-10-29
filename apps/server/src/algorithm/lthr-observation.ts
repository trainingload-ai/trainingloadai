export type LthrObservationForAggregation = {
  id: string;
  activityId: number;
  candidateBpm: number;
  observedAt: Date;
  protocol: 'OBSERVED' | 'TEST';
  qualityWeight?: number;
};

export type LthrEstimate = {
  value: number;
  tier: 'SINGLE_HIGH_QUALITY' | 'CORROBORATED' | 'VERIFIED_TEST';
  supportCount: number;
  observationIds: string[];
  rangeMin: number;
  rangeMax: number;
  autoEligible: boolean;
};

const DAY_MS = 86_400_000;

function weightedMedian(
  rows: Array<{ value: number; weight: number }>,
): number {
  const sorted = [...rows].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, row) => sum + row.weight, 0);
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= total / 2) return row.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

export function selectLthrEstimate(
  observations: LthrObservationForAggregation[],
  at: Date,
): LthrEstimate | null {
  const windowStart = at.getTime() - 90 * DAY_MS;
  const eligible = observations.filter(
    (row) =>
      Number.isFinite(row.candidateBpm) &&
      row.candidateBpm > 0 &&
      row.observedAt.getTime() >= windowStart &&
      row.observedAt.getTime() <= at.getTime(),
  );
  if (!eligible.length) return null;

  const verified = eligible
    .filter((row) => row.protocol === 'TEST')
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
  if (verified) {
    return {
      value: Math.round(verified.candidateBpm),
      tier: 'VERIFIED_TEST',
      supportCount: 1,
      observationIds: [verified.id],
      rangeMin: verified.candidateBpm,
      rangeMax: verified.candidateBpm,
      autoEligible: true,
    };
  }

  const supportStart = at.getTime() - 42 * DAY_MS;
  const clusterCandidates = eligible.map((center) => {
    const rows = eligible.filter(
      (row) => Math.abs(row.candidateBpm - center.candidateBpm) <= 3,
    );
    const recentSupport = rows.filter(
      (row) => row.observedAt.getTime() >= supportStart,
    ).length;
    const weightedRows = rows.map((row) => {
      const ageDays = Math.max(
        0,
        (at.getTime() - row.observedAt.getTime()) / DAY_MS,
      );
      return {
        value: row.candidateBpm,
        weight:
          Math.max(0.1, Math.min(1, row.qualityWeight ?? 1)) *
          Math.pow(0.5, ageDays / 28),
      };
    });
    return {
      rows,
      recentSupport,
      value: Math.round(weightedMedian(weightedRows)),
      totalWeight: weightedRows.reduce((sum, row) => sum + row.weight, 0),
    };
  });

  const corroborated = clusterCandidates
    .filter((cluster) => cluster.recentSupport >= 2)
    .sort(
      (a, b) =>
        b.value - a.value ||
        b.recentSupport - a.recentSupport ||
        b.totalWeight - a.totalWeight,
    )[0];
  if (corroborated) {
    const values = corroborated.rows.map((row) => row.candidateBpm);
    return {
      value: corroborated.value,
      tier: 'CORROBORATED',
      supportCount: corroborated.recentSupport,
      observationIds: corroborated.rows.map((row) => row.id),
      rangeMin: Math.min(...values),
      rangeMax: Math.max(...values),
      autoEligible: true,
    };
  }

  const strongest = [...eligible].sort(
    (a, b) =>
      b.candidateBpm - a.candidateBpm ||
      b.observedAt.getTime() - a.observedAt.getTime(),
  )[0];
  return {
    value: Math.round(strongest.candidateBpm),
    tier: 'SINGLE_HIGH_QUALITY',
    supportCount: 1,
    observationIds: [strongest.id],
    rangeMin: strongest.candidateBpm,
    rangeMax: strongest.candidateBpm,
    autoEligible: false,
  };
}

export function shouldApplyLthrAutoUpdate(
  currentAutoValue: number | null | undefined,
  estimate: LthrEstimate,
): boolean {
  if (estimate.tier === 'VERIFIED_TEST') {
    return (
      currentAutoValue == null ||
      Math.abs(estimate.value - currentAutoValue) > 1
    );
  }
  if (!estimate.autoEligible) return false;
  if (currentAutoValue == null) return estimate.supportCount >= 2;
  const delta = estimate.value - currentAutoValue;
  if (delta <= 1) return false;
  if (delta <= 5) return estimate.supportCount >= 2;
  return estimate.supportCount >= 3;
}
