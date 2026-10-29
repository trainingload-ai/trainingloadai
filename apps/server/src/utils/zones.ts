import { vVo2MaxFromVDOT } from '@/algorithm/vo2max';
import { round } from 'lodash';
import { $Enums, ZoneBase } from '@prisma/client';
import {
  resolveLthrForCalculation,
  type LthrCalculationSource,
} from '@shared/lthr';

/**
 * 功率区间具体值
 */
export interface UserZoneValue {
  min?: number;
  max?: number;
  color?: string;
  duration?: number;
  percent?: number;
  avg?: number;
  name: 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | string;
  order?: number;
}

export interface UserZoneSetting {
  configurationSource?: 'saved' | 'generated';
  model?: string | null;
  benchmark?: $Enums.ZoneBase | null;
  benchmarkSource?: LthrCalculationSource | 'CUSTOM' | 'UNKNOWN';
  zones: UserZoneValue[];
}

/**
 * Time-weighted zone distribution for irregular sensor streams. The left
 * sample owns the interval until the next timestamp; spans over 10 seconds and
 * invalid values are unknown rather than fabricated duration.
 */
export function fillTimedValuesToZones(
  samples: Array<{ tMs: number; value: number | null }>,
  zones?: UserZoneValue[],
): UserZoneValue[] {
  if (!zones?.length) return [];
  const result = zones.map((zone) => ({
    ...zone,
    duration: 0,
    avg: 0,
    percent: 0,
  }));
  const ordered = [...samples]
    .filter((sample) => Number.isFinite(sample.tMs))
    .sort((a, b) => a.tMs - b.tMs)
    .filter(
      (sample, index, rows) => index === 0 || sample.tMs > rows[index - 1].tMs,
    );
  let coveredSeconds = 0;
  for (let index = 0; index < ordered.length - 1; index++) {
    const current = ordered[index];
    const seconds = (ordered[index + 1].tMs - current.tMs) / 1000;
    const value = current.value;
    if (
      seconds <= 0 ||
      seconds > 10 ||
      value == null ||
      !Number.isFinite(value)
    ) {
      continue;
    }
    const zoneIndex = result.findIndex((zone, candidateIndex) => {
      const min = zone.min ?? 0;
      const max = zone.max ?? Number.POSITIVE_INFINITY;
      return (
        value >= min && (candidateIndex === result.length - 1 || value < max)
      );
    });
    if (zoneIndex < 0) continue;
    coveredSeconds += seconds;
    result[zoneIndex].duration = (result[zoneIndex].duration ?? 0) + seconds;
    result[zoneIndex].avg = (result[zoneIndex].avg ?? 0) + value * seconds;
  }
  for (const zone of result) {
    const seconds = zone.duration ?? 0;
    zone.percent = round(
      coveredSeconds > 0 ? (seconds / coveredSeconds) * 100 : 0,
      2,
    );
    zone.avg = round(seconds > 0 ? (zone.avg ?? 0) / seconds : 0, 2);
  }
  return result;
}
// 根据百分比，来直接生成对应的功率区间
export const resolvePowerZoneSettings = (
  setting: UserZoneSetting,
  context: {
    FTP?: number;
    CP?: number;
  },
): UserZoneValue[] | undefined => {
  let zones = setting.zones || [];
  if (setting.benchmark !== ZoneBase.CUSTOM) {
    let benchmarkValue = 0; // Default fallback

    // 优先 FTP，其次是 CP
    if (setting.benchmark === ZoneBase.FTP && context.FTP) {
      benchmarkValue = Number(context.FTP);
    } else if (setting.benchmark === ZoneBase.CP && context.CP) {
      benchmarkValue = Number(context.CP);
    }
    if (benchmarkValue <= 0) {
      return undefined;
    }
    zones = setting.zones.map((z) => ({
      ...z,
      min: round((z.min / 100) * benchmarkValue, 0),
      max: z.max ? round((z.max / 100) * benchmarkValue, 0) : undefined,
    }));
  }

  return zones;
};
/**
 * 根据用户的 zone setting 配置解析出 Heart Rate Zone 配置
 * @param setting UserZoneSetting
 * @param userProfile { maxHeartRate?: number; restingHeartRate?: number; lthr?: number; }
 * @returns ResolvedUserZoneSetting | undefined
 */
