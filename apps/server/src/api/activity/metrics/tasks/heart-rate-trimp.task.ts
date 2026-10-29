import { Injectable } from '@nestjs/common';
import { Gender, UserFitnessMetricType } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { mean, round } from 'lodash';
import { calculateHrTss, estimateMaxHeartRate } from '@/algorithm/utils';
import {
  computeTRIMP,
  computeTRIMP100,
  computeTRIMPZonal,
} from '@/algorithm/trimp';
import { resolveLthrForCalculation } from '@shared/lthr';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { UserService } from '@/api/user/user.service';
import { pickPositiveThreshold } from '../fitness-metric-priority';

@Injectable()
export class HeartRateTrimpTask implements MetricsTask {
  key = 'heartRateTrimp' as const;

  constructor(
    private readonly persistence: AnalyzePersistenceService,
    private readonly userService: UserService,
  ) {}

  async pre(ctx: MetricsContext) {
    const { activity, userId } = ctx.inputs;
    if (!userId || !activity?.id) return ctx;

    let next = ctx;

    if (!next.cache.profile || !next.cache.hrThreshold) {
      const [profile, hrThreshold] = await Promise.all([
        next.cache.profile ??
          this.userService.getComposedUserProfile(
            userId,
            activity.sportType,
            activity.startTime ?? undefined,
          ),
        next.cache.hrThreshold ??
          this.userService.getUserHeartRateThreshold(
            userId,
            activity.sportType,
            activity.startTime ?? undefined,
          ),
      ]);
      next = {
        ...next,
        cache: {
          ...next.cache,
          profile,
          hrThreshold,
        },
      };
    }

    const profile = next.cache.profile;
    if (profile && !profile.gender) {
      next = {
        ...next,
        cache: { ...next.cache, profile: { ...profile, gender: Gender.MALE } },
      };
    }

    return next;
  }

  async exec(ctx: MetricsContext) {
    const profile = ctx.cache.profile;
    const hrThreshold = ctx.cache.hrThreshold;
    const rows = ctx.inputs.canonicalRecords ?? [];
    if (!rows.length) return ctx;

    const sampleSec =
      ctx.cache.sampleSec != null &&
      Number.isFinite(ctx.cache.sampleSec) &&
      ctx.cache.sampleSec > 0
        ? ctx.cache.sampleSec
        : 1;

    // 使用上游计算结果；缺失时再从 canonical records 兜底计算。
    const zoneValues = ctx.outputs.heartRateZones?.zone?.zones ?? [];
    const zoneDurationSec = zoneValues.reduce(
      (sum, z) =>
        sum +
        (typeof z.duration === 'number' && Number.isFinite(z.duration)
          ? z.duration
          : 0),
      0,
    );

    let hrRecords: number[] | undefined;
    const getHrRecords = () => {
      hrRecords ??= rows
        .map((r) => r.heartRate)
        .filter((v): v is number => v !== undefined && v !== null && v > 0);
      return hrRecords;
    };

    const reusableAvg =
      ctx.outputs.heartRateBase?.avg != null &&
      Number.isFinite(ctx.outputs.heartRateBase.avg)
        ? ctx.outputs.heartRateBase.avg
        : undefined;
    const avg = reusableAvg ?? mean(getHrRecords());
    const durationSec =
      zoneDurationSec > 0 ? zoneDurationSec : getHrRecords().length * sampleSec;
    if (
      !Number.isFinite(avg) ||
      avg <= 0 ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0
    ) {
      return ctx;
    }

    const effectiveMetrics = ctx.cache.fitnessMetrics ?? {};
    const maxHr = pickPositiveThreshold(
      effectiveMetrics[UserFitnessMetricType.MAX_HR]?.value,
      profile?.maxHeartRate,
      hrThreshold?.maxHeartRate,
      estimateMaxHeartRate(profile?.age),
    );
    const restHr = pickPositiveThreshold(
      effectiveMetrics[UserFitnessMetricType.RESTING_HR]?.value,
      profile?.restingHeartRate,
      hrThreshold?.restingHeartRate,
    );
    const lthr = pickPositiveThreshold(
      effectiveMetrics[UserFitnessMetricType.LTHR]?.value,
      profile?.lthr,
      hrThreshold?.lactateThresholdHeartRate,
      hrThreshold?.lthr,
    );

    const HRR =
      restHr && maxHr && Number.isFinite(restHr) && Number.isFinite(maxHr)
        ? maxHr - restHr
        : undefined;

    const hrTss =
      zoneValues.length > 0 ? calculateHrTss(zoneValues) : undefined;
    const calculationLthr = resolveLthrForCalculation({
      lthr,
      maxHeartRate: maxHr,
    });
    const IntensityFactorHR = calculationLthr
      ? round(avg / calculationLthr.value, 6)
      : undefined;

    const trimp = computeTRIMP(
      round(durationSec / 60, 6),
      round(avg, 2),
      maxHr,
      restHr,
      String(profile?.gender ?? Gender.MALE).toLowerCase(),
    );
    // computeTRIMP100 会在真实 LTHR 缺失时使用 MAXHR × 88% 的运行时基准；
    // 该值不会写入用户档案，区间与计划计算也通过同一解析策略保持一致。
    const trimp100 = computeTRIMP100(
      trimp,
      maxHr,
      restHr,
      lthr,
      profile?.gender ?? Gender.MALE,
    );
    const trimpZonal = computeTRIMPZonal(zoneValues, {
      avgHr: avg,
      durationSec,
    });

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        heartRateTrimp: {
          TRIMP: round(trimp, 2),
          TRIMP100: round(trimp100, 2),
          TRIMPZonal: round(trimpZonal, 2),
          HRR,
          IntensityFactorHR,
          hrTss,
        },
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const trimp = ctx.outputs.heartRateTrimp;
    if (!activity?.id || !trimp || trimp.TRIMP === undefined) return ctx;
    await this.persistence.saveActivityHeartRateTrimpRow(activity.id, trimp);
    return ctx;
  }
}
