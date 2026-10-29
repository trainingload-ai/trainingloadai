import { Injectable, Logger } from '@nestjs/common';
import dayjs = require('dayjs');
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { ActivityMetricsPipelineService } from '@/api/activity/metrics/activity-metrics-pipeline.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import type { Prisma, SportType } from '@prisma/client';
import type { ActivityFitnessMetricsSnapshot } from '@prisma/client';
import { AnalyzePersistenceService } from './analyze-persistence.service';
import { computeEPOCFromHR } from '@/algorithm/epoc';
import { detectSampleSec } from '@/algorithm/utils';
import { readyActivityWhere } from '@/utils/activity-ready-where';

type ActivityLite = {
  id: number;
  userId: string;
  sportType: SportType;
  startTime: Date;
  avgHeartRate: number | null;
  ascent: number | null;
  descent: number | null;
};

export function heartRateThresholdSnapshotMatches(
  snapshot: Pick<
    ActivityFitnessMetricsSnapshot,
    'maxHrValue' | 'restHrValue' | 'lthrValue'
  >,
  current: {
    maxHeartRate: number | null;
    restingHeartRate: number | null;
    lactateThresholdHeartRate: number | null;
  } | null,
) {
  return (
    snapshot.maxHrValue === (current?.maxHeartRate ?? null) &&
    snapshot.restHrValue === (current?.restingHeartRate ?? null) &&
    snapshot.lthrValue === (current?.lactateThresholdHeartRate ?? null)
  );
}

/**
 * 活动复算执行器。
 * 它不负责调度、去重、重试，只负责把某个用户在给定时间窗口内受影响的活动重新分析一遍。
 */
@Injectable()
export class ActivityRecomputeExecutorService {
  private readonly logger = new Logger(ActivityRecomputeExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly activityMetrics: ActivityMetricsPipelineService,
    private readonly sensorDataService: SensorDataService,
    private readonly analyzePersistence: AnalyzePersistenceService,
  ) {}

  private async shouldSkipHrRecomputeForActivity(
    act: { id: number; userId: string; sportType: SportType; startTime: Date },
    hrThreshold: {
      maxHeartRate: number | null;
      restingHeartRate: number | null;
      lactateThresholdHeartRate: number | null;
    } | null,
  ): Promise<boolean> {
    const snapshot: Pick<
      ActivityFitnessMetricsSnapshot,
      'maxHrValue' | 'restHrValue' | 'lthrValue'
    > | null = await this.prisma.activityFitnessMetricsSnapshot.findUnique({
      where: { activityId: act.id },
      select: { maxHrValue: true, restHrValue: true, lthrValue: true },
    });
    if (snapshot) {
      if (heartRateThresholdSnapshotMatches(snapshot, hrThreshold)) {
        this.logger.debug(
          `[增量复算] 活动 ${act.id} HR 指标未变化，跳过心率复算`,
        );
        return true;
      }
      const curLthr = hrThreshold?.lactateThresholdHeartRate ?? null;
      const curMax = hrThreshold?.maxHeartRate ?? null;
      const curRest = hrThreshold?.restingHeartRate ?? null;
      this.logger.debug(
        `[增量复算] 活动 ${act.id} HR 快照与当前生效指标不一致，将复算 最大值=${String(curMax)} vs ${String(snapshot.maxHrValue ?? null)}, rest=${String(curRest)} vs ${String(snapshot.restHrValue ?? null)}, lthr=${String(curLthr)} vs ${String(snapshot.lthrValue ?? null)}`,
      );
      return false;
    }
    return false;
  }

