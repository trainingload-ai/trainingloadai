import { Injectable } from '@nestjs/common';
import { $Enums, PeakType, ScaleType } from '@prisma/client';
import { round } from 'lodash';
import type { MetricsContext, PeakMetricKey } from '../context';
import type { MetricsTask } from '../task';
import { ActivityMetricsPreloaderService } from '../preloader.service';
import { UserService } from '@/api/user/user.service';
import { Vo2MaxEngineService } from '@/analyze/vo2max/vo2max-engine.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { SensorData } from '@/analyze/analyze.interface';

const HR_PEAK_KEY_PREFIX = `${PeakType.hr}:${ScaleType.TIME}:` as const;

/** 用户 MaxHR 优先；缺失时用当前活动 MMHR（与 observeMaxHr 一致，优先 1s 窗口）。 */
function resolveMaxHeartRate(args: {
  hrThreshold?: { maxHeartRate?: number | null } | null;
  profile?: { maxHeartRate?: number } | null;
  peakMetrics?: Partial<Record<PeakMetricKey, number>>;
}): number | undefined {
  // 用户最大心率优先
  const userMhr = args.hrThreshold?.maxHeartRate ?? args.profile?.maxHeartRate;
  if (typeof userMhr === 'number' && Number.isFinite(userMhr) && userMhr > 0) {
    return userMhr;
  }

  const peaks = args.peakMetrics ?? {};
  const oneSec = peaks[`${HR_PEAK_KEY_PREFIX}1` as PeakMetricKey];
  if (typeof oneSec === 'number' && Number.isFinite(oneSec) && oneSec > 0) {
    return round(oneSec, 0);
  }

  let maxPeak = 0;
  for (const [key, value] of Object.entries(peaks)) {
    if (!key.startsWith(HR_PEAK_KEY_PREFIX)) continue;
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > maxPeak
    ) {
      maxPeak = value;
    }
  }
  // 返回最大心率
  return maxPeak > 0 ? round(maxPeak, 0) : undefined;
}

@Injectable()
export class Vo2MaxTask implements MetricsTask {
  key = 'vo2Max' as const;

  constructor(
    private readonly preloader: ActivityMetricsPreloaderService,
    private readonly userService: UserService,
    private readonly vo2maxEngine: Vo2MaxEngineService,
    private readonly prisma: PrismaService,
  ) {}

  private async ensureActivityHrPeaksInCache(
    ctx: MetricsContext,
  ): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const hasHrPeaks = Object.keys(ctx.cache.peakMetrics ?? {}).some((k) =>
      k.startsWith(HR_PEAK_KEY_PREFIX),
    );
    if (hasHrPeaks) return ctx;

    const rows = await this.prisma.activityPeakMetric.findMany({
      where: {
        activityId: activity.id,
        type: PeakType.hr,
        scaleType: ScaleType.TIME,
        value: { gt: 0 },
      },
      select: { scaleValue: true, value: true },
    });
    if (!rows.length) return ctx;

