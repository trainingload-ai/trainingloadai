// 主要实现各种算法，来对 power 进行计算

import { SensorData } from '@/analyze/analyze.interface';
import dayjs = require('dayjs');
import { PowerZoneModel, SportType, ZoneBase } from '@prisma/client';
import { round } from 'lodash';
import { toMs } from '@/utils';
import { UserZoneSetting } from '@/utils/zones';

/**
 * 计算采样间隔
 * @param records
 * @returns
 */
export const detectSampleSec = (records: { timestamp: unknown }[]) => {
  if (records.length < 2) {
    return { sampleSec: 1, totalSec: 0 };
  }

  const deltas = [];
  for (let i = 1; i < records.length; i++) {
    const t1 = toMs(records[i].timestamp);
    const t0 = toMs(records[i - 1].timestamp);
    if (t1 == null || t0 == null) continue;
    const dt = (t1 - t0) / 1000;
    if (dt > 0 && dt < 10) deltas.push(dt);
  }

  const freq: Record<number, number> = {};
  deltas.forEach((d) => (freq[d] = (freq[d] || 0) + 1));
  const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const sampleSec = Number(best[0]);

  const end = toMs(records[records.length - 1].timestamp);
  const start = toMs(records[0].timestamp);
  const totalSec =
    end != null && start != null ? (end - start) / 1000 : 0;

  return { sampleSec, totalSec };
};

export const generateDefaultPowerZonePercentagesByModel = (
  model: PowerZoneModel = PowerZoneModel.FRIEL,
) => {
  if (model === PowerZoneModel.STRYD) {
    return [
      { order: 1, name: 'Easy', min: 0, max: 81 },
      { order: 2, name: 'Moderate', min: 81, max: 91 },
      { order: 3, name: 'Threshold', min: 91, max: 101 },
      { order: 4, name: 'Interval', min: 101, max: 116 },
      { order: 5, name: 'Repetition', min: 116, max: null },
    ];
  }

  if (model === PowerZoneModel.VANCE) {
    return [
      { order: 1, name: 'Recovery/Walking', min: 0, max: 81 },
      { order: 2, name: 'Endurance', min: 81, max: 89 },
      { order: 3, name: 'Tempo', min: 89, max: 96 },
      { order: 4, name: 'Threshold', min: 96, max: 106 },
      { order: 5, name: 'High Intensity', min: 106, max: 116 },
      { order: 6, name: 'VO2', min: 116, max: 128 },
      { order: 7, name: 'Anaerobic Capacity', min: 128, max: null },
    ];
  }

  return [
    { order: 1, name: 'Active Recovery', min: 0, max: 56 },
    { order: 2, name: 'Endurance', min: 56, max: 76 },
    { order: 3, name: 'Tempo', min: 76, max: 91 },
    { order: 4, name: 'Threshold', min: 91, max: 106 },
    { order: 5, name: 'VO2 Max', min: 106, max: 121 },
    { order: 6, name: 'Anaerobic', min: 121, max: 151 },
    { order: 7, name: 'Neuromuscular', min: 151, max: null },
  ];
};

export const generatePowerZonesFromProfile = (
  userProfile: {
    FTP?: number;
    CP?: number;
    powerZoneModel?: PowerZoneModel;
  },
  sportType: SportType,
): {
  zones: { min: number; max?: number; name: string; order?: number }[];
  benchmark: ZoneBase;
} | null => {
  const { FTP, CP, powerZoneModel } = userProfile;
  const base =
    Number.isFinite(FTP) && (FTP || 0) > 0
      ? (FTP as number)
      : Number.isFinite(CP) && (CP || 0) > 0
        ? (CP as number)
        : undefined;
  if (!base) return null;

  const benchmark =
    Number.isFinite(FTP) && (FTP || 0) > 0 ? ZoneBase.FTP : ZoneBase.CP;
  const model = powerZoneModel || PowerZoneModel.FRIEL;

  const percentages = generateDefaultPowerZonePercentagesByModel(model);
  const boundaries = percentages.map((z) =>
    z.max != null ? round((z.max / 100) * base, 0) : undefined,
  );

  let prevMax = 0;
  const zones = percentages.map((z, idx) => {
    const max = boundaries[idx];
    const min = idx === 0 ? 0 : prevMax;
    if (max != null) prevMax = max;
    return {
      name: z.name,
      order: z.order,
      min,
      max: max ?? undefined,
    };
  });

  return {
    zones,
    benchmark,
  };
};