  private async shouldSkipPowerRecomputeForActivity(
    act: ActivityLite,
  ): Promise<boolean> {
    const snapshot: Pick<
      ActivityFitnessMetricsSnapshot,
      'cpValue' | 'cpValue2' | 'ftpValue'
    > | null = await this.prisma.activityFitnessMetricsSnapshot.findUnique({
      where: { activityId: act.id },
      select: { cpValue: true, cpValue2: true, ftpValue: true },
    });
    if (snapshot) {
      const profile = await this.userService.getComposedUserProfile(
        act.userId,
        act.sportType,
        act.startTime,
      );
      const curCp = profile?.cp ?? null;
      const curFtp = profile?.ftp ?? null;
      const curWPrime = profile?.wPrime ?? null;

      const cpMatches = snapshot.cpValue == null || snapshot.cpValue === curCp;
      const ftpMatches =
        snapshot.ftpValue == null || snapshot.ftpValue === curFtp;
      const wPrimeMatches =
        snapshot.cpValue2 == null || snapshot.cpValue2 === curWPrime;

      if (cpMatches && ftpMatches && wPrimeMatches) {
        this.logger.debug(
          `[增量复算] 活动 ${act.id} Power 指标未变化，跳过功率复算`,
        );
        return true;
      }
      this.logger.debug(
        `[增量复算] 活动 ${act.id} Power 快照与当前生效指标不一致，将复算 cp=${String(curCp)} vs ${String(snapshot.cpValue ?? null)}, ftp=${String(curFtp)} vs ${String(snapshot.ftpValue ?? null)}, w'=${String(curWPrime)} vs ${String(snapshot.cpValue2 ?? null)}`,
      );
      return false;
    }
    return false;
  }

  private async shouldSkipPaceRecomputeForActivity(
    act: ActivityLite,
  ): Promise<boolean> {
    const snapshot: Pick<
      ActivityFitnessMetricsSnapshot,
      'csValue' | 'csValue2'
    > | null = await this.prisma.activityFitnessMetricsSnapshot.findUnique({
      where: { activityId: act.id },
      select: { csValue: true, csValue2: true },
    });
    if (snapshot) {
      const profile = await this.userService.getComposedUserProfile(
        act.userId,
        act.sportType,
        act.startTime,
      );
      const curCs = profile?.cs ?? null;
      const curDPrime = profile?.dPrime ?? null;
      const csMatches = snapshot.csValue == null || snapshot.csValue === curCs;
      const dPrimeMatches =
        snapshot.csValue2 == null || snapshot.csValue2 === curDPrime;
      if (csMatches && dPrimeMatches) {
        this.logger.debug(
          `[增量复算] 活动 ${act.id} Pace 指标未变化，跳过配速复算`,
        );
        return true;
      }
      this.logger.debug(
        `[增量复算] 活动 ${act.id} Pace 快照与当前生效指标不一致，将复算 cs=${String(curCs)} vs ${String(snapshot.csValue ?? null)}, d'=${String(curDPrime)} vs ${String(snapshot.csValue2 ?? null)}`,
      );
      return false;
    }
    return false;
  }

