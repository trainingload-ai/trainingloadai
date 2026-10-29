import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../api/user/user.service';
import { UserQueryService } from '../api/user/user-query.service';
import { I18nService } from 'nestjs-i18n';
import { I18nContext } from 'nestjs-i18n/dist/i18n.context';
import {
  MetricSource,
  PeakType,
  ScaleType,
  SportType as PrismaSportType,
  UserFitnessMetricType,
} from '@prisma/client';
import dayjs = require('dayjs');
import { round } from 'lodash';
import { computeCriticalSpeed, CSPoint } from '../algorithm/cs';
import { calculateCp } from '../algorithm/fitness-cp';
import { TimeDecayEstimator } from '../algorithm/time-decay';
import { BusinessException } from '../filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '../filters/business-exception/business-exception.error.codes';
import { resolveEffectiveActivityVo2Max } from './vo2max/vo2max-source';
import { readyOrScopedActivityWhere } from '@/utils/activity-ready-where';
import {
  permitsPowerDerivedMetrics,
  resolveMeasuredPowerEvidence,
} from '@/training-load/measured-power-evidence';
import { validateFitnessMetricCandidate } from '@/api/user/fitness-metric-validator';
import {
  selectLthrEstimate,
  shouldApplyLthrAutoUpdate,
} from '@/algorithm/lthr-observation';

export type ActivityFitnessRefreshScope = {
  includeActivityIds?: readonly number[];
};

export type UserFitnessRefreshFailure = {
  task: string;
  error: unknown;
};

const RUN_CS_MIN_TRIAL_SECONDS = 120;
const RUN_CS_MAX_TRIAL_SECONDS = 900;
const RUN_CS_MIN_POINTS = 3;
const RUN_CS_MIN_SPEED_METERS_PER_SECOND = 1.8;
const RUN_CS_MIN_R_SQUARED = 0.95;

export class UserFitnessRefreshError extends Error {
  constructor(
    readonly stage: 'PRE' | 'POST',
    readonly userId: string,
    readonly failures: UserFitnessRefreshFailure[],
  ) {
    super(
      `[用户档案][${stage}] 刷新失败，用户ID=${userId}, 失败任务=${failures
        .map((failure) => failure.task)
        .join(',')}`,
    );
    this.name = 'UserFitnessRefreshError';
  }
}

@Injectable()
export class AnalyzeFitnessOrchestratorService {
  private readonly logger = new Logger(AnalyzeFitnessOrchestratorService.name);

