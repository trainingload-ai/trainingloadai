import { Injectable, Logger } from '@nestjs/common';
import type { Activity } from '@prisma/client';
import { $Enums } from '@prisma/client';
import { round } from 'lodash';
import type { AnalyzeUserContext, MetricsContext } from '../context';
import { toSensorData } from '../context';
import type { MetricsTask } from '../task';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { AnalyzeContextBuilderService } from '@/analyze/context-builder.service';
import { PowerEngineService } from '@/analyze/power/power-engine.service';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { calculateEfficiencyIndexPower } from '@/algorithm/power';
import type { UserZoneSetting } from '@/utils/zones';
import { pickPositiveThreshold } from '../fitness-metric-priority';

type PowerActivityLike = Pick<Activity, 'id' | 'sportType' | 'startTime'>;

@Injectable()
export class PowerBaseTask implements MetricsTask {
  key = 'powerBase' as const;

  private readonly logger = new Logger(PowerBaseTask.name);

  constructor(
    private readonly userService: UserService,
    private readonly contextBuilder: AnalyzeContextBuilderService,
    private readonly powerEngine: PowerEngineService,
    private readonly persistence: AnalyzePersistenceService,
    private readonly prisma: PrismaService,
  ) {}

  private async loadPowerConfig(args: {
    activity: PowerActivityLike;
    userId: string;
    metricOverrides?: {
      ftp?: number | null;
      cp?: number | null;
    };
  }): Promise<{
    powerZones: UserZoneSetting;
    context: AnalyzeUserContext;
  }> {
    const { activity, userId, metricOverrides } = args;
    const sportType = activity.sportType;

    // profile 仍负责体重/分区模板等；FTP、CP 数值采用 cache → 快照 → profile 显式合并（避免仅 profile 优先盖住 bind）。
    const [profile, snap] = await Promise.all([
      this.userService.getComposedUserProfile(
        userId,
        sportType,
        activity.startTime ?? undefined,
      ),
      this.prisma.activityFitnessMetricsSnapshot.findUnique({
        where: { activityId: activity.id },
        select: { userId: true, ftpValue: true, cpValue: true },
      }),
    ]);
    const context: AnalyzeUserContext = this.contextBuilder.build({
      userId,
      sportType,
      userProfile: profile,
      activityDate: activity.startTime,
    });

    const snapFtp =
      snap?.userId === userId ? (snap.ftpValue ?? undefined) : undefined;
    const snapCp =
      snap?.userId === userId ? (snap.cpValue ?? undefined) : undefined;

    context.FTP = pickPositiveThreshold(
      metricOverrides?.ftp ?? undefined,
      snapFtp,
      context.FTP,
    );
    context.CP = pickPositiveThreshold(
      metricOverrides?.cp ?? undefined,
      snapCp,
      context.CP,
    );

    const powerZones = await this.userService.getPowerZoneSettingResolved(
      userId,
      sportType,
      {
        FTP: context.FTP,
        CP: context.CP,
        powerZoneModel: profile?.powerZoneModel,
      },
    );

    return { powerZones, context };
  }

  async pre(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const userId = ctx.inputs.userId;
    if (!activity?.id || !userId) return ctx;
    const ftpMetric =
      ctx.cache.fitnessMetrics?.[$Enums.UserFitnessMetricType.FTP];
    const cpMetric =
      ctx.cache.fitnessMetrics?.[$Enums.UserFitnessMetricType.CP];
    try {
      const loaded = await this.loadPowerConfig({
        activity,
        userId,
        metricOverrides: {
          ftp: ftpMetric?.value ?? null,
          cp: cpMetric?.value ?? null,
        },
      });
      return {
        ...ctx,
        cache: {
          ...ctx.cache,
          powerPreload: {
            ...(ctx.cache.powerPreload ?? {}),
            powerZones: loaded.powerZones,
            context: loaded.context,
          },
        },
      };
    } catch (e) {
      this.logger.warn(
        `[powerBase] 预处理失败，活动ID=${activity.id}：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw e;
    }
  }

  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const preload = ctx.cache.powerPreload;
    const canonical = ctx.inputs.canonicalRecords;
    if (!activity?.id || !canonical?.length) return ctx;

    const st = activity.sportType;
    if (st !== $Enums.SportType.RUN && st !== $Enums.SportType.CYCLING) {
      return ctx;
    }

    const reusableAvgHeartRate =
      ctx.outputs.heartRateBase?.avg != null &&
      Number.isFinite(ctx.outputs.heartRateBase.avg)
        ? ctx.outputs.heartRateBase.avg
        : undefined;
    const reusableAvgSpeedMps =
      ctx.outputs.paceBase?.avgSpeed != null &&
      Number.isFinite(ctx.outputs.paceBase.avgSpeed)
        ? ctx.outputs.paceBase.avgSpeed
        : undefined;

    const agg = this.powerEngine.computePowerSeriesAggregates(
      toSensorData(canonical),
      ctx.cache.sampleSec,
      {
        avgHeartRate: reusableAvgHeartRate,
        avgSpeedMps: reusableAvgSpeedMps,
      },
    );
    if (!agg) return ctx;

    const userWeight = preload?.context?.userWeight;
    const eff = this.powerEngine.computePowerEfficiencyMetrics(agg, userWeight);
    const efficiencyIndexPower = calculateEfficiencyIndexPower(
      agg.avgPower,
      agg.avgHeartRate,
    );

    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        powerAggregates: agg,
      },
      outputs: {
        ...ctx.outputs,
        powerBase: {
          avgPower: round(agg.avgPower, 2),
          efficiencyIndexPower,
          re: eff.re,
          ei: eff.ei,
        },
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const base = ctx.outputs.powerBase;
    if (!activity?.id || !base) return ctx;
    await this.persistence.saveActivityPowerActivityFields(activity.id, {
      avgPower: base.avgPower,
      efficiencyIndexPower: base.efficiencyIndexPower,
      re: base.re,
      ei: base.ei,
    });
    return ctx;
  }
}
