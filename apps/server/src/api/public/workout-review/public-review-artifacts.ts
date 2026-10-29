import type {
  CanonicalActivityPayload,
  CanonicalLap,
  CanonicalRecord,
} from '@/importing/canonical-activity.types';

export const PUBLIC_REVIEW_LANGUAGES = [
  'en',
  'de',
  'fr',
  'es',
  'pt-BR',
  'it',
  'ko',
  'ja',
  'zh',
  'zh-hant',
] as const;

export type PublicReviewLanguage = (typeof PUBLIC_REVIEW_LANGUAGES)[number];

export type PublicWorkoutVisualizationPoint = {
  xM: number;
  zM: number;
  altitudeM?: number;
  distanceM?: number;
  speedMps?: number;
};

export type PublicWorkoutTrendPoint = {
  index: number;
  elapsedSec?: number;
  distanceM?: number;
  altitudeM?: number;
  speedMps?: number;
  heartRateBpm?: number;
  powerW?: number;
  cadence?: number;
};

export type PublicWorkoutVisualization = {
  sport: string;
  route3d?: PublicWorkoutVisualizationPoint[];
  elevationProfile?: Array<{ distanceM: number; altitudeM: number }>;
  trends?: PublicWorkoutTrendPoint[];
  verticalExaggeration: number;
  warnings: string[];
};

export type PublicReviewEvidence = {
  schemaVersion: '1.0';
  language: PublicReviewLanguage;
  sport: string;
  summary: {
    distanceM?: number;
    elapsedTimeSec?: number;
    timerTimeSec?: number;
    ascentM?: number;
    descentM?: number;
    calories?: number;
    avgHeartRateBpm?: number;
    maxHeartRateBpm?: number;
    avgPowerW?: number;
    maxPowerW?: number;
    avgPaceSecPerKm?: number;
    fastestPaceSecPerKm?: number;
    avgSpeedKph?: number;
    maxSpeedKph?: number;
    avgCadence?: number;
    maxCadence?: number;
  };
  laps: Array<{
    index: number;
    distanceM?: number;
    timerTimeSec?: number;
    avgHeartRateBpm?: number;
    maxHeartRateBpm?: number;
    avgPowerW?: number;
    avgPaceSecPerKm?: number;
    avgSpeedKph?: number;
  }>;
  userContext: {
    question?: string;
    perceivedEffort?: number;
    maxHeartRate?: number;
    lactateThresholdHr?: number;
    ftp?: number;
  };
  dataAvailability: {
    recordCount: number;
    hasHeartRate: boolean;
    hasPower: boolean;
    hasSpeed: boolean;
    hasAltitude: boolean;
    hasRoute: boolean;
  };
  derived: {
    heartRateSamplesAtOrAboveLthrPct?: number;
    observedHeartRateTimeSec?: number;
    timeAtOrAboveLthrSec?: number;
    lapSpeedCoefficientOfVariationPct?: number;
  };
};

