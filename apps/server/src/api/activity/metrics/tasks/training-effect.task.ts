import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { pickPositiveThreshold } from '../fitness-metric-priority';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { computeEPOCFromHR } from '@/algorithm/epoc';
import { DEFAULT_RESTING_HEART_RATE_BPM } from '@/algorithm/fitness-timeline';

@Injectable()
export class TrainingEffectTask implements MetricsTask {
  key = 'trainingEffect' as const;
  constructor(
    private readonly userService: UserService,
    private readonly analyzePersistence: AnalyzePersistenceService,
    private readonly prisma: PrismaService,
  ) {}
  async pre(ctx: MetricsContext) {
    const { activity, userId } = ctx.inputs;
    if (!userId) return ctx;
    if (ctx.cache.resolvedFitnessContext) return ctx;

    const [profile, hrThreshold, snap] = await Promise.all([
      this.userService.getComposedUserProfile(
        userId,
        activity.sportType,
        activity.startTime ?? undefined,
      ),
      this.userService.getUserHeartRateThreshold(
        userId,
        activity.sportType,
        activity.startTime ?? undefined,
      ),
      this.prisma.activityFitnessMetricsSnapshot.findUnique({
        where: { activityId: activity.id },
        select: {
          userId: true,
          maxHrValue: true,
          restHrValue: true,
        },
      }),
    ]);

    const snapOk = snap?.userId === userId;
    const snapMax = snapOk ? (snap.maxHrValue ?? undefined) : undefined;
    const snapRest = snapOk ? (snap.restHrValue ?? undefined) : undefined;

    const cachedMax =
      ctx.cache.fitnessMetrics?.[$Enums.UserFitnessMetricType.MAX_HR]?.value;
    const cachedRest =
      ctx.cache.fitnessMetrics?.[$Enums.UserFitnessMetricType.RESTING_HR]
        ?.value;

    const mergedThreshold = {
      ...(hrThreshold ?? {}),
      maxHeartRate:
        pickPositiveThreshold(
          cachedMax,
          snapMax,
          hrThreshold?.maxHeartRate,
          profile?.maxHeartRate,
        ) ??
        hrThreshold?.maxHeartRate ??
        null,
      restingHeartRate:
        pickPositiveThreshold(
          cachedRest,
          snapRest,
          hrThreshold?.restingHeartRate,
          profile?.restingHeartRate,
        ) ??
        hrThreshold?.restingHeartRate ??
        null,
    };

    return {
      ...ctx,
      cache: { ...ctx.cache, profile, hrThreshold: mergedThreshold },
    };
  }
  async exec(ctx: MetricsContext) {
    const userId = ctx.inputs.userId;
    if (!userId) return ctx;

    let { maxHeartRate = null, restingHeartRate = null } =
      ctx.cache.hrThreshold ?? {};
    if (!restingHeartRate) {
      restingHeartRate =
        ctx.cache.loadRestingHeartRateDefault ?? DEFAULT_RESTING_HEART_RATE_BPM;
    }
    if (!maxHeartRate || !restingHeartRate) {
      const profile = ctx.cache.profile;
      if (!maxHeartRate) maxHeartRate = profile?.maxHeartRate;
      if (!restingHeartRate) restingHeartRate = profile?.restingHeartRate;
    }

    if (!maxHeartRate || !restingHeartRate || maxHeartRate <= restingHeartRate)
      return ctx;

    const rows = ctx.inputs.canonicalRecords ?? [];
    if (!rows.length) return ctx;

    const sampleSec = ctx.cache.sampleSec ?? 1;
    const hrRows = rows
      .filter(
        (r) =>
          Number.isFinite(r.tMs) &&
          r.heartRate != null &&
          Number.isFinite(r.heartRate) &&
          r.heartRate >= 30 &&
          r.heartRate <= 240,
      )
      .map((r) => ({
        time: new Date(r.tMs).toISOString(),
        hr: r.heartRate,
        speed: r.speed,
        distance: r.distance,
      }));
    if (hrRows.length < 2) return ctx;
    const m = computeEPOCFromHR(hrRows, maxHeartRate, restingHeartRate);
    const teMetrics = m ? { ...m, sampleSec } : null;
    return { ...ctx, outputs: { ...ctx.outputs, trainingEffect: teMetrics } };
  }
  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const teMetrics = ctx.outputs.trainingEffect;
    if (!teMetrics) return ctx;
    await this.analyzePersistence.saveActivityTrainingEffect(
      activity,
      teMetrics,
      ctx.persistenceTx,
    );
    return ctx;
  }
}
