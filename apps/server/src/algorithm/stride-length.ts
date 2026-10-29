import { SensorRecord } from '@/sensor/sensor-data.service';
import { toMs } from '@/utils';

type DistanceUnit = 'm' | 'km';

const toTimestampMs = (value: SensorRecord['timestamp']): number =>
  toMs(value) ?? NaN;

const toDistanceCm = (distance: number, unit: DistanceUnit): number => {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return unit === 'km' ? distance * 1000 * 100 : distance * 100;
};

const computeStrideCm = (
  distanceDelta: number,
  cadence: number,
  durationSec: number,
  distanceUnit: DistanceUnit,
): number => {
  if (
    !Number.isFinite(distanceDelta) ||
    !Number.isFinite(cadence) ||
    !Number.isFinite(durationSec) ||
    distanceDelta <= 0 ||
    cadence <= 0 ||
    durationSec <= 0
  ) {
    return 0;
  }

  const cadenceStepsPerSecond = (cadence * 2) / 60;
  if (cadenceStepsPerSecond <= 0) return 0;

  const stride =
    toDistanceCm(distanceDelta, distanceUnit) /
    (cadenceStepsPerSecond * durationSec);

  if (!Number.isFinite(stride) || stride <= 0) return 0;
  return Math.round(stride);
};

export function calculateStrideLengthSeries(
  records: SensorRecord[],
  distanceUnit: DistanceUnit = 'm',
): number[] {
  if (!records || records.length === 0) return [];

  const strides = new Array<number>(records.length).fill(0);

  const firstDistance = Number(records[0]?.distance ?? 0);
  const firstCadence = Number(records[0]?.cadence ?? 0);
  const firstTimeDeltaSec = 0;
  strides[0] = computeStrideCm(
    firstDistance,
    firstCadence,
    firstTimeDeltaSec,
    distanceUnit,
  );

  for (let i = 1; i < records.length; i++) {
    const currDistance = Number(records[i]?.distance ?? 0);
    const prevDistance = Number(records[i - 1]?.distance ?? 0);
    const currCadence = Number(records[i]?.cadence ?? 0);

    const currMs = toTimestampMs(records[i].timestamp);
    const prevMs = toTimestampMs(records[i - 1].timestamp);
    const durationSec = (currMs - prevMs) / 1000;

    strides[i] = computeStrideCm(
      currDistance - prevDistance,
      currCadence,
      durationSec,
      distanceUnit,
    );
  }

  return strides;
}

export function applyStrideLengthToRecords(
  records: SensorRecord[],
  distanceUnit: DistanceUnit = 'm',
): SensorRecord[] {
  if (!records || records.length === 0) return [];
  const strides = calculateStrideLengthSeries(records, distanceUnit);
  return records.map((record, index) => ({
    ...record,
    clength: strides[index],
  }));
}

export function calculateAverageStrideLength(
  records: SensorRecord[],
  distanceUnit: DistanceUnit = 'm',
): number | null {
  if (!records || records.length < 2) return null;

  const strides = calculateStrideLengthSeries(records, distanceUnit);
  let weighted = 0;
  let totalSec = 0;

  for (let i = 1; i < records.length; i++) {
    const value = strides[i];
    if (!Number.isFinite(value) || value <= 0) continue;

    const currMs = toTimestampMs(records[i].timestamp);
    const prevMs = toTimestampMs(records[i - 1].timestamp);
    const dt = (currMs - prevMs) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) continue;

    weighted += value * dt;
    totalSec += dt;
  }

  if (totalSec <= 0) return null;
  return Math.round(weighted / totalSec);
}

export function calculateStrideLengthForActivity(
  activity: {
    distance?: number | null;
    cadence?: number | null;
    duration?: number | null;
  },
  distanceUnit: DistanceUnit = 'm',
): number | null {
  const distance = Number(activity.distance ?? 0);
  const cadence = Number(activity.cadence ?? 0);
  const duration = Number(activity.duration ?? 0);

  if (distance <= 0 || cadence <= 0 || duration <= 0) return null;

  const value = computeStrideCm(distance, cadence, duration, distanceUnit);
  if (value <= 0 || value > 255) return null;
  return value;
}
