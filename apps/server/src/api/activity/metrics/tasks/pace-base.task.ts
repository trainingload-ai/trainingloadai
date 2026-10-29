import { Injectable, Logger } from '@nestjs/common';
import type { Activity } from '@prisma/client';
import { $Enums } from '@prisma/client';
import type { AnalyzeUserContext, MetricsContext } from '../context';
import { toSensorData } from '../context';
import type { MetricsTask } from '../task';
import { pickPositiveThreshold } from '../fitness-metric-priority';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { AnalyzeContextBuilderService } from '@/analyze/context-builder.service';
import { PaceEngineService } from '@/analyze/pace/pace-engine.service';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import type { UserZoneSetting } from '@/utils/zones';

type PaceActivityLike = Pick<Activity, 'id' | 'sportType' | 'startTime'>;

@Injectable()
export class PaceBaseTask implements MetricsTask {
  key = 'paceBase' as const;

  private readonly logger = new Logger(PaceBaseTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly contextBuilder: AnalyzeContextBuilderService,
    private readonly paceEngine: PaceEngineService,
    private readonly persistence: AnalyzePersistenceService,
  ) {}

  private async loadPaceConfig(args: {
    activity: PaceActivityLike;
    userId: string;
    csOverride?: number | null;
  }): Promise<{
    paceZones: UserZoneSetting;
    context: AnalyzeUserContext;
  }> {
    const { activity, userId, csOverride } = args;
    const sportType = activity.sportType;

    // 必须用合成 profile（含 vo2max/tp/cs）；切勿传 raw t_user_profile，否则 getPaceZoneSettingResolved 不会拉 composed。
    const [profile, snap] = await Promise.all([
      this.userService.getComposedUserProfile(
        userId,
        sportType,
        activity.startTime ?? undefined,
      ),
      this.prisma.activityFitnessMetricsSnapshot.findUnique({
        where: { activityId: activity.id },
        select: { userId: true, csValue: true },
      }),
    ]);
    const context: AnalyzeUserContext = this.contextBuilder.build({
      userId,
      sportType,
      userProfile: profile,
      activityDate: activity.startTime,
    });

    const snapCs =
      snap?.userId === userId ? (snap.csValue ?? undefined) : undefined;
    context.CS = pickPositiveThreshold(
      csOverride ?? undefined,
      snapCs,
      context.CS,
    );
    const paceZones = await this.userService.getPaceZoneSettingResolved(
      userId,
      activity.sportType,
      {
        vo2max: profile?.vo2max,
        tp: profile?.tp,
        cs: context.CS ?? profile?.cs,
        paceZoneModel: profile?.paceZoneModel,
      },
    );
    return { paceZones, context };
  }

  async pre(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const userId = ctx.inputs.userId;
    if (!activity?.id || !userId) return ctx;
    try {
      const csMetric =
        ctx.cache.fitnessMetrics?.[$Enums.UserFitnessMetricType.CS];
      const loaded = await this.loadPaceConfig({
        activity,
        userId,
        csOverride: csMetric?.value ?? null,
      });
      return {
        ...ctx,
        cache: {
          ...ctx.cache,
          pacePreload: {
            ...(ctx.cache.pacePreload ?? {}),
            paceZones: loaded.paceZones,
            context: loaded.context,
          },
        },
      };
    } catch (e) {
      this.logger.warn(
        `[paceBase] 预处理失败，活动ID=${activity.id}：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw e;
    }
  }

  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const preload = ctx.cache.pacePreload;
    const canonical = ctx.inputs.canonicalRecords;
    if (!activity?.id || !preload || !canonical?.length) return ctx;

    const internal = this.paceEngine.computePaceInternals(
      toSensorData(canonical),
    );
    if (!internal) {
      const speedPositive = canonical.filter(
        (r) =>
          typeof r?.speed === 'number' &&
          Number.isFinite(r.speed) &&
          r.speed > 0,
      ).length;
      const enhancedSpeedPositive = canonical.filter(
        (r) =>
          typeof r?.enhancedSpeed === 'number' &&
          Number.isFinite(r.enhancedSpeed) &&
          r.enhancedSpeed > 0,
      ).length;
      const gapPositive = canonical.filter(
        (r) =>
          typeof r?.gap === 'number' && Number.isFinite(r.gap) && r.gap > 0,
      ).length;
      const samples = canonical.slice(0, 5).map((r) => ({
        time: r?.time,
        speed: r?.speed,
        enhancedSpeed: r?.enhancedSpeed,
        gap: r?.gap,
        distance: r?.distance,
      }));
      this.logger.warn(
        `[paceBase] 计算跳过，活动ID=${activity.id}，records=${canonical.length}，speed>0=${speedPositive}，enhancedSpeed>0=${enhancedSpeedPositive}，gap>0=${gapPositive}，sample=${JSON.stringify(
          samples,
        )}`,
      );
      return ctx;
    }

    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        paceInternals: internal,
      },
      outputs: {
        ...ctx.outputs,
        paceBase: internal.base,
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const base = ctx.outputs.paceBase;
    if (!activity?.id || !base) return ctx;
    await this.persistence.saveActivityPaceActivityFields(activity.id, {
      avgGap: base.avgGap,
      avgSpeed: base.avgSpeed,
      xPace: base.xPace,
      xGap: base.xGap,
      viPace: base.viPace,
      viGap: base.viGap,
      avgAerobicEfficiency: base.avgAerobicEfficiency,
    });
    return ctx;
  }
}