export const resolveHeartRateSettings = (
  setting: UserZoneSetting,
  userProfile: {
    maxHeartRate?: number;
    restingHeartRate?: number;
    lthr?: number;
  },
): UserZoneValue[] | undefined => {
  if (!setting || !setting.zones) {
    return undefined;
  }
  let zones = setting.zones;
  // 如果是不是 CUSTOM 类型，那么就根据 benchmark 来计算 min 和 max
  if (setting?.benchmark !== ZoneBase.CUSTOM && zones.length > 0) {
    let benchmarkValue: number | undefined;
    let baseValue = 0;

    if (setting.benchmark === ZoneBase.LTHR) {
      benchmarkValue = resolveLthrForCalculation({
        lthr: userProfile.lthr,
        maxHeartRate: userProfile.maxHeartRate,
      })?.value;
    } else if (
      setting.benchmark === ZoneBase.HRR &&
      userProfile.maxHeartRate &&
      userProfile.restingHeartRate
    ) {
      // HRR: % of Reserve + Rest
      benchmarkValue = userProfile.maxHeartRate - userProfile.restingHeartRate;
      baseValue = userProfile.restingHeartRate;
    } else if (setting.benchmark === ZoneBase.MHR) {
      benchmarkValue = userProfile.maxHeartRate;
    }
    if (!benchmarkValue || !Number.isFinite(benchmarkValue)) return undefined;
    // 根据 值来重写 min 和 max
    zones = zones.map((z) => ({
      ...z,
      min: round(baseValue + (z.min / 100) * benchmarkValue, 0),
      max: z.max
        ? round(baseValue + (z.max / 100) * benchmarkValue, 0)
        : undefined,
    }));
  }

  return zones;
};

export const resolvePaceZoneSettings = (
  setting: UserZoneSetting,
  context: {
    vo2max?: number; // VDOT
    tp?: number; // Threshold Speed (m/s)
    cs?: number; // Critical Speed (m/s)
  },
): UserZoneValue[] | undefined => {
  const zones = setting?.zones || [];
  if (!zones || zones.length === 0) return undefined;

  if (setting.benchmark === ZoneBase.CUSTOM || !setting.benchmark) {
    return zones;
  }

  let baseSpeedMps: number | undefined;
  if (
    setting.benchmark === ZoneBase.VO2MAX &&
    Number.isFinite(context.vo2max) &&
    context.vo2max > 0
  ) {
    const speedMmin = vVo2MaxFromVDOT(Number(context.vo2max));
    baseSpeedMps =
      Number.isFinite(speedMmin) && speedMmin > 0 ? speedMmin / 60 : undefined;
  } else if (setting.benchmark === ZoneBase.TP && context.tp) {
    baseSpeedMps = Number(context.tp);
  } else if (setting.benchmark === ZoneBase.CS && context.cs) {
    baseSpeedMps = Number(context.cs);
  }
  if (!Number.isFinite(baseSpeedMps) || (baseSpeedMps || 0) <= 0) {
    return undefined;
  }

  const toGap = (percent?: number): number | undefined => {
    if (!Number.isFinite(percent) || (percent || 0) <= 0) return undefined;
    const speed = (baseSpeedMps as number) * ((percent as number) / 100);
    if (!Number.isFinite(speed) || speed <= 0) return undefined;
    return round(1 / speed, 6);
  };

  const parsed: UserZoneValue[] = zones.map((z, idx) => ({
    name: z?.name || `z${idx + 1}`,
    order: z?.order ?? idx + 1,
    min: toGap(z?.max),
    max: z?.min != null ? toGap(z?.min) : undefined,
  }));

  return parsed;
};

/**
 * 将 records 数据填入 zones
 * @param records
 * @param zones
 * @returns
 */
export const fillValueToPowerZones = (
  records: {
    power: number;
  }[],
  zones?: UserZoneValue[],
  sampleSecInput?: number,
): UserZoneValue[] => {
  if (!zones || zones.length === 0) {
    return [];
  }
  const sampleSec =
    sampleSecInput != null &&
    Number.isFinite(sampleSecInput) &&
    sampleSecInput > 0
      ? sampleSecInput
      : 1;

  // Initialize zones with 0 values
  const result: UserZoneValue[] = zones.map((z) => ({
    ...z,
    duration: 0,
    avg: 0,
    percent: 0,
  }));

  const totalDurationSec = records.length * sampleSec;
  for (let i = 0; i < records.length; i++) {
    const cur = records[i];
    const power = cur.power;
    // Power can be 0, but usually not negative. Skip invalid.
    if (power == null || isNaN(power) || power < 0) continue;

    for (let j = 0; j < result.length; j++) {
      const sec = result[j];
      const isLast = j === result.length - 1;
      // Use inclusive min and exclusive max (except for last zone)
      if (
        power >= (sec.min || 0) &&
        (isLast || power < (sec.max || Number.MAX_VALUE))
      ) {
        result[j].duration = (result[j].duration || 0) + sampleSec;
        // Online update of average value (sum now, average later)
        result[j].avg = (result[j].avg || 0) + power * sampleSec;
      }
    }
  }

  // Process percentage and avg
  for (let i = 0; i < result.length; i++) {
    const d = result[i].duration || 0;
    result[i].percent = round(d ? (d / totalDurationSec) * 100 : 0, 2);
    result[i].avg = round(d ? (result[i].avg || 0) / d : 0, 2);
  }

  return result;
};

