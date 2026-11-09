import { instantaneousSpeedPolicy } from '@shared/instantaneous-speed';

/**
 * 自动 activity trim：从污染尾段的起点把记录裁到结束（Ignore Part / crop）。
 *
 * 针对跑步结束后手表仍在记录、运动员已经上车的尾段。活动实体保留，
 * 只丢掉这段结尾。裁掉的样本不再进入准备后的序列，因此功率、速度、
 * 距离增量、地图坐标、心率和踏频都不会留下。它不替代实测功率可信度门
 * 和病态 eCP 拒绝。孤立的 1 秒启动毛刺由瞬时速度清洗处理，不属于这里。
 *
 * 必须在跑步速度清洗之前判断。清洗会把高于跑步上限的持续速度改写掉，
 * 尾段一旦被改写就无法再靠车速识别。
 *
 * 阈值：
 * - 只处理 RUN。这个速度区间对骑行是合理的。
 * - 车速：严格高于跑步瞬时速度上限（12 m/s，43.2 km/h）。已出现的
 *   形态约为 15 m/s / 54 km/h。
 * - 持续：终端车速段至少 15 秒且至少 8 个样本。1 秒尖峰不合格。
 * - 段内允许最多 2 个、合计不超过 2 秒的速度缺失；有明确跑速的样本
 *   会结束这段尾。车速样本占比至少 80%。
 * - 位于活动末尾。末尾最多 5 秒的非车速样本（停车后才停下记录）仍算尾段。
 * - 尾段之前至少保留 60 秒。整段都是车速时不裁，留给既有门拒绝，避免把活动清空。
 * - 至少再满足一条：车速段里至少 70% 的踏频缺失或低于 30；或者尾段功率中位数
 *   至少是非尾段中位数的 2 倍，且至少是非尾段 95 分位的 1.5 倍
 *   （非尾段至少 20 个功率样本，尾段至少 5 个）。
 * - 车速段成立后，排除窗口沿末尾连续样本向前延伸，盖住速度仍高于
 *   车速段之前 99 分位速度的加速过程。速度回到该活动自身的跑速后停止，
 *   因此更早、已经被正常跑速隔开的短暂加速不会被剪掉。
 */
export const CONTAMINATED_RUN_TAIL_TRIM = Object.freeze({
  speedMetersPerSecond: instantaneousSpeedPolicy('RUN').maxSpeedMetersPerSecond,
  minVehicleSeconds: 15,
  minVehicleSamples: 8,
  maxInternalGapSamples: 2,
  maxInternalGapSeconds: 2,
  minVehicleFraction: 0.8,
  trailingGraceSeconds: 5,
  minBodySeconds: 60,
  cadenceNearZero: 30,
  minCadenceAbsentFraction: 0.7,
  minPowerMedianRatio: 2,
  minPowerP95Ratio: 1.5,
  minBodyPowerSamples: 20,
  minTailPowerSamples: 5,
  /** 加速进车：相对车速段之前速度分布的分位。 */
  approachSpeedPercentile: 0.99,
});

export type ActivityTrimSample = {
  tMs?: number;
  time?: string | number | Date | null;
  timestamp?: string | number | Date | null;
  speed?: number | null;
  enhancedSpeed?: number | null;
  cadence?: number | null;
  power?: number | null;
};

export type ContaminatedRunTailTrim = {
  /** 第一个被裁掉的样本下标。保留的准备序列是 [0, startIndex)。 */
  startIndex: number;
  vehicleEndIndex: number;
  excludedSampleCount: number;
  vehicleDurationSeconds: number;
  corroboration: 'cadence' | 'power' | 'cadence-and-power';
  reason: 'exclude-contaminated-tail';
};

type PreparedSample = {
  tMs: number;
  speed: number | null;
  cadenceAbsent: boolean;
  power: number | null;
};