const EARTH_RADIUS_M = 6_371_000;

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function round(value: number, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sample<T>(values: T[], maximum: number): T[] {
  if (values.length <= maximum) return values;
  const sampled: T[] = [];
  const lastIndex = values.length - 1;
  for (let index = 0; index < maximum; index += 1) {
    sampled.push(values[Math.round((index * lastIndex) / (maximum - 1))]);
  }
  return sampled;
}

function sanitizeQuestion(value: string | undefined) {
  const clean = String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return clean || undefined;
}

function isPaceSport(sport: string) {
  return sport === 'RUN';
}

function paceSecPerKm(speedMps: number | undefined) {
  return speedMps !== undefined && speedMps > 0
    ? round(1_000 / speedMps, 1)
    : undefined;
}

function speedKph(speedMps: number | undefined) {
  return speedMps !== undefined && speedMps >= 0
    ? round(speedMps * 3.6, 1)
    : undefined;
}

function displaySpeed(sport: string, speed: unknown, maximum = false) {
  const value = finite(speed);
  if (isPaceSport(sport)) {
    return maximum
      ? { fastestPaceSecPerKm: paceSecPerKm(value) }
      : { avgPaceSecPerKm: paceSecPerKm(value) };
  }
  return maximum
    ? { maxSpeedKph: speedKph(value) }
    : { avgSpeedKph: speedKph(value) };
}

function lapEvidence(lap: CanonicalLap, fallbackIndex: number, sport: string) {
  const distance = finite(lap.distance);
  const timerTime = finite(lap.timerTime);
  const averageSpeed =
    finite(lap.avgSpeed) ??
    (distance !== undefined && timerTime !== undefined && timerTime > 0
      ? distance / timerTime
      : undefined);
  return {
    index: finite(lap.index) ?? fallbackIndex,
    distanceM: distance,
    timerTimeSec: timerTime,
    avgHeartRateBpm: finite(lap.avgHeartRate),
    maxHeartRateBpm: finite(lap.maxHeartRate),
    avgPowerW: finite(lap.avgPower),
    ...displaySpeed(sport, averageSpeed),
  };
}

function altitude(record: CanonicalRecord) {
  return finite(record.enhancedAltitude) ?? finite(record.altitude);
}

function timestampMs(record: CanonicalRecord) {
  if (!record.timestamp) return undefined;
  const value = Date.parse(record.timestamp);
  return Number.isFinite(value) ? value : undefined;
}

function coordinateDistance(left: CanonicalRecord, right: CanonicalRecord) {
  const leftLat = finite(left.positionLat);
  const leftLng = finite(left.positionLong);
  const rightLat = finite(right.positionLat);
  const rightLng = finite(right.positionLong);
  if (
    leftLat === undefined ||
    leftLng === undefined ||
    rightLat === undefined ||
    rightLng === undefined
  ) {
    return undefined;
  }
  const meanLatRad = (((leftLat + rightLat) / 2) * Math.PI) / 180;
  const x = (((rightLng - leftLng) * Math.PI) / 180) * Math.cos(meanLatRad);
  const y = ((rightLat - leftLat) * Math.PI) / 180;
  return EARTH_RADIUS_M * Math.sqrt(x * x + y * y);
}

function segmentSpeed(left: CanonicalRecord, right: CanonicalRecord) {
  const leftTime = timestampMs(left);
  const rightTime = timestampMs(right);
  if (leftTime === undefined || rightTime === undefined) return undefined;
  const elapsedSeconds = (rightTime - leftTime) / 1_000;
  if (elapsedSeconds <= 0 || elapsedSeconds > 300) return undefined;
  const leftDistance = finite(left.distance);
  const rightDistance = finite(right.distance);
  const distance =
    leftDistance !== undefined &&
    rightDistance !== undefined &&
    rightDistance >= leftDistance
      ? rightDistance - leftDistance
      : coordinateDistance(left, right);
  if (distance === undefined) return undefined;
  const speed = distance / elapsedSeconds;
  return Number.isFinite(speed) && speed >= 0 && speed <= 80
    ? round(speed)
    : undefined;
}

function resolveRecordSpeeds(records: CanonicalRecord[]) {
  return records.map((record, index) => {
    const recorded = finite(record.speed);
    if (recorded !== undefined && recorded >= 0) return recorded;
    if (index > 0) {
      const fromPrevious = segmentSpeed(records[index - 1], record);
      if (fromPrevious !== undefined) return fromPrevious;
    }
    if (index < records.length - 1)
      return segmentSpeed(record, records[index + 1]);
    return undefined;
  });
}

function recordElapsedSeconds(
  record: CanonicalRecord,
  firstTimestampMs?: number,
) {
  if (firstTimestampMs === undefined || !record.timestamp) return undefined;
  const timestampMs = Date.parse(record.timestamp);
  if (!Number.isFinite(timestampMs) || timestampMs < firstTimestampMs)
    return undefined;
  return round((timestampMs - firstTimestampMs) / 1_000, 1);
}

function buildTrends(
  records: CanonicalRecord[],
  speeds: Array<number | undefined>,
): PublicWorkoutTrendPoint[] | undefined {
  const firstTimestampMs = records.reduce<number | undefined>(
    (first, record) => {
      if (first !== undefined || !record.timestamp) return first;
      const value = Date.parse(record.timestamp);
      return Number.isFinite(value) ? value : undefined;
    },
    undefined,
  );
  const trends = records
    .map(
      (record, index): PublicWorkoutTrendPoint => ({
        index,
        elapsedSec: recordElapsedSeconds(record, firstTimestampMs),
        distanceM: finite(record.distance),
        altitudeM: altitude(record),
        speedMps: speeds[index],
        heartRateBpm: finite(record.heartRate),
        powerW: finite(record.power),
        cadence: finite(record.cadence),
      }),
    )
    .filter(
      (point) =>
        point.distanceM !== undefined ||
        point.elapsedSec !== undefined ||
        point.altitudeM !== undefined ||
        point.speedMps !== undefined ||
        point.heartRateBpm !== undefined ||
        point.powerW !== undefined ||
        point.cadence !== undefined,
    );
  return trends.length > 1 ? sample(trends, 600) : undefined;
}

function buildDerivedEvidence(
  records: CanonicalRecord[],
  laps: CanonicalLap[],
  lactateThresholdHr: number | undefined,
): PublicReviewEvidence['derived'] {
  const derived: PublicReviewEvidence['derived'] = {};
  const threshold = finite(lactateThresholdHr);
  const heartRates = records
    .map((record) => finite(record.heartRate))
    .filter((value): value is number => value !== undefined);
  if (threshold !== undefined && heartRates.length > 0) {
    derived.heartRateSamplesAtOrAboveLthrPct = round(
      (heartRates.filter((value) => value >= threshold).length /
        heartRates.length) *
        100,
      1,
    );
    let observedSeconds = 0;
    let aboveSeconds = 0;
    for (let index = 0; index < records.length - 1; index += 1) {
      const current = records[index];
      const next = records[index + 1];
      const currentMs = current.timestamp
        ? Date.parse(current.timestamp)
        : Number.NaN;
      const nextMs = next.timestamp ? Date.parse(next.timestamp) : Number.NaN;
      const intervalSeconds = (nextMs - currentMs) / 1_000;
      const heartRate = finite(current.heartRate);
      if (
        heartRate === undefined ||
        !Number.isFinite(intervalSeconds) ||
        intervalSeconds <= 0 ||
        intervalSeconds > 120
      ) {
        continue;
      }
      observedSeconds += intervalSeconds;
      if (heartRate >= threshold) aboveSeconds += intervalSeconds;
    }
    if (observedSeconds > 0) {
      derived.observedHeartRateTimeSec = round(observedSeconds, 1);
      derived.timeAtOrAboveLthrSec = round(aboveSeconds, 1);
    }
  }
  const lapSpeeds = laps
    .map((lap) => finite(lap.avgSpeed))
    .filter((value): value is number => value !== undefined && value > 0);
  if (lapSpeeds.length >= 2) {
    const mean =
      lapSpeeds.reduce((sum, value) => sum + value, 0) / lapSpeeds.length;
    const variance =
      lapSpeeds.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      lapSpeeds.length;
    derived.lapSpeedCoefficientOfVariationPct = round(
      (Math.sqrt(variance) / mean) * 100,
      1,
    );
  }
  return derived;
}

function buildVisualization(
  records: CanonicalRecord[],
  sport: string,
  speeds: Array<number | undefined>,
): PublicWorkoutVisualization {
  const warnings: string[] = [];
  const trends = buildTrends(records, speeds);
  const geolocated = records
    .map((record, index) => ({ record, index }))
    .filter(
      ({ record }) =>
        finite(record.positionLat) !== undefined &&
        finite(record.positionLong) !== undefined,
    );
  if (geolocated.length < 2) {
    return {
      sport,
      trends,
      verticalExaggeration: 1,
      warnings: ['ROUTE_UNAVAILABLE'],
    };
  }

  const centerLat =
    geolocated.reduce((sum, item) => sum + item.record.positionLat!, 0) /
    geolocated.length;
  const centerLng =
    geolocated.reduce((sum, item) => sum + item.record.positionLong!, 0) /
    geolocated.length;
  const centerLatRad = (centerLat * Math.PI) / 180;
  const route: PublicWorkoutVisualizationPoint[] = geolocated.map(
    ({ record, index }) => ({
      xM: round(
        EARTH_RADIUS_M *
          (((record.positionLong! - centerLng) * Math.PI) / 180) *
          Math.cos(centerLatRad),
      ),
      zM: round(
        -EARTH_RADIUS_M * (((record.positionLat! - centerLat) * Math.PI) / 180),
      ),
      altitudeM: altitude(record),
      distanceM: finite(record.distance),
      speedMps: speeds[index],
    }),
  );
  const altitudes = route
    .map((point) => point.altitudeM)
    .filter((value): value is number => value !== undefined);
  if (altitudes.length !== route.length) warnings.push('ALTITUDE_PARTIAL');
  if (altitudes.length === 0) warnings.push('ALTITUDE_UNAVAILABLE');

  const xValues = route.map((point) => point.xM);
  const zValues = route.map((point) => point.zM);
  const horizontalExtent = Math.max(
    Math.max(...xValues) - Math.min(...xValues),
    Math.max(...zValues) - Math.min(...zValues),
    1,
  );
  const altitudeRange =
    altitudes.length > 1 ? Math.max(...altitudes) - Math.min(...altitudes) : 0;
  const verticalExaggeration =
    altitudeRange > 0
      ? round(
          Math.min(8, Math.max(2, (horizontalExtent * 0.15) / altitudeRange)),
          1,
        )
      : 1;
  const elevationProfile = route
    .filter(
      (
        point,
      ): point is PublicWorkoutVisualizationPoint & {
        distanceM: number;
        altitudeM: number;
      } => point.distanceM !== undefined && point.altitudeM !== undefined,
    )
    .map((point) => ({
      distanceM: point.distanceM,
      altitudeM: point.altitudeM,
    }));

  return {
    sport,
    route3d: sample(route, 1_500),
    elevationProfile:
      elevationProfile.length > 1 ? sample(elevationProfile, 500) : undefined,
    trends,
    verticalExaggeration,
    warnings,
  };
}

export function buildPublicReviewArtifacts(
  payload: CanonicalActivityPayload,
  input: {
    language: PublicReviewLanguage;
    question?: string;
    perceivedEffort?: number;
    maxHeartRate?: number;
    lactateThresholdHr?: number;
    ftp?: number;
  },
): {
  datasetChecksum: string;
  evidence: PublicReviewEvidence;
  visualization: PublicWorkoutVisualization;
} {
  const summary = payload.summary;
  const recordSpeeds = resolveRecordSpeeds(payload.records);
  const summaryDistance = finite(summary.distance);
  const summaryTimerTime = finite(summary.timerTime);
  const averageSpeed =
    finite(summary.avgSpeed) ??
    (summaryDistance !== undefined &&
    summaryTimerTime !== undefined &&
    summaryTimerTime > 0
      ? summaryDistance / summaryTimerTime
      : undefined);
  const sortedRecordSpeeds = recordSpeeds
    .filter((value): value is number => value !== undefined && value > 0)
    .sort((left, right) => left - right);
  const maximumSpeed =
    finite(summary.maxSpeed) ??
    (sortedRecordSpeeds.length
      ? sortedRecordSpeeds[Math.floor((sortedRecordSpeeds.length - 1) * 0.95)]
      : undefined);
  const evidence: PublicReviewEvidence = {
    schemaVersion: '1.0',
    language: input.language,
    sport: summary.sportType,
    summary: {
      distanceM: summaryDistance,
      elapsedTimeSec: finite(summary.elapsedTime),
      timerTimeSec: finite(summary.timerTime),
      ascentM: finite(summary.enhancedAscent) ?? finite(summary.ascent),
      descentM: finite(summary.enhancedDescent) ?? finite(summary.descent),
      calories: finite(summary.calories),
      avgHeartRateBpm: finite(summary.avgHeartRate),
      maxHeartRateBpm: finite(summary.maxHeartRate),
      avgPowerW: finite(summary.avgPower),
      maxPowerW: finite(summary.maxPower),
      ...displaySpeed(summary.sportType, averageSpeed),
      ...displaySpeed(summary.sportType, maximumSpeed, true),
      avgCadence: finite(summary.avgCadence),
      maxCadence: finite(summary.maxCadence),
    },
    laps: sample(payload.laps, 30).map((lap, index) =>
      lapEvidence(lap, index, summary.sportType),
    ),
    userContext: {
      question: sanitizeQuestion(input.question),
      perceivedEffort: finite(input.perceivedEffort),
      maxHeartRate: finite(input.maxHeartRate),
      lactateThresholdHr: finite(input.lactateThresholdHr),
      ftp: finite(input.ftp),
    },
    dataAvailability: {
      recordCount: payload.records.length,
      hasHeartRate: payload.records.some(
        (record) => finite(record.heartRate) !== undefined,
      ),
      hasPower: payload.records.some(
        (record) => finite(record.power) !== undefined,
      ),
      hasSpeed: recordSpeeds.some((speed) => speed !== undefined),
      hasAltitude: payload.records.some(
        (record) => altitude(record) !== undefined,
      ),
      hasRoute: payload.records.some(
        (record) =>
          finite(record.positionLat) !== undefined &&
          finite(record.positionLong) !== undefined,
      ),
    },
    derived: buildDerivedEvidence(
      payload.records,
      payload.laps,
      input.lactateThresholdHr,
    ),
  };
  return {
    datasetChecksum: payload.identity.datasetChecksum,
    evidence,
    visualization: buildVisualization(
      payload.records,
      summary.sportType,
      recordSpeeds,
    ),
  };
}