/**
 * 将心率记录填充到心率区间，生成分布统计
 * - 输入为心率样本与区间设置（区间为绝对 bpm 上下限）
 * - 输出为每个区间的累计时长、平均心率和占比
 * - 边界规则：左闭右开 [min, max)，最后一个区间为 [min, +∞)
 */
export const fillValueToHeartRateZones = (
  records: {
    heartRate: number;
  }[],
  zones?: UserZoneValue[],
  sampleSecInput?: number,
): UserZoneValue[] => {
  if (!zones || zones.length === 0) {
    return [];
  }
  const sampleSec =
    sampleSecInput != null &&
    Number.isFinite(sampleSecInput) &&
    sampleSecInput > 0
      ? sampleSecInput
      : 1;

  // Initialize zones with 0 values
  const result: UserZoneValue[] = zones.map((z) => ({
    ...z,
    duration: 0,
    avg: 0,
    percent: 0,
  }));

  const totalDurationSec = records.length * sampleSec;
  for (let i = 0; i < records.length; i++) {
    const cur = records[i];
    const hr = cur.heartRate;
    if (hr == null || isNaN(hr) || hr <= 0) continue;

    for (let j = 0; j < result.length; j++) {
      const sec = result[j];
      const isLast = j === result.length - 1;
      // Use inclusive min and exclusive max (except for last zone)
      if (
        hr >= (sec.min || 0) &&
        (isLast || hr < (sec.max || Number.MAX_VALUE))
      ) {
        result[j].duration = (result[j].duration || 0) + sampleSec;
        // Online update of average value (sum now, average later)
        result[j].avg = (result[j].avg || 0) + hr * sampleSec;
      }
    }
  }

  // Process percentage and avg (按样本计数近似时长占比)
  for (let i = 0; i < result.length; i++) {
    const d = result[i].duration || 0;
    result[i].percent = round(d ? (d / totalDurationSec) * 100 : 0, 2);
    result[i].avg = round(d ? (result[i].avg || 0) / d : 0, 2);
  }
  return result;
};

/**
 * 将速度样本（米/秒）填入配速区间，生成分布统计。
 * - 入参仅需 `speed`；区间 min/max 为 GAP（秒/米），内部用 gap=1/speed 与区间比较。
 * - `sampleSec` 由调用方（如 metrics task）传入；未传或非正数时按 1 秒计，本函数内不再估算。
 * - 输出 avg 为区间内平均 GAP（秒/米），与落库 ActivityZone 语义一致。
 * - 边界规则：左闭右开 [min, max)（GAP 空间）；max 缺省视为无上界。
 */
export const fillValueToPaceZones = (
  records: { speed: number }[],
  zones: UserZoneValue[],
  sampleSecInput?: number,
): UserZoneValue[] => {
  if (!zones || zones.length === 0) return [];

  const inputRecords = records || [];
  const sampleSec =
    sampleSecInput != null &&
    Number.isFinite(sampleSecInput) &&
    sampleSecInput > 0
      ? sampleSecInput
      : 1;

  const result: UserZoneValue[] = zones.map((z) => ({
    ...z,
    duration: 0,
    avg: 0,
    percent: 0,
  }));

  const totalDurationSec = inputRecords.length * sampleSec;

  for (let i = 0; i < inputRecords.length; i++) {
    const speed = inputRecords[i]?.speed as number | undefined;
    if (speed == null || !Number.isFinite(speed) || speed <= 0) continue;
    const gap = 1 / speed;

    for (let j = 0; j < result.length; j++) {
      const zone = result[j];
      const min = zone.min ?? 0;
      const max =
        zone.max != null && Number.isFinite(zone.max)
          ? zone.max
          : Number.MAX_VALUE;

      if (gap >= min && gap < max) {
        zone.duration = (zone.duration || 0) + sampleSec;
        zone.avg = (zone.avg || 0) + gap * sampleSec;
      }
    }
  }

  for (let i = 0; i < result.length; i++) {
    const dSec = result[i].duration || 0;
    result[i].percent = round(
      totalDurationSec > 0 ? (dSec / totalDurationSec) * 100 : 0,
      2,
    );
    result[i].avg = round(dSec > 0 ? (result[i].avg || 0) / dSec : 0, 2);
  }

  return result;
};

/**
 * 判断 zones 区间有没有更新过
 * @param persistedZones
 * @param targetZones
 * @returns
 */
export const isSameZones = (
  persistedZones: UserZoneSetting,
  targetZones: UserZoneSetting,
) => {
  return (
    persistedZones.zones.length === targetZones.zones.length &&
    persistedZones.zones.every((z, i) => {
      const t = targetZones.zones[i];
      return (
        round(z.min, 2) === round(t.min, 2) &&
        round(z.max, 2) === round(t.max, 2)
      );
    })
  );
};
