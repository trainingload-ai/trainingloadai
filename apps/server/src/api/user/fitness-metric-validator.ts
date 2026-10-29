import { MetricSource, SportType, UserFitnessMetricType } from '@prisma/client';

export type FitnessMetricValidationContext = Partial<
  Record<UserFitnessMetricType, number | null | undefined>
>;

export type FitnessMetricCandidate = {
  type: UserFitnessMetricType;
  value: number;
  value2?: number | null;
  sport?: SportType | null;
  source?: string | null;
};

export type FitnessMetricValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export type FitnessMetricValidationOptions = {
  /** 自动推算需要必要参照；手动/外部实测允许独立建档。 */
  requireReferenceMetrics?: boolean;
};

/**
 * 体能阈值写入前的统一保护。
 *
 * 绝对上下限故意保持宽松，只负责排除不可能/明显错误的数据；真正的
 * 保护来自同一生理系统内的相对关系校验。
 */
export function validateFitnessMetricCandidate(
  candidate: FitnessMetricCandidate,
  context: FitnessMetricValidationContext = {},
  options: FitnessMetricValidationOptions = {},
): FitnessMetricValidationResult {
  const { type, value } = candidate;
  if (!Number.isFinite(value)) return invalid('value_not_finite');
  const bounds = intrinsicBounds(type, candidate.sport);
  if (bounds && (value < bounds.min || value > bounds.max)) {
    return invalid(`outside_intrinsic_range:${bounds.min}-${bounds.max}`);
  }
  if (
    type === UserFitnessMetricType.CS &&
    candidate.sport === SportType.RUN &&
    candidate.source === MetricSource.AUTO &&
    value < 1.8
  ) {
    return invalid('auto_running_cs_below_minimum:1.8');
  }

  const maxHr = positive(context[UserFitnessMetricType.MAX_HR]);
  const restingHr = positive(context[UserFitnessMetricType.RESTING_HR]);
  const lthr = positive(context[UserFitnessMetricType.LTHR]);
  const cp = positive(context[UserFitnessMetricType.CP]);
  const ftp = positive(context[UserFitnessMetricType.FTP]);
  const pMax = positive(context[UserFitnessMetricType.P_MAX]);
  const cs = positive(context[UserFitnessMetricType.CS]);
  const tp = positive(context[UserFitnessMetricType.TP]);

  if (type === UserFitnessMetricType.LTHR) {
    if (options.requireReferenceMetrics && !maxHr) {
      return invalid('max_hr_required_for_lthr');
    }
    if (restingHr && value < restingHr + 20) {
      return invalid('lthr_too_close_to_resting_hr');
    }
    if (maxHr && (value < maxHr * 0.65 || value > maxHr * 0.98)) {
      return invalid('lthr_not_consistent_with_max_hr');
    }
  }

  if (type === UserFitnessMetricType.MAX_HR) {
    if (restingHr && value < restingHr + 40) {
      return invalid('max_hr_too_close_to_resting_hr');
    }
    if (lthr && value < lthr / 0.98) {
      return invalid('max_hr_below_lthr');
    }
  }

  if (type === UserFitnessMetricType.RESTING_HR) {
    if (maxHr && value > maxHr - 40) {
      return invalid('resting_hr_too_close_to_max_hr');
    }
    if (lthr && value > lthr - 20) {
      return invalid('resting_hr_too_close_to_lthr');
    }
  }

  if (type === UserFitnessMetricType.AET_HR) {
    if (restingHr && value < restingHr + 15) {
      return invalid('aet_hr_too_close_to_resting_hr');
    }
    if (lthr && value >= lthr) return invalid('aet_hr_not_below_lthr');
  }

  if (type === UserFitnessMetricType.CP && ftp) {
    const ratio = ftp / value;
    if (ratio < 0.75 || ratio > 1.1) {
      return invalid('cp_not_consistent_with_ftp');
    }
  }
  if (type === UserFitnessMetricType.FTP && cp) {
    const ratio = value / cp;
    if (ratio < 0.75 || ratio > 1.1) {
      return invalid('ftp_not_consistent_with_cp');
    }
  }
  if (type === UserFitnessMetricType.P_MAX) {
    const thresholdPower = Math.max(cp ?? 0, ftp ?? 0);
    if (thresholdPower > 0 && value < thresholdPower) {
      return invalid('pmax_below_threshold_power');
    }
  }
  if (
    (type === UserFitnessMetricType.CP || type === UserFitnessMetricType.FTP) &&
    pMax &&
    value > pMax
  ) {
    return invalid('threshold_power_above_pmax');
  }

  if (type === UserFitnessMetricType.TP && cs) {
    const ratio = value / cs;
    if (ratio < 0.7 || ratio > 1.05) {
      return invalid('tp_not_consistent_with_cs');
    }
  }
  if (type === UserFitnessMetricType.CS && tp) {
    const ratio = tp / value;
    if (ratio < 0.7 || ratio > 1.05) {
      return invalid('cs_not_consistent_with_tp');
    }
  }

  return { valid: true };
}

function intrinsicBounds(
  type: UserFitnessMetricType,
  sport?: SportType | null,
): { min: number; max: number } | null {
  switch (type) {
    case UserFitnessMetricType.CP:
    case UserFitnessMetricType.FTP:
      return { min: 30, max: 2000 };
    case UserFitnessMetricType.P_MAX:
      return { min: 50, max: 3000 };
    case UserFitnessMetricType.W_PRIME:
      return { min: 500, max: 100_000 };
    case UserFitnessMetricType.MAX_HR:
      return { min: 80, max: 240 };
    case UserFitnessMetricType.RESTING_HR:
      return { min: 25, max: 120 };
    case UserFitnessMetricType.LTHR:
      return { min: 70, max: 230 };
    case UserFitnessMetricType.AET_HR:
      return { min: 50, max: 220 };
    case UserFitnessMetricType.CS:
    case UserFitnessMetricType.TP:
      return sport === SportType.SWIM
        ? { min: 0.3, max: 3 }
        : { min: 0.3, max: 12 };
    case UserFitnessMetricType.VO2_MAX:
      return { min: 10, max: 100 };
    default:
      return null;
  }
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function invalid(reason: string): FitnessMetricValidationResult {
  return { valid: false, reason };
}
