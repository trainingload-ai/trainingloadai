import { Injectable, Logger } from '@nestjs/common';
import estimateRestDays from '@/algorithm/restDays';
import { computeTrainingLoadMonotony } from '@/algorithm/utils';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import {
  SportType,
  PMCData,
  PeakType,
  ScaleType,
  UserFitnessMetricType,
  MetricSource,
  PMCExtremeType,
  Gender,
  BodyMetricType,
} from '@prisma/client';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import { round } from 'lodash';
import {
  computeBanisterWithFit,
  computePowerIndex,
} from '@/algorithm/banister';
import {
  normalizeVo2MaxSourcePreference,
  resolveEffectiveActivityVo2Max,
} from '@/analyze/vo2max/vo2max-source';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import {
  PmcRepository,
  type PmcListRangeOptions,
  type PmcLoadSums,
} from './persistence/pmc.repository';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { UserQueryService } from '@/api/user/user-query.service';
import {
  currentTrainingStressBalance,
  nextExponentialLoad,
  PMC_ALGORITHM_VERSION,
  timeConstantDecayFactor,
} from './pmc-formula';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';
import { VdotForecastService } from './vdot-forecast.service';
import {
  activityLocalDate,
  localDateKeyToUtcDate,
  resolveActivityAnalysisTimezone,
} from './activity-local-date';

dayjs.extend(utc);

/**
 * PMC 的 `date` 不是一个瞬时时刻，而是用 UTC 零点承载的日历日期。
 * 因此所有 PMC 游标、分组键和查询边界都必须使用 UTC；如果使用宿主机
 * 本地时区，同一条数据库记录会在不同时区的实例上落入不同日期。
 */
function pmcDayStart(value: Date | string | number = new Date()) {
  return dayjs.utc(value).startOf('day');
}

function pmcDayEnd(value: Date | string | number = new Date()) {
  return dayjs.utc(value).endOf('day');
}

function pmcDateKey(value: Date | string | number) {
  return dayjs.utc(value).format('YYYY-MM-DD');
}

export type { PmcListRangeOptions, PmcLoadSums };

// PMC calculation result interface
export interface PMCCalculationResult {
  date: Date;
  calculatedAt?: Date;
  dailyValue: number;
  ctl: number;
  atl: number;
  tsb: number;
  cyclingValue?: number;
  runningValue?: number;
  swimmingValue?: number;
  otherValue?: number;
  activityCount: number;
  totalDuration: number;
}

// User threshold interface
export interface UserThresholds {
  ftp?: number;
  lthr?: number;
  criticalPace?: number;
  swimCSS?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  weight?: number;
}

// TSS calculation result interface
export interface TSSResult {
  TSS: number;
  IF?: number;
  NP?: number;
  avgHR?: number;
}

export interface DailyLoadData {
  date: Date;

  // 选出的“当天唯一负荷值”及其分项（根据用户 loadSources）
  dailyValue?: number;
  cyclingValue?: number;
  runningValue?: number;
  swimmingValue?: number;
  otherValue?: number;

  activityCount: number;
  totalDuration: number;
  avgIntensity?: number;
  dailyEpoc?: number;
}

export type Vo2MaxLevel = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'POOR';

export interface Vo2MaxThresholds {
  fair: number;
  good: number;
  veryGood: number;
  excellent: number;
}

export interface Vo2MaxClassification {
  level: Vo2MaxLevel;
  thresholds: Vo2MaxThresholds;
  method: 'DEFAULT' | 'AGE_GENDER';
  gender?: 'MALE' | 'FEMALE';
  ageBand?: '20-29' | '30-39' | '40-49' | '50-59' | '60-69' | '70-79';
}

// PMC calculation params
export interface PMCCalculationParams {
  userId: string;
  startDate: Date;
  endDate: Date;
  ctlTimeConstant?: number; // CTL time constant, default 42 days
  atlTimeConstant?: number; // ATL time constant, default 7 days
  recalculateAll?: boolean; // Whether to recalculate all data
}
@Injectable()
export class PMCService {
  private readonly logger = new Logger(PMCService.name);
  private readonly currentPMCEnsurePromises = new Map<string, Promise<void>>();

