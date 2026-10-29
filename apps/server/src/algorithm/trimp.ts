import { UserZoneValue } from '@/utils/zones';
import { round } from 'lodash';
import { Gender } from '@prisma/client';
import {
  ESTIMATED_LTHR_MAX_HR_RATIO,
  resolveLthrForCalculation,
} from '@shared/lthr';

/**
 * 计算 TRIMP（Banister 的训练冲量 Training Impulse）
 *
 * 版本：v1.0（Banister TRIMPexp，全程近似）
 *
 * @param durationMin - 训练时长（分钟）
 * @param avgHR - 训练平均心率（bpm）
 * @param maxHR - 最大心率（bpm）
 * @param restHR - 静息心率（bpm）
 * @param gender - 性别：'male' 或 'female'
 * @returns TRIMP 值
 */
export const computeTRIMP = (
  durationMin: number,
  avgHR: number,
  maxHR?: number,
  restHR?: number,
  gender: string | Gender = 'male',
): number => {
  // 如果没有储备心率，则直接退化到 平均心率缩放
  if (!maxHR || !restHR || maxHR <= restHR) {
    return 0;
    // return computeTRIMPWithAvg(durationMin, avgHR);
  }
  // 1) 计算心率储备比（HRr）
  const hrRatio = (avgHR - restHR) / (maxHR - restHR);
  if (hrRatio <= 0) return 0;

  // 2) 根据性别选择系数
  // 男性：0.64 * exp(1.92 * HRr)
  // 女性：0.64 * exp(1.67 * HRr)
  const genderCoeff = 0.64;
  let expCoeff = 1.92;

  const g = gender.toString().toLowerCase();
  if (g === 'female') {
    expCoeff = 1.67;
  }
  // 3) Banister TRIMPexp 公式（全程近似）
  const trimp =
    durationMin * hrRatio * genderCoeff * Math.exp(expCoeff * hrRatio);
  return round(trimp, 2);
};

/**
 * 如果没有 静息心率、最大心率的话，退化到平均心率缩放来计算 TRIMP
 */
export const computeTRIMPWithAvg = (durationMin: number, avgHR: number) => {
  if (durationMin && avgHR) {
    return round(durationMin * avgHR, 2);
  }
  return 0;
};

/**
 * TRIMP100 旧调用方保留的比例别名；统一策略定义在 packages/shared/lthr。
 */
export const TRIMP100_ESTIMATED_LTHR_MAX_HR_RATIO = ESTIMATED_LTHR_MAX_HR_RATIO;

export const estimateTrimp100LthrFromMaxHr = (
  maxHR?: number,
): number | undefined =>
  resolveLthrForCalculation({ maxHeartRate: maxHR })?.value;

/**
 * 计算 TRIMP100（Banister 的训练冲量 Training Impulse 100%）
 * @param trimp
 * @param maxHR
 * @param restHR
 * @param ltHR - 真实 LTHR；缺失时仅为本次负荷归一化回退到 MAXHR × 88%
 * @param gender
 * @returns
 */
export const computeTRIMP100 = (
  trimp: number,
  maxHR: number,
  restHR: number,
  ltHR?: number,
  gender: string | Gender = 'male',
): number => {
  if (!trimp || trimp <= 0) return 0;
  const normalizationLthr = resolveLthrForCalculation({
    lthr: ltHR,
    maxHeartRate: maxHR,
  })?.value;
  if (
    !maxHR ||
    !restHR ||
    !normalizationLthr ||
    maxHR <= restHR ||
    normalizationLthr <= restHR
  ) {
    return 0;
  }
  const genderCoeff = 0.64;
  let expCoeff = 1.92;
  const g = gender.toString().toLowerCase();
  if (g === 'female') {
    expCoeff = 1.67;
  }
  const ratio = (normalizationLthr - restHR) / (maxHR - restHR);
  if (ratio <= 0) return 0;
  const denom = 60 * ratio * genderCoeff * Math.exp(expCoeff * ratio);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  const score = (100 * trimp) / denom;
  return round(score, 2);
};

/**
 * 当游泳/跑步/骑行活动没有 *Score 指标时的兜底计算
 * @param zones 分区数据（最好是基于 LTHR 的分区，以匹配 TRIMPZonal 系数含义）
 * @param options 可选参数
 * @returns TRIMPZonal 值
 */
export const computeTRIMPZonal = (
  // zones 最好使用 LTHR 分区，以对齐 TRIMPZonal 的权重系数语义
  zones: UserZoneValue[],
  options?: {
    weights?: number[];
    avgHr?: number;
    durationSec?: number;
  },
): number => {
  if (!zones || zones.length === 0) return 0;

  const indexedZones = zones.map((z, i) => {
    if (typeof z.order === 'number' && Number.isFinite(z.order)) {
      return { zone: z, order: z.order, index: i };
    }
    const match = /z(\d+)/i.exec(String(z.name));
    const parsed = match ? Number(match[1]) : undefined;
    return {
      zone: z,
      order: Number.isFinite(parsed) ? (parsed as number) : i + 1,
      index: i,
    };
  });

  const ordered = indexedZones
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    })
    .map((z) => z.zone);

  const weights =
    options?.weights && options.weights.length > 0
      ? options.weights
      : ordered.length === 5
        ? [0.9, 1.1, 1.2, 2.0, 5.0]
        : ordered.map((_, i) => i + 1);

  let value = 0;
  for (let i = 0; i < ordered.length; i++) {
    const zone = ordered[i];
    const durationSec = zone?.duration ?? 0;
    const weight = weights[i];
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(durationSec) || durationSec <= 0) continue;
    value += weight * durationSec;
  }

  if (
    value === 0 &&
    options?.avgHr != null &&
    Number.isFinite(options.avgHr) &&
    options?.durationSec != null &&
    Number.isFinite(options.durationSec) &&
    options.durationSec > 0
  ) {
    const avgHr = options.avgHr;
    const fallbackDurationSec = options.durationSec;
    const idx = ordered.findIndex((zone) => {
      const min = zone.min ?? Number.NEGATIVE_INFINITY;
      const max = zone.max ?? Number.POSITIVE_INFINITY;
      return avgHr >= min && avgHr < max;
    });
    if (idx >= 0) {
      const weight = weights[idx];
      if (Number.isFinite(weight) && weight > 0) {
        value += weight * fallbackDurationSec;
      }
    }
  }

  if (value <= 0 || !Number.isFinite(value)) return 0;
  return round(value / 60, 2);
};

/**
 * 计算 Session RPE（主观用力程度 Rate of Perceived Exertion）
 *
 * Session RPE = RPE * 分钟数
 * - RPE：主观用力程度（10 分制改良 Borg 量表）
 * - 分钟数：优先使用 Moving Time，否则使用 Duration
 *
 * @param durationMin - 训练时长（分钟）
 * @param rpe - 主观用力程度（10 分制改良 Borg 量表）
 * @returns Session RPE 值
 */
export const computeSessionRPE = (
  durationMin: number,
  rpe?: number,
): number => {
  if (!rpe || rpe <= 0) return 0;
  if (!durationMin || durationMin <= 0) return 0;
  return round(rpe * durationMin, 2);
};
