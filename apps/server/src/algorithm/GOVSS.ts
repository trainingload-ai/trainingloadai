import { SensorRecord } from '../sensor/sensor-data.service';
import { toMs } from '@/utils';
import { resampleObservedValues } from './time-series-metrics';

const toTimestampMs = (value: SensorRecord['timestamp']): number =>
  toMs(value) ?? NaN;

const computeRecIntSecs = (records: SensorRecord[]): number => {
  if (!records || records.length < 2) {
    return 1;
  }
  let prevMs: number | null = null;
  let sum = 0;
  let count = 0;
  for (const record of records) {
    const ms = toTimestampMs(record.timestamp);
    if (!Number.isFinite(ms)) {
      continue;
    }
    if (prevMs !== null) {
      const delta = (ms - prevMs) / 1000;
      if (delta > 0 && Number.isFinite(delta)) {
        sum += delta;
        count++;
      }
    }
    prevMs = ms;
  }
  if (count === 0) {
    return 1;
  }
  const recIntSecs = sum / count;
  return recIntSecs > 0 ? recIntSecs : 1;
};

/**
 * 计算跑步功率
 * @param weight 体重（千克）
 * @param height 身高（米）
 * @param speed 速度（米/秒）
 * @param slope 坡度（0-100）
 * @param distance 距离（米）
 * @param initialSpeed 初始速度（米/秒）
 * @returns 功率（瓦）
 */
export function computeRunningPower(
  weight: number,
  height: number,
  speed: number,
  slope: number = 0.0,
  distance: number = 0.0,
  initialSpeed: number = 0.0,
): number {
  const Af = 0.2025 * Math.pow(height, 0.725) * Math.pow(weight, 0.425) * 0.266;
  const cAero = (0.5 * 1.2 * 0.9 * Af * Math.pow(speed, 2)) / weight;

  const cKin =
    distance !== 0
      ? (0.5 * (Math.pow(speed, 2) - Math.pow(initialSpeed, 2))) / distance
      : 0.0;

  const cSlope =
    155.4 * Math.pow(slope, 5) -
    30.4 * Math.pow(slope, 4) -
    43.3 * Math.pow(slope, 3) +
    46.3 * Math.pow(slope, 2) +
    19.5 * slope +
    3.6;

  const eff = (0.25 + 0.054 * speed) * (1 - (0.5 * speed) / 8.33);

  return (cAero + cKin + cSlope * eff) * speed * weight;
}

export const GOVSS_ALGORITHM_VERSION = 3;
const GOVSS_SPEED_GRADE_WINDOW_SECONDS = 120;
const GOVSS_POWER_WINDOW_SECONDS = 30;
const MAX_OBSERVATION_GAP_SECONDS = 10;

export interface GOVSSResult {
  lnp: number;
  rtp: number;
  iwf: number;
  govss: number;
  xPace: number;
  algorithmVersion: number;
  gradeMode: 'record' | 'flat';
  coveredSeconds: number;
  gradeCoverageRatio: number;
}

export interface GOVSSOptions {
  gradeMode?: 'record' | 'flat';
}

function buildGovssTimelines(records: SensorRecord[]) {
  const timestamps = records.map((record) => toTimestampMs(record.timestamp));
  const speed = resampleObservedValues(
    records.map((record, index) => {
      const rawValue = record.enhancedSpeed ?? record.speed;
      return {
        tMs: timestamps[index],
        value:
          typeof rawValue === 'number' &&
          Number.isFinite(rawValue) &&
          rawValue >= 0
            ? rawValue
            : null,
      };
    }),
    MAX_OBSERVATION_GAP_SECONDS,
  );
  const grade = resampleObservedValues(
    records.map((record, index) => {
      const value = record.grade;
      return {
        tMs: timestamps[index],
        value:
          typeof value === 'number' && Number.isFinite(value) ? value : null,
      };
    }),
    MAX_OBSERVATION_GAP_SECONDS,
  );
  return { speed, grade };
}

export function calculateObservedGradeCoverageRatio(
  records: SensorRecord[],
): number {
  const { speed, grade } = buildGovssTimelines(records);
  return gradeCoverageRatioFromTimelines(speed.values, grade.values);
}

function gradeCoverageRatioFromTimelines(
  speedValues: Array<number | null>,
  gradeValues: Array<number | null>,
): number {
  let speedSeconds = 0;
  let gradeSeconds = 0;
  for (let index = 0; index < speedValues.length; index++) {
    if (speedValues[index] == null) continue;
    speedSeconds++;
    if (gradeValues[index] != null) gradeSeconds++;
  }
  return speedSeconds > 0 ? gradeSeconds / speedSeconds : 0;
}