export function detectContaminatedRunTail(
  samples: readonly ActivityTrimSample[],
  sportType?: string | null,
): ContaminatedRunTailTrim | null {
  if (sportType !== 'RUN' || samples.length < 2) return null;
  const prepared = samples.map((sample, index) => prepareSample(sample, index));
  const last = prepared.length - 1;
  const graceMs = CONTAMINATED_RUN_TAIL_TRIM.trailingGraceSeconds * 1000;
  let vehicleEnd = -1;
  for (let index = last; index >= 0; index -= 1) {
    if (prepared[last].tMs - prepared[index].tMs > graceMs) break;
    if (isVehicleSpeed(prepared[index].speed)) {
      vehicleEnd = index;
      break;
    }
  }
  if (vehicleEnd < 0) return null;

  let start = vehicleRunStart(prepared, vehicleEnd);
  let vehicleSamples = countVehicleSamples(prepared, start, vehicleEnd);
  if (
    vehicleSamples / (vehicleEnd - start + 1) <
    CONTAMINATED_RUN_TAIL_TRIM.minVehicleFraction
  ) {
    start = vehicleEnd;
    while (start > 0 && isVehicleSpeed(prepared[start - 1].speed)) start -= 1;
    vehicleSamples = vehicleEnd - start + 1;
  }
  const vehicleDurationSeconds =
    (prepared[vehicleEnd].tMs - prepared[start].tMs) / 1000;
  if (
    vehicleDurationSeconds < CONTAMINATED_RUN_TAIL_TRIM.minVehicleSeconds ||
    vehicleSamples < CONTAMINATED_RUN_TAIL_TRIM.minVehicleSamples
  ) {
    return null;
  }
  const bodySeconds = (prepared[start].tMs - prepared[0].tMs) / 1000;
  if (bodySeconds < CONTAMINATED_RUN_TAIL_TRIM.minBodySeconds) return null;

  const corroboration = corroborate(prepared, start, vehicleEnd);
  if (!corroboration) return null;
  const evidenceStart = extendThroughVehicleApproach(prepared, start);
  const retainedBodySeconds =
    (prepared[evidenceStart].tMs - prepared[0].tMs) / 1000;
  if (retainedBodySeconds < CONTAMINATED_RUN_TAIL_TRIM.minBodySeconds) {
    return null;
  }
  return {
    startIndex: evidenceStart,
    vehicleEndIndex: vehicleEnd,
    excludedSampleCount: prepared.length - evidenceStart,
    vehicleDurationSeconds,
    corroboration,
    reason: 'exclude-contaminated-tail',
  };
}

/**
 * 裁掉污染尾段的全部样本。没有尾段时返回原数组。
 * 功率、速度、距离、坐标、心率、踏频都在被丢弃的样本上，不再另做按字段清除。
 */
export function cropContaminatedActivityTail<T extends ActivityTrimSample>(
  samples: readonly T[],
  sportType?: string | null,
): { records: T[]; trim: ContaminatedRunTailTrim | null } {
  const trim = detectContaminatedRunTail(samples, sportType);
  if (!trim) return { records: samples as T[], trim: null };
  return { records: samples.slice(0, trim.startIndex), trim };
}

function prepareSample(
  sample: ActivityTrimSample,
  index: number,
): PreparedSample {
  return {
    tMs: timeMs(sample, index),
    speed: preferredSpeed(sample),
    cadenceAbsent: isCadenceAbsent(sample.cadence),
    power: finiteNonNegative(sample.power),
  };
}

function extendThroughVehicleApproach(
  samples: readonly PreparedSample[],
  vehicleStart: number,
) {
  const bodySpeeds: number[] = [];
  for (let index = 0; index < vehicleStart; index += 1) {
    if (samples[index].speed != null) bodySpeeds.push(samples[index].speed);
  }
  if (bodySpeeds.length < CONTAMINATED_RUN_TAIL_TRIM.minBodyPowerSamples) {
    return vehicleStart;
  }
  bodySpeeds.sort((left, right) => left - right);
  const departure = quantile(
    bodySpeeds,
    CONTAMINATED_RUN_TAIL_TRIM.approachSpeedPercentile,
  );
  let start = vehicleStart;
  while (start > 0) {
    const speed = samples[start - 1].speed;
    if (speed == null || speed <= departure) break;
    start -= 1;
  }
  return start;
}

function vehicleRunStart(
  samples: readonly PreparedSample[],
  vehicleEnd: number,
) {
  let start = vehicleEnd;
  while (start > 0) {
    if (isVehicleSpeed(samples[start - 1].speed)) {
      start -= 1;
      continue;
    }
    const bridged = bridgeMissingSpeed(samples, start);
    if (bridged == null) break;
    start = bridged;
  }
  return start;
}

