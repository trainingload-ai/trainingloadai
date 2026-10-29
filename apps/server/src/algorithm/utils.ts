// Mainly implements various algorithms to calculate power

import { round } from 'lodash';
import { SensorData } from '../analyze/analyze.interface';
import {
  UserZoneSetting,
  ZoneType,
  ZoneBase,
  $Enums,
  UserZones,
} from '@prisma/client';
import dayjs = require('dayjs');
import { UserZoneValue } from '@/utils/zones';

/**
 * Calculate the variance of an array
 * @param arr number[] array
 * @returns number variance of the array
 */
export const variance = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
};

/**
 * Calculate the quantile of an array
 * @param arr number[] array
 * @param q number quantile (0-1)
 * @returns number quantile value
 */
export const quantile = (arr: number[], q: number) => {
  const sorted = arr.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
};

/**
 * Calculate the standard deviation of an array
 * @param arr number[] array
 * @returns number standard deviation of the array
 */
export const stddev = (arr: number[]) => {
  return Math.sqrt(variance(arr));
};

/**
 * Compute Foster-style training monotony and training strain
 * - loads: array of daily training load values (e.g. TSS, TRIMP, BikeScore)
 * - monotony = avg(load) / (stddev(load) + avg(load))
 * - trainingStrain = sum(load) * monotony / 0.5
 */
export const computeTrainingLoadMonotony = (loads: number[]) => {
  if (!loads || loads.length === 0) {
    return { monotony: 0, trainingStrain: 0 };
  }
  const sumLoad = loads.reduce((a, b) => a + b, 0);
  const avgLoad = sumLoad / loads.length;
  const v = variance(loads);
  const denominator = Math.sqrt(v) + avgLoad;
  const monotony = denominator > 0 ? avgLoad / denominator : 0;
  const trainingStrain = (sumLoad * monotony) / 0.5;
  return { monotony, trainingStrain };
};

/**
 * Calculate the mode of an array
 * @param arr number[] array
 * @returns number mode of the array
 */
export const mode = (arr: number[]): number => {
  if (!arr || arr.length === 0) return null;
  const m = {};
  arr.forEach((x) => (m[x] = (m[x] || 0) + 1));
  let best = null,
    bestc = -1;
  for (const k in m)
    if (m[k] > bestc) {
      bestc = m[k];
      best = Number(k);
    }
  return best;
};

/**
 * 计算采样间隔（单位：秒）
 * @param records
 * @returns number采样间隔（单位：秒）或默认值1
 */
export const detectSampleSec = (records: { time: string }[]): number => {
  if (!records || records.length < 2) return 1;

  const freq = new Map<number, number>();
  let maxCount = 0;
  let mode = 0;

  for (let i = 1; i < records.length; i++) {
    const dt = dayjs(records[i].time).diff(
      dayjs(records[i - 1].time),
      'second',
    );
    if (dt > 0 && dt < 300) {
      const count = (freq.get(dt) || 0) + 1;
      freq.set(dt, count);
      if (count > maxCount) {
        maxCount = count;
        mode = dt;
      }
    }
  }

  // 降级：没有找到有效间隔时返回默认值
  return maxCount > 0 ? mode : 1;
};
/**
 * duration in second
 *
 * @param records
 * @returns duration in second
 */
export const getDurationSec = (records: SensorData[]) => {
  if (!records || records.length < 2) return 0;
  return dayjs(records[records.length - 1].time).diff(
    dayjs(records[0].time),
    'second',
  );
};

/**
 * Estimate Max Heart Rate
 * @param age number Age, optional
 * @param gender 'male' | 'female' Gender, optional
 * @param heartRateRecords number[] Heart rate records, optional
 * @returns number | undefined Estimated Max HR, or undefined if unable to estimate
 */
export const estimateMaxHeartRate = (
  age?: number,
  gender?: string,
  heartRateRecords?: number[],
): number | undefined => {
  // 1. If there are actual historical records, take the historical maximum (need to filter outliers)
  if (heartRateRecords && heartRateRecords.length > 0) {
    // Simple logic: Take 99th percentile to avoid spikes
    return quantile(heartRateRecords, 0.99);
  }

  // 2. Use formula if age is available
  if (age) {
    // Tanaka formula: 208 - 0.7 * age
    return 208 - 0.7 * age;
  }

  return undefined;
};