export function computeGOVSS(
  records: SensorRecord[],
  weight: number,
  height: number,
  cv?: number,
  _sampleSec?: number,
  options: GOVSSOptions = {},
): GOVSSResult {
  const timelines = buildGovssTimelines(records ?? []);
  const gradeCoverageRatio = gradeCoverageRatioFromTimelines(
    timelines.speed.values,
    timelines.grade.values,
  );
  const gradeMode = options.gradeMode ?? 'record';
  if (!records || records.length === 0) {
    return {
      lnp: 0,
      rtp: 0,
      iwf: 0,
      govss: 0,
      xPace: 0,
      algorithmVersion: GOVSS_ALGORITHM_VERSION,
      gradeMode,
      coveredSeconds: 0,
      gradeCoverageRatio,
    };
  }

  let total = 0.0;
  let count = 0;
  let lnp = 0;
  let secs = 0;

  let rollingSpeed: number[] = [];
  let rollingSlope: number[] = [];
  let rollingPower: number[] = [];
  let sumSpeed = 0;
  let sumSlope = 0;
  let sumPower = 0;
  let initialSpeed = 0;

  for (let index = 0; index < timelines.speed.values.length; index++) {
    const speed = timelines.speed.values[index];
    const grade =
      gradeMode === 'flat' ? 0 : (timelines.grade.values[index] ?? null);
    if (speed == null || grade == null) {
      rollingSpeed = [];
      rollingSlope = [];
      rollingPower = [];
      sumSpeed = 0;
      sumSlope = 0;
      sumPower = 0;
      initialSpeed = 0;
      continue;
    }

    rollingSpeed.push(speed);
    sumSpeed += speed;
    rollingSlope.push(grade / 100);
    sumSlope += grade / 100;
    if (rollingSpeed.length > GOVSS_SPEED_GRADE_WINDOW_SECONDS) {
      sumSpeed -= rollingSpeed.shift()!;
      sumSlope -= rollingSlope.shift()!;
    }
    const speed120 = sumSpeed / rollingSpeed.length;
    const slope120 = sumSlope / rollingSlope.length;
    const watts = computeRunningPower(
      weight,
      height,
      speed120,
      slope120,
      speed120,
      initialSpeed,
    );
    initialSpeed = speed120;

    rollingPower.push(watts);
    sumPower += watts;
    if (rollingPower.length > GOVSS_POWER_WINDOW_SECONDS) {
      sumPower -= rollingPower.shift()!;
    }
    const power30 = sumPower / rollingPower.length;
    total += Math.pow(power30, 4);
    count++;
  }

  if (count > 0) {
    lnp = Math.pow(total / count, 0.25);
    secs = count;
  }

  let rtp = 0;
  if (cv && cv > 0) {
    rtp = computeRunningPower(weight, height, cv, 0, 0, 0);
  }

  let iwf = 0;
  if (rtp > 0) {
    iwf = lnp / rtp;
  }

  let govss = 0;
  if (rtp > 0) {
    const normWork = lnp * secs;
    const rawGOVSS = normWork * iwf;
    const workInAnHourAtRTP = rtp * 3600;
    govss = workInAnHourAtRTP ? (rawGOVSS / workInAnHourAtRTP) * 100.0 : 0;
  }

  let xPace = 0;
  if (lnp > 0) {
    let low = 0.0;
    let high = 10.0;
    let speed = 0.0;

    const powerHigh = computeRunningPower(weight, height, high, 0, 0, 0);
    if (lnp >= powerHigh) {
      speed = high;
    } else {
      do {
        speed = (low + high) / 2.0;
        const watts = computeRunningPower(weight, height, speed, 0, 0, 0);
        if (Math.abs(watts - lnp) < 0.001) break;
        if (watts < lnp) low = speed;
        else if (watts > lnp) high = speed;
      } while (high - low > 0.01);
    }

    if (speed > 0.01) {
      xPace = 1000.0 / 60.0 / speed;
    }
  }

  return {
    lnp,
    rtp,
    iwf,
    govss,
    xPace,
    algorithmVersion: GOVSS_ALGORITHM_VERSION,
    gradeMode,
    coveredSeconds: secs,
    gradeCoverageRatio,
  };
}
