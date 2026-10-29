import { Injectable } from '@nestjs/common';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { $Enums, Prisma, type UserFitnessMetric } from '@prisma/client';

const FITNESS_SNAPSHOT_RESOLUTION_VERSION = 2;

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function sourceProvenance(
  metric: UserFitnessMetric | null | undefined,
  fallback: string,
) {
  return metric
    ? {
        mode: 'FITNESS_METRIC',
        metricId: metric.id,
        type: metric.type,
        source: metric.source,
        sport: metric.sport,
        recordedAt: metric.recordedAt.toISOString(),
        changeSource: metric.changeSource ?? null,
        originProvider: metric.originProvider ?? null,
        originExternalId: metric.originExternalId ?? null,
      }
    : { mode: 'PROFILE_FALLBACK', fallback };
}

/**
 * 将需要关联的快照数据 创建快照并关联。
 * 原因：
 */
@Injectable()
export class BindFitnessMetricsTask implements MetricsTask {
  key = 'bindFitnessMetrics' as const;
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}
  async pre(ctx: MetricsContext) {
    const userId = ctx.inputs.userId;
    const activity = ctx.inputs.activity;
    if (!userId) return ctx;

    const sport = activity.sportType ?? $Enums.SportType.UNKNOWN;

    const existing = ctx.cache.fitnessMetrics;
    if (existing && Object.keys(existing).length > 0) return ctx;

    const metricTypes = [
      $Enums.UserFitnessMetricType.FTP,
      $Enums.UserFitnessMetricType.CP,
      $Enums.UserFitnessMetricType.W_PRIME,
      $Enums.UserFitnessMetricType.MAX_HR,
      $Enums.UserFitnessMetricType.LTHR,
      $Enums.UserFitnessMetricType.RESTING_HR,
      $Enums.UserFitnessMetricType.CS,
    ] as const;
    const [profile, metricRows] = await Promise.all([
      // 阈值使用分析当天真正生效的组合档案：AUTO / MANUAL
      // 按 recordedAt 取最新，同一时刻由 MANUAL 胜出。
      this.userService.getComposedUserProfile(
        userId,
        sport,
        activity.startTime ?? undefined,
      ),
      Promise.all(
        metricTypes.map((type) =>
          this.userService.getEffectiveUserFitnessMetric(
            userId,
            type,
            activity.startTime ?? undefined,
            sport,
          ),
        ),
      ),
    ]);

    const rows = new Map(
      metricTypes.map((type, index) => [type, metricRows[index]]),
    );
    const ftpMetric = rows.get($Enums.UserFitnessMetricType.FTP);
    const cpMetric = rows.get($Enums.UserFitnessMetricType.CP);
    const wPrimeMetric = rows.get($Enums.UserFitnessMetricType.W_PRIME);
    const maxHrMetric = rows.get($Enums.UserFitnessMetricType.MAX_HR);
    const lthrMetric = rows.get($Enums.UserFitnessMetricType.LTHR);
    const restHrMetric = rows.get($Enums.UserFitnessMetricType.RESTING_HR);
    const csMetric = rows.get($Enums.UserFitnessMetricType.CS);
    const ftp = positive(ftpMetric?.value) ?? positive(profile?.ftp);
    const cp = positive(cpMetric?.value) ?? positive(profile?.cp);
    const wPrime =
      positive(wPrimeMetric?.value) ??
      positive(cpMetric?.value2) ??
      positive(profile?.wPrime);
    const maxHr =
      positive(maxHrMetric?.value) ?? positive(profile?.maxHeartRate);
    const lthr = positive(lthrMetric?.value) ?? positive(profile?.lthr);
    const restHr =
      positive(restHrMetric?.value) ?? positive(profile?.restingHeartRate);
    const cs = positive(csMetric?.value) ?? positive(profile?.cs);
    const dPrime = positive(csMetric?.value2) ?? positive(profile?.dPrime);

    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        profile: ctx.cache.profile ?? profile,
        fitnessMetrics: {
          [$Enums.UserFitnessMetricType.FTP]: ftp
            ? {
                value: ftp,
                value2: null,
                provenance: {
                  value: sourceProvenance(ftpMetric, 'composedProfile.ftp'),
                },
              }
            : null,
          [$Enums.UserFitnessMetricType.CP]: cp
            ? {
                value: cp,
                value2: wPrime ?? null,
                provenance: {
                  value: sourceProvenance(cpMetric, 'composedProfile.cp'),
                  value2: sourceProvenance(
                    wPrimeMetric ?? (cpMetric?.value2 ? cpMetric : null),
                    'composedProfile.wPrime',
                  ),
                },
              }
            : null,
          [$Enums.UserFitnessMetricType.MAX_HR]: maxHr
            ? {
                value: maxHr,
                value2: null,
                provenance: {
                  value: sourceProvenance(
                    maxHrMetric,
                    'composedProfile.maxHeartRate',
                  ),
                },
              }
            : null,
          [$Enums.UserFitnessMetricType.LTHR]: lthr
            ? {
                value: lthr,
                value2: null,
                provenance: {
                  value: sourceProvenance(lthrMetric, 'composedProfile.lthr'),
                },
              }
            : null,
          [$Enums.UserFitnessMetricType.RESTING_HR]: restHr
            ? {
                value: restHr,
                value2: null,
                provenance: {
                  value: sourceProvenance(
                    restHrMetric,
                    'composedProfile.restingHeartRate',
                  ),
                },
              }
            : null,
          [$Enums.UserFitnessMetricType.CS]: cs
            ? {
                value: cs,
                value2: dPrime ?? null,
                provenance: {
                  value: sourceProvenance(csMetric, 'composedProfile.cs'),
                  value2: sourceProvenance(
                    csMetric?.value2 ? csMetric : null,
                    'composedProfile.dPrime',
                  ),
                },
              }
            : null,
        },
      },
    };
  }
  async exec(ctx: MetricsContext) {
    return ctx;
  }
  async post(ctx: MetricsContext) {
    const userId = ctx.inputs.userId;
    const activity = ctx.inputs.activity;
    if (!userId) return ctx;

    const sport = activity.sportType ?? $Enums.SportType.UNKNOWN;
    const recordedAt = activity.startTime;
    if (!recordedAt) return ctx;

    const metrics = ctx.cache.fitnessMetrics ?? {};
    const ftp = metrics[$Enums.UserFitnessMetricType.FTP] ?? null;
    const cp = metrics[$Enums.UserFitnessMetricType.CP] ?? null;
    const maxHr = metrics[$Enums.UserFitnessMetricType.MAX_HR] ?? null;
    const lthr = metrics[$Enums.UserFitnessMetricType.LTHR] ?? null;
    const restHr = metrics[$Enums.UserFitnessMetricType.RESTING_HR] ?? null;
    const cs = metrics[$Enums.UserFitnessMetricType.CS] ?? null;
    const provenance = Object.fromEntries(
      Object.entries(metrics).map(([type, metric]) => [
        type,
        metric?.provenance ?? { value: { mode: 'UNAVAILABLE' } },
      ]),
    );

    await this.prisma.activityFitnessMetricsSnapshot.upsert({
      where: { activityId: activity.id },
      update: {
        userId,
        sport,
        recordedAt,
        resolvedAt: new Date(),
        resolutionVersion: FITNESS_SNAPSHOT_RESOLUTION_VERSION,
        provenance: provenance as Prisma.InputJsonValue,
        ftpValue: ftp?.value ?? null,
        ftpValue2: ftp?.value2 ?? null,
        cpValue: cp?.value ?? null,
        cpValue2: cp?.value2 ?? null,
        maxHrValue: maxHr?.value ?? null,
        lthrValue: lthr?.value ?? null,
        restHrValue: restHr?.value ?? null,
        csValue: cs?.value ?? null,
        csValue2: cs?.value2 ?? null,
      },
      create: {
        activityId: activity.id,
        userId,
        sport,
        recordedAt,
        resolvedAt: new Date(),
        resolutionVersion: FITNESS_SNAPSHOT_RESOLUTION_VERSION,
        provenance: provenance as Prisma.InputJsonValue,
        ftpValue: ftp?.value ?? null,
        ftpValue2: ftp?.value2 ?? null,
        cpValue: cp?.value ?? null,
        cpValue2: cp?.value2 ?? null,
        maxHrValue: maxHr?.value ?? null,
        lthrValue: lthr?.value ?? null,
        restHrValue: restHr?.value ?? null,
        csValue: cs?.value ?? null,
        csValue2: cs?.value2 ?? null,
      },
      select: { id: true },
    });

    return ctx;
  }
}