function bridgeMissingSpeed(
  samples: readonly PreparedSample[],
  start: number,
): number | null {
  const maxGap = CONTAMINATED_RUN_TAIL_TRIM.maxInternalGapSamples;
  for (let skipped = 1; skipped <= maxGap; skipped += 1) {
    const candidate = start - skipped - 1;
    if (candidate < 0) return null;
    const gapSeconds = (samples[start].tMs - samples[candidate].tMs) / 1000;
    if (gapSeconds > CONTAMINATED_RUN_TAIL_TRIM.maxInternalGapSeconds) {
      return null;
    }
    if (
      samples.slice(candidate + 1, start).some((sample) => sample.speed != null)
    ) {
      return null;
    }
    if (isVehicleSpeed(samples[candidate].speed)) return candidate;
  }
  return null;
}

function countVehicleSamples(
  samples: readonly PreparedSample[],
  start: number,
  end: number,
) {
  let count = 0;
  for (let index = start; index <= end; index += 1) {
    if (isVehicleSpeed(samples[index].speed)) count += 1;
  }
  return count;
}

function corroborate(
  samples: readonly PreparedSample[],
  start: number,
  vehicleEnd: number,
): ContaminatedRunTailTrim['corroboration'] | null {
  let absent = 0;
  const tailPower: number[] = [];
  for (let index = start; index <= vehicleEnd; index += 1) {
    if (samples[index].cadenceAbsent) absent += 1;
    if (samples[index].power != null) tailPower.push(samples[index].power);
  }
  const cadence =
    absent / (vehicleEnd - start + 1) >=
    CONTAMINATED_RUN_TAIL_TRIM.minCadenceAbsentFraction;
  const power = powerIsAboveBody(samples, start, tailPower);
  if (cadence && power) return 'cadence-and-power';
  if (cadence) return 'cadence';
  if (power) return 'power';
  return null;
}

function powerIsAboveBody(
  samples: readonly PreparedSample[],
  start: number,
  tailPower: number[],
) {
  if (tailPower.length < CONTAMINATED_RUN_TAIL_TRIM.minTailPowerSamples) {
    return false;
  }
  const bodyPower: number[] = [];
  for (let index = 0; index < start; index += 1) {
    if (samples[index].power != null) bodyPower.push(samples[index].power);
  }
  if (bodyPower.length < CONTAMINATED_RUN_TAIL_TRIM.minBodyPowerSamples) {
    return false;
  }
  const bodySorted = [...bodyPower].sort((left, right) => left - right);
  const tailSorted = [...tailPower].sort((left, right) => left - right);
  const bodyMedian = quantile(bodySorted, 0.5);
  const bodyP95 = quantile(bodySorted, 0.95);
  const tailMedian = quantile(tailSorted, 0.5);
  return (
    tailMedian >= bodyMedian * CONTAMINATED_RUN_TAIL_TRIM.minPowerMedianRatio &&
    tailMedian >= bodyP95 * CONTAMINATED_RUN_TAIL_TRIM.minPowerP95Ratio
  );
}

function isVehicleSpeed(speed: number | null) {
  return (
    speed != null && speed > CONTAMINATED_RUN_TAIL_TRIM.speedMetersPerSecond
  );
}

function isCadenceAbsent(value: number | null | undefined) {
  return (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < CONTAMINATED_RUN_TAIL_TRIM.cadenceNearZero
  );
}

function preferredSpeed(sample: ActivityTrimSample) {
  return (
    finiteNonNegative(sample.enhancedSpeed) ?? finiteNonNegative(sample.speed)
  );
}

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function timeMs(sample: ActivityTrimSample, index: number) {
  if (typeof sample.tMs === 'number' && Number.isFinite(sample.tMs)) {
    return sample.tMs;
  }
  const raw = sample.time ?? sample.timestamp;
  const parsed =
    raw instanceof Date
      ? raw.getTime()
      : typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Date.parse(raw)
          : Number.NaN;
  return Number.isFinite(parsed) ? parsed : index * 1000;
}

function quantile(sorted: readonly number[], q: number) {
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
