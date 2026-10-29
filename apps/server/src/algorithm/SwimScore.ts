import { SensorRecord } from '@/sensor/sensor-data.service';
import dayjs = require('dayjs');

// NOTE: This code follows the description of SwimScore in
// "Calculating Power Output and Training Stress in Swimmers:
// The Development of the SwimScoreTM Algorithm", by Dr. Phil Skiba:
// http://www.physfarm.com/swimscore.pdf

export const computeSwimPower = (weight: number, speed: number) => {
  const K = 0.35 * weight + 2; // Drag Factor (Eq. 6)
  const ep = 0.6;
  const power = (K / ep) * Math.pow(speed, 3); // Power (Eq. 7)
  return power;
};

export const computeSwimSpeed = (weight: number, power: number) => {
  const K = 0.35 * weight + 2; // Drag Factor (Eq. 6)
  const ep = 0.6;
  const speed = Math.pow((ep / K) * power, 1 / 3);
  return speed;
};
export const computeXPowerSwim = (
  records: SensorRecord[],
  context: {
    weight: number;
    sampleSec: number;
  },
): { xPower: number; durationSec: number } | null => {
  if (records.length === 0 || context.weight <= 0 || context.sampleSec <= 0) {
    return null;
  }

  const EPSILON = 0.1;
  const NEGLIGIBLE = 0.1;

  const sampsPerWindow = 25 / context.sampleSec;
  const attenuation = sampsPerWindow / (sampsPerWindow + context.sampleSec);
  const sampleWeight = context.sampleSec / (sampsPerWindow + context.sampleSec);

  let lastSecs = 0.0;
  const startMs: number | null = records[0].timestamp
    ? dayjs(records?.[0]?.timestamp).valueOf()
    : null;
  if (startMs === null) {
    return null;
  }
  let weighted = 0.0;

  let total = 0.0;
  let count = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const ts = record.timestamp ? dayjs(record.timestamp).valueOf() : NaN;
    if (!Number.isFinite(ts)) {
      continue;
    }
    const currentSecs = (ts - startMs) / 1000;
    const speed = Number(record.enhancedSpeed ?? record.speed ?? 0);

    // 模拟停留窗口
    while (
      weighted > NEGLIGIBLE &&
      currentSecs > lastSecs + context.sampleSec + EPSILON
    ) {
      weighted *= attenuation;
      lastSecs += context.sampleSec;
      total += Math.pow(weighted, 3.0);
      count++;
    }

    const power = speed > 0 ? computeSwimPower(context.weight, speed) : 0;
    weighted *= attenuation;
    weighted += sampleWeight * power;
    lastSecs = currentSecs;
    total += Math.pow(weighted, 3.0);
    count++;
  }

  const xPower = count ? Math.pow(total / count, 1 / 3) : 0.0;
  const durationSec = count * context.sampleSec;

  return { xPower, durationSec };
};

export const computeXPaceSwim = (
  weight: number,
  xPower: number,
  distanceM: number = 100,
): number | null => {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isFinite(xPower) || xPower <= 0) return null;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;

  const speed = computeSwimSpeed(weight, xPower);
  if (!Number.isFinite(speed) || speed <= 0) return null;

  return distanceM / speed / 60;
};

/**
 * Swimming Threshold Power based on CV, used for SwimScore calculation
 * @param weight
 * @param cssPaceSec
 * @param distanceM
 * @returns
 */
export const computeSTPSwim = (
  weight: number,
  cssPaceSec: number,
  distanceM: number = 100,
): number | null => {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isFinite(cssPaceSec) || cssPaceSec <= 0) return null;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;

  const speed = distanceM / cssPaceSec;
  if (!Number.isFinite(speed) || speed <= 0) return null;

  return computeSwimPower(weight, speed);
};

export const computeSRISwim = (xPower: number, stp: number): number | null => {
  if (!Number.isFinite(xPower) || xPower <= 0) return null;
  if (!Number.isFinite(stp) || stp <= 0) return null;
  return xPower / stp;
};

export const computeSwimScore = (params: {
  xPower: number;
  durationSec: number;
  sri: number;
  stp: number;
  weight?: number;
  avgSpeedMps?: number;
  workoutSec?: number;
}): number => {
  const { xPower, durationSec, sri, stp, weight, avgSpeedMps, workoutSec } =
    params;

  if (
    !Number.isFinite(xPower) ||
    !Number.isFinite(durationSec) ||
    !Number.isFinite(sri) ||
    !Number.isFinite(stp)
  ) {
    return 0;
  }

  const normWork = xPower > 0 && durationSec > 0 ? xPower * durationSec : 0;
  let rawGOVSS = normWork * sri;
  const fallbackDuration =
    Number.isFinite(workoutSec) && workoutSec > 0 ? workoutSec : durationSec;

  // No samples in manual workouts, use power at average speed and duration
  if (
    rawGOVSS === 0 &&
    Number.isFinite(weight) &&
    Number.isFinite(avgSpeedMps) &&
    weight > 0 &&
    avgSpeedMps > 0 &&
    fallbackDuration > 0
  ) {
    const watts = computeSwimPower(weight, avgSpeedMps);
    const sriFallback = stp > 0 ? watts / stp : 0;
    rawGOVSS = watts * fallbackDuration * sriFallback;
  }

  const workInAnHourAtSTP = stp * 3600;
  return workInAnHourAtSTP ? (rawGOVSS / workInAnHourAtSTP) * 100.0 : 0;
};
