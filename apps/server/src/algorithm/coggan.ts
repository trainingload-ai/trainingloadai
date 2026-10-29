import { $Enums } from '@prisma/client';
import {
  averageKnownValues,
  computeNormalizedRollingValue,
  resampleObservedValues,
} from './time-series-metrics';

/**
 * calculate ISOPower value
 * Iso Power is an estimate of the power that you could have maintained for the same physiological 'cost' if your power output had been perfectly constant.
 *
 * @param records @type {number[]}
 * @param sampleSec @type {number} default 1
 * @param windowSec @type {number} window size in seconds, default 30
 * @returns ISOPower @type {number} coggan_np
 */
export const computeISOPower = (
  records: number[],
  sampleSec = 1,
  windowSec = 30,
) => {
  if (
    !records ||
    records.length === 0 ||
    !Number.isFinite(sampleSec) ||
    sampleSec <= 0 ||
    !Number.isFinite(windowSec) ||
    windowSec <= 0
  )
    return 0;
  const window = Math.max(1, Math.round(windowSec / sampleSec));
  if (records.length < window) return 0;
  let total = 0;
  let count = 0;

  // Optimized rolling window calculation
  if (window > 1) {
    let sum = 0;

    for (let i = 0; i < records.length; i++) {
      const watts = records[i];
      if (!Number.isFinite(watts) || watts < 0) return 0;
      sum += watts;
      if (i >= window) sum -= records[i - window];
      // NP only starts when a complete rolling window is available. Treating
      // the missing pre-activity samples as zero depresses every short ride.
      if (i >= window - 1) {
        const avg = sum / window;
        total += Math.pow(avg, 4);
        count++;
      }
    }
  } else {
    // Fallback if window is too small (should rarely happen given logic above)
    for (const p of records) {
      if (!Number.isFinite(p) || p < 0) return 0;
      total += Math.pow(p, 4);
      count++;
    }
  }

  if (count > 0) {
    return Math.pow(total / count, 0.25);
  } else {
    return 0;
  }
};

/**
 * Variability Index (VI): isoPower / avgPower
 * @param avgPower
 * @param isoPower
 * @returns
 */
export const computeVariabilityIndex = (isoPower: number, avgPower: number) => {
  if (avgPower <= 0 || isoPower <= 0) return 0;
  return isoPower / avgPower;
};
/**
 * Intensity Factor is the ratio between IsoPower and the Functional Threshold Power (FTP) configured in Power Zones.
 * @param value
 * @param threshold
 * @returns coggan_if
 */
export const computeIntensityFactor = (
  value: number,
  threshold: number,
): number => {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  )
    return 0;
  return value / threshold;
};

/**
 * Bike Stress (TSS)
 * Training Stress Score takes into account both the intensity and the duration of the training session.
 * Formula: 100 * hours * IF^2
 * @param intensityFactor
 * @param durationSec
 * @returns Bike Stress (TSS)
 */
export const computeBikeStress = (
  intensityFactor: number,
  durationSec: number,
) => {
  if (
    !Number.isFinite(intensityFactor) ||
    intensityFactor <= 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  )
    return 0;
  // 100 * (duration / 3600) * IF^2
  return 100 * (durationSec / 3600) * Math.pow(intensityFactor, 2);
};

/**
 * Training Stress Score per Hour (Intensity)
 * Formula: TSS / Hours = 100 * IF^2
 * @param tss
 * @param durationSec
 * @returns TSS per hour
 */
export const computeTssPerHour = (tss: number, durationSec: number) => {
  if (
    !Number.isFinite(tss) ||
    tss <= 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    return 0;
  }

  return tss / (durationSec / 3600);
};

/**
 * Efficiency Factor (EF)
 * The ratio between IsoPower (or xPace for run) and Average HR.
 * Similar to Efficiency Factor in other platforms.
 */
export const computeEfficiencyFactor = (
  isoPower: number,
  xPace: number,
  avgHeartRate: number,
  sportType: $Enums.SportType,
) => {
  let ef = 0;
  if (sportType === $Enums.SportType.RUN && (!isoPower || isoPower === 0)) {
    if (xPace > 0) {
      ef = xPace;
    }
  } else {
    // Use IsoPower (NP)
    ef = isoPower;
  }
  if (avgHeartRate > 0) {
    return ef / avgHeartRate;
  }

  return 0.0;
};