  /**
   * 基准型指标 / 分区配置变更后的纯执行入口。
   * 调度、去重、重试由 t_activity_recompute_job + worker 负责，这里只关心“给定窗口内怎么重算”。
   */
  public async executeMetricChangeRecompute(params: {
    userId: string;
    metricType:
      | 'LTHR'
      | 'MHR'
      | 'RHR'
      | 'FTP'
      | 'CP'
      | 'CS'
      | 'ZONE_HEART_RATE'
      | 'ZONE_POWER'
      | 'ZONE_PACE';
    sportType?: SportType;
    effectiveFrom: Date;
    effectiveTo?: Date;
    lookbackDays: number;
  }) {
    const {
      userId,
      metricType,
      sportType,
      effectiveFrom,
      effectiveTo,
      lookbackDays,
    } = params;
    const now = new Date();
    const windowFrom = dayjs(now).subtract(lookbackDays, 'day').toDate();
    const from = effectiveFrom > windowFrom ? effectiveFrom : windowFrom;
    const to = effectiveTo ?? now;
    const where: Prisma.ActivityWhereInput = readyActivityWhere({
      userId,
      startTime: { gte: from, lte: to },
    });
    if (sportType) where.sportType = sportType;
    this.logger.log(
      `[增量复算] 用户ID=${userId}, metricType=${metricType}, 运动类型=${sportType ?? 'ALL'}, rawFrom=${dayjs(effectiveFrom).format('YYYY-MM-DD')}, windowFrom=${dayjs(windowFrom).format('YYYY-MM-DD')}, from=${dayjs(from).format('YYYY-MM-DD')}, rawTo=${effectiveTo ? dayjs(effectiveTo).format('YYYY-MM-DD') : 'OPEN'}, to=${dayjs(to).format('YYYY-MM-DD')}, 回溯天数=${lookbackDays}`,
    );
    const activities: ActivityLite[] = await this.prisma.activity.findMany({
      where,
      select: {
        id: true,
        sportType: true,
        startTime: true,
        userId: true,
        avgHeartRate: true,
        ascent: true,
        descent: true,
        state: true,
      },
      orderBy: { startTime: 'asc' },
    });
    if (!activities || activities.length === 0) {
      this.logger.log('[增量复算] 无受影响活动，跳过');
      return;
    }
    const needHR =
      metricType === 'LTHR' ||
      metricType === 'MHR' ||
      metricType === 'RHR' ||
      metricType === 'ZONE_HEART_RATE';
    const needPower =
      metricType === 'FTP' ||
      metricType === 'CP' ||
      metricType === 'ZONE_POWER';
    const needPace = metricType === 'CS' || metricType === 'ZONE_PACE';
    this.logger.log(
      `[增量复算] 命中活动数=${activities.length}, needHR=${needHR}, needPower=${needPower}, needPace=${needPace}`,
    );
    for (const act of activities) {
      try {
        this.logger.debug(
          `[增量复算] 开始处理活动 ${act.id}，运动类型=${act.sportType}, 开始时间=${dayjs(act.startTime).format('YYYY-MM-DD HH:mm:ss')}`,
        );
        let didRecompute = false;
        let shouldRecomputeVo2Max = false;
        if (needHR) {
          const hrThreshold = await this.userService.getUserHeartRateThreshold(
            act.userId,
            act.sportType,
            act.startTime,
          );
          const skippedHr = await this.shouldSkipHrRecomputeForActivity(
            act,
            hrThreshold,
          );
          if (!skippedHr) {
            await this.activityMetrics.runHeartRate(act.id, act.userId);
            didRecompute = true;
            shouldRecomputeVo2Max = true;
            if (hrThreshold?.maxHeartRate && hrThreshold?.restingHeartRate) {
              const rows =
                (await this.sensorDataService.getRecordSeriesMulti(act.id, [
                  'heartRate',
                  'speed',
                  'distance',
                ])) || [];
              if (rows.length) {
                const sampleSec = detectSampleSec(rows);
                const hrRows = rows.map((r) => ({
                  time: r.time,
                  hr: r.heartRate,
                  distance: Number(r.distance),
                }));
                const m = computeEPOCFromHR(
                  hrRows,
                  hrThreshold.maxHeartRate,
                  hrThreshold.restingHeartRate,
                );
                const teMetrics = m ? { ...m, sampleSec } : null;
                if (teMetrics) {
                  await this.analyzePersistence.saveActivityTrainingEffect(
                    act,
                    teMetrics,
                  );
                }
              }
            }
          }
        }

        if (
          needPower &&
          (act.sportType === 'CYCLING' || act.sportType === 'RUN')
        ) {
          const skippedPower =
            await this.shouldSkipPowerRecomputeForActivity(act);
          if (!skippedPower) {
            await this.activityMetrics.runPower(act.id, act.userId);
            didRecompute = true;
          }
        }
        if (needPace) {
          const skippedPace =
            await this.shouldSkipPaceRecomputeForActivity(act);
          if (!skippedPace) {
            await this.activityMetrics.runPace(act.id, act.userId);
            didRecompute = true;
          }
        }
        if (didRecompute) {
          await this.activityMetrics.upsertFitnessMetricSnapshots(
            act,
            act.userId,
          );
        }
        if (shouldRecomputeVo2Max) {
          await this.activityMetrics.recomputeVo2Max(act.id, act.userId);
        }
        this.logger.debug(`[增量复算] 活动 ${act.id} 处理完成`);
      } catch (e) {
        this.logger.error(
          `[增量复算] 活动 ${act.id} 复算失败：${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    this.logger.log(
      `[增量复算] 完成，处理活动数=${activities.length}, metricType=${metricType}`,
    );
  }
}
