import { SensorRecord } from '@/sensor/sensor-data.service';

interface RunCadenceResult {
  avg: number;
  max: number;
  min: number;
}

interface RunGroundContactTimeResult {
  avg: number;
  max: number;
  min: number;
}

interface RunVerticalOscillationResult {
  avg: number;
  max: number;
  min: number;
}

/**
 * Compute run cadence metrics
 * @description 计算跑步时的步频指标
 * @param records Sensor records
 * @param sampleSec Sample seconds
 * @returns Run cadence metrics
 */
export const computeRunCadence = (
  records: SensorRecord[],
  sampleSec: number,
): RunCadenceResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalCadence = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const cadence = point.cadence;
    if (cadence > 0) {
      totalCadence += cadence;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalCadence / countPoints : 0,
    max: countPoints > 0 ? Math.max(...records.map((p) => p.cadence)) : 0,
    min: countPoints > 0 ? Math.min(...records.map((p) => p.cadence)) : 0,
  };
};

/**
 * Compute run ground contact time metrics
 * @description 计算跑步时的地面接触时间指标
 * @param records Sensor records
 * @param sampleSec Sample seconds
 * @returns Run ground contact time metrics
 */
export const computeRunGroundContactTime = (
  records: SensorRecord[],
  sampleSec: number,
): RunGroundContactTimeResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalGroundContactTime = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const stanceTime = point.stanceTime;
    if (stanceTime > 0) {
      totalGroundContactTime += stanceTime;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalGroundContactTime / countPoints : 0,
    max: countPoints > 0 ? Math.max(...records.map((p) => p.stanceTime)) : 0,
    min: countPoints > 0 ? Math.min(...records.map((p) => p.stanceTime)) : 0,
  };
};

/**
 * Compute run vertical oscillation metrics
 * @description 计算跑步时的垂直振动指标
 * @param records Sensor records
 * @param sampleSec Sample seconds
 * @returns Run vertical oscillation metrics
 */
export const computeRunVerticalOscillation = (
  records: SensorRecord[],
  sampleSec: number,
): RunVerticalOscillationResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalVerticalOscillation = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const verticalOscillation = point.verticalOscillation;
    if (verticalOscillation > 0) {
      totalVerticalOscillation += verticalOscillation;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalVerticalOscillation / countPoints : 0,
    max:
      countPoints > 0
        ? Math.max(...records.map((p) => p.verticalOscillation))
        : 0,
    min:
      countPoints > 0
        ? Math.min(...records.map((p) => p.verticalOscillation))
        : 0,
  };
};

interface RunStrideLengthResult {
  avg: number;
  max: number;
  min: number;
}

/**
 * Compute run stride length metrics
 * @description 计算跑步时的步长指标
 * @param records Sensor records
 * @param sampleSec Sample seconds
 * @returns Run stride length metrics
 */
export const computeRunStrideLength = (
  records: SensorRecord[],
  sampleSec: number,
): RunStrideLengthResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalStrideLength = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const strideLength = point.clength;
    if (strideLength > 0) {
      totalStrideLength += strideLength;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalStrideLength / countPoints : 0,
    max: countPoints > 0 ? Math.max(...records.map((p) => p.clength)) : 0,
    min: countPoints > 0 ? Math.min(...records.map((p) => p.clength)) : 0,
  };
};

interface RunVerticalRatioResult {
  avg: number;
  max: number;
  min: number;
}

/**
 * Compute run vertical ratio metrics
 * @description 计算跑步时的垂直比例指标
 * @param records Sensor records
 * @param sampleSec Sample seconds
 * @returns Run vertical ratio metrics
 */
export const computeRunVerticalRatio = (
  records: SensorRecord[],
  sampleSec: number,
): RunVerticalRatioResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalVerticalRatio = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const verticalRatio = point.verticalRatio;
    if (verticalRatio > 0) {
      totalVerticalRatio += verticalRatio;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalVerticalRatio / countPoints : 0,
    max: countPoints > 0 ? Math.max(...records.map((p) => p.verticalRatio)) : 0,
    min: countPoints > 0 ? Math.min(...records.map((p) => p.verticalRatio)) : 0,
  };
};

interface RunStanceTimePercentResult {
  avg: number;
  max: number;
  min: number;
}

/**
 * Compute run stance time percent metrics
 * @description 计算跑步时的触地时间占比
 * @param records Sensor records
 * @param sampleSec Sample seconds
 * @returns Run stance time percent metrics
 */
export const computeRunStanceTimePercent = (
  records: SensorRecord[],
  sampleSec: number,
): RunStanceTimePercentResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalStanceTimePercent = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const stanceTimePercent = point.stanceTimePercent;
    if (stanceTimePercent > 0) {
      totalStanceTimePercent += stanceTimePercent;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalStanceTimePercent / countPoints : 0,
    max:
      countPoints > 0
        ? Math.max(...records.map((p) => p.stanceTimePercent))
        : 0,
    min:
      countPoints > 0
        ? Math.min(...records.map((p) => p.stanceTimePercent))
        : 0,
  };
};

export const computeRunStepLength = (
  records: SensorRecord[],
  sampleSec: number,
): RunStrideLengthResult => {
  if (records.length === 0 || sampleSec <= 0) {
    return {
      avg: 0,
      max: 0,
      min: 0,
    };
  }

  let totalStepLength = 0;
  let countPoints = 0;
  for (let i = 0; i < records.length; i++) {
    const point = records[i];
    const stepLength = point.stepLength;
    if (stepLength > 0) {
      totalStepLength += stepLength;
      countPoints++;
    }
  }
  return {
    avg: countPoints > 0 ? totalStepLength / countPoints : 0,
    max: countPoints > 0 ? Math.max(...records.map((p) => p.stepLength)) : 0,
    min: countPoints > 0 ? Math.min(...records.map((p) => p.stepLength)) : 0,
  };
};