  /**
   * 用户体能档案刷新编排器（全局/跨运动类型）。
   *
   * 职责：
   * - 从活动峰值/分析结果中回推用户体能指标（TP/CS/CP/FTP/LTHR/VO2Max 等）
   * - 将这些指标写入 `UserFitnessMetric`（通常 来源=AUTO）
   *
   * 设计取舍：
   * - 这里既包含查询（Prisma）也包含计算（算法），但只服务“用户档案刷新”这一条主流程。
   * - 数据不足时正常跳过；查询、计算或写入异常必须上抛，让后处理队列重试。
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly users: UserQueryService,
  ) {}

  /**
   * 重新估算阈值配速 TP（Threshold Pace）。
   *
   * 逻辑：
   * - 在窗口期内找 5K 最佳配速（ActivityPeakMetric: pace + DISTANCE=5000）
   * - TP = 5K 配速 + offsetSecPerKm（经验偏移）
   *
   * 输出：
   * - 写入 UserFitnessMetricType.TP（value=速度 m/s，value2=配速 s/km）
   */
  async recalculateUserTP(
    userId: string,
    calculationDate: Date = dayjs().endOf('day').toDate(),
    windowDays: number = 180,
    distanceM: number = 5000,
    offsetSecPerKm: number = 20,
    scope: ActivityFitnessRefreshScope = {},
  ) {
    try {
      const normalEndDate = dayjs(calculationDate).endOf('day').toDate();
      const since = dayjs(calculationDate)
        .subtract(windowDays, 'day')
        .startOf('day')
        .toDate();

      const best = await this.prisma.activityPeakMetric.findFirst({
        where: {
          sport: PrismaSportType.RUN,
          scaleType: ScaleType.DISTANCE,
          type: PeakType.pace,
          scaleValue: distanceM,
          // 5K 峰值存的是速度。TP 的固有上限也是 12m/s；超出该范围的历史
          // 峰值不具备进入阈值估算的语义资格，但仍保留在活动侧供数据修复审计。
          value: { gt: 0, lte: 12 },
          activity: readyOrScopedActivityWhere(
            {
              userId,
              startTime: { gte: since, lte: normalEndDate },
            },
            scope.includeActivityIds,
          ),
        },
        orderBy: { value: 'desc' },
      });

      const bestSpeedMps = best?.value;
      if (!bestSpeedMps || !Number.isFinite(bestSpeedMps) || bestSpeedMps <= 0)
        return;

      const bestPaceSecPerKm = 1000 / bestSpeedMps;
      if (
        !Number.isFinite(bestPaceSecPerKm) ||
        bestPaceSecPerKm <= 0 ||
        bestPaceSecPerKm > 3600
      ) {
        return;
      }

      const estimatedTpSecPerKm = bestPaceSecPerKm + offsetSecPerKm;
      this.logger.log(
        `[TP] 用户：${userId} 5K峰值来源活动=${best.activityId}，峰值速度=${round(bestSpeedMps, 3)}m/s，最佳配速=${round(bestPaceSecPerKm, 2)}s/km -> 阈值配速=${round(
          estimatedTpSecPerKm,
          2,
        )}s/km（+${offsetSecPerKm}s），估算时间=${dayjs(calculationDate).format('YYYY-MM-DD')}`,
      );

      await this.userService.upsertFitnessMetric(
        userId,
        UserFitnessMetricType.TP,
        1000 / estimatedTpSecPerKm,
        PrismaSportType.RUN,
        estimatedTpSecPerKm,
        MetricSource.AUTO,
        calculationDate,
      );
    } catch (e) {
      this.logger.error(
        `[TP] 用户：${userId} 阈值配速估算失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw e;
    }
  }

  /**
   * 更新全局 VO2Max（跨运动类型的汇总指标）。
   *
   * 逻辑：
   * - 读取最近 180 天跑步活动 VO2Max，并按用户配置选取来源
   * - 用 TimeDecayEstimator 做时间衰减加权，得到一个更平滑的全局 VO2Max
   *
   * 失败处理：
   * - 抛 BusinessException（保持历史行为），由上层决定是否吞掉
   */
  async updateGlobalMetrics(
    userId: string,
    scope: ActivityFitnessRefreshScope = {},
  ) {
    try {
      this.logger.debug(`[VO2Max] 开始更新全局 VO2Max，用户ID=${userId}`);
      const [profile, vo2MaxRecords] = await Promise.all([
        this.users.profiles().findUnique({
          where: { userId },
          select: {
            defaultVdotSource: true,
            vo2maxCorrectionFactor: true,
          },
        }),
        this.prisma.activity.findMany({
          where: readyOrScopedActivityWhere(
            {
              userId,
              sportType: PrismaSportType.RUN,
              startTime: { gte: dayjs().subtract(180, 'day').toDate() },
              vo2max: {
                OR: [
                  { vo2maxVdotByFactor: { gt: 0 } },
                  { vo2maxVdotByHr: { gt: 0 } },
                  { vo2maxVdotByRace: { gt: 0 } },
                ],
              },
            },
            scope.includeActivityIds,
          ),
          select: {
            startTime: true,
            vo2max: {
              select: {
                vo2maxVdotByFactor: true,
                vo2maxVdotByHr: true,
                vo2maxVdotByRace: true,
              },
            },
          },
          orderBy: { startTime: 'desc' },
        }),
      ]);
      if (!vo2MaxRecords || vo2MaxRecords.length === 0) {
        this.logger.debug(`[VO2Max] 最近无有效 VO2Max 数据，跳过更新`);
        return;
      }
      const dataPoints = vo2MaxRecords
        .map((r) => {
          const resolved = resolveEffectiveActivityVo2Max(
            r.vo2max,
            profile?.defaultVdotSource,
            profile?.vo2maxCorrectionFactor,
          );
          return resolved && r.startTime
            ? { date: r.startTime, value: resolved.value }
            : undefined;
        })
        .filter((point): point is { date: Date; value: number } => !!point);

      const weightedAvg = TimeDecayEstimator.calculate(dataPoints, {
        decayDays: 40,
        truncationMultiple: 3,
        referenceDate: dayjs().endOf('day').toDate(),
      });
      if (weightedAvg !== null) {
        const roundedAvg = round(weightedAvg, 2);
        this.logger.log(
          `[VO2Max] 用户(${userId})的加权 VO2Max 估算值：${roundedAvg}`,
        );
        const recordedAt = dayjs().endOf('day').toDate();
        await this.userService.upsertFitnessMetric(
          userId,
          UserFitnessMetricType.VO2_MAX,
          roundedAvg,
          PrismaSportType.UNKNOWN,
          undefined,
          MetricSource.AUTO,
          recordedAt,
        );
      }
    } catch (e) {
      this.logger.error(
        `[VO2Max] 更新全局指标失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  async recalculateUserCPAndFTP(
    userId: string,
    sportType: PrismaSportType,
    calculationDate: Date = dayjs().endOf('day').toDate(),
    scope: ActivityFitnessRefreshScope = {},
  ) {
    const windowStart = dayjs(calculationDate)
      .subtract(90, 'day')
      .startOf('day')
      .toDate();
    const normalEndDate = dayjs(calculationDate).endOf('day').toDate();
    const peakRows = await this.prisma.activityPeakMetric.findMany({
      where: {
        activity: readyOrScopedActivityWhere(
          {
            userId,
            startTime: { gte: windowStart, lte: normalEndDate },
          },
          scope.includeActivityIds,
        ),
        sport: sportType,
        type: PeakType.power,
        scaleType: ScaleType.TIME,
      },
      select: {
        scaleValue: true,
        value: true,
        activity: {
          select: {
            activitySources: {
              where: { isActive: true, isPrimary: true },
              select: { metadata: true },
            },
          },
        },
      },
    });

    const bestByDuration = new Map<number, number>();
    for (const row of peakRows) {
      if (
        !permitsPowerDerivedMetrics(
          resolveMeasuredPowerEvidence(row.activity.activitySources),
        )
      ) {
        continue;
      }
      const value = Number(row.value);
      if (!Number.isFinite(value) || value <= 0) continue;
      bestByDuration.set(
        row.scaleValue,
        Math.max(bestByDuration.get(row.scaleValue) ?? 0, value),
      );
    }

    if (bestByDuration.size <= 4) {
      this.logger.log(
        `[CP] 没有足够的点可以用来计算用户的CP和FTP，用户：${userId} 运动类型： ${sportType} 时间：${calculationDate}`,
      );
      return;
    }

    const points = Array.from(bestByDuration.entries())
      .map(([duration, power]) => ({ duration, power }))
      .filter(
        (p: { duration: number; power: number }) =>
          p.duration > 0 && p.power > 0,
      )
      .sort(
        (a: { duration: number }, b: { duration: number }) =>
          a.duration - b.duration,
      );

    try {
      const result = calculateCp(
        points.map(({ duration, power }) => ({
          seconds: duration,
          value: power,
        })),
      );
      if (!result.valid) {
        this.logger.warn(
          `[CP] 拒绝低质量功率曲线：用户=${userId}, 运动=${sportType}, 原因=${result.reason}`,
        );
        return;
      }
      const cp = result.cp;
      const wPrime = result.wPrime;
      const ftp = result.ftp;
      const pMax = result.pMax;

      this.logger.log(
        `[CP] 用户：${userId} 在运动类型为：${sportType} 的CP估算结果为： CP=${cp}, W'=${wPrime}, FTP=${ftp}, P最大值=${pMax}`,
      );
      if (!cp || cp <= 0) return;

      const powerContext = {
        [UserFitnessMetricType.CP]: cp,
        [UserFitnessMetricType.FTP]: ftp,
        [UserFitnessMetricType.P_MAX]: pMax,
      };
      const candidates = [
        { type: UserFitnessMetricType.CP, value: cp },
        { type: UserFitnessMetricType.FTP, value: ftp },
        ...(pMax ? [{ type: UserFitnessMetricType.P_MAX, value: pMax }] : []),
        ...(wPrime
          ? [{ type: UserFitnessMetricType.W_PRIME, value: wPrime }]
          : []),
      ];
      for (const candidate of candidates) {
        const validation = validateFitnessMetricCandidate(
          { ...candidate, sport: sportType },
          powerContext,
        );
        if (validation.valid === false) {
          this.logger.warn(
            `[CP] 拒绝不自洽的功率模型结果：用户=${userId}, 运动=${sportType}, CP=${cp}, FTP=${ftp}, Pmax=${pMax}, W'=${wPrime}, 原因=${validation.reason}`,
          );
          return;
        }
      }

      await this.userService.upsertAutoFitnessMetrics(
        userId,
        sportType,
        candidates,
        calculationDate,
      );
      return;
    } catch (e) {
      this.logger.error(
        `[CP] 计算失败: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
  }

  private async runRefreshTasks(
    stage: 'PRE' | 'POST',
    userId: string,
    tasks: Array<{ task: string; promise: Promise<unknown> }>,
  ) {
    const results = await Promise.allSettled(
      tasks.map(({ promise }) => promise),
    );
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [{ task: tasks[index].task, error: result.reason }]
        : [],
    );
    if (failures.length > 0) {
      const error = new UserFitnessRefreshError(stage, userId, failures);
      this.logger.error(error.message);
      throw error;
    }
    this.logger.log(`[用户档案][${stage}] 刷新完成，用户ID=${userId}`);
  }
  /**
   * 聚合普通活动产生的严格 LTHR 观测证据。
   *
   * 单次高质量观测只进入 ESTIMATED 轨道；最近 42 天内至少两次相互接近的
   * 独立活动才允许提升 AUTO。被动观测只上调，不自动下调已有 AUTO 值。
   * 本方法只读取已经随新活动/显式单活动重算生成的 observation，不回扫历史。
   */
  async recalculateUserLTHR(
    userId: string,
    calculationDate: Date = dayjs().endOf('day').toDate(),
    sportTypes: PrismaSportType[] = [
      PrismaSportType.RUN,
      PrismaSportType.CYCLING,
      PrismaSportType.SWIM,
    ],
    scope: ActivityFitnessRefreshScope = {},
  ) {
    const supportedSports = Array.from(
      new Set(
        sportTypes.filter(
          (sport) =>
            sport === PrismaSportType.RUN || sport === PrismaSportType.CYCLING,
        ),
      ),
    );
    const at = dayjs(calculationDate).endOf('day').toDate();
    const since = dayjs(at).subtract(90, 'day').startOf('day').toDate();

    for (const sport of supportedSports) {
      const [observations, maxHr, restingHr, currentAuto] = await Promise.all([
        this.prisma.activityLthrObservation.findMany({
          where: {
            userId,
            sport,
            observedAt: { gte: since, lte: at },
            activity: readyOrScopedActivityWhere(
              { userId },
              scope.includeActivityIds,
            ),
          },
          select: {
            id: true,
            activityId: true,
            candidateBpm: true,
            observedAt: true,
            protocol: true,
            algorithmVersion: true,
          },
          orderBy: { observedAt: 'desc' },
        }),
        this.userService.getEffectiveUserFitnessMetric(
          userId,
          UserFitnessMetricType.MAX_HR,
          at,
          sport,
        ),
        this.userService.getEffectiveUserFitnessMetric(
          userId,
          UserFitnessMetricType.RESTING_HR,
          at,
          sport,
        ),
        this.userService.getUserFitnessMetric(
          userId,
          UserFitnessMetricType.LTHR,
          at,
          sport,
          MetricSource.AUTO,
          true,
        ),
      ]);

      const latestObservationByActivity = new Map<
        number,
        (typeof observations)[number]
      >();
      for (const row of observations) {
        const current = latestObservationByActivity.get(row.activityId);
        if (!current || row.algorithmVersion > current.algorithmVersion) {
          latestObservationByActivity.set(row.activityId, row);
        }
      }
      const validObservations = Array.from(latestObservationByActivity.values())
        .filter((row) => row.protocol === 'OBSERVED' || row.protocol === 'TEST')
        .filter(
          (row) =>
            validateFitnessMetricCandidate(
              {
                type: UserFitnessMetricType.LTHR,
                value: Math.round(row.candidateBpm),
                sport,
                source: MetricSource.ESTIMATED,
              },
              {
                [UserFitnessMetricType.MAX_HR]: maxHr?.value,
                [UserFitnessMetricType.RESTING_HR]: restingHr?.value,
              },
              { requireReferenceMetrics: true },
            ).valid,
        )
        .map((row) => ({
          ...row,
          protocol: row.protocol as 'OBSERVED' | 'TEST',
        }));
      const estimate = selectLthrEstimate(validObservations, at);
      if (!estimate) {
        this.logger.debug(
          `[LTHR] 无可用观测，跳过更新：用户=${userId}, 运动=${sport}`,
        );
        continue;
      }

      const source = shouldApplyLthrAutoUpdate(currentAuto?.value, estimate)
        ? MetricSource.AUTO
        : MetricSource.ESTIMATED;
      await this.userService.upsertFitnessMetric(
        userId,
        UserFitnessMetricType.LTHR,
        estimate.value,
        sport,
        undefined,
        source,
        calculationDate,
        {
          originPayload: {
            method: 'PASSIVE_30M_TAIL20',
            aggregationWindowDays: 90,
            corroborationWindowDays: 42,
            tier: estimate.tier,
            supportCount: estimate.supportCount,
            observationIds: estimate.observationIds,
            rangeBpm: [estimate.rangeMin, estimate.rangeMax],
            algorithmVersions: Array.from(
              new Set(
                validObservations
                  .filter((row) => estimate.observationIds.includes(row.id))
                  .map((row) => row.algorithmVersion),
              ),
            ),
          },
        },
      );
      this.logger.log(
        `[LTHR] 更新${source}：用户=${userId}, 运动=${sport}, 值=${estimate.value}, 证据等级=${estimate.tier}, 支持数=${estimate.supportCount}`,
      );
    }
  }

  /**
   * Pre 刷新时：从 MMHR（ActivityPeakMetric: hr + TIME）观测峰值，与档案 MAX_HR 比较，更高则写入自动指标（全局 UNKNOWN）。
   * 优先用 1s MMHR（与瞬时峰值最接近）；若无记录再回退到所有时长窗口 MMHR 的最大值。
   * 不用 Activity.maxHeartRate：摘要字段可能被管道省略或与记录流不一致。
   */
  async observeMaxHrFromActivitiesAndUpdate(
    userId: string,
    calculationDate: Date = dayjs().endOf('day').toDate(),
    scope: ActivityFitnessRefreshScope = {},
  ) {
    const maxHrAutoOk = await this.userService.checkAutoUpdatePermission(
      userId,
      UserFitnessMetricType.MAX_HR,
    );
    if (!maxHrAutoOk) {
      this.logger.debug(
        `[MaxHR] 自动更新已关闭，跳过观测写入 userId=${userId}`,
      );
      return;
    }

    const HR_MIN = 80;
    const HR_MAX = 240;

    const valueWhere = {
      gt: 0,
      gte: HR_MIN,
      lte: HR_MAX,
    };

    let agg = await this.prisma.activityPeakMetric.aggregate({
      _max: { value: true },
      where: {
        type: PeakType.hr,
        scaleType: ScaleType.TIME,
        scaleValue: 1,
        value: valueWhere,
        activity: readyOrScopedActivityWhere(
          { userId },
          scope.includeActivityIds,
        ),
      },
    });

    let raw = agg._max.value;
    if (raw == null || !Number.isFinite(Number(raw))) {
      agg = await this.prisma.activityPeakMetric.aggregate({
        _max: { value: true },
        where: {
          type: PeakType.hr,
          scaleType: ScaleType.TIME,
          value: valueWhere,
          activity: readyOrScopedActivityWhere(
            { userId },
            scope.includeActivityIds,
          ),
        },
      });
      raw = agg._max.value;
    }

    if (raw == null || !Number.isFinite(Number(raw))) {
      this.logger.debug(
        `[MaxHR] Pre 刷新观测：无有效 MMHR（ActivityPeakMetric hr/TIME），用户ID=${userId}`,
      );
      return;
    }

    const observed = Math.round(Number(raw));
    if (observed < HR_MIN || observed > HR_MAX) return;

    const current = await this.userService.getEffectiveUserFitnessMetric(
      userId,
      UserFitnessMetricType.MAX_HR,
      undefined,
      PrismaSportType.UNKNOWN,
    );
    const previous = current?.value != null ? Math.round(current.value) : 0;

    // 普通活动峰值只能抬高已有基线，不能凭单次活动从零创建 MAX_HR。
    if (!previous) {
      this.logger.debug(
        `[MaxHR] 尚无可信基线，忽略普通活动峰值观测=${observed}, 用户ID=${userId}`,
      );
      return;
    }

    if (observed <= previous) {
      this.logger.debug(
        `[MaxHR] Pre 刷新观测：MMHR 峰值=${observed} 未超过档案=${previous || '—'}，跳过`,
      );
      return;
    }

    this.logger.log(
      `[MaxHR] Pre 刷新观测：MMHR 峰值心率=${observed} > 档案 MAX_HR=${previous || '—'}，更新为用户体能指标`,
    );

    await this.userService.upsertFitnessMetric(
      userId,
      UserFitnessMetricType.MAX_HR,
      observed,
      PrismaSportType.UNKNOWN,
      undefined,
      MetricSource.AUTO,
      calculationDate,
    );
  }
  /**
   * 重新估算用户的 CS
   * @param userId
   * @param sport 运动类型
   * @param calculationDate 计算日期
   * @param windowDays 窗口天数
   * @param minPoints 最小点数
   */
  async recalculateUserCS(
    userId: string,
    sport: PrismaSportType,
    calculationDate: Date = dayjs().endOf('day').toDate(),
    windowDays: number = 90,
    minPoints: number = RUN_CS_MIN_POINTS,
    scope: ActivityFitnessRefreshScope = {},
  ) {
    const normalEndDate = dayjs(calculationDate).endOf('day').toDate();
    const since = dayjs(calculationDate)
      .subtract(windowDays, 'day')
      .startOf('day')
      .toDate();
    const perfRows = await this.prisma.activityPeakMetric.findMany({
      where: {
        sport,
        scaleType: ScaleType.DISTANCE,
        type: PeakType.pace,
        activity: readyOrScopedActivityWhere(
          {
            userId,
            startTime: { gte: since, lte: normalEndDate },
            ...(sport === PrismaSportType.RUN
              ? {
                  OR: [
                    { sportDefinitionCode: null },
                    {
                      sportDefinitionCode: {
                        notIn: ['WALKING', 'HIKING'],
                      },
                    },
                  ],
                }
              : {}),
          },
          scope.includeActivityIds,
        ),
      },
      select: { activityId: true, scaleValue: true, value: true },
      orderBy: [{ scaleValue: 'asc' }, { value: 'desc' }],
    });

    const bestByDistance = new Map<
      number,
      { activityId: number; scaleValue: number; value: number }
    >();
    for (const row of perfRows) {
      if (!row.value || row.value <= 0) continue;
      const current = bestByDistance.get(row.scaleValue);
      if (!current || row.value > current.value) {
        bestByDistance.set(row.scaleValue, {
          activityId: row.activityId,
          scaleValue: row.scaleValue,
          value: row.value,
        });
      }
    }

    const pointCandidates = [...bestByDistance.values()]
      .map((row) => {
        const distance_m = row.scaleValue;
        const speedMps = row.value;
        const time_s = speedMps > 0 ? distance_m / speedMps : 0;
        if (!distance_m || !time_s || distance_m <= 0 || time_s <= 0)
          return null;
        return {
          activityId: row.activityId,
          distance_m,
          time_s,
          weight: 1,
        };
      })
      .filter(Boolean)
      .filter((point) => {
        if (sport !== PrismaSportType.RUN) return true;
        return (
          point!.time_s >= RUN_CS_MIN_TRIAL_SECONDS &&
          point!.time_s <= RUN_CS_MAX_TRIAL_SECONDS
        );
      }) as Array<CSPoint & { activityId: number }>;

    const points: CSPoint[] = pointCandidates;

    const requiredPoints =
      sport === PrismaSportType.RUN
        ? Math.max(RUN_CS_MIN_POINTS, minPoints)
        : minPoints;
    if (!points || points.length < requiredPoints) {
      this.logger.debug(
        `[CS] 跳过估算：用户=${userId}，运动=${sport}，合格点=${points.length}/${requiredPoints}`,
      );
      return;
    }
    if (
      sport === PrismaSportType.RUN &&
      new Set(pointCandidates.map((point) => point.activityId)).size <
        RUN_CS_MIN_POINTS
    ) {
      this.logger.warn(
        `[CS] 拒绝单次活动内部拟合：用户=${userId}，独立活动不足 ${RUN_CS_MIN_POINTS} 次`,
      );
      return;
    }

    const { cs, dPrimeM, r2 } = computeCriticalSpeed(points);
    this.logger.log(
      `[CS] 用户：${userId} 在运动类型为：${sport}的CS估算结果为： CS=${cs}, dPrimeM=${dPrimeM}，估算时间为 ${dayjs(calculationDate).format('YYYY-MM-DD')}`,
    );
    if (!cs || cs <= 0) return;
    if (
      sport === PrismaSportType.RUN &&
      (cs < RUN_CS_MIN_SPEED_METERS_PER_SECOND ||
        !dPrimeM ||
        !r2 ||
        r2 < RUN_CS_MIN_R_SQUARED)
    ) {
      this.logger.warn(
        `[CS] 拒绝低质量跑步估算：用户=${userId}，CS=${cs}，D'=${dPrimeM ?? 'invalid'}，R²=${r2 ?? 'invalid'}，点数=${points.length}`,
      );
      return;
    }

    await this.userService.upsertFitnessMetric(
      userId,
      UserFitnessMetricType.CS,
      cs,
      sport,
      dPrimeM,
      MetricSource.AUTO,
      calculationDate,
    );
  }

  async refreshUserAutoUpdateMetric(
    userId: string,
    metric: UserFitnessMetricType,
  ) {
    switch (metric) {
      case UserFitnessMetricType.FTP:
      case UserFitnessMetricType.CP:
      case UserFitnessMetricType.W_PRIME:
      case UserFitnessMetricType.P_MAX:
        await Promise.all([
          this.recalculateUserCPAndFTP(userId, PrismaSportType.RUN),
          this.recalculateUserCPAndFTP(userId, PrismaSportType.CYCLING),
        ]);
        return;
      case UserFitnessMetricType.CS:
        await Promise.all([
          this.recalculateUserCS(userId, PrismaSportType.RUN),
          this.recalculateUserCS(userId, PrismaSportType.CYCLING),
          this.recalculateUserCS(userId, PrismaSportType.SWIM),
        ]);
        return;
      case UserFitnessMetricType.TP:
        await this.recalculateUserTP(userId);
        return;
      case UserFitnessMetricType.LTHR:
        await this.recalculateUserLTHR(userId);
        return;
      case UserFitnessMetricType.MAX_HR:
        await this.observeMaxHrFromActivitiesAndUpdate(userId);
        return;
      default:
        return;
    }
  }

  async refreshUserFitnessProfile(
    userId: string,
    sportTypes: PrismaSportType[] = [
      PrismaSportType.RUN,
      PrismaSportType.CYCLING,
      PrismaSportType.SWIM,
    ],
    scope: ActivityFitnessRefreshScope = {},
  ) {
    await this.refreshUserFitnessProfilePre(userId, sportTypes, scope);
    await this.refreshUserFitnessProfilePost(userId, scope);
  }
  /**
   * 前置刷新，依赖用户阈值与分区配置
   * 更新 FTP、CS、TP、LTHR等
   * @param userId 用户ID
   * @param sportTypes 运动类型
   */
  async refreshUserFitnessProfilePre(
    userId: string,
    sportTypes: PrismaSportType[] = [
      PrismaSportType.RUN,
      PrismaSportType.CYCLING,
      PrismaSportType.SWIM,
    ],
    scope: ActivityFitnessRefreshScope = {},
  ) {
    this.logger.log(
      `[用户档案][Pre] 开始刷新用户前置指标，更新 FTP、CS、TP、LTHR等，用户ID=${userId}, sportTypes=${sportTypes.join(',')}`,
    );
    const tasks: Array<{ task: string; promise: Promise<unknown> }> = [];
    for (const sport of sportTypes) {
      if (sport === PrismaSportType.RUN || sport === PrismaSportType.CYCLING) {
        tasks.push({
          task: `CP_FTP:${sport}`,
          promise: this.recalculateUserCPAndFTP(
            userId,
            sport,
            undefined,
            scope,
          ),
        });
        tasks.push({
          task: `CS:${sport}`,
          promise: this.recalculateUserCS(
            userId,
            sport,
            undefined,
            undefined,
            undefined,
            scope,
          ),
        });
        // 跑步更新 TP
        if (sport === PrismaSportType.RUN) {
          tasks.push({
            task: 'TP:RUN',
            promise: this.recalculateUserTP(
              userId,
              undefined,
              undefined,
              undefined,
              undefined,
              scope,
            ),
          });
        }
        // 游泳更新 CS
      } else if (sport === PrismaSportType.SWIM) {
        tasks.push({
          task: `CS:${sport}`,
          promise: this.recalculateUserCS(
            userId,
            sport,
            undefined,
            undefined,
            undefined,
            scope,
          ),
        });
      }
    }

    // LTHR 的生理一致性校验依赖 MAX_HR。同批刷新先等待 MAX_HR 观测完成；
    // MAX_HR 即使失败，也继续尝试其余任务，并由 runRefreshTasks 统一汇总失败。
    const maxHrPromise = this.observeMaxHrFromActivitiesAndUpdate(
      userId,
      undefined,
      scope,
    );
    tasks.push({
      task: 'LTHR',
      promise: maxHrPromise
        .catch(() => undefined)
        .then(() =>
          this.recalculateUserLTHR(userId, undefined, sportTypes, scope),
        ),
    });
    tasks.push({
      task: 'MAX_HR',
      promise: maxHrPromise,
    });
    await this.runRefreshTasks('PRE', userId, tasks);
  }

  async refreshUserFitnessProfilePost(
    userId: string,
    scope: ActivityFitnessRefreshScope = {},
  ) {
    this.logger.log(`[用户档案][Post] 开始刷新用户后置指标，用户ID=${userId}`);
    await this.runRefreshTasks('POST', userId, [
      {
        task: 'GLOBAL_VO2_MAX',
        promise: this.updateGlobalMetrics(userId, scope),
      },
    ]);
  }
}
