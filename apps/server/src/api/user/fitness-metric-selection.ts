import { SportType, UserFitnessMetricType } from '@prisma/client';
import { validateFitnessMetricCandidate } from './fitness-metric-validator';

export type EffectiveFitnessMetricCandidate = {
  recordedAt: Date;
  source: string;
  sport: string;
  type: string;
  value?: unknown;
  value2?: unknown;
};

function asUserFitnessMetricType(
  value: string,
): UserFitnessMetricType | null {
  return (Object.values(UserFitnessMetricType) as string[]).includes(value)
    ? (value as UserFitnessMetricType)
    : null;
}

function asSportType(value: string): SportType | null {
  return (Object.values(SportType) as string[]).includes(value)
    ? (value as SportType)
    : null;
}

/**
 * 从同一指标的手动与自动历史中选择当前生效值。
 *
 * 自动更新开关只控制后续是否允许写入 AUTO 记录，不参与读取优先级。
 * 读取时先保持运动专项优先于 legacy UNKNOWN，再按生效时间取最新值；
 * 时间完全相同时让用户手动值胜出。
 */
export function selectEffectiveFitnessMetric<
  T extends EffectiveFitnessMetricCandidate,
>(candidates: T[], type: string, preferredSport: string | null): T | undefined {
  const matchingType = candidates.filter((candidate) => {
    if (candidate.type !== type) return false;
    const metricType = asUserFitnessMetricType(candidate.type);
    const sport = asSportType(candidate.sport);
    if (!metricType) return false;
    if (
      !validateFitnessMetricCandidate({
        type: metricType,
        value: Number(candidate.value),
        sport,
        source: candidate.source,
      }).valid
    ) {
      return false;
    }
    return true;
  });
  const sportSpecific = preferredSport
    ? matchingType.filter((candidate) => candidate.sport === preferredSport)
    : [];
  const pool =
    sportSpecific.length > 0
      ? sportSpecific
      : matchingType.filter((candidate) => candidate.sport === 'UNKNOWN');

  return [...pool].sort((left, right) => {
    const timeDifference =
      right.recordedAt.getTime() - left.recordedAt.getTime();
    if (timeDifference !== 0) return timeDifference;
    if (left.source === right.source) return 0;
    return left.source === 'MANUAL' ? -1 : 1;
  })[0];
}
