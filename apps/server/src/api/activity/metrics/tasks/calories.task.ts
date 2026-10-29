import { Injectable } from '@nestjs/common';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { UserService } from '@/api/user/user.service';
import { AlgorithmService } from '@/analyze/algorithm.service';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class CaloriesTask implements MetricsTask {
  key = 'calories' as const;
  constructor(
    private readonly userService: UserService,
    private readonly algorithmService: AlgorithmService,
    private readonly prisma: PrismaService,
  ) {}
  async pre(ctx: MetricsContext) {
    return ctx;
  }

  private sumZoneDuration(
    zones?: Array<{ duration?: number | null }> | null,
  ): number {
    return (
      zones?.reduce(
        (sum, zone) =>
          sum +
          (typeof zone.duration === 'number' && Number.isFinite(zone.duration)
            ? zone.duration
            : 0),
        0,
      ) ?? 0
    );
  }

  private resolveOutputDurationSec(ctx: MetricsContext): number {
    const candidates = [
      this.sumZoneDuration(ctx.outputs.powerZoneDistribution),
      this.sumZoneDuration(ctx.outputs.heartRateZones?.zone?.zones),
      this.sumZoneDuration(ctx.outputs.paceZoneDistribution),
    ];
    return candidates.find((duration) => duration > 0) ?? 0;
  }

  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const userId = ctx.inputs.userId;
    if (!activity || !userId) return ctx;

    const avgPower =
      ctx.outputs.powerBase?.avgPower != null &&
      Number.isFinite(ctx.outputs.powerBase.avgPower)
        ? ctx.outputs.powerBase.avgPower
        : activity.avgPower;
    const avgHeartRate =
      ctx.outputs.heartRateBase?.avg != null &&
      Number.isFinite(ctx.outputs.heartRateBase.avg)
        ? ctx.outputs.heartRateBase.avg
        : activity.avgHeartRate;
    const durationSec =
      this.resolveOutputDurationSec(ctx) ||
      (typeof activity.timerTime === 'number' && activity.timerTime > 0
        ? activity.timerTime
        : 0);

    if (!durationSec || durationSec <= 0) return ctx;

    let userProfile = ctx.cache.profile;
    const hasPower = !!avgPower && avgPower > 0;
    const needsHrProfile =
      !hasPower || (!!avgHeartRate && avgHeartRate > 0 && !userProfile);
    if (needsHrProfile && !userProfile) {
      userProfile = await this.userService.getComposedUserProfile(
        userId,
        activity.sportType || undefined,
        activity.startTime ?? undefined,
      );
    }

    const maxHeartRate =
      ctx.cache.hrThreshold?.maxHeartRate ?? userProfile?.maxHeartRate;
    const hasHrMetrics =
      userProfile?.weight && userProfile?.age && userProfile?.gender;
    if (!hasPower && !hasHrMetrics) return ctx;

    const { calories, fatCalories } = this.algorithmService.calculateCalories(
      avgPower,
      avgHeartRate,
      durationSec,
      {
        weight: userProfile?.weight,
        age: userProfile?.age,
        gender: userProfile?.gender,
        maxHeartRate,
      },
    );

    if (!(calories > 0)) return ctx;
    return {
      ...ctx,
      outputs: { ...ctx.outputs, calories: { calories, fatCalories } },
    };
  }
  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const out = ctx.outputs.calories;
    if (!activity || !out) return ctx;
    await this.prisma.activity.update({
      where: { id: activity.id },
      data: { calories: out.calories, fatCalories: out.fatCalories },
    });
    return ctx;
  }
}
