import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Activity } from '@prisma/client';
import { $Enums, Prisma, SportType, ZoneType } from '@prisma/client';
import type { UserZoneValue } from '@/utils/zones';
import { round } from 'lodash';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type { HeartRateAnalysisResult } from './heart-rate/heart-rate.types';
import type { computeEPOCFromHR } from '@/algorithm/epoc';
import { replaceActivityZoneRows } from '@/prisma/activity-zone-write';

export type ActivityTrainingEffectMetrics = ReturnType<
  typeof computeEPOCFromHR
> & {
  aerobicEpoc?: number;
  anaerobicEpoc?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  sampleSec?: number;
};

@Injectable()
export class AnalyzePersistenceService {
  private readonly logger = new Logger(AnalyzePersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Activity 上 scalar 功率字段（PowerBaseTask.post） */
  async saveActivityPowerActivityFields(
    activityId: number,
    data: {
      avgPower?: number;
      efficiencyIndexPower?: number;
      re?: number;
      ei?: number;
    },
  ) {
    if (!activityId) return;
    try {
      await this.prisma.activity.update({
        where: { id: activityId },
        data: {
          avgPower: data.avgPower ?? undefined,
          aePower: data.efficiencyIndexPower ?? undefined,
          re: data.re ?? undefined,
          ei: data.ei ?? undefined,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存功率基础字段] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /** 功率分区 ActivityZone.POWER（PowerZonesTask.post） */
  async saveActivityPowerZoneRows(activityId: number, zones: UserZoneValue[]) {
    if (!activityId) return;
    try {
      const powerZoneRows = (zones || []).map((z, index) => {
        const order =
          typeof z.order === 'number' && z.order > 0 ? z.order : index + 1;
        return {
          activityId: activityId,
          zoneType: ZoneType.POWER,
          name: z.name ?? '',
          order: order,
          color: z.color ?? undefined,
          duration: z?.duration != null ? round(z.duration) : undefined,
          percent: z?.percent ?? undefined,
          min: z?.min ?? undefined,
          max: z?.max ?? undefined,
          avg: z?.avg ?? undefined,
        };
      });
      await replaceActivityZoneRows(this.prisma, {
        activityId,
        zoneType: ZoneType.POWER,
        rows: powerZoneRows,
      });
    } catch (e) {
      this.logger.error(
        `[保存功率分区] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  async saveActivityPowerCogganRow(
    activityId: number,
    sportType: $Enums.SportType,
    coggan: import('@/algorithm/coggan').CogganResult,
  ) {
    if (!activityId || !coggan) return;
    try {
      await this.prisma.activityCoggan.upsert({
        where: { activityId: activityId },
        update: {
          sport: sportType,
          isopower: round(coggan.isopower, 4) ?? null,
          variabilityIndex: round(coggan.variabilityIndex, 4) ?? null,
          intensityFactor: round(coggan.intensityFactor, 4) ?? null,
          bikeStress: round(coggan.bikeStress, 4) ?? null,
          tssPerHour: round(coggan.tssPerHour, 4) ?? null,
          efficiencyFactor: round(coggan.efficiencyFactor, 4) ?? null,
          algorithmVersion: coggan.algorithmVersion ?? null,
          powerSource: coggan.powerSource ?? null,
          durationSec: round(coggan.durationSec, 3) ?? null,
          coveredSeconds: round(coggan.coveredSeconds, 3) ?? null,
          coverageRatio: round(coggan.coverageRatio, 6) ?? null,
          parameters: coggan.parameters
            ? (coggan.parameters as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          calculatedAt: new Date(),
        },
        create: {
          activityId: activityId,
          sport: sportType,
          isopower: round(coggan.isopower, 4) ?? null,
          variabilityIndex: round(coggan.variabilityIndex, 4) ?? null,
          intensityFactor: round(coggan.intensityFactor, 4) ?? null,
          bikeStress: round(coggan.bikeStress, 4) ?? null,
          tssPerHour: round(coggan.tssPerHour, 4) ?? null,
          efficiencyFactor: round(coggan.efficiencyFactor, 4) ?? null,
          algorithmVersion: coggan.algorithmVersion ?? null,
          powerSource: coggan.powerSource ?? null,
          durationSec: round(coggan.durationSec, 3) ?? null,
          coveredSeconds: round(coggan.coveredSeconds, 3) ?? null,
          coverageRatio: round(coggan.coverageRatio, 6) ?? null,
          parameters: coggan.parameters
            ? (coggan.parameters as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存 Coggan] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  async saveActivityPowerBikeScoreRow(
    activityId: number,
    sportType: $Enums.SportType,
    bikeScore: import('@/algorithm/BikeScore').BikeScoreResult,
  ) {
    if (!activityId || !bikeScore) return;
    try {
      await this.prisma.activityBikeScore.upsert({
        where: { activityId: activityId },
        update: {
          sport: sportType,
          xPower: round(bikeScore.xPower, 4) ?? null,
          variabilityIndex: round(bikeScore.variabilityIndex, 4) ?? null,
          relativeIntensity: round(bikeScore.relativeIntensity, 4) ?? null,
          bikeScore: round(bikeScore.bikeScore, 4) ?? null,
          responseIndex: round(bikeScore.responseIndex, 4) ?? null,
          aerobicTISS: round(bikeScore.aerobicTISS, 4) ?? null,
          anaerobicTISS: round(bikeScore.anaerobicTISS, 4) ?? null,
          tissAerobicity: round(bikeScore.tissAerobicity, 4) ?? null,
          algorithmVersion: bikeScore.algorithmVersion,
          durationSec: round(bikeScore.durationSec, 3) ?? null,
          coveredSeconds: round(bikeScore.coveredSeconds, 3) ?? null,
          coverageRatio: round(bikeScore.coverageRatio, 6) ?? null,
          parameters: bikeScore.parameters as Prisma.InputJsonValue,
          calculatedAt: new Date(),
        },
        create: {
          activityId: activityId,
          sport: sportType,
          xPower: round(bikeScore.xPower, 4) ?? null,
          variabilityIndex: round(bikeScore.variabilityIndex, 4) ?? null,
          relativeIntensity: round(bikeScore.relativeIntensity, 4) ?? null,
          bikeScore: round(bikeScore.bikeScore, 4) ?? null,
          responseIndex: round(bikeScore.responseIndex, 4) ?? null,
          aerobicTISS: round(bikeScore.aerobicTISS, 4) ?? null,
          anaerobicTISS: round(bikeScore.anaerobicTISS, 4) ?? null,
          tissAerobicity: round(bikeScore.tissAerobicity, 4) ?? null,
          algorithmVersion: bikeScore.algorithmVersion,
          durationSec: round(bikeScore.durationSec, 3) ?? null,
          coveredSeconds: round(bikeScore.coveredSeconds, 3) ?? null,
          coverageRatio: round(bikeScore.coverageRatio, 6) ?? null,
          parameters: bikeScore.parameters as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存 BikeScore] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  async saveActivitySwimScore(
    activityId: number,
    sportType: $Enums.SportType,
    result: {
      algorithmVersion: number;
      swimScore: number;
      thresholdSpeedMps: number;
      xPower: number;
      durationSec: number;
      coveredSeconds: number;
      coverageRatio: number;
      parameters: Record<string, unknown>;
    },
  ) {
    const data = {
      sport: sportType,
      swimScore: round(result.swimScore, 4),
      algorithmVersion: result.algorithmVersion,
      thresholdSpeedMps: round(result.thresholdSpeedMps, 6),
      xPower: round(result.xPower, 4),
      durationSec: round(result.durationSec, 3),
      coveredSeconds: round(result.coveredSeconds, 3),
      coverageRatio: round(result.coverageRatio, 6),
      parameters: result.parameters as Prisma.InputJsonValue,
      calculatedAt: new Date(),
    };
    await this.prisma.activitySwimScore.upsert({
      where: { activityId },
      update: data,
      create: { activityId, ...data },
    });
  }

  async saveActivityLthrObservation(args: {
    activity: Pick<Activity, 'id' | 'sportType' | 'startTime'>;
    userId: string;
    observation: import('@/api/activity/metrics/context').MetricsContext['outputs']['lthrObservation'] &
      object;
  }) {
    const { activity, userId, observation } = args;
    if (
      !observation ||
      !activity.startTime ||
      (activity.sportType !== $Enums.SportType.RUN &&
        activity.sportType !== $Enums.SportType.CYCLING)
    ) {
      return;
    }
    const data = {
      userId,
      sport: activity.sportType,
      candidateBpm: observation.value,
      rawMeanBpm: observation.rawMean,
      windowStartSec: observation.windowStartSec,
      windowEndSec: observation.windowEndSec,
      measureStartSec: observation.measureStartSec,
      measureEndSec: observation.measureEndSec,
      fullCoverageRatio: observation.fullCoverageRatio,
      tailCoverageRatio: observation.tailCoverageRatio,
      maxGapSeconds: observation.maxGapSeconds,
      pausedSeconds: observation.pausedSeconds,
      pauseEvidence: observation.pauseEvidence,
      sampleSeconds: observation.sampleSeconds,
      protocol: observation.protocol,
      qualityTier: observation.qualityTier,
      checks: observation.checks as Prisma.InputJsonValue,
      observedAt: activity.startTime,
      calculatedAt: new Date(),
    };
    await this.prisma.activityLthrObservation.upsert({
      where: {
        activityId_algorithmVersion: {
          activityId: activity.id,
          algorithmVersion: observation.algorithmVersion,
        },
      },
      update: data,
      create: {
        activityId: activity.id,
        algorithmVersion: observation.algorithmVersion,
        ...data,
      },
    });
  }

  async saveActivityGovssRow(
    activityId: number,
    sportType: $Enums.SportType,
    govss: import('@/algorithm/GOVSS').GOVSSResult,
  ) {
    if (!activityId || !govss) return;
    try {
      await this.prisma.activityGOVSS.upsert({
        where: { activityId },
        update: {
          sport: sportType,
          govss: round(govss.govss, 4) ?? null,
          algorithmVersion: govss.algorithmVersion,
          gradeMode: govss.gradeMode,
          coveredSeconds: govss.coveredSeconds,
          gradeCoverageRatio: govss.gradeCoverageRatio,
          parameters: {
            gradeUnit: 'percent',
            minimumGradeCoverageRatio: 0.8,
            speedGradeWindowSeconds: 120,
            powerWindowSeconds: 30,
            maxObservationGapSeconds: 10,
          } as Prisma.InputJsonValue,
          calculatedAt: new Date(),
        },
        create: {
          activityId,
          sport: sportType,
          govss: round(govss.govss, 4) ?? null,
          algorithmVersion: govss.algorithmVersion,
          gradeMode: govss.gradeMode,
          coveredSeconds: govss.coveredSeconds,
          gradeCoverageRatio: govss.gradeCoverageRatio,
          parameters: {
            gradeUnit: 'percent',
            minimumGradeCoverageRatio: 0.8,
            speedGradeWindowSeconds: 120,
            powerWindowSeconds: 30,
            maxObservationGapSeconds: 10,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存 GOVSS] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /** Activity 上配速 scalar 字段（PaceBaseTask.post） */
  async saveActivityPaceActivityFields(
    activityId: number,
    data: {
      avgGap?: number;
      avgSpeed?: number;
      xPace?: number;
      xGap?: number;
      viPace?: number;
      viGap?: number;
      avgAerobicEfficiency?: number;
    },
  ) {
    if (!activityId) return;
    try {
      await this.prisma.activity.update({
        where: { id: activityId },
        data: {
          avgGAP: data.avgGap,
          avgSpeed: data.avgSpeed,
          xPace: data.xPace ?? undefined,
          xGap: data.xGap ?? undefined,
          viPace: data.viPace ?? undefined,
          viGap: data.viGap ?? undefined,
          avgAerobicEfficiency: data.avgAerobicEfficiency ?? undefined,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存配速基础字段] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /** 配速分区 ActivityZone.PACE（PaceZonesTask.post） */
  async saveActivityPaceZoneRows(
    activityId: number,
    zones: import('@/utils/zones').UserZoneValue[],
  ) {
    if (!activityId) return;
    try {
      const paceZoneRows = (zones || []).map((z, index) => {
        const order = z.order ?? index + 1;
        return {
          activityId: activityId,
          zoneType: ZoneType.PACE,
          name: z.name ?? `Z${index}`,
          order,
          color: z.color ?? undefined,
          duration: z?.duration != null ? round(z.duration) : undefined,
          percent: z?.percent ?? undefined,
          min: z?.min ?? undefined,
          max: z?.max ?? undefined,
          avg: z?.avg ?? undefined,
        };
      });
      await replaceActivityZoneRows(this.prisma, {
        activityId,
        zoneType: ZoneType.PACE,
        rows: paceZoneRows,
      });
    } catch (e) {
      this.logger.error(
        `[保存配速分区] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /** 仅写入 Activity 上的心率基础字段（由 HeartRateBaseTask.post 调用） */
  async saveActivityHeartRateBaseFields(
    activityId: number,
    data: Pick<
      HeartRateAnalysisResult,
      'avg' | 'max' | 'min' | 'paHr' | 'pwHr' | 'maxHrDrop'
    >,
  ) {
    if (!activityId) return;
    try {
      await this.prisma.activity.update({
        where: { id: activityId },
        data: {
          avgHeartRate: data.avg ? Math.round(data.avg) : undefined,
          maxHeartRate: data.max ?? undefined,
          minHeartRate: data.min ?? undefined,
          paHr: data.paHr ?? undefined,
          pwHr: data.pwHr ?? undefined,
          maxHrDrop: data.maxHrDrop ?? undefined,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存心率基础] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /** 仅写入心率分区（由 HeartRateZonesTask.post 调用） */
  async saveActivityHeartRateZoneRows(
    activityId: number,
    zones: Array<{
      name: string;
      order?: number;
      color?: string;
      duration?: number;
      percent?: number;
      min?: number;
      max?: number;
      avg?: number;
    }>,
  ) {
    if (!activityId) return;
    try {
      const hrZoneRows = zones.map((z, i) => ({
        activityId,
        zoneType: ZoneType.HEART_RATE,
        name: z.name,
        order: z.order ?? i + 1,
        color: z.color ?? undefined,
        duration: z.duration != null ? round(z.duration) : undefined,
        percent: z.percent ?? undefined,
        min: z.min ?? undefined,
        max: z.max ?? undefined,
        avg: z.avg ?? undefined,
      }));
      await replaceActivityZoneRows(this.prisma, {
        activityId,
        zoneType: ZoneType.HEART_RATE,
        rows: hrZoneRows,
      });
    } catch (e) {
      this.logger.error(
        `[保存心率分区] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /** 仅写入 TRIMP 行（由 HeartRateTrimpTask.post 调用） */
  async saveActivityHeartRateTrimpRow(
    activityId: number,
    data: Pick<HeartRateAnalysisResult, 'TRIMP' | 'TRIMP100' | 'TRIMPZonal'>,
  ) {
    if (!activityId || data.TRIMP === undefined) return;
    try {
      await this.prisma.activityTrimp.upsert({
        where: { activityId },
        update: {
          trimp: data.TRIMP,
          trimp100: data.TRIMP100,
          trimpZonalPoints: data.TRIMPZonal,
          calculatedAt: new Date(),
        },
        create: {
          activityId,
          trimp: data.TRIMP,
          trimp100: data.TRIMP100,
          trimpZonalPoints: data.TRIMPZonal ?? 0,
        },
      });
    } catch (e) {
      this.logger.error(
        `[保存心率 TRIMP] 活动ID=${activityId} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /**
   * 持久化训练效应（EPOC/TE/恢复时间等）。
   *
   * 说明：
   * - 这里不要求传入完整 Activity 实体，只要能提供 activityId 与 sportType 即可。
   * - 便于增量复算等场景直接用 “activity lite” 调用，避免到处 `as unknown as Activity`。
   */
  async saveActivityTrainingEffect(
    activity: Pick<Activity, 'id' | 'sportType'>,
    teMetrics: ActivityTrainingEffectMetrics,
  ) {
    const metrics = teMetrics;
    if (!metrics) return;
    this.logger.debug(
      `[保存训练效应] 活动ID=${activity.id} 开始写入训练效应数据`,
    );
    await this.prisma.activityTrainingEffect.upsert({
      where: { activityId: activity.id },
      update: {
        sport: activity.sportType ?? SportType.UNKNOWN,
        epoc: metrics.epoc,
        trainingEffect: metrics.trainingEffect,
        recoveryHours: metrics.recoveryHours,
        calculatedAt: new Date(),
        aerobicEpoc: metrics?.aerobicEpoc ?? undefined,
        anaerobicEpoc: metrics?.anaerobicEpoc ?? undefined,
        aerobicTrainingEffect: metrics?.aerobicTrainingEffect ?? undefined,
        anaerobicTrainingEffect: metrics?.anaerobicTrainingEffect ?? undefined,
      },
      create: {
        activityId: activity.id,
        sport: activity.sportType ?? SportType.UNKNOWN,
        epoc: metrics.epoc,
        trainingEffect: metrics.trainingEffect,
        recoveryHours: metrics.recoveryHours,
        aerobicEpoc: metrics?.aerobicEpoc ?? undefined,
        anaerobicEpoc: metrics?.anaerobicEpoc ?? undefined,
        aerobicTrainingEffect: metrics?.aerobicTrainingEffect ?? undefined,
        anaerobicTrainingEffect: metrics?.anaerobicTrainingEffect ?? undefined,
      },
    });
    this.logger.debug(`[保存训练效应] 活动ID=${activity.id} 写入完成`);
  }
}
