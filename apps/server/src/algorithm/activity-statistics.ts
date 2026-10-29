import { $Enums } from '@prisma/client';

export const ACTIVITY_STATISTICS_ALGORITHM_VERSION = 1;
export const ACTIVITY_STATISTICS_MAX_GAP_SECONDS = 10;
export const TERRAIN_GRADE_THRESHOLD_PERCENT = 1.5;

export type ActivityStatisticsRecord = {
  tMs: number;
  distance?: number;
  speed?: number;
  enhancedSpeed?: number;
  heartRate?: number;
  power?: number;
  calculatedPower?: number;
  cadence?: number;
  grade?: number;
  altitude?: number;
  enhancedAltitude?: number;
  gap?: number;
};

export type ActivityMetricDistributionResult = {
  metric: string;
  source: string;
  unit: string;
  average: number;
  activeAverage: number | null;
  min: number;
  max: number;
  q25: number;
  median: number;
  q75: number;
  standardDeviation: number;
  sampleCount: number;
  coveredSeconds: number;
  activitySeconds: number;
  coverageRatio: number;
  algorithmVersion: number;
  parameters: Record<string, unknown>;
};

export type ActivityTerrainSummaryResult = {
  uphillSeconds: number;
  flatSeconds: number;
  downhillSeconds: number;
  uphillDistanceM: number;
  flatDistanceM: number;
  downhillDistanceM: number;
  uphillAvgSpeedMps: number | null;
  flatAvgSpeedMps: number | null;
  downhillAvgSpeedMps: number | null;
  uphillAvgCadence: number | null;
  flatAvgCadence: number | null;
  downhillAvgCadence: number | null;
  ascentSpeedMPerHour: number | null;
  profile: 'FLAT' | 'UPHILL' | 'DOWNHILL' | 'HILLY' | 'ROLLING';
  gradeCoveredSeconds: number;
  activitySeconds: number;
  gradeCoverageRatio: number;
  algorithmVersion: number;
  parameters: Record<string, unknown>;
};

export type ActivityStatisticsResult = {
  distributions: ActivityMetricDistributionResult[];
  terrain: ActivityTerrainSummaryResult | null;
};