/**
 * Calculate Exponential Moving Average (EMA) with time-weighted decay.
 * @param oldValue The previous value of the metric.
 * @param newValue The new proposed value.
 * @param daysDiff The time difference in days between the last update and now.
 * @param timeConstant The time constant (tau) for decay. Larger tau means slower decay (more stability).
 * @returns The new weighted average.
 */
export const calculateExponentialMovingAverage = (
  oldValue: number,
  newValue: number,
  daysDiff: number,
  timeConstant: number,
): number => {
  if (oldValue === 0) return newValue;
  const effectiveDays = Math.max(daysDiff, 1);
  const alpha = 1 - Math.exp(-effectiveDays / timeConstant);
  return round(oldValue * (1 - alpha) + newValue * alpha);
};

export const calculateHrTss = (hrz: UserZoneValue[]) => {
  // hrz: [z1Seconds, z2Seconds, z3Seconds, z4Seconds, z5Seconds]
  // Formula: hrTSS = (z1/3600)*30 + (z2/3600)*40 + (z3/3600)*50 + (z4/3600)*70 + (z5/3600)*100
  const weights = [30, 40, 50, 70, 100];
  const score = hrz.reduce((acc, zone, i) => {
    const seconds = zone.duration || 0;
    const hours = seconds / 3600; // Convert seconds to hours
    return acc + hours * (weights[i] || 0);
  }, 0);
  return round(score, 2);
};

/**
 * Find best pace for target distances from lengths
 * @param lengths ordered continuous lengths (only active/training lengths)
 * @param poolLength pool length (meters)
 * @param targets target distances (meters)
 * @returns
 */
export const bestFromLengths = (
  lengths: {
    timestamp: string;
    index: number | null;
    event: string | null;
    totalElapsedTime: number | null;
    totalStrokes: number | null;
    avgSpeed: number | null;
    swimStroke: string | null;
    avgSwimmingCadence: number | null;
    strokeCount: number | null;
    messageIndex: number | null;
    startTime: string | null;
  }[],
  poolLength: number,
  targets = [100, 200, 400, 1000],
) => {
  // lengths must be ordered continuous lengths (only active/training lengths)
  if (!lengths || lengths.length === 0 || !poolLength) {
    return null;
  }

  // Convert lengths to array of {dist: m, time: s}
  const seq = lengths.map((l) => {
    // Some parsers give different field names for elapsed_time or total_elapsed_time
    const t = l.totalElapsedTime || 0;
    return { dist: poolLength, time: t };
  });
  // sliding window over lengths (merge by lap), calculate min time in window -> convert to sec/100m
  const best = {};
  for (const d of targets) best[d] = null;

  let start = 0;
  let distSum = 0;
  let timeSum = 0;
  for (let i = 0; i < seq.length; i++) {
    distSum += seq[i].dist;
    timeSum += seq[i].time;
    // When window covers distance >= max target, try to shrink head to find all possible combinations
    while (distSum >= Math.min(...targets) && start <= i) {
      // Check if each target is satisfied
      for (const target of targets) {
        if (distSum >= target) {
          // If window is too large (e.g. distSum > target), we can try to split excess part from tail or head
          // But at lap level we use whole lap merge approximation: when distSum >= target, map current timeSum to pace
          const secPer100 = timeSum / (distSum / 100.0); // sec / 100m
          const key = target;
          if (best[key] === null || secPer100 < best[key])
            best[key] = secPer100;
        }
      }
      // Move start forward, try to find new window
      distSum -= seq[start].dist;
      timeSum -= seq[start].time;
      start++;
    }
  }

  // There may be last few windows (scan once more after start move completes)
  // Simple merge scan again (from each start to end)
  for (let s = 0; s < seq.length; s++) {
    let dist = 0,
      t = 0;
    for (let e = s; e < seq.length; e++) {
      dist += seq[e].dist;
      t += seq[e].time;
      for (const target of targets) {
        if (dist >= target) {
          const secPer100 = t / (dist / 100.0);
          const key = target;
          if (best[key] === null || secPer100 < best[key])
            best[key] = secPer100;
        }
      }
    }
  }

  return { ...best, method: 'length' };
};

export const calculateAerobicEfficiencyPace = (
  xGapSpeedMs: number,
  avgHr: number,
) => {
  // Use m/min / bpm for EF
  return avgHr > 0 ? (xGapSpeedMs * 60) / avgHr : 0;
};