/**
 * 计算功率在不同区间的持续时间和占比
 * @param powerData SensorData[] 功率数据点数组
 * @param ftp number FTP 值
 * @returns { z1: {...}, z2: {...}, z3: {...}, z4: {...}, z5: {...}, z6: {...} } 每个区间的持续时间、占比、最小值、最大值、平均值
 */
export const calculateTimeInZones = (
  powerData: SensorData[],
  ftp: number,
): {
  z1: {
    duration: number;
    percent: number;
    min: number;
    max: number;
    avg: number;
  };
  z2: {
    duration: number;
    percent: number;
    min: number;
    max: number;
    avg: number;
  };
  z3: {
    duration: number;
    percent: number;
    min: number;
    max: number;
    avg: number;
  };
  z4: {
    duration: number;
    percent: number;
    min: number;
    max: number;
    avg: number;
  };
  z5: {
    duration: number;
    percent: number;
    min: number;
    max: number;
    avg: number;
  };
  z6: {
    duration: number;
    percent: number;
    min: number;
    max: number;
    avg: number;
  };
} => {
  // 边界: z1 <55% | z2 <75% | z3 <90% | z4 <105% | z5 <120% | z6 >=120%
  const init = () => ({
    durationMs: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    count: 0,
  });

  const buckets = {
    z1: init(),
    z2: init(),
    z3: init(),
    z4: init(),
    z5: init(),
    z6: init(),
  };

  if (!powerData.length || !ftp || ftp <= 0) {
    return {
      z1: { duration: 0, percent: 0, min: 0, max: 0, avg: 0 },
      z2: { duration: 0, percent: 0, min: 0, max: 0, avg: 0 },
      z3: { duration: 0, percent: 0, min: 0, max: 0, avg: 0 },
      z4: { duration: 0, percent: 0, min: 0, max: 0, avg: 0 },
      z5: { duration: 0, percent: 0, min: 0, max: 0, avg: 0 },
      z6: { duration: 0, percent: 0, min: 0, max: 0, avg: 0 },
    };
  }

  const totalDurationMs = dayjs(powerData[powerData.length - 1].time).diff(
    dayjs(powerData[0].time),
    'millisecond',
  );

  // 遍历数据点，按区间累计时长与功率统计
  for (let i = 1; i < powerData.length; i++) {
    const prev = powerData[i - 1];
    const cur = powerData[i];
    const dt = Math.max(
      0,
      dayjs(cur.time).diff(dayjs(prev.time), 'millisecond'),
    );
    const percentage = (cur.power / ftp) * 100;

    let key: keyof typeof buckets = 'z6';
    if (percentage < 55) key = 'z1';
    else if (percentage < 75) key = 'z2';
    else if (percentage < 90) key = 'z3';
    else if (percentage < 105) key = 'z4';
    else if (percentage < 120) key = 'z5';

    const b = buckets[key];
    b.durationMs += dt;
    b.sum += cur.power;
    b.count += 1;
    b.min = Math.min(b.min, cur.power);
    b.max = Math.max(b.max, cur.power);
  }

  const toStat = (b: typeof buckets.z1) => {
    const durationSec = Math.round(b.durationMs / 1000);
    const percent =
      totalDurationMs > 0 ? (b.durationMs / totalDurationMs) * 100 : 0;
    const avg = b.count > 0 ? b.sum / b.count : 0;
    const min = b.count > 0 ? b.min : 0;
    const max = b.count > 0 ? b.max : 0;
    return {
      duration: durationSec,
      percent,
      min,
      max,
      avg,
    };
  };

  return {
    z1: toStat(buckets.z1),
    z2: toStat(buckets.z2),
    z3: toStat(buckets.z3),
    z4: toStat(buckets.z4),
    z5: toStat(buckets.z5),
    z6: toStat(buckets.z6),
  };
};

export const calculatePowerPercentiles = (
  powerRecords: number[],
): {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
} => {
  if (powerRecords.length === 0) {
    return { p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
  }

  const sortedPowers = [...powerRecords].sort((a, b) => a - b);

  return {
    p5: interpolatePercentile(sortedPowers, 5),
    p10: interpolatePercentile(sortedPowers, 10),
    p25: interpolatePercentile(sortedPowers, 25),
    p50: interpolatePercentile(sortedPowers, 50),
    p75: interpolatePercentile(sortedPowers, 75),
    p90: interpolatePercentile(sortedPowers, 90),
    p95: interpolatePercentile(sortedPowers, 95),
  };
};

export const interpolatePercentile = (
  sortedData: number[],
  percentile: number,
): number => {
  if (sortedData.length === 0) return 0;
  if (sortedData.length === 1) return sortedData[0];

  const index = (percentile / 100) * (sortedData.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
};