    const patch: Partial<Record<PeakMetricKey, number>> = {};
    for (const row of rows) {
      if (row.value == null || !Number.isFinite(row.value)) continue;
      patch[`${HR_PEAK_KEY_PREFIX}${row.scaleValue}` as PeakMetricKey] =
        row.value;
    }
    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        peakMetrics: { ...(ctx.cache.peakMetrics ?? {}), ...patch },
      },
    };
  }

  async pre(ctx: MetricsContext): Promise<MetricsContext> {
    const { activity, userId } = ctx.inputs;
    if (!userId) return ctx;

    // Cache-first: previous tasks in the same metrics pipeline may have loaded these already.
    const cachedProfile = ctx.cache.profile;
    const cachedHrThreshold = ctx.cache.hrThreshold;

    const [profile, hrThreshold] = await Promise.all([
      cachedProfile ??
        this.userService.getComposedUserProfile(
          userId,
          activity.sportType || undefined,
          activity.startTime ?? undefined,
        ),
      cachedHrThreshold ??
        this.userService.getUserHeartRateThreshold(
          userId,
          activity.sportType,
          activity.startTime ?? undefined,
        ),
    ]);

    let next: MetricsContext = {
      ...ctx,
      cache: { ...ctx.cache, profile, hrThreshold },
    };

    if (activity.sportType === $Enums.SportType.CYCLING) {
      next = await this.preloader.ensurePeakMetric(next, {
        sport: $Enums.SportType.CYCLING,
        type: PeakType.power,
        scaleType: ScaleType.TIME,
        scaleValue: 300,
      });
    }

    if (activity.sportType === $Enums.SportType.RUN) {
      next = await this.ensureActivityHrPeaksInCache(next);
    }

    return next;
  }

  async exec(ctx: MetricsContext): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const profile = ctx.cache.profile;
    const hrThreshold = ctx.cache.hrThreshold;

    if (activity.sportType === $Enums.SportType.CYCLING) {
      const mmp5 =
        ctx.cache.peakMetrics?.[
          `${PeakType.power}:${ScaleType.TIME}:300` as PeakMetricKey
        ];
      const MAP =
        typeof mmp5 === 'number' && Number.isFinite(mmp5) && mmp5 > 0
          ? round(mmp5 * 0.92, 2)
          : undefined;
      const vo2 = this.vo2maxEngine.calculateCyclingActivityVo2Max(
        MAP,
        profile?.weight ?? 0,
      );
      return {
        ...ctx,
        outputs: { ...ctx.outputs, vo2max: { vo2maxVdotByHr: vo2 ?? null } },
      };
    }

    if (activity.sportType === $Enums.SportType.RUN) {
      const records =
        ctx.inputs.canonicalRecords
          ?.filter(
            (r) => r.speed != null && r.heartRate != null && r.distance != null,
          )
          .map(
            (r) =>
              ({
                time: r.time,
                tMs: r.tMs,
                distance: String(r.distance),
                speed: r.speed,
                heartRate: r.heartRate,
              }) satisfies SensorData,
          ) ?? [];
      const effectiveDistance =
        activity.effectiveDistance ?? activity.distance ?? 0;
      const durationSec = activity.elapsedTime ?? 0;
      const avgSpeed = activity.avgSpeed ?? 0;
      const avgHeartRate = activity.avgHeartRate ?? 0;

      const res = this.vo2maxEngine.calculateRunActivityVo2Max(
        effectiveDistance || 0,
        durationSec || 0,
        avgSpeed || 0,
        avgHeartRate || 0,
        records,
        {
          MHR: resolveMaxHeartRate({
            hrThreshold,
            profile,
            peakMetrics: ctx.cache.peakMetrics,
          }),
          vo2maxCorrectionFactor: profile?.vo2maxCorrectionFactor ?? 1,
        },
      );

      return { ...ctx, outputs: { ...ctx.outputs, vo2max: res ?? null } };
    }

    return ctx;
  }

  async post(ctx: MetricsContext): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const result = ctx.outputs.vo2max;
    if (!result) return ctx;

    await this.prisma.activityVO2Max.upsert({
      where: { activityId: activity.id },
      update: {
        sport: activity.sportType ?? $Enums.SportType.UNKNOWN,
        vo2maxVdotByRace: result.vo2maxVdotByRace ?? null,
        vo2maxVdotByHr: result.vo2maxVdotByHr ?? null,
        vo2maxVdotByFactor: result.vo2maxVdotByFactor ?? null,
        vo2maxCorrectionFactor: result.vo2maxCorrectionFactor ?? null,
        calculatedAt: new Date(),
      },
      create: {
        activityId: activity.id,
        sport: activity.sportType ?? $Enums.SportType.UNKNOWN,
        vo2maxVdotByRace: result.vo2maxVdotByRace ?? null,
        vo2maxVdotByHr: result.vo2maxVdotByHr ?? null,
        vo2maxVdotByFactor: result.vo2maxVdotByFactor ?? null,
        vo2maxCorrectionFactor: result.vo2maxCorrectionFactor ?? null,
      },
    });

    return ctx;
  }
}
