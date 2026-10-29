import { SensorRecord } from '../../sensor/sensor-data.service';

export const ELEVATE_GRADE_DEFAULT_LOOKAHEAD_METERS = 10;
export const RUN_GRADE_LOOKAHEAD_METERS = 25;
export const CYCLING_GRADE_LOOKAHEAD_METERS = 40;
export const GRADE_CLAMP_PERCENT = 50;

type GradePoint = {
  recordIndex: number;
  distance: number;
  altitude: number;
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Elevate-compatible three-point rolling median used to remove altitude spikes. */
function medianFilter3(values: number[]): number[] {
  if (values.length < 3) return [...values];
  const output: number[] = [];
  const window: number[] = [values[0]];
  const radius = 1;
  for (let index = 0; index < values.length; index++) {
    if (index + radius < values.length) {
      window.push(values[index + radius]);
    }
    output.push(median(window));
    if (index >= radius) window.shift();
  }
  return output;
}

/** Elevate-compatible one-pole altitude low-pass filter (alpha=0.5). */
function lowPassAltitude(values: number[], alpha = 0.5): number[] {
  if (!values.length) return [];
  const output = [...values];
  let filtered = values[0];
  for (let index = 1; index < values.length; index++) {
    filtered += (values[index] - filtered) * alpha;
    output[index] = round(filtered, 2);
  }
  return output;
}

/** Elevate-compatible scalar Kalman smoothing for the calculated grade stream. */
function kalmanGrade(
  values: number[],
  processNoise = 0.01,
  measurementNoise = 0.5,
): number[] {
  if (!values.length) return [];
  let estimate = values[0];
  let covariance = measurementNoise;
  return values.map((measurement, index) => {
    if (index > 0) {
      const predictedCovariance = covariance + processNoise;
      const gain =
        predictedCovariance / (predictedCovariance + measurementNoise);
      estimate += gain * (measurement - estimate);
      covariance = predictedCovariance - gain * predictedCovariance;
    }
    return round(estimate, 3);
  });
}

function calculateSegmentGrade(
  points: GradePoint[],
  lookaheadMeters: number,
): number[] {
  const altitudes = lowPassAltitude(
    medianFilter3(points.map((point) => point.altitude)),
  );
  const rawGrade: number[] = [];
  let aheadIndex = 0;
  for (let index = 0; index < points.length; index++) {
    aheadIndex = Math.max(aheadIndex, index);
    const targetDistance = points[index].distance + lookaheadMeters;
    while (
      aheadIndex < points.length &&
      points[aheadIndex].distance < targetDistance
    ) {
      aheadIndex++;
    }
    const resolvedAheadIndex =
      aheadIndex < points.length ? aheadIndex : points.length - 1;
    const distanceDelta =
      points[resolvedAheadIndex].distance - points[index].distance;
    const altitudeDelta = altitudes[resolvedAheadIndex] - altitudes[index];
    const grade =
      distanceDelta > 0 ? round((altitudeDelta / distanceDelta) * 100, 2) : 0;
    rawGrade.push(
      Math.max(-GRADE_CLAMP_PERCENT, Math.min(GRADE_CLAMP_PERCENT, grade)),
    );
  }
  return kalmanGrade(rawGrade);
}

/**
 * Recomputes grade from distance and altitude using Elevate's processing order:
 * altitude median filter -> altitude low-pass -> distance-ahead rise/run ->
 * +/-50% clamp -> scalar Kalman filter.
 *
 * Missing or decreasing distance/altitude starts a new independent segment and
 * never becomes a synthetic zero. Records without enough evidence retain their
 * source grade, if any.
 */
export function applySmoothing(
  records: SensorRecord[],
  lookaheadMeters = ELEVATE_GRADE_DEFAULT_LOOKAHEAD_METERS,
): SensorRecord[] {
  if (!records.length) return [];
  const safeLookahead =
    Number.isFinite(lookaheadMeters) && lookaheadMeters > 0
      ? lookaheadMeters
      : ELEVATE_GRADE_DEFAULT_LOOKAHEAD_METERS;
  const grades = new Map<number, number>();
  let segment: GradePoint[] = [];

  const flushSegment = () => {
    if (segment.length >= 2) {
      const calculated = calculateSegmentGrade(segment, safeLookahead);
      segment.forEach((point, index) => {
        grades.set(point.recordIndex, calculated[index]);
      });
    }
    segment = [];
  };

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const distance = record.distance;
    const altitude = record.enhancedAltitude ?? record.altitude;
    if (
      typeof distance !== 'number' ||
      !Number.isFinite(distance) ||
      typeof altitude !== 'number' ||
      !Number.isFinite(altitude)
    ) {
      flushSegment();
      continue;
    }
    const previous = segment[segment.length - 1];
    if (previous && distance < previous.distance) flushSegment();
    segment.push({ recordIndex: index, distance, altitude });
  }
  flushSegment();

  return records.map((record, index) => {
    const grade = grades.get(index);
    return grade == null ? record : { ...record, grade };
  });
}