type WeightedValue = { value: number; seconds: number };
type MetricDefinition = {
  metric: string;
  source: string;
  unit: string;
  value: (record: ActivityStatisticsRecord) => number | null;
  activeMinimum?: number;
  parameters?: Record<string, unknown>;
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function positive(value: unknown): number | null {
  const parsed = finite(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function nonNegative(value: unknown): number | null {
  const parsed = finite(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function effectiveSpeed(record: ActivityStatisticsRecord): number | null {
  return positive(record.enhancedSpeed) ?? positive(record.speed);
}

function elevation(record: ActivityStatisticsRecord): number | null {
  return finite(record.enhancedAltitude) ?? finite(record.altitude);
}

function weightedQuantile(values: WeightedValue[], quantile: number): number {
  const ordered = [...values].sort((a, b) => a.value - b.value);
  const total = ordered.reduce((sum, item) => sum + item.seconds, 0);
  const target = total * quantile;
  let cumulative = 0;
  for (const item of ordered) {
    cumulative += item.seconds;
    if (cumulative >= target) return item.value;
  }
  return ordered[ordered.length - 1]?.value ?? 0;
}

function distribution(
  definition: MetricDefinition,
  values: WeightedValue[],
  activitySeconds: number,
): ActivityMetricDistributionResult | null {
  const coveredSeconds = values.reduce((sum, item) => sum + item.seconds, 0);
  if (coveredSeconds <= 0) return null;
  const average =
    values.reduce((sum, item) => sum + item.value * item.seconds, 0) /
    coveredSeconds;
  const variance =
    values.reduce(
      (sum, item) => sum + Math.pow(item.value - average, 2) * item.seconds,
      0,
    ) / coveredSeconds;
  const active =
    definition.activeMinimum == null
      ? []
      : values.filter((item) => item.value >= definition.activeMinimum!);
  const activeSeconds = active.reduce((sum, item) => sum + item.seconds, 0);
  return {
    metric: definition.metric,
    source: definition.source,
    unit: definition.unit,
    average,
    activeAverage:
      activeSeconds > 0
        ? active.reduce((sum, item) => sum + item.value * item.seconds, 0) /
          activeSeconds
        : null,
    min: Math.min(...values.map((item) => item.value)),
    max: Math.max(...values.map((item) => item.value)),
    q25: weightedQuantile(values, 0.25),
    median: weightedQuantile(values, 0.5),
    q75: weightedQuantile(values, 0.75),
    standardDeviation: Math.sqrt(variance),
    sampleCount: values.length,
    coveredSeconds,
    activitySeconds,
    coverageRatio: activitySeconds > 0 ? coveredSeconds / activitySeconds : 0,
    algorithmVersion: ACTIVITY_STATISTICS_ALGORITHM_VERSION,
    parameters: {
      aggregation: 'TIME_WEIGHTED_LEFT_SAMPLE',
      maxGapSeconds: ACTIVITY_STATISTICS_MAX_GAP_SECONDS,
      missingValues: 'UNKNOWN',
      activeMinimum: definition.activeMinimum ?? null,
      ...definition.parameters,
    },
  };
}

type TerrainBucket = {
  seconds: number;
  distanceM: number;
  speedSum: number;
  speedSeconds: number;
  cadenceSum: number;
  cadenceSeconds: number;
};

function emptyTerrainBucket(): TerrainBucket {
  return {
    seconds: 0,
    distanceM: 0,
    speedSum: 0,
    speedSeconds: 0,
    cadenceSum: 0,
    cadenceSeconds: 0,
  };
}

function averageOrNull(sum: number, seconds: number): number | null {
  return seconds > 0 ? sum / seconds : null;
}

export function computeActivityStatistics(
  records: ActivityStatisticsRecord[],
  sportType: $Enums.SportType,
): ActivityStatisticsResult {
  const ordered = [...records]
    .filter((record) => Number.isFinite(record.tMs))
    .sort((a, b) => a.tMs - b.tMs)
    .filter(
      (record, index, rows) => index === 0 || record.tMs > rows[index - 1].tMs,
    );
  if (ordered.length < 2) return { distributions: [], terrain: null };

  const activitySeconds =
    (ordered[ordered.length - 1].tMs - ordered[0].tMs) / 1000;
  if (!(activitySeconds > 0)) return { distributions: [], terrain: null };

  const cadenceMultiplier = sportType === $Enums.SportType.RUN ? 2 : 1;
  const cadenceActiveMinimum =
    sportType === $Enums.SportType.CYCLING
      ? 30
      : sportType === $Enums.SportType.RUN
        ? 100
        : 1;
  const definitions: MetricDefinition[] = [
    {
      metric: 'SPEED',
      source: 'RECORDED',
      unit: 'm/s',
      value: effectiveSpeed,
    },
    {
      metric: 'PACE',
      source: 'DERIVED_FROM_SPEED',
      unit: 's/m',
      value: (record) => {
        const speed = effectiveSpeed(record);
        return speed ? 1 / speed : null;
      },
    },
    {
      metric: 'GAP',
      source: 'GRADE_ADJUSTED',
      unit: 's/m',
      value: (record) => positive(record.gap),
    },
    {
      metric: 'HEART_RATE',
      source: 'RECORDED',
      unit: 'bpm',
      value: (record) => positive(record.heartRate),
    },
    {
      metric: 'POWER',
      source: 'MEASURED',
      unit: 'W',
      value: (record) => nonNegative(record.power),
    },
    {
      metric: 'CALCULATED_POWER',
      source: 'MODEL',
      unit: 'W',
      value: (record) => nonNegative(record.calculatedPower),
    },
    {
      metric: 'CADENCE',
      source: 'RECORDED',
      unit: sportType === $Enums.SportType.RUN ? 'spm' : 'rpm',
      value: (record) => {
        const cadence = nonNegative(record.cadence);
        return cadence == null ? null : cadence * cadenceMultiplier;
      },
      activeMinimum: cadenceActiveMinimum,
      parameters: {
        cadenceConvention:
          sportType === $Enums.SportType.RUN
            ? 'TOTAL_STEPS_PER_MINUTE'
            : 'REVOLUTIONS_PER_MINUTE',
      },
    },
    {
      metric: 'ELEVATION',
      source: 'ENHANCED_OR_RECORDED',
      unit: 'm',
      value: elevation,
    },
    {
      metric: 'GRADE',
      source: 'ELEVATE_STYLE_DERIVED',
      unit: '%',
      value: (record) => finite(record.grade),
    },
  ];
  const observations = new Map<string, WeightedValue[]>(
    definitions.map((item) => [item.metric, []]),
  );
  const ascentSpeedValues: WeightedValue[] = [];
  const terrain = {
    uphill: emptyTerrainBucket(),
    flat: emptyTerrainBucket(),
    downhill: emptyTerrainBucket(),
  };
  let uphillGainM = 0;

  for (let index = 0; index < ordered.length - 1; index++) {
    const current = ordered[index];
    const next = ordered[index + 1];
    const seconds = (next.tMs - current.tMs) / 1000;
    if (seconds <= 0 || seconds > ACTIVITY_STATISTICS_MAX_GAP_SECONDS) {
      continue;
    }
    for (const definition of definitions) {
      const value = definition.value(current);
      if (value != null && Number.isFinite(value)) {
        observations.get(definition.metric)!.push({ value, seconds });
      }
    }

    const grade = finite(current.grade);
    if (grade == null) continue;
    const category =
      grade > TERRAIN_GRADE_THRESHOLD_PERCENT
        ? 'uphill'
        : grade < -TERRAIN_GRADE_THRESHOLD_PERCENT
          ? 'downhill'
          : 'flat';
    const bucket = terrain[category];
    bucket.seconds += seconds;
    const currentDistance = finite(current.distance);
    const nextDistance = finite(next.distance);
    if (
      currentDistance != null &&
      nextDistance != null &&
      nextDistance >= currentDistance
    ) {
      bucket.distanceM += nextDistance - currentDistance;
    }
    const speed = effectiveSpeed(current);
    if (speed != null) {
      bucket.speedSum += speed * seconds;
      bucket.speedSeconds += seconds;
    }
    const rawCadence = nonNegative(current.cadence);
    const cadence = rawCadence == null ? null : rawCadence * cadenceMultiplier;
    if (cadence != null) {
      bucket.cadenceSum += cadence * seconds;
      bucket.cadenceSeconds += seconds;
    }
    if (category === 'uphill') {
      const currentElevation = elevation(current);
      const nextElevation = elevation(next);
      if (
        currentElevation != null &&
        nextElevation != null &&
        nextElevation > currentElevation
      ) {
        const gain = nextElevation - currentElevation;
        uphillGainM += gain;
        ascentSpeedValues.push({ value: (gain / seconds) * 3600, seconds });
      }
    }
  }

  const distributions = definitions.flatMap((definition) => {
    const result = distribution(
      definition,
      observations.get(definition.metric)!,
      activitySeconds,
    );
    return result ? [result] : [];
  });
  const ascentSpeedDistribution = distribution(
    {
      metric: 'ASCENT_SPEED',
      source: 'DERIVED_FROM_ELEVATION',
      unit: 'm/h',
      value: () => null,
    },
    ascentSpeedValues,
    activitySeconds,
  );
  if (ascentSpeedDistribution) distributions.push(ascentSpeedDistribution);

  const gradeCoveredSeconds =
    terrain.uphill.seconds + terrain.flat.seconds + terrain.downhill.seconds;
  if (gradeCoveredSeconds <= 0) {
    return { distributions, terrain: null };
  }
  const uphillRatio = terrain.uphill.seconds / gradeCoveredSeconds;
  const flatRatio = terrain.flat.seconds / gradeCoveredSeconds;
  const downhillRatio = terrain.downhill.seconds / gradeCoveredSeconds;
  const profile: ActivityTerrainSummaryResult['profile'] =
    flatRatio >= 0.6
      ? 'FLAT'
      : uphillRatio >= 0.5
        ? 'UPHILL'
        : downhillRatio >= 0.5
          ? 'DOWNHILL'
          : uphillRatio + downhillRatio >= 0.6
            ? 'HILLY'
            : 'ROLLING';
  return {
    distributions,
    terrain: {
      uphillSeconds: terrain.uphill.seconds,
      flatSeconds: terrain.flat.seconds,
      downhillSeconds: terrain.downhill.seconds,
      uphillDistanceM: terrain.uphill.distanceM,
      flatDistanceM: terrain.flat.distanceM,
      downhillDistanceM: terrain.downhill.distanceM,
      uphillAvgSpeedMps: averageOrNull(
        terrain.uphill.speedSum,
        terrain.uphill.speedSeconds,
      ),
      flatAvgSpeedMps: averageOrNull(
        terrain.flat.speedSum,
        terrain.flat.speedSeconds,
      ),
      downhillAvgSpeedMps: averageOrNull(
        terrain.downhill.speedSum,
        terrain.downhill.speedSeconds,
      ),
      uphillAvgCadence: averageOrNull(
        terrain.uphill.cadenceSum,
        terrain.uphill.cadenceSeconds,
      ),
      flatAvgCadence: averageOrNull(
        terrain.flat.cadenceSum,
        terrain.flat.cadenceSeconds,
      ),
      downhillAvgCadence: averageOrNull(
        terrain.downhill.cadenceSum,
        terrain.downhill.cadenceSeconds,
      ),
      ascentSpeedMPerHour:
        terrain.uphill.seconds > 0
          ? (uphillGainM / terrain.uphill.seconds) * 3600
          : null,
      profile,
      gradeCoveredSeconds,
      activitySeconds,
      gradeCoverageRatio: gradeCoveredSeconds / activitySeconds,
      algorithmVersion: ACTIVITY_STATISTICS_ALGORITHM_VERSION,
      parameters: {
        aggregation: 'TIME_WEIGHTED_LEFT_SAMPLE',
        maxGapSeconds: ACTIVITY_STATISTICS_MAX_GAP_SECONDS,
        uphillAbovePercent: TERRAIN_GRADE_THRESHOLD_PERCENT,
        downhillBelowPercent: -TERRAIN_GRADE_THRESHOLD_PERCENT,
        gradeSource: 'ELEVATE_STYLE_DERIVED',
        cadenceConvention:
          sportType === $Enums.SportType.RUN
            ? 'TOTAL_STEPS_PER_MINUTE'
            : 'REVOLUTIONS_PER_MINUTE',
      },
    },
  };
}