export interface CogganResult {
  isopower: number;
  variabilityIndex: number;
  intensityFactor: number;
  bikeStress: number;
  tssPerHour: number;
  efficiencyFactor: number;
  algorithmVersion?: number;
  powerSource?: 'MEASURED';
  durationSec?: number;
  coveredSeconds?: number;
  coverageRatio?: number;
  parameters?: Record<string, unknown>;
}

export type TimedPowerSample = { tMs: number; power: number | null };

export const COGGAN_TIMELINE_ALGORITHM_VERSION = 2;
export const COGGAN_MAX_GAP_SECONDS = 10;

/**
 * Builds a one-second observed-power timeline from real timestamps. A sample
 * holds until the next timestamp only when that span is within maxGapSeconds.
 * Zero watts remains observed recovery; missing/invalid power remains unknown.
 */
export function resampleObservedPower(
  samples: TimedPowerSample[],
  maxGapSeconds = COGGAN_MAX_GAP_SECONDS,
): {
  values: Array<number | null>;
  durationSec: number;
  coveredSeconds: number;
} {
  return resampleObservedValues(
    samples.map((sample) => ({
      tMs: sample.tMs,
      value:
        sample.power != null &&
        Number.isFinite(sample.power) &&
        sample.power >= 0
          ? sample.power
          : null,
    })),
    maxGapSeconds,
  );
}

export function computeCogganFromTimeline(
  samples: TimedPowerSample[],
  threshold: number,
  avgHeartRate: number,
  sportType: $Enums.SportType,
  xPace = 0,
): CogganResult {
  const timeline = resampleObservedPower(samples);
  const values = timeline.values;
  const normalized = computeNormalizedRollingValue(values);
  const isopower = normalized.value;
  const avgPower = averageKnownValues(values);
  const variabilityIndex = computeVariabilityIndex(isopower, avgPower);
  const intensityFactor = computeIntensityFactor(isopower, threshold);
  const bikeStress = computeBikeStress(
    intensityFactor,
    timeline.coveredSeconds,
  );
  return {
    isopower,
    variabilityIndex,
    intensityFactor,
    bikeStress,
    tssPerHour: computeTssPerHour(bikeStress, timeline.coveredSeconds),
    efficiencyFactor: computeEfficiencyFactor(
      isopower,
      xPace,
      avgHeartRate,
      sportType,
    ),
    algorithmVersion: COGGAN_TIMELINE_ALGORITHM_VERSION,
    powerSource: 'MEASURED',
    durationSec: timeline.durationSec,
    coveredSeconds: timeline.coveredSeconds,
    coverageRatio:
      timeline.durationSec > 0
        ? timeline.coveredSeconds / timeline.durationSec
        : 0,
    parameters: {
      resampleSeconds: 1,
      rollingWindowSeconds: 30,
      maxGapSeconds: COGGAN_MAX_GAP_SECONDS,
      zeroPower: 'OBSERVED',
      missingPower: 'UNKNOWN',
      completeWindows: normalized.completeWindows,
    },
  };
}

/**
 * 计算所有 Coggan 相关的指标
 * @param records 功率数据
 * @param sampleSec Sampling interval in seconds
 * @param threshold FTP
 * @param avgHeartRate Average Heart Rate
 * @param sportType Sport Type
 * @param xPace xPace (for running without power)
 * @returns CogganResult
 */
export const computeCoggan = (
  records: number[],
  sampleSec: number,
  threshold: number,
  avgHeartRate: number,
  sportType: $Enums.SportType,
  xPace: number = 0,
): CogganResult => {
  if (!records || records.length === 0) {
    return {
      isopower: 0,
      variabilityIndex: 0,
      intensityFactor: 0,
      bikeStress: 0,
      tssPerHour: 0,
      efficiencyFactor: 0,
    };
  }

  const duration = records.length * sampleSec;
  const avgPower = records.reduce((a, b) => a + b, 0) / records.length;
  const isopower = computeISOPower(records, sampleSec);
  const variabilityIndex = computeVariabilityIndex(isopower, avgPower);
  const intensityFactor = computeIntensityFactor(isopower, threshold);
  const bikeStress = computeBikeStress(intensityFactor, duration);
  const tssPerHour = computeTssPerHour(bikeStress, duration);
  const efficiencyFactor = computeEfficiencyFactor(
    isopower,
    xPace,
    avgHeartRate,
    sportType,
  );

  return {
    isopower,
    variabilityIndex,
    intensityFactor,
    bikeStress,
    tssPerHour,
    efficiencyFactor,
  };
};