  // PMC calculation constants
  private readonly DEFAULT_CTL_TIME_CONSTANT = 42; // 42 days
  private readonly DEFAULT_ATL_TIME_CONSTANT = 7; // 7 days

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private readonly pmc: PmcRepository,
    private readonly activityRead: ActivityReadService,
    private readonly loadReadout: LoadReadoutService,
    private readonly users: UserQueryService,
    private readonly analysisConfigs: UserAnalysisConfigService,
    private readonly vdotForecast: VdotForecastService,
  ) {}

  getVdotForecast(userId: string) {
    return this.vdotForecast.getForecast(userId);
  }

  async listRange(
    userId: string,
    start: Date,
    end: Date,
    options?: PmcListRangeOptions,
  ) {
    return this.pmc.listRange(userId, start, end, options);
  }

  async sumLoadBySport(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<PmcLoadSums> {
    return this.pmc.sumLoadBySport(userId, start, end);
  }

  async listFitnessWindow(userId: string, start: Date, end: Date) {
    return this.pmc.listFitnessWindow(userId, start, end);
  }

  async listExportRows(userId: string, createdAtLte?: Date) {
    return this.pmc.listExportRows(userId, createdAtLte);
  }

  private getVo2MaxThresholds(
    vo2Max: number,
    age?: number,
    gender?: Gender,
  ): Vo2MaxClassification {
    const defaultThresholds: Vo2MaxThresholds = {
      excellent: 50,
      veryGood: 40,
      good: 35,
      fair: 30,
    };

    const classify = (thresholds: Vo2MaxThresholds): Vo2MaxLevel => {
      if (vo2Max >= thresholds.excellent) return 'EXCELLENT';
      if (vo2Max >= thresholds.veryGood) return 'VERY_GOOD';
      if (vo2Max >= thresholds.good) return 'GOOD';
      if (vo2Max >= thresholds.fair) return 'FAIR';
      return 'POOR';
    };

    if (
      !Number.isFinite(age) ||
      !age ||
      age < 20 ||
      (gender !== Gender.MALE && gender !== Gender.FEMALE)
    ) {
      return {
        level: classify(defaultThresholds),
        thresholds: defaultThresholds,
        method: 'DEFAULT',
      };
    }

    const ageBand =
      age < 30
        ? '20-29'
        : age < 40
          ? '30-39'
          : age < 50
            ? '40-49'
            : age < 60
              ? '50-59'
              : age < 70
                ? '60-69'
                : '70-79';

    const table: Record<
      'MALE' | 'FEMALE',
      Record<
        Vo2MaxClassification['ageBand'],
        { excellent: number; veryGood: number; good: number; fair: number }
      >
    > = {
      MALE: {
        '20-29': { excellent: 55.4, veryGood: 51.1, good: 45.4, fair: 41.7 },
        '30-39': { excellent: 54.0, veryGood: 48.3, good: 44.0, fair: 40.5 },
        '40-49': { excellent: 52.5, veryGood: 46.4, good: 42.4, fair: 38.5 },
        '50-59': { excellent: 48.9, veryGood: 43.4, good: 39.2, fair: 35.6 },
        '60-69': { excellent: 45.7, veryGood: 39.5, good: 35.5, fair: 32.3 },
        '70-79': { excellent: 42.1, veryGood: 36.7, good: 32.3, fair: 29.4 },
      },
      FEMALE: {
        '20-29': { excellent: 49.6, veryGood: 43.9, good: 39.5, fair: 36.1 },
        '30-39': { excellent: 47.4, veryGood: 42.4, good: 37.8, fair: 34.4 },
        '40-49': { excellent: 45.3, veryGood: 39.7, good: 36.3, fair: 33.0 },
        '50-59': { excellent: 41.1, veryGood: 36.7, good: 33.0, fair: 30.1 },
        '60-69': { excellent: 37.8, veryGood: 33.0, good: 30.0, fair: 27.5 },
        '70-79': { excellent: 36.7, veryGood: 30.9, good: 28.1, fair: 25.9 },
      },
    };

    const normalizedGender = gender === Gender.MALE ? 'MALE' : 'FEMALE';
    const thresholds = table[normalizedGender][ageBand];
    return {
      level: classify(thresholds),
      thresholds,
      method: 'AGE_GENDER',
      gender: normalizedGender,
      ageBand,
    };
  }

  private async getCurrentRunningVo2Max(userId: string) {
    const [configVersions, effectiveMetric] = await Promise.all([
      this.analysisConfigs.listVersions(userId, new Date()),
      this.userService.getEffectiveUserFitnessMetric(
        userId,
        UserFitnessMetricType.VO2_MAX,
        new Date(),
        SportType.UNKNOWN,
      ),
    ]);
    const currentConfig = this.analysisConfigs.resolveFromVersions(
      configVersions,
      new Date(),
    );
    const value = effectiveMetric?.value;

    return {
      value:
        value == null || !Number.isFinite(Number(value)) || Number(value) <= 0
          ? undefined
          : round(Number(value), 2),
      preference: normalizeVo2MaxSourcePreference(
        currentConfig?.defaultVdotSource,
      ),
    };
  }

  /**
   * 获取用户 PMC 负荷来源优先级
   * 默认 ["POWER","HEART_RATE","PACE","SESSIONRPE"]；RPE 仅在前三项无有效值时兜底。
   */
  async getUserPMCLoadSources(
    userId: string,
  ): Promise<('POWER' | 'HEART_RATE' | 'PACE' | 'SESSIONRPE')[]> {
    return this.loadReadout.getUserLoadSources(userId);
  }

  /**
   * 计算指定时间段的PMC数据
   */
  async calculatePMC(
    params: PMCCalculationParams,
  ): Promise<PMCCalculationResult[]> {
    const {
      userId,
      startDate,
      endDate,
      ctlTimeConstant = this.DEFAULT_CTL_TIME_CONSTANT,
      atlTimeConstant = this.DEFAULT_ATL_TIME_CONSTANT,
    } = params;

    // Normal calculation start date, considering CTL time constant
    let normalStartDate = dayjs
      .utc(startDate)
      .subtract(ctlTimeConstant, 'day')
      .startOf('day')
      .toDate();

    const normalEndDate = pmcDayEnd(endDate).toDate();

    let seedRecord = await this.pmc.findFirst({
      where: { userId, date: { lt: normalStartDate } },
      orderBy: { date: 'desc' },
      select: { CTL: true, ATL: true, version: true },
    });

    if (seedRecord && seedRecord.version !== PMC_ALGORITHM_VERSION) {
      const earliestActivity = await this.activityRead.findFirst({
        where: readyActivityWhere({ userId }),
        orderBy: { startTime: 'asc' },
        select: { startTime: true },
      });

      if (earliestActivity) {
        normalStartDate = pmcDayStart(earliestActivity.startTime).toDate();
      }
      seedRecord = null;
    }

    this.logger.log(
      `[PMCService] 开始计算用户${userId}的PMC数据，时间范围 ${dayjs.utc(normalStartDate).format('YYYY MM DD HH:mm:ss')} 至 ${dayjs.utc(normalEndDate).format('YYYY MM DD HH:mm:ss')}`,
    );
    const dailyLoad = await this.calculateDailyLoad(
      userId,
      normalStartDate,
      normalEndDate,
    );
    // 3. Calculate PMC metrics (TSS and TRIMP)
    const pmcResults = this.calculatePMCMetrics(
      dailyLoad,
      normalStartDate,
      normalEndDate,
      {
        ctl: Number(seedRecord?.CTL ?? 0),
        atl: Number(seedRecord?.ATL ?? 0),
      },
      { ctlTimeConstant, atlTimeConstant },
    );
    // this.logger.log(`[PMCService] 计算结果为 ${JSON.stringify(pmcResults)}`);
    // 4. Save calculation results
    await this.savePMCData(userId, pmcResults);

    await this.updatePMCExtremes(pmcResults);

    this.logger.log(
      `[PMCService] 用户${userId}的PMC数据计算完成， 处理 ${pmcResults.length} 条记录`,
    );
    return pmcResults;
  }

  /**
   * 手动触发重新计算
   * Directly calculate last 60 days
   */
  async recalculatePMC(userId: string): Promise<boolean> {
    this.logger.log(`开始手动计算用户${userId}过去60天的数据`);
    // tomorrow
    const endDate = pmcDayEnd(dayjs.utc().add(1, 'day').toDate()).toDate();
    const startDate = pmcDayStart(
      dayjs.utc().subtract(60, 'day').toDate(),
    ).toDate();

    await this.calculatePMC({
      userId,
      startDate,
      endDate,
      recalculateAll: true,
    });

    return true;
  }

  private async calculateCurrentPMCOnce(userId: string): Promise<void> {
    const existing = this.currentPMCEnsurePromises.get(userId);
    if (existing) {
      await existing;
      return;
    }

    const promise = this.calculatePMC({
      userId,
      startDate: pmcDayStart(dayjs.utc().subtract(60, 'day').toDate()).toDate(),
      endDate: pmcDayEnd(dayjs.utc().add(1, 'day').toDate()).toDate(),
      recalculateAll: true,
    }).then(() => undefined);

    this.currentPMCEnsurePromises.set(userId, promise);
    try {
      await promise;
    } finally {
      this.currentPMCEnsurePromises.delete(userId);
    }
  }

  async ensureCurrentPMC(userId: string): Promise<void> {
    const todayStart = pmcDayStart();
    const todayRecord = await this.pmc.findFirst({
      where: {
        userId,
        date: {
          gte: todayStart.toDate(),
          lt: todayStart.add(1, 'day').toDate(),
        },
      },
      select: { id: true, version: true },
    });

    if (todayRecord?.version === PMC_ALGORITHM_VERSION) {
      return;
    }

    await this.calculateCurrentPMCOnce(userId);
  }

  async ensurePMCForQueryRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const todayStart = pmcDayStart();
    const normalStartDate = pmcDayStart(startDate);
    const normalEndDate = pmcDayEnd(endDate);

    if (
      normalStartDate.isAfter(todayStart, 'day') ||
      normalEndDate.isBefore(todayStart)
    ) {
      return;
    }

    await this.ensureCurrentPMC(userId);
  }

  /**
   * 只读已落库的 PMC 切片，不重算、不补缺失日。
   * 执行快照、Runtime 用这个。图表/状态页走 getPMCData（缺今天会先 ensure 再填空洞）。
   */
  async getStoredSliceAsOf(args: {
    userId: string;
    asOfDate: Date;
    fromDate: Date;
  }): Promise<{
    latest: { CTL: number; ATL: number; TSB: number } | null;
    daily: Array<{
      date: Date;
      dailyValue: number;
      CTL: number;
      ATL: number;
      TSB: number;
    }>;
  }> {
    const [latest, daily] = await Promise.all([
      this.pmc.findFirst({
        where: { userId: args.userId, date: { lte: args.asOfDate } },
        orderBy: [{ date: 'desc' }],
        select: { CTL: true, ATL: true, TSB: true },
      }),
      this.pmc.findMany({
        where: {
          userId: args.userId,
          date: { gte: args.fromDate, lte: args.asOfDate },
        },
        orderBy: [{ date: 'desc' }],
        take: 21,
        select: {
          date: true,
          dailyValue: true,
          CTL: true,
          ATL: true,
          TSB: true,
        },
      }),
    ]);
    return { latest, daily };
  }

  /**
   * 获取天数据
   */
  async getPMCData(
    userId: string,
    startDate: Date,
    endDate: Date,
    options?: { ensureCurrent?: boolean },
  ): Promise<PMCCalculationResult[]> {
    this.logger.log(
      `获取 PMC 数据：用户ID=${userId}，开始=${startDate.toISOString()}，结束=${endDate.toISOString()}`,
    );

    const normalStartDate = pmcDayStart(startDate).toDate();
    const normalEndDate = pmcDayEnd(endDate).toDate();
    if (options?.ensureCurrent !== false) {
      await this.ensurePMCForQueryRange(userId, normalStartDate, normalEndDate);
    }

    // 取历史
    const history = await this.getPMCHistory(
      userId,
      normalStartDate,
      normalEndDate,
    );
    const seedRecord = await this.pmc.findFirst({
      where: {
        userId,
        date: { lt: normalStartDate },
      },
      orderBy: { date: 'desc' },
    });

    const toMap = (rows: PMCData[]) => {
      const map = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        map.set(pmcDateKey(r.date), r);
      }
      return map;
    };
    const historyMap = toMap(history);

    const results: PMCCalculationResult[] = [];
    const ctlDecayFactor = timeConstantDecayFactor(
      this.DEFAULT_CTL_TIME_CONSTANT,
    );
    const atlDecayFactor = timeConstantDecayFactor(
      this.DEFAULT_ATL_TIME_CONSTANT,
    );
    const rangeStart = pmcDayStart(normalStartDate);
    let cursor = seedRecord
      ? pmcDayStart(seedRecord.date).add(1, 'day')
      : rangeStart;
    let prevCTL = Number(seedRecord?.CTL ?? 0);
    let prevATL = Number(seedRecord?.ATL ?? 0);

    while (
      cursor.isBefore(pmcDayEnd(normalEndDate)) ||
      cursor.isSame(pmcDayEnd(normalEndDate))
    ) {
      const key = pmcDateKey(cursor.valueOf());
      const row = historyMap.get(key);
      const rowCTL = Number(row?.CTL);
      const rowATL = Number(row?.ATL);
      const ctl =
        row && Number.isFinite(rowCTL)
          ? rowCTL
          : nextExponentialLoad(prevCTL, 0, ctlDecayFactor);
      const atl =
        row && Number.isFinite(rowATL)
          ? rowATL
          : nextExponentialLoad(prevATL, 0, atlDecayFactor);
      const tsb = currentTrainingStressBalance(ctl, atl);

      if (!cursor.isBefore(rangeStart)) {
        results.push({
          date: cursor.toDate(),
          calculatedAt:
            row?.updatedAt instanceof Date ? row.updatedAt : undefined,
          dailyValue: Number(row?.dailyValue ?? 0),
          ctl: round(ctl, 2),
          atl: round(atl, 2),
          tsb: round(tsb, 2),
          cyclingValue: Number(row?.cyclingValue ?? 0),
          runningValue: Number(row?.runningValue ?? 0),
          swimmingValue: Number(row?.swimmingValue ?? 0),
          otherValue: Number(row?.otherValue ?? 0),
          activityCount: Number(row?.activityCount ?? 0),
          totalDuration: Number(row?.totalDuration ?? 0),
        });
      }

      prevCTL = ctl;
      prevATL = atl;
      cursor = cursor.add(1, 'day');
    }

    return results;
  }

  /**
   * Get fitness status metrics
   */
  async getFitnessStatus(
    userId: string,
    options?: { ensureCurrent?: boolean },
  ) {
    const [runningVo2Max, runProfile] = await Promise.all([
      this.getCurrentRunningVo2Max(userId),
      this.userService.getComposedUserProfile(userId, SportType.RUN),
    ]);
    const vo2Max = runningVo2Max.value;
    let vo2MaxClassification: Vo2MaxClassification | undefined;
    if (typeof vo2Max === 'number' && Number.isFinite(vo2Max) && vo2Max > 0) {
      const { age, gender } = await this.userService.getUserAgeGender(userId);
      vo2MaxClassification = this.getVo2MaxThresholds(vo2Max, age, gender);
    }

    const endDate = pmcDayEnd().toDate();
    const startDate = pmcDayStart(
      dayjs.utc().subtract(6, 'day').toDate(),
    ).toDate();

    // 获取近 7 天的 PMC 数据
    const pmcData = await this.getPMCData(userId, startDate, endDate, options);

    const filledLoad: number[] = [];

    for (let i = 0; i < 7; i++) {
      const d = pmcDateKey(dayjs.utc().subtract(i, 'day').valueOf());
      const record = pmcData.find((r) => pmcDateKey(r.date) === d);
      const val = record?.dailyValue || 0;
      filledLoad.push(val);
    }

    const { monotony, trainingStrain } =
      computeTrainingLoadMonotony(filledLoad);

    const latestRecord =
      pmcData.length > 0 ? pmcData[pmcData.length - 1] : undefined;

    const ctl = latestRecord?.ctl || 0;
    const atl = latestRecord?.atl || 0;
    const acRatio = ctl > 0 ? atl / ctl : 0;
    const pmcProjection = latestRecord
      ? {
          effectiveAt: latestRecord.date,
          calculatedAt: latestRecord.calculatedAt,
          intervalMinutes: 30,
          ctlDecayFactorPerDay: timeConstantDecayFactor(
            this.DEFAULT_CTL_TIME_CONSTANT,
          ),
          atlDecayFactorPerDay: timeConstantDecayFactor(
            this.DEFAULT_ATL_TIME_CONSTANT,
          ),
        }
      : undefined;

    // 估算还有多久能够恢复
    const neededRestDays = estimateRestDays({
      atl,
      ctl,
      tauATL: this.DEFAULT_ATL_TIME_CONSTANT,
      tauCTL: this.DEFAULT_CTL_TIME_CONSTANT,
    });

    const paceSetting = await this.userService.getPaceZoneSettingResolved(
      userId,
      SportType.RUN,
      {
        vo2max: vo2Max ?? runProfile.vo2max,
        tp: runProfile.tp,
        cs: runProfile.cs,
        paceZoneModel: runProfile.paceZoneModel,
      },
    );
    const thresholdPaceSecPerKm =
      typeof runProfile.tp === 'number' && runProfile.tp > 0
        ? round(1000 / runProfile.tp, 1)
        : undefined;
    const paceZones = paceSetting.zones.map((zone, index) => ({
      order: zone.order ?? index + 1,
      name: zone.name,
      fastestPaceSecPerKm:
        typeof zone.min === 'number' ? round(zone.min * 1000, 1) : undefined,
      slowestPaceSecPerKm:
        typeof zone.max === 'number' ? round(zone.max * 1000, 1) : undefined,
    }));

    return {
      vo2Max,
      vo2MaxSourcePreference: runningVo2Max.preference,
      vo2MaxClassification,
      thresholdPaceSecPerKm,
      paceZoneModel: runProfile.paceZoneModel,
      paceZoneBenchmark: paceSetting.benchmark,
      paceZones,
      ctl: round(ctl, 2),
      atl: round(atl, 2),
      tsb: round(currentTrainingStressBalance(ctl, atl), 2),
      acRatio: round(acRatio, 2),
      monotony: round(monotony, 2),
      intensity: round(trainingStrain, 2),
      restDays: neededRestDays,
      pmcProjection,
    };
  }

  /**
   * 获取当前用户的 vo2Max list
   */
  async getVo2MaxHistory(userId: string, startDate?: Date, endDate?: Date) {
    const normalStartDate = startDate
      ? pmcDayStart(startDate).toDate()
      : pmcDayStart().subtract(1, 'year').toDate();
    const normalEndDate = endDate
      ? pmcDayEnd(endDate).toDate()
      : pmcDayEnd().toDate();

    const history = await this.users.fitnessMetrics().findMany({
      where: {
        userId,
        type: UserFitnessMetricType.VO2_MAX,
        // Causal replay persists the rolling user timeline as AUTO. ESTIMATED
        // is only the non-effective audit track used while auto update is off.
        source: MetricSource.AUTO,
        sport: SportType.UNKNOWN,
        recordedAt: {
          gte: normalStartDate,
          lte: normalEndDate,
        },
      },
      orderBy: { recordedAt: 'asc' },
      select: { recordedAt: true, value: true },
    });

    return history.map((h) => ({ date: h.recordedAt, value: Number(h.value) }));
  }

  async getVo2MaxActivityHistory(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const normalStartDate = startDate
      ? pmcDayStart(startDate).toDate()
      : pmcDayStart().subtract(1, 'year').toDate();
    const normalEndDate = endDate
      ? pmcDayEnd(endDate).toDate()
      : pmcDayEnd().toDate();

    const rows = await this.activityRead.findMany({
      where: readyActivityWhere({
        userId,
        startTime: {
          gte: normalStartDate,
          lte: normalEndDate,
        },
        vo2max: {
          OR: [
            { vo2maxVdotByFactor: { gt: 0 } },
            { vo2maxVdotByHr: { gt: 0 } },
            { vo2maxVdotByRace: { gt: 0 } },
          ],
        },
        sportType: SportType.RUN,
      }),
      orderBy: { startTime: 'asc' },
      select: {
        startTime: true,
        vo2max: {
          select: {
            vo2maxVdotByFactor: true,
            vo2maxVdotByHr: true,
            vo2maxVdotByRace: true,
          },
        },
        fitnessMetricsSnapshot: {
          select: {
            resolutionVersion: true,
            resolvedVo2maxValue: true,
            resolvedVo2maxSource: true,
          },
        },
      },
    });

    const configVersions = await this.analysisConfigs.listVersions(
      userId,
      normalEndDate,
    );

    return rows
      .map((row) => {
        if ((row.fitnessMetricsSnapshot?.resolutionVersion ?? 0) >= 4) {
          const value = row.fitnessMetricsSnapshot?.resolvedVo2maxValue;
          return value != null && Number(value) > 0
            ? {
                date: row.startTime,
                value: Number(value),
                source:
                  row.fitnessMetricsSnapshot.resolvedVo2maxSource ??
                  'UNAVAILABLE',
              }
            : undefined;
        }
        const config = this.analysisConfigs.resolveFromVersions(
          configVersions,
          row.startTime,
        );
        const resolved = resolveEffectiveActivityVo2Max(
          row.vo2max,
          config?.defaultVdotSource,
          config?.vo2maxCorrectionFactor,
        );
        return resolved
          ? {
              date: row.startTime,
              value: resolved.value,
              source: resolved.source,
            }
          : undefined;
      })
      .filter(
        (row): row is NonNullable<typeof row> =>
          !!row && Number.isFinite(row.value) && row.value > 0,
      );
  }

  /**
   * Get PMC history data (filtered by user's preferred model)
   */
  private async getPMCHistory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PMCData[]> {
    const normalStartDate = pmcDayStart(startDate).toDate();
    const normalEndDate = pmcDayEnd(endDate).toDate();
    return await this.pmc.findMany({
      where: {
        userId,
        date: {
          gte: normalStartDate,
          lte: normalEndDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });
  }
  /**
   * 计算每日负荷数据
   * @param userId 用户ID
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @returns 每日负荷数据
   */
  private async calculateDailyLoad(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DailyLoadData[]> {
    const normalStartDate = pmcDayStart(startDate).toDate();
    const normalEndDate = pmcDayEnd(endDate).toDate();
    const firstDateKey = pmcDateKey(normalStartDate);
    const lastDateKey = pmcDateKey(normalEndDate);
    const activities = await this.activityRead.findMany({
      where: readyActivityWhere({
        userId,
        startTime: {
          gte: dayjs.utc(normalStartDate).subtract(1, 'day').toDate(),
          lte: dayjs.utc(normalEndDate).add(1, 'day').toDate(),
        },
      }),
      orderBy: {
        startTime: 'asc',
      },
      include: {
        coggan: true,
        bikeScore: true,
        swimScore: true,
        govss: true,
        trimp: true,
        fitnessMetricsSnapshot: true,
        activitySources: {
          where: { isActive: true, isPrimary: true },
          select: { metadata: true },
        },
      },
    });
    // Group activities by date
    const dailyActivities = new Map<
      string,
      Array<(typeof activities)[number]>
    >();

    const [configVersions, bodyMetricRows] = await Promise.all([
      this.analysisConfigs.listVersions(userId, normalEndDate),
      this.userService.listBodyMetricEvidenceAt(
        userId,
        dayjs.utc(normalEndDate).add(1, 'day').toDate(),
      ),
    ]);

    for (const activity of activities) {
      const snapshot = activity.fitnessMetricsSnapshot;
      let dateKey = snapshot?.pmcLocalDate ?? null;
      if (!dateKey) {
        const timezoneRow = bodyMetricRows.find(
          (row) =>
            row.type === BodyMetricType.TIMEZONE &&
            row.effectiveDate <= activity.startTime,
        );
        const timezoneName = resolveActivityAnalysisTimezone({
          activityTimezone: activity.timezone,
          bodyMetrics: timezoneRow
            ? [{ type: timezoneRow.type, value: timezoneRow.value }]
            : [],
        });
        dateKey = activityLocalDate(activity.startTime, timezoneName);
      }
      if (dateKey < firstDateKey || dateKey > lastDateKey) continue;
      if (!dailyActivities.has(dateKey)) {
        dailyActivities.set(dateKey, []);
      }
      dailyActivities.get(dateKey)!.push(activity);
    }

    // 按天计算
    const dailyLoadData: DailyLoadData[] = [];
    let currentDate = dayjs.utc(normalStartDate);

    while (
      currentDate.isBefore(dayjs.utc(normalEndDate)) ||
      currentDate.isSame(dayjs.utc(normalEndDate), 'day')
    ) {
      const dateKey = pmcDateKey(currentDate.valueOf());
      const dayActivities = dailyActivities.get(dateKey) || [];

      let totalDuration = 0;
      const activityCount = dayActivities.length;
      let dailyValue = 0;
      let cyclingValue = 0;
      let runningValue = 0;
      let swimmingValue = 0;
      let otherValue = 0;
      for (const activity of dayActivities) {
        try {
          const snapshot = activity.fitnessMetricsSnapshot;
          let dayValue: number;
          if ((snapshot?.resolutionVersion ?? 0) >= 4) {
            dayValue = snapshot?.actualLoad ?? 0;
          } else {
            const historicalConfig =
              this.analysisConfigs.resolveFromVersions(
                configVersions,
                activity.startTime,
              ) ??
              (await this.analysisConfigs.resolveAt(
                userId,
                activity.startTime,
              ));
            dayValue =
              this.loadReadout.loadReadoutForActivity(
                activity,
                historicalConfig.loadSources,
              ).actualLoad ?? 0;
          }
          dailyValue += dayValue;

          switch (activity.sportType) {
            case SportType.CYCLING:
              cyclingValue += dayValue;
              break;
            case SportType.RUN:
              runningValue += dayValue;
              break;
            case SportType.SWIM:
              swimmingValue += dayValue;
              break;
            default:
              otherValue += dayValue;
              break;
          }

          // Common metrics
          totalDuration += activity.elapsedTime || activity.timerTime || 0;
        } catch (error) {
          this.logger.error(
            `[calculateDailyLoad] 计算日负荷失败，活动ID=${activity.id}：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
      }

      dailyLoadData.push({
        date: localDateKeyToUtcDate(dateKey),
        dailyValue,
        cyclingValue,
        runningValue,
        swimmingValue,
        otherValue,
        activityCount,
        totalDuration,
      });

      currentDate = currentDate.add(1, 'day');
    }

    return dailyLoadData;
  }

  /**
   * Calculate PMC metrics
   */
  private calculatePMCMetrics(
    dailyLoadData: DailyLoadData[],
    startDate: Date,
    endDate: Date,
    seed: { ctl: number; atl: number } = { ctl: 0, atl: 0 },
    constants: { ctlTimeConstant: number; atlTimeConstant: number } = {
      ctlTimeConstant: this.DEFAULT_CTL_TIME_CONSTANT,
      atlTimeConstant: this.DEFAULT_ATL_TIME_CONSTANT,
    },
  ): PMCCalculationResult[] {
    const results: PMCCalculationResult[] = [];

    // Intervals.icu convention: decay = exp(-1 / time constant).
    const ctlDecayFactor = timeConstantDecayFactor(constants.ctlTimeConstant);
    const atlDecayFactor = timeConstantDecayFactor(constants.atlTimeConstant);

    let prevCTL = Number.isFinite(seed.ctl) ? seed.ctl : 0;
    let prevATL = Number.isFinite(seed.atl) ? seed.atl : 0;

    for (const dayData of dailyLoadData) {
      const dailyVal = Number(dayData.dailyValue || 0);
      const ctl = nextExponentialLoad(prevCTL, dailyVal, ctlDecayFactor);
      const atl = nextExponentialLoad(prevATL, dailyVal, atlDecayFactor);
      const tsb = currentTrainingStressBalance(ctl, atl);

      const time = new Date(dayData.date).getTime();
      if (time >= startDate.getTime() && time <= endDate.getTime()) {
        results.push({
          date: dayData.date,
          dailyValue: dailyVal,
          ctl: round(ctl, 2),
          atl: round(atl, 2),
          tsb: round(tsb, 2),
          cyclingValue: dayData.cyclingValue,
          runningValue: dayData.runningValue,
          swimmingValue: dayData.swimmingValue,
          otherValue: dayData.otherValue,
          activityCount: dayData.activityCount,
          totalDuration: dayData.totalDuration,
        });
      }

      prevCTL = ctl;
      prevATL = atl;
    }

    return results;
  }

  /**
   * Save PMC data
   */
  private async savePMCData(
    userId: string,
    results: PMCCalculationResult[],
  ): Promise<void> {
    try {
      // We can't use a simple transaction with userId_date unique key anymore because we have multiple entries per day (TSS and TRIMP)
      // The schema has @@unique([userId, date, type])
      // So we need to specify type in the where clause.

      await this.pmc.saveDailySeries(userId, results, PMC_ALGORITHM_VERSION);
    } catch (error) {
      this.logger.error(
        `[savePMCData] 保存 PMC 数据失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 辅助函数，获取用户设置的 基本模型
   */
  /**
   * 获取极值：历史范围内计算最大 CTL/ATL
   */
  async getExtremes(userId: string, options?: { ensureCurrent?: boolean }) {
    // 取到时间范围
    const range = await this.pmc.aggregate({
      _min: { date: true },
      _max: { date: true },
      where: { userId },
    });
    const startDate =
      (range._min.date as Date | null) ??
      dayjs.utc().subtract(60, 'day').toDate();
    const endDate = (range._max.date as Date | null) ?? new Date();

    // 根据时间范围取得 PMC 的天数据
    const series = await this.getPMCData(
      userId,
      pmcDayStart(startDate).toDate(),
      pmcDayEnd(endDate).toDate(),
      options,
    );
    let maxCTL = 0;
    let maxATL = 0;
    for (const r of series) {
      if (r.ctl > maxCTL) maxCTL = r.ctl;
      if (r.atl > maxATL) maxATL = r.atl;
    }
    return { ctl: maxCTL, atl: maxATL };
  }
  /**
   * 更新 CTL 和 ATL 的极值
   * @param results
   * @returns
   */
  private async updatePMCExtremes(results: PMCCalculationResult[]) {
    if (!results || results.length === 0) return;
    let maxCTL = results[0].ctl;
    let maxATL = results[0].atl;
    for (let index = 1; index < results.length; index += 1) {
      maxCTL = Math.max(maxCTL, results[index].ctl);
      maxATL = Math.max(maxATL, results[index].atl);
    }

    const [currentCTL, currentATL] = await Promise.all([
      this.pmc.findExtremeFirst({
        where: { valueType: PMCExtremeType.CTL },
        orderBy: { value: 'desc' },
      }),
      this.pmc.findExtremeFirst({
        where: { valueType: PMCExtremeType.ATL },
        orderBy: { value: 'desc' },
      }),
    ]);

    await Promise.all([
      !currentCTL || maxCTL > (currentCTL.value ?? 0)
        ? this.pmc.createExtreme({
            data: { valueType: PMCExtremeType.CTL, value: maxCTL },
          })
        : Promise.resolve(null),
      !currentATL || maxATL > (currentATL.value ?? 0)
        ? this.pmc.createExtreme({
            data: { valueType: PMCExtremeType.ATL, value: maxATL },
          })
        : Promise.resolve(null),
    ]);
  }

  private async buildBanisterSeries(
    userId: string,
    startDate: Date,
    endDate: Date,
    dailyValues: { date: Date; value: number }[],
    sportType?: SportType,
  ): Promise<
    Map<string, { performance: number; pte: number; nte: number; rmse: number }>
  > {
    if (!dailyValues || dailyValues.length === 0) return new Map();

    const valueMap = new Map<string, number>();
    for (const d of dailyValues) {
      const key = pmcDateKey(d.date);
      valueMap.set(key, Number.isFinite(d.value) ? d.value : 0);
    }

    const dateKeys: string[] = [];
    const scores: number[] = [];
    let cursor = pmcDayStart(startDate);
    const last = pmcDayStart(endDate);
    while (cursor.isBefore(last) || cursor.isSame(last)) {
      const key = pmcDateKey(cursor.valueOf());
      dateKeys.push(key);
      scores.push(valueMap.get(key) ?? 0);
      cursor = cursor.add(1, 'day');
    }

    const normalStartDate = pmcDayStart(startDate).toDate();
    const normalEndDate = pmcDayEnd(endDate).toDate();
    const peaks = await this.prisma.activityPeakMetric.findMany({
      where: {
        type: PeakType.power,
        scaleType: ScaleType.TIME,
        scaleValue: { gte: 180 },
        sport: sportType,
        activity: {
          userId,
          startTime: {
            gte: normalStartDate,
            lte: normalEndDate,
          },
          sportType,
        },
      },
      select: {
        scaleValue: true,
        value: true,
        activity: {
          select: {
            startTime: true,
          },
        },
      },
    });

    const testByDay = new Map<string, number>();
    for (const p of peaks) {
      const duration = Number(p.scaleValue);
      const avgPower = Number(p.value || 0);
      if (!Number.isFinite(duration) || !Number.isFinite(avgPower)) continue;
      const pix = computePowerIndex(avgPower, duration);
      if (pix <= 0) continue;
      const key = pmcDateKey(p.activity.startTime);
      const prev = testByDay.get(key) ?? 0;
      if (pix > prev) testByDay.set(key, pix);
    }

    const tests = dateKeys
      .map((key, index) => ({
        index,
        value: testByDay.get(key) ?? 0,
      }))
      .filter((t) => t.value > 0);

    const { series, fit } = computeBanisterWithFit(scores, tests, {
      t1: 50,
      t2: 11,
      k1: 0.2,
      k2: 0.2,
      p0: tests[0]?.value ?? 0,
    });

    const result = new Map<
      string,
      { performance: number; pte: number; nte: number; rmse: number }
    >();
    for (let i = 0; i < dateKeys.length; i++) {
      const row = series[i];
      result.set(dateKeys[i], {
        performance: row.perf,
        pte: row.pte,
        nte: row.nte,
        rmse: fit.rmse,
      });
    }
    return result;
  }
}
