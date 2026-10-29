import { Injectable, Logger } from '@nestjs/common';
import { SportType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { computeNormalizedSessionRpeLoad } from '@/training-load/session-rpe-load';
import {
  permitsPowerDerivedMetrics,
  resolveMeasuredPowerEvidence,
} from '@/training-load/measured-power-evidence';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { ActivityReadService } from './activity-read.service';

/**
 * 活动「实际负荷」读取
 * ============================
 * 与 `PMCService.calculateDailyLoad` + `getValueWithLoadSources` 完全一致：
 * - power → coggan.bikeStress；heartRate → trimp.trimp100；
 * - pace：RUN 优先 govss，CYCLING 用 bikeScore，SWIM 用 swimScore。
 * - loadSources 解析与 `getUserPMCLoadSources` 同口径。
 *
 * 处方偏好 vs 度量偏好解耦见计划侧文档；此处只负责「跟 PMC 同一套读数」。
 */

const DEFAULT_LOAD_SOURCES: ReadonlyArray<LoadSourceKey> = [
  'POWER',
  'HEART_RATE',
  'PACE',
  'SESSIONRPE',
];

export type LoadSourceKey = 'POWER' | 'HEART_RATE' | 'PACE' | 'SESSIONRPE';

export type LoadActivityRow = {
  sportType: SportType;
  sportDefinitionCode?: string | null;
  sessionRpe?: number | null;
  timerTime?: number | null;
  elapsedTime?: number | null;
  coggan?: { bikeStress: number | null } | null;
  trimp?: { trimp100: number | null } | null;
  bikeScore?: { bikeScore: number | null } | null;
  govss?: { govss: number | null } | null;
  swimScore?: { swimScore: number | null } | null;
  activitySources?: Array<{ metadata: unknown }>;
};

export interface ActualLoadReadout {
  actualLoad: number | null;
  actualLoadSource: LoadSourceKey | null;
}

@Injectable()
export class LoadReadoutService {
  private readonly logger = new Logger(LoadReadoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityRead: ActivityReadService,
    private readonly users: UserQueryService,
  ) {}

  /** 读取用户 loadSources 优先级（对齐 PMCService.getUserPMCLoadSources） */
  async getUserLoadSources(userId: string): Promise<LoadSourceKey[]> {
    try {
      const profile = await this.users.profiles().findUnique({
        where: { userId },
      });
      if (!profile?.loadSources) return [...DEFAULT_LOAD_SOURCES];
      const parsed = String(profile.loadSources)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is LoadSourceKey =>
          ['POWER', 'HEART_RATE', 'PACE', 'SESSIONRPE'].includes(s),
        );
      return parsed.length > 0 ? parsed : [...DEFAULT_LOAD_SOURCES];
    } catch (err) {
      this.logger.warn(
        `[LoadReadout] getUserLoadSources(${userId}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [...DEFAULT_LOAD_SOURCES];
    }
  }

  /**
   * 单条活动取实际负荷
   */
  async getActualLoadForActivity(
    activityId: number,
  ): Promise<ActualLoadReadout> {
    const activity = await this.activityRead.findFirst({
      where: readyActivityWhere({ id: activityId }),
      select: {
        userId: true,
        sportType: true,
        sportDefinitionCode: true,
        sessionRpe: true,
        timerTime: true,
        elapsedTime: true,
        coggan: { select: { bikeStress: true } },
        trimp: { select: { trimp100: true } },
        bikeScore: { select: { bikeScore: true } },
        govss: { select: { govss: true } },
        swimScore: { select: { swimScore: true } },
        activitySources: {
          where: { isActive: true, isPrimary: true },
          select: { metadata: true },
        },
      },
    });
    if (!activity) return { actualLoad: null, actualLoadSource: null };

    const sources = await this.getUserLoadSources(activity.userId);
    return this.pickActualLoad(
      sources,
      activity.sportType,
      activity.sportDefinitionCode,
      computeNormalizedSessionRpeLoad({
        rating: activity.sessionRpe,
        timerTimeSeconds: activity.timerTime,
        elapsedTimeSeconds: activity.elapsedTime,
      }),
      {
        coggan: activity.coggan,
        trimp: activity.trimp,
        bikeScore: activity.bikeScore,
        govss: activity.govss,
        swimScore: activity.swimScore,
        activitySources: activity.activitySources,
      },
    );
  }

  /**
   * 批量取实际负荷（按 activityId）
   * 返回 Map<activityId, ActualLoadReadout>，方便链接列表一次性补齐。
   */
  async batchGetActualLoad(
    activityIds: number[],
  ): Promise<Map<number, ActualLoadReadout>> {
    const out = new Map<number, ActualLoadReadout>();
    if (!activityIds.length) return out;

    const activities = await this.activityRead.findMany({
      where: readyActivityWhere({ id: { in: activityIds } }),
      select: {
        id: true,
        userId: true,
        sportType: true,
        sportDefinitionCode: true,
        sessionRpe: true,
        timerTime: true,
        elapsedTime: true,
        coggan: { select: { bikeStress: true } },
        trimp: { select: { trimp100: true } },
        bikeScore: { select: { bikeScore: true } },
        govss: { select: { govss: true } },
        swimScore: { select: { swimScore: true } },
        activitySources: {
          where: { isActive: true, isPrimary: true },
          select: { metadata: true },
        },
      },
    });
    if (!activities.length) return out;

    const sourceCache = new Map<string, LoadSourceKey[]>();
    const userIds = Array.from(new Set(activities.map((a) => a.userId)));
    for (const userId of userIds) {
      sourceCache.set(userId, await this.getUserLoadSources(userId));
    }

    for (const activity of activities) {
      const sources = sourceCache.get(activity.userId) ?? [
        ...DEFAULT_LOAD_SOURCES,
      ];
      out.set(
        activity.id,
        this.pickActualLoad(
          sources,
          activity.sportType,
          activity.sportDefinitionCode,
          computeNormalizedSessionRpeLoad({
            rating: activity.sessionRpe,
            timerTimeSeconds: activity.timerTime,
            elapsedTimeSeconds: activity.elapsedTime,
          }),
          {
            coggan: activity.coggan,
            trimp: activity.trimp,
            bikeScore: activity.bikeScore,
            govss: activity.govss,
            swimScore: activity.swimScore,
            activitySources: activity.activitySources,
          },
        ),
      );
    }
    return out;
  }

  /**
   * PMC `calculateDailyLoad` 的单条活动负荷值。口径与 `pickActualLoad` 相同。
   */
  loadValueForActivity(
    activity: LoadActivityRow,
    sources: LoadSourceKey[],
  ): number {
    return (
      this.pickActualLoad(
        sources,
        activity.sportType,
        activity.sportDefinitionCode ?? null,
        computeNormalizedSessionRpeLoad({
          rating: activity.sessionRpe,
          timerTimeSeconds: activity.timerTime,
          elapsedTimeSeconds: activity.elapsedTime,
        }),
        {
          coggan: activity.coggan ?? null,
          trimp: activity.trimp ?? null,
          bikeScore: activity.bikeScore ?? null,
          govss: activity.govss ?? null,
          swimScore: activity.swimScore ?? null,
          activitySources: activity.activitySources,
        },
      ).actualLoad ?? 0
    );
  }

  /**
   * 与 PMCService.getValueWithLoadSources 同序：按 loadSources 第一个正值轨道命中。
   * pace 分量与 calculateDailyLoad 内对齐（RUN→govss；CYCLING→bikeScore；SWIM→swimScore）。
   */
  private pickActualLoad(
    sources: LoadSourceKey[],
    sport: SportType,
    sportDefinitionCode: string | null,
    normalizedSessionRpeLoad: number | null,
    metrics: {
      coggan: { bikeStress: number | null } | null;
      trimp: { trimp100: number | null } | null;
      bikeScore: { bikeScore: number | null } | null;
      govss: { govss: number | null } | null;
      swimScore: { swimScore: number | null } | null;
      activitySources?: Array<{ metadata: unknown }>;
    },
  ): ActualLoadReadout {
    const permitsPower = permitsPowerDerivedMetrics(
      resolveMeasuredPowerEvidence(metrics.activitySources),
    );
    const powerValue = permitsPower ? num(metrics.coggan?.bikeStress) : 0;
    const heartRateValue = num(metrics.trimp?.trimp100);
    let paceValue = 0;
    if (
      sport === SportType.RUN &&
      sportDefinitionCode !== 'WALKING' &&
      sportDefinitionCode !== 'HIKING'
    ) {
      paceValue =
        num(metrics.govss?.govss) ||
        (permitsPower ? num(metrics.bikeScore?.bikeScore) : 0);
    } else if (sport === SportType.CYCLING) {
      // BikeScore/xPower 本质上仍是功率指标，不能从 PACE 轨道绕过
      // 原始功率来源校验。
      paceValue = permitsPower ? num(metrics.bikeScore?.bikeScore) : 0;
    } else if (sport === SportType.SWIM) {
      paceValue = num(metrics.swimScore?.swimScore);
    }
    const sessionRPEValue = num(normalizedSessionRpeLoad);

    for (const s of sources) {
      if (s === 'POWER' && powerValue > 0) {
        return { actualLoad: powerValue, actualLoadSource: 'POWER' };
      }
      if (s === 'HEART_RATE' && heartRateValue > 0) {
        return { actualLoad: heartRateValue, actualLoadSource: 'HEART_RATE' };
      }
      if (s === 'PACE' && paceValue > 0) {
        return { actualLoad: paceValue, actualLoadSource: 'PACE' };
      }
      if (s === 'SESSIONRPE' && sessionRPEValue > 0) {
        return {
          actualLoad: sessionRPEValue,
          actualLoadSource: 'SESSIONRPE',
        };
      }
    }

    return { actualLoad: null, actualLoadSource: null };
  }
}

function num(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return 0;
  return value;
}
