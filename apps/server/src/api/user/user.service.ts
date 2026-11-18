import { AthleteStateFitnessFacts } from '@/athlete-state/updates/athlete-state-fitness-facts.service';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';
import dayjs = require('dayjs');
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { I18nService } from 'nestjs-i18n';
import { generateHeartRateZonesFromProfile } from '@/heart-rate/heart-rate.utils';
import { generatePowerZonesFromProfile } from '@/power/util';
import { generatePaceZonesFromProfile } from '@/api/pace/pace.utils';
import {
  $Enums,
  ActivityStatus,
  SportType,
  ThirdPartyProvider,
  ZoneType,
  BodyMetricType,
  ZoneBase,
  UserFitnessMetricType,
  MetricSource,
  UserFitnessMetric,
  Gender,
  PeakType,
  ScaleType,
  ChangeSource,
  Prisma,
} from '@prisma/client';
import {
  UserProfileResponse,
  UpdateUserProfileRequest,
} from './user.interface';
import { round } from 'lodash';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivitySourceLifecycleService } from '@/sync/activity-source-lifecycle.service';
import {
  emitUserFitnessContextChanged,
  emitUserFitnessInvalidated,
  emitUserZoneSettingChanged,
  UserFitnessContextChangedEvent,
  UserFitnessInvalidatedEvent,
  UserZoneSettingChangedEvent,
} from './events/user-fitness.events';
import { UserQueryService } from './user-query.service';
import {
  resolveHeartRateSettings,
  resolvePowerZoneSettings,
  resolvePaceZoneSettings,
  UserZoneSetting,
} from '@/utils/zones';
import { resolveLthrForCalculation } from '@shared/lthr';
import {
  resolveSupportedLocale,
  type SupportedAppLocale,
} from '@/utils/locale.util';
import { selectEffectiveFitnessMetric } from './fitness-metric-selection';
import {
  COMPOSED_BODY_METRIC_TYPES,
  composeUserProfile,
  composedFitnessMetricWhere,
  normalizeLoadSources,
  normalizePreferredSports,
  resolveComposedProfileSport,
} from './composed-user-profile';
import {
  type FitnessMetricValidationContext,
  validateFitnessMetricCandidate,
} from './fitness-metric-validator';
import {
  derivedPowerMetricNeedsEvidence,
  hasPowerPeakEvidence,
  isDerivedPowerMetric,
} from './power-metric-evidence';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { normalizeIanaTimezone } from '@/timezone/user-timezone-initializer.service';
import { normalizeZoneSettingRows } from './zone-setting-order';
import type { PrismaTx } from '@/prisma/prisma-db';
import { validateManualWeightKg } from './body-metric-validator';
import { UserAnalysisConfigService } from './user-analysis-config.service';

const AUTO_UPDATE_METRIC_TYPES: UserFitnessMetricType[] = [
  UserFitnessMetricType.FTP,
  UserFitnessMetricType.CP,
  UserFitnessMetricType.W_PRIME,
  UserFitnessMetricType.P_MAX,
  UserFitnessMetricType.CS,
  UserFitnessMetricType.TP,
  UserFitnessMetricType.LTHR,
  UserFitnessMetricType.MAX_HR,
];

type TrainingSettingOrigin = {
  changeSource?: ChangeSource;
  originProvider?: ThirdPartyProvider | null;
  originExternalId?: string | number | null;
  originChecksum?: string | null;
  originPayload?: unknown;
  originSyncedAt?: Date | null;
};

type FitnessMetricPersistOrigin = TrainingSettingOrigin;

type AutoFitnessMetricCandidate = {
  type: UserFitnessMetricType;
  value: number;
  value2?: number;
};

export type TimelineFitnessProjection = {
  type: UserFitnessMetricType;
  sport: SportType;
  value: number;
  value2?: number | null;
  effectiveAt: Date;
  projectionVersion: number;
  projectionFingerprint: string;
  originPayload?: Prisma.InputJsonValue;
};

export type ApplyTimelineProjectionBatchInput = {
  userId: string;
  projectionRunId: string;
  replacementReason: string;
  replaceFrom: Date;
  replaceTo?: Date | null;
  scopes: readonly {
    type: UserFitnessMetricType;
    sport: SportType;
  }[];
  projections: readonly TimelineFitnessProjection[];
};

const FITNESS_WRITE_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    )
    .join(',')}}`;
}

function checksumTrainingSettingPayload(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function cleanOriginExternalId(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly fitnessWriteTails = new Map<string, Promise<void>>();

  /** MANUAL/legacy AUTO 指标变更统一进入因果时间线 Replay。 */
  readonly fitnessMetricActivityRecomputeEnabled = true;

  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly configService: ConfigService,
    private readonly activitySourceLifecycle: ActivitySourceLifecycleService,
    private readonly events: EventEmitter2,
    private readonly users: UserQueryService,
    private readonly analysisConfigs: UserAnalysisConfigService,
    private readonly stateFitness: AthleteStateFitnessFacts,
  ) {}

  private analysisConfigVersions() {
    return this.analysisConfigs;
  }

  /**
   * Serialize writes for one user before opening an interactive transaction.
   * PostgreSQL advisory locks remain the cross-process authority; this queue
   * prevents one process from starting several transaction timers that can
   * only wait for the same lock.
   */
  private async serializeFitnessWrite<T>(
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.fitnessWriteTails.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.fitnessWriteTails.set(userId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.fitnessWriteTails.get(userId) === tail) {
        this.fitnessWriteTails.delete(userId);
      }
    }
  }

  private async runFitnessWriteTransaction<T>(
    userId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockFitnessUser(tx, userId);
      return this.stateFitness.observe(userId, tx, () => operation(tx));
    }, FITNESS_WRITE_TRANSACTION_OPTIONS);
  }

  private inferredChangeSource(source: MetricSource) {
    if (source === MetricSource.AUTO || source === MetricSource.ESTIMATED)
      return ChangeSource.SYSTEM_CALCULATED;
    if (source === MetricSource.MANUAL) return ChangeSource.USER_MANUAL;
    return ChangeSource.SYSTEM_IMPORTED;
  }

  private buildOriginWriteData(
    source: MetricSource,
    origin?: TrainingSettingOrigin,
  ) {
    const originPayload = origin?.originPayload;
    const hasPayload = originPayload !== undefined;
    const originProvider = origin?.originProvider ?? null;
    const originChecksum =
      origin?.originChecksum ??
      (hasPayload ? checksumTrainingSettingPayload(originPayload) : null);

    return {
      changeSource: origin?.changeSource ?? this.inferredChangeSource(source),
      originProvider,
      originExternalId: cleanOriginExternalId(origin?.originExternalId),
      originChecksum,
      originPayload: hasPayload
        ? (originPayload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      originSyncedAt:
        origin?.originSyncedAt === null
          ? null
          : (origin?.originSyncedAt ?? (originProvider ? new Date() : null)),
    };
  }

  private buildZoneOriginWriteData(origin?: TrainingSettingOrigin) {
    const data = this.buildOriginWriteData(MetricSource.MANUAL, {
      ...origin,
      changeSource: origin?.changeSource ?? ChangeSource.USER_MANUAL,
    });
    return {
      changeSource: data.changeSource,
      originProvider: data.originProvider,
      originExternalId: data.originExternalId,
      originChecksum: data.originChecksum,
      originSyncedAt: data.originSyncedAt,
    };
  }

  private isExternalOrigin(origin?: TrainingSettingOrigin) {
    return Boolean(origin?.originProvider);
  }

  private hasOriginDiff(
    current: {
      changeSource?: ChangeSource | null;
      originProvider?: ThirdPartyProvider | null;
      originExternalId?: string | null;
      originChecksum?: string | null;
    },
    next: {
      changeSource?: ChangeSource | null;
      originProvider?: ThirdPartyProvider | null;
      originExternalId?: string | null;
      originChecksum?: string | null;
    },
  ) {
    return (
      (current.changeSource ?? null) !== (next.changeSource ?? null) ||
      (current.originProvider ?? null) !== (next.originProvider ?? null) ||
      (current.originExternalId ?? null) !== (next.originExternalId ?? null) ||
      (current.originChecksum ?? null) !== (next.originChecksum ?? null)
    );
  }

  private toSourceInfo(row: {
    changeSource?: ChangeSource | null;
    originProvider?: ThirdPartyProvider | null;
    originExternalId?: string | null;
    originSyncedAt?: Date | null;
  }) {
    return {
      changeSource: row.changeSource ?? null,
      originProvider: row.originProvider ?? null,
      originExternalId: row.originExternalId ?? null,
      originSyncedAt: row.originSyncedAt ?? null,
    };
  }

  /**
   * 用户权益判断的边界先收在 UserService。
   * 当前用配置白名单兜底，后续接会员/订阅表时只替换这里，分析链路不用感知权益来源。
   */
  async isVipUser(userId: string): Promise<boolean> {
    const ids =
      this.configService.get<string[]>('activityRecomputePolicy.vipUserIds') ??
      [];
    return ids.includes(userId);
  }

  /**
   * 复算回溯策略属于“用户权益 + 产品策略”，不放进 analyze/worker。
   */
  async getActivityRecomputePolicyForUser(userId: string): Promise<{
    entitlement: 'FREE' | 'VIP';
    lookbackDays: number;
  }> {
    const isVip = await this.isVipUser(userId);
    if (isVip) {
      return {
        entitlement: 'VIP',
        lookbackDays:
          this.configService.get<number>(
            'activityRecomputePolicy.vipLookbackDays',
          ) ?? 30,
      };
    }
    return {
      entitlement: 'FREE',
      lookbackDays:
        this.configService.get<number>(
          'activityRecomputePolicy.freeLookbackDays',
        ) ?? 7,
    };
  }

  /**
   * 获取用户偏好语言（用于异步任务：worker/邮件/通知等无法依赖请求头时）。
   * - 支持产品公开的全部语言；空值或未知值回落为英语
   */
  async getPreferredLocale(
    userId: string,
    tx?: PrismaTx,
  ): Promise<SupportedAppLocale> {
    const row = await this.users.users(tx).findUnique({
      where: { id: userId },
      select: { preferredLocale: true },
    });
    return resolveSupportedLocale(String(row?.preferredLocale ?? ''));
  }

  /**
   * 读取账户当前 IANA 时区（UserBodyMetric TIMEZONE 最新一条）。
   * 空值或非法 IANA 返回 null。调用方自行决定运行时回退，不得把回退写回档案。
   */
  async getPreferredTimezone(
    userId: string,
    tx?: PrismaTx,
  ): Promise<string | null> {
    const timezoneMetric = await this.users.bodyMetrics(tx).findFirst({
      where: { userId, type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    return normalizeIanaTimezone(timezoneMetric?.value);
  }

  /**
   * 最近活动连续同 IANA 时区 ≥4 条且与档案不一致时，建议更新档案时区（首页弹窗用）。
   */
  async getTimezonePrompt(userId: string): Promise<{
    shouldPrompt: boolean;
    suggestedTimezone: string | null;
    consecutiveCount: number;
    profileTimezone: string | null;
  }> {
    const RECENT_LIMIT = 20;

    const profileTimezone = await this.getPreferredTimezone(userId);

    const activities = await this.prisma.activity.findMany({
      where: readyActivityWhere({
        userId,
        status: { not: ActivityStatus.FAILED },
        startTime: { not: null },
      }),
      orderBy: { startTime: 'desc' },
      take: RECENT_LIMIT,
      select: { timezone: true },
    });

    const norm = (tz: string | null | undefined) => String(tz ?? '').trim();

    let consecutiveCount = 0;
    for (let i = 0; i < activities.length; i++) {
      const tz = norm(activities[i].timezone);
      if (!tz) break;
      if (i > 0 && tz !== norm(activities[i - 1].timezone)) break;
      consecutiveCount++;
    }

    const suggestedTimezone =
      consecutiveCount > 0 ? norm(activities[0].timezone) : null;

    const meetsThreshold = consecutiveCount > 3 && !!suggestedTimezone;
    const differsFromProfile =
      !profileTimezone || profileTimezone !== suggestedTimezone;

    const shouldPrompt =
      meetsThreshold && differsFromProfile && !!suggestedTimezone;

    return {
      shouldPrompt,
      suggestedTimezone: meetsThreshold ? suggestedTimezone : null,
      consecutiveCount,
      profileTimezone,
    };
  }

  getSupportedAutoUpdateMetricTypes() {
    return AUTO_UPDATE_METRIC_TYPES;
  }

  isAutoUpdateMetricSupported(type: UserFitnessMetricType) {
    return AUTO_UPDATE_METRIC_TYPES.includes(type);
  }

  /**
   * 原子替换系统生成的有效 AUTO 时间线。
   *
   * 该入口刻意绕过 persistFitnessMetricBySource：
   * - 保留活动结束的精确 UTC 时刻；
   * - 被替代行先进入不可变审计，再物理删除，保证旧版本读取安全；
   * - 不发送 FITNESS_METRIC_CHANGED，避免 Projector 自己触发自己。
   * 写入前仍调用 validateFitnessMetricCandidate。超界或相对关系不成立的
   * 投影只记日志并跳过，不改写成其它数值，也不能成为生效 AUTO。
   */
  async applyTimelineProjectionBatch(
    input: ApplyTimelineProjectionBatchInput,
    transaction?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      await lockFitnessUser(tx, input.userId);
      if (
        !Number.isFinite(input.replaceFrom.getTime()) ||
        (input.replaceTo != null &&
          (!Number.isFinite(input.replaceTo.getTime()) ||
            input.replaceTo < input.replaceFrom))
      ) {
        throw new Error('INVALID_TIMELINE_PROJECTION_RANGE');
      }

      const desiredByKey = new Map<string, TimelineFitnessProjection>();
      for (const projection of input.projections) {
        if (
          !Number.isFinite(projection.value) ||
          projection.value <= 0 ||
          !Number.isFinite(projection.effectiveAt.getTime()) ||
          projection.effectiveAt < input.replaceFrom ||
          (input.replaceTo != null && projection.effectiveAt > input.replaceTo)
        ) {
          throw new Error('INVALID_TIMELINE_PROJECTION_VALUE');
        }
        const key = [
          projection.type,
          projection.sport,
          projection.effectiveAt.toISOString(),
        ].join(':');
        if (desiredByKey.has(key)) {
          throw new Error('DUPLICATE_TIMELINE_PROJECTION_CHANGE_POINT');
        }
        desiredByKey.set(key, projection);
      }
      await this.retainValidTimelineProjections(
        tx,
        input,
        desiredByKey,
        MetricSource.AUTO,
      );

      const scopes = Array.from(
        new Map(
          [...input.scopes, ...input.projections].map((projection) => [
            `${projection.type}:${projection.sport}`,
            { type: projection.type, sport: projection.sport },
          ]),
        ).values(),
      );
      if (scopes.length === 0) {
        return { archived: 0, deleted: 0, written: 0, unchanged: 0 };
      }

      const existing = await this.users.fitnessMetrics(tx).findMany({
        where: {
          userId: input.userId,
          source: MetricSource.AUTO,
          OR: scopes,
          recordedAt: {
            gte: input.replaceFrom,
            ...(input.replaceTo ? { lte: input.replaceTo } : {}),
          },
        },
      });

      const retainedIds = new Set<string>();
      const replaced = existing.filter((row) => {
        const key = [row.type, row.sport, row.recordedAt.toISOString()].join(
          ':',
        );
        const desired = desiredByKey.get(key);
        const unchanged =
          desired?.projectionFingerprint === row.projectionFingerprint &&
          desired.projectionVersion === row.projectionVersion &&
          Math.abs(desired.value - row.value) <= 0.001 &&
          Math.abs((desired.value2 ?? 0) - (row.value2 ?? 0)) <= 0.001;
        if (unchanged) retainedIds.add(row.id);
        return !unchanged;
      });

      for (const row of replaced) {
        await tx.userFitnessMetricProjectionAudit.upsert({
          where: {
            originalMetricId_replacementRunId: {
              originalMetricId: row.id,
              replacementRunId: input.projectionRunId,
            },
          },
          update: {},
          create: {
            userId: row.userId,
            originalMetricId: row.id,
            sport: row.sport,
            type: row.type,
            value: row.value,
            value2: row.value2,
            source: row.source,
            recordedAt: row.recordedAt,
            projectionVersion: row.projectionVersion,
            projectionRunId: row.projectionRunId,
            projectionFingerprint: row.projectionFingerprint,
            originPayload:
              row.originPayload == null
                ? Prisma.JsonNull
                : (row.originPayload as Prisma.InputJsonValue),
            changeSource: row.changeSource,
            originProvider: row.originProvider,
            originExternalId: row.originExternalId,
            originChecksum: row.originChecksum,
            originSyncedAt: row.originSyncedAt,
            originalCreatedAt: row.createdAt,
            replacementRunId: input.projectionRunId,
            replacementReason: input.replacementReason,
          },
        });
      }
      if (replaced.length > 0) {
        await this.users.fitnessMetrics(tx).deleteMany({
          where: { id: { in: replaced.map((row) => row.id) } },
        });
      }

      let written = 0;
      for (const projection of desiredByKey.values()) {
        const alreadyPresent = existing.some(
          (row) =>
            retainedIds.has(row.id) &&
            row.type === projection.type &&
            row.sport === projection.sport &&
            row.recordedAt.getTime() === projection.effectiveAt.getTime(),
        );
        if (alreadyPresent) continue;
        await this.users.fitnessMetrics(tx).create({
          data: {
            userId: input.userId,
            type: projection.type,
            sport: projection.sport,
            value: projection.value,
            value2: projection.value2 ?? null,
            source: MetricSource.AUTO,
            recordedAt: projection.effectiveAt,
            changeSource: ChangeSource.SYSTEM_CALCULATED,
            originPayload: projection.originPayload ?? Prisma.JsonNull,
            projectionVersion: projection.projectionVersion,
            projectionRunId: input.projectionRunId,
            projectionFingerprint: projection.projectionFingerprint,
          },
        });
        written += 1;
      }
      return {
        archived: replaced.length,
        deleted: replaced.length,
        written,
        unchanged: retainedIds.size,
      };
    };

    if (transaction) return execute(transaction);
    return this.serializeFitnessWrite(input.userId, () =>
      this.prisma.$transaction(execute, FITNESS_WRITE_TRANSACTION_OPTIONS),
    );
  }

  /**
   * 为因果重放提供按精确时刻排序的指标事实。
   * 数据访问留在 UsersModule 内，AnalyzeModule 只消费领域结果。
   */
  listTimelineFitnessMetrics(userId: string, at: Date) {
    return this.users.fitnessMetrics().findMany({
      where: {
        userId,
        source: { in: [MetricSource.MANUAL, MetricSource.AUTO] },
        recordedAt: { lte: at },
      },
      orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findNextManualFitnessMetric(args: {
    userId: string;
    type: UserFitnessMetricType;
    sport: SportType;
    after: Date;
    beforeOrAt: Date;
  }) {
    return this.users.fitnessMetrics().findFirst({
      where: {
        userId: args.userId,
        type: args.type,
        source: MetricSource.MANUAL,
        sport: args.sport,
        recordedAt: { gt: args.after, lte: args.beforeOrAt },
      },
      orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
      select: { recordedAt: true },
    });
  }

  listBodyMetricEvidenceAt(userId: string, at: Date) {
    return this.users.bodyMetrics().findMany({
      where: { userId, effectiveDate: { lte: at } },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** 保存未获自动传播许可的活动估算证据；不参与生效值选择，也不发复算事件。 */
  async saveTimelineEstimatesBatch(
    input: ApplyTimelineProjectionBatchInput,
    transaction?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      await lockFitnessUser(tx, input.userId);
      if (
        !Number.isFinite(input.replaceFrom.getTime()) ||
        (input.replaceTo != null &&
          (!Number.isFinite(input.replaceTo.getTime()) ||
            input.replaceTo < input.replaceFrom))
      ) {
        throw new Error('INVALID_TIMELINE_ESTIMATE_RANGE');
      }

      const desiredByKey = new Map<string, TimelineFitnessProjection>();
      for (const estimate of input.projections) {
        if (
          !Number.isFinite(estimate.value) ||
          estimate.value <= 0 ||
          !Number.isFinite(estimate.effectiveAt.getTime()) ||
          estimate.effectiveAt < input.replaceFrom ||
          (input.replaceTo != null && estimate.effectiveAt > input.replaceTo)
        ) {
          throw new Error('INVALID_TIMELINE_ESTIMATE_VALUE');
        }
        const key = [
          estimate.type,
          estimate.sport,
          estimate.effectiveAt.toISOString(),
        ].join(':');
        if (desiredByKey.has(key)) {
          throw new Error('DUPLICATE_TIMELINE_ESTIMATE_CHANGE_POINT');
        }
        desiredByKey.set(key, estimate);
      }
      await this.retainValidTimelineProjections(
        tx,
        input,
        desiredByKey,
        MetricSource.ESTIMATED,
      );

      const scopes = Array.from(
        new Map(
          [...input.scopes, ...input.projections].map((projection) => [
            `${projection.type}:${projection.sport}`,
            { type: projection.type, sport: projection.sport },
          ]),
        ).values(),
      );
      if (scopes.length === 0) {
        return { archived: 0, deleted: 0, written: 0, unchanged: 0 };
      }

      const existing = await this.users.fitnessMetrics(tx).findMany({
        where: {
          userId: input.userId,
          source: MetricSource.ESTIMATED,
          OR: scopes,
          recordedAt: {
            gte: input.replaceFrom,
            ...(input.replaceTo ? { lte: input.replaceTo } : {}),
          },
        },
      });
      const retainedIds = new Set<string>();
      const replaced = existing.filter((row) => {
        const key = [row.type, row.sport, row.recordedAt.toISOString()].join(
          ':',
        );
        const desired = desiredByKey.get(key);
        const unchanged =
          desired?.projectionFingerprint === row.projectionFingerprint &&
          desired.projectionVersion === row.projectionVersion &&
          Math.abs(desired.value - row.value) <= 0.001 &&
          Math.abs((desired.value2 ?? 0) - (row.value2 ?? 0)) <= 0.001;
        if (unchanged) retainedIds.add(row.id);
        return !unchanged;
      });

      for (const row of replaced) {
        await tx.userFitnessMetricProjectionAudit.upsert({
          where: {
            originalMetricId_replacementRunId: {
              originalMetricId: row.id,
              replacementRunId: input.projectionRunId,
            },
          },
          update: {},
          create: {
            userId: row.userId,
            originalMetricId: row.id,
            sport: row.sport,
            type: row.type,
            value: row.value,
            value2: row.value2,
            source: row.source,
            recordedAt: row.recordedAt,
            projectionVersion: row.projectionVersion,
            projectionRunId: row.projectionRunId,
            projectionFingerprint: row.projectionFingerprint,
            originPayload:
              row.originPayload == null
                ? Prisma.JsonNull
                : (row.originPayload as Prisma.InputJsonValue),
            changeSource: row.changeSource,
            originProvider: row.originProvider,
            originExternalId: row.originExternalId,
            originChecksum: row.originChecksum,
            originSyncedAt: row.originSyncedAt,
            originalCreatedAt: row.createdAt,
            replacementRunId: input.projectionRunId,
            replacementReason: input.replacementReason,
          },
        });
      }
      if (replaced.length > 0) {
        await this.users.fitnessMetrics(tx).deleteMany({
          where: { id: { in: replaced.map((row) => row.id) } },
        });
      }

      let written = 0;
      for (const estimate of desiredByKey.values()) {
        const alreadyPresent = existing.some(
          (row) =>
            retainedIds.has(row.id) &&
            row.type === estimate.type &&
            row.sport === estimate.sport &&
            row.recordedAt.getTime() === estimate.effectiveAt.getTime(),
        );
        if (alreadyPresent) continue;
        await this.users.fitnessMetrics(tx).create({
          data: {
            userId: input.userId,
            type: estimate.type,
            sport: estimate.sport,
            source: MetricSource.ESTIMATED,
            value: estimate.value,
            value2: estimate.value2 ?? null,
            recordedAt: estimate.effectiveAt,
            changeSource: ChangeSource.SYSTEM_CALCULATED,
            originPayload: estimate.originPayload ?? Prisma.JsonNull,
            projectionVersion: estimate.projectionVersion,
            projectionRunId: input.projectionRunId,
            projectionFingerprint: estimate.projectionFingerprint,
          },
        });
        written += 1;
      }
      return {
        archived: replaced.length,
        deleted: replaced.length,
        written,
        unchanged: retainedIds.size,
      };
    };
    if (transaction) return execute(transaction);
    return this.serializeFitnessWrite(input.userId, () =>
      this.prisma.$transaction(execute, FITNESS_WRITE_TRANSACTION_OPTIONS),
    );
  }

  /**
   * DATA_REPAIR 重放会直接写 AUTO/ESTIMATED，不能只靠读取时过滤。
   * 候选只减不增：同一时刻互相冲突的一组会被一起拒绝，已拒绝的值不会再回到上下文。
   */
  private async retainValidTimelineProjections(
    tx: Prisma.TransactionClient,
    input: ApplyTimelineProjectionBatchInput,
    desiredByKey: Map<string, TimelineFitnessProjection>,
    source: MetricSource,
  ) {
    const projections = [...desiredByKey.values()];
    if (projections.length === 0) return;

    const upperBound = projections.reduce(
      (max, projection) =>
        projection.effectiveAt > max ? projection.effectiveAt : max,
      projections[0].effectiveAt,
    );
    const rows = await this.users.fitnessMetrics(tx).findMany({
      where: {
        userId: input.userId,
        recordedAt: { lte: upperBound },
        OR: [
          { source: MetricSource.MANUAL },
          {
            source: MetricSource.AUTO,
            recordedAt: { lt: input.replaceFrom },
          },
        ],
      },
    });
    const persisted = rows.filter((row) => {
      const recordedAt = row.recordedAt;
      if (
        !(recordedAt instanceof Date) ||
        !Number.isFinite(recordedAt.getTime()) ||
        recordedAt > upperBound
      ) {
        return false;
      }
      if (row.source === MetricSource.MANUAL) return true;
      return (
        row.source === MetricSource.AUTO &&
        recordedAt.getTime() < input.replaceFrom.getTime()
      );
    });

    let active = projections;
    const rejected = new Map<TimelineFitnessProjection, string>();
    while (active.length > 0) {
      const survivors: TimelineFitnessProjection[] = [];
      let removed = false;
      for (const projection of active) {
        const reason = this.explainTimelineProjectionRejection(
          projection,
          this.timelineProjectionValidationContext({
            persisted,
            batch: active,
            at: projection.effectiveAt,
            sport: projection.sport,
            source,
          }),
          source,
        );
        if (reason) {
          rejected.set(projection, reason);
          removed = true;
          continue;
        }
        rejected.delete(projection);
        survivors.push(projection);
      }
      const stalled = survivors.length >= active.length;
      active = survivors;
      if (!removed || stalled) break;
    }

    for (const [projection, reason] of rejected) {
      this.logger.warn(
        `[体能指标校验] 拒绝时间线${source === MetricSource.AUTO ? '投影' : '估算'}：用户ID=${input.userId}, 类型=${projection.type}, 运动=${projection.sport}, 值=${projection.value}, value2=${projection.value2 ?? ''}, 原因=${reason}, 生效时间=${projection.effectiveAt.toISOString()}`,
      );
    }
    if (rejected.size === 0) return;

    desiredByKey.clear();
    for (const projection of active) {
      desiredByKey.set(
        [
          projection.type,
          projection.sport,
          projection.effectiveAt.toISOString(),
        ].join(':'),
        projection,
      );
    }
  }

  private explainTimelineProjectionRejection(
    projection: TimelineFitnessProjection,
    context: FitnessMetricValidationContext,
    source: MetricSource,
  ): string | null {
    const validation = validateFitnessMetricCandidate(
      {
        type: projection.type,
        value: projection.value,
        value2: projection.value2,
        sport: projection.sport,
        source,
      },
      context,
      { requireReferenceMetrics: true },
    );
    if (validation.valid === false) return validation.reason;
    if (
      projection.type === UserFitnessMetricType.CP &&
      projection.value2 != null
    ) {
      const wPrime = validateFitnessMetricCandidate(
        {
          type: UserFitnessMetricType.W_PRIME,
          value: projection.value2,
          sport: projection.sport,
          source,
        },
        context,
        { requireReferenceMetrics: true },
      );
      if (wPrime.valid === false) return `cp_value2:${wPrime.reason}`;
    }
    return null;
  }

  private timelineProjectionValidationContext(args: {
    persisted: ReadonlyArray<{
      type: UserFitnessMetricType;
      sport: SportType;
      source: string;
      value: unknown;
      recordedAt: Date;
    }>;
    batch: readonly TimelineFitnessProjection[];
    at: Date;
    sport: SportType;
    source: MetricSource;
  }): FitnessMetricValidationContext {
    const atTime = args.at.getTime();
    const candidates = [
      ...args.persisted
        .filter((row) => row.recordedAt.getTime() <= atTime)
        .map((row) => ({
          type: row.type,
          sport: row.sport,
          source: row.source,
          value: Number(row.value),
          recordedAt: row.recordedAt,
        })),
      ...args.batch
        .filter((row) => row.effectiveAt.getTime() <= atTime)
        .map((row) => ({
          type: row.type,
          sport: row.sport,
          source: args.source,
          value: row.value,
          recordedAt: row.effectiveAt,
        })),
    ];
    const context: FitnessMetricValidationContext = {};
    for (const type of Object.values(UserFitnessMetricType)) {
      const selected = selectEffectiveFitnessMetric(
        candidates,
        type,
        args.sport,
      );
      if (selected?.value != null) context[type] = Number(selected.value);
    }
    return context;
  }

  private async getAutoUpdateEnabledMap(userId: string) {
    const rows = await this.prisma.userAutoUpdateConfig.findMany({
      where: {
        userId,
        metric: { in: AUTO_UPDATE_METRIC_TYPES },
      },
      select: { metric: true, enabled: true },
    });
    return new Map<UserFitnessMetricType, boolean>(
      AUTO_UPDATE_METRIC_TYPES.map((metric) => [
        metric,
        rows.find((row) => row.metric === metric)?.enabled ?? true,
      ]),
    );
  }

  async listAutoUpdateConfigs(userId: string) {
    const enabledMap = await this.getAutoUpdateEnabledMap(userId);
    return AUTO_UPDATE_METRIC_TYPES.map((metric) => ({
      metric,
      enabled: enabledMap.get(metric) ?? true,
    }));
  }

  /**
   * 检查用户是否开启自动更新
   * @param userId
   * @param metric
   * @returns
   */
  async checkAutoUpdatePermission(
    userId: string,
    metric: UserFitnessMetricType,
    at?: Date,
  ) {
    if (!this.isAutoUpdateMetricSupported(metric)) return true;
    if (at) {
      return this.analysisConfigVersions().resolveAutoUpdateAt(
        userId,
        metric,
        at,
      );
    }
    const row = await this.prisma.userAutoUpdateConfig.findUnique({
      where: {
        userId_metric: {
          userId,
          metric,
        },
      },
      select: { enabled: true },
    });
    return row?.enabled ?? true;
  }

  async updateAutoUpdateConfig(
    userId: string,
    metric: UserFitnessMetricType,
    enabled: boolean,
  ) {
    if (!this.isAutoUpdateMetricSupported(metric)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    const changedAt = new Date();
    const result = await this.serializeFitnessWrite(userId, () =>
      this.runFitnessWriteTransaction(userId, async (tx) => {
        const previous = await tx.userAutoUpdateConfig.findUnique({
          where: {
            userId_metric: {
              userId,
              metric,
            },
          },
          select: { enabled: true },
        });
        const saved = await tx.userAutoUpdateConfig.upsert({
          where: {
            userId_metric: {
              userId,
              metric,
            },
          },
          update: { enabled },
          create: {
            userId,
            metric,
            enabled,
          },
          select: { metric: true, enabled: true },
        });
        if (previous?.enabled !== saved.enabled) {
          await this.analysisConfigVersions().recordAutoUpdateVersion({
            userId,
            metric,
            enabled: saved.enabled,
            effectiveAt: changedAt,
            source: 'USER_SETTING',
            tx,
          });
        }
        return {
          saved,
          shouldPromote: saved.enabled && previous?.enabled !== true,
        };
      }),
    );

    if (result.shouldPromote) {
      await this.promoteLatestEstimatedMetricsToAuto(
        userId,
        result.saved.metric,
      );
    }

    return result.saved;
  }

  /**
   * 开启自动更新时，将各运动轨道最新的系统估算从当前精确时刻起应用到 AUTO。
   * 不能回填原估算时刻，也不能压缩到当天零点，否则会改写用户开启权限前的历史。
   */
  private async promoteLatestEstimatedMetricsToAuto(
    userId: string,
    type: UserFitnessMetricType,
  ) {
    const rows = await this.users.fitnessMetrics().findMany({
      where: {
        userId,
        type,
        source: MetricSource.ESTIMATED,
      },
      orderBy: { recordedAt: 'desc' },
    });
    const latestBySport = new Map<SportType, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestBySport.has(row.sport)) latestBySport.set(row.sport, row);
    }

    const recordedAt = new Date();
    await Promise.all(
      Array.from(latestBySport.values()).map(async (estimated) => {
        const validation = validateFitnessMetricCandidate(
          {
            type,
            value: estimated.value,
            value2: estimated.value2,
            sport: estimated.sport,
          },
          await this.getFitnessMetricValidationContext(
            userId,
            estimated.sport,
            recordedAt,
          ),
          { requireReferenceMetrics: true },
        );
        if (validation.valid === false) {
          this.logger.warn(
            `[自动更新] 跳过不合格估算值：用户ID=${userId}, 类型=${type}, 运动=${estimated.sport}, 值=${estimated.value}, 原因=${validation.reason}`,
          );
          return null;
        }
        return this.persistFitnessMetricBySource(
          userId,
          type,
          estimated.value,
          estimated.sport,
          estimated.value2 ?? undefined,
          MetricSource.AUTO,
          recordedAt,
          estimated.originPayload == null
            ? undefined
            : { originPayload: estimated.originPayload },
          true,
        );
      }),
    );
  }
  /**
   * 更新用户的 fitness metric
   * 逻辑为
   * 1. 先根据 recordedAt 来获取当前最新的记录
   * 2. 如果有当前值，则更新当前值
   * 3. 如果没有则新增
   *
   */
  async upsertFitnessMetric(
    userId: string,
    type: UserFitnessMetricType,
    value: number,
    sport: SportType,
    value2?: number,
    source: MetricSource = MetricSource.AUTO,
    recordedAt: Date = dayjs().endOf('day').toDate(),
    origin?: FitnessMetricPersistOrigin,
  ) {
    const changedMetrics: UserFitnessMetric[] = [];
    const result = await this.serializeFitnessWrite(userId, async () => {
      const autoUpdateEnabled =
        source === MetricSource.AUTO
          ? await this.checkAutoUpdatePermission(userId, type)
          : true;
      return this.runFitnessWriteTransaction(userId, async (tx) => {
        // 外部指标同步通常只携带部分指标，不能把数据库中来自其它来源、
        // 其它时间的关联指标当作同一组快照进行一致性校验。
        // 这里仅移除跨指标上下文；数值自身的 intrinsic bounds 仍会校验。
        const isExternalImport =
          source === MetricSource.MANUAL &&
          origin?.changeSource === ChangeSource.SYSTEM_IMPORTED &&
          this.isExternalOrigin(origin);
        const validationContext = isExternalImport
          ? {}
          : await this.getFitnessMetricValidationContext(
              userId,
              sport,
              recordedAt,
              tx,
            );
        const validation = validateFitnessMetricCandidate(
          { type, value, value2, sport, source },
          validationContext,
          { requireReferenceMetrics: source !== MetricSource.MANUAL },
        );
        if (validation.valid === false) {
          const message = `[体能指标校验] 拒绝写入：用户ID=${userId}, 类型=${type}, 运动=${sport}, 值=${value}, 原因=${validation.reason}`;
          if (source === MetricSource.AUTO) {
            this.logger.warn(message);
            return null;
          }
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message,
          });
        }

        return this.persistValidatedFitnessMetric(
          {
            userId,
            type,
            value,
            sport,
            value2,
            source,
            recordedAt,
            origin,
            autoUpdateEnabled,
          },
          tx,
          changedMetrics,
        );
      });
    });
    for (const changed of changedMetrics)
      this.triggerRecomputeByFitnessMetricChange(changed);
    return result;
  }

  /**
   * Persist one modeled result as an atomic metric group. Calculations may run
   * concurrently, but related CP/FTP/W'/P_MAX values share one transaction.
   */
  async upsertAutoFitnessMetrics(
    userId: string,
    sport: SportType,
    candidates: AutoFitnessMetricCandidate[],
    recordedAt: Date = dayjs().endOf('day').toDate(),
    origin?: FitnessMetricPersistOrigin,
  ) {
    if (candidates.length === 0) return [];
    if (
      candidates.some((candidate) => isDerivedPowerMetric(candidate.type)) &&
      !hasPowerPeakEvidence(origin?.originPayload)
    ) {
      this.logger.warn(
        `[体能指标校验] 拒绝缺少功率曲线证据的自动写入：用户ID=${userId}, 运动=${sport}`,
      );
      return [];
    }
    const changedMetrics: UserFitnessMetric[] = [];
    const result = await this.serializeFitnessWrite(userId, async () => {
      const autoUpdateEnabled = await this.getAutoUpdateEnabledMap(userId);
      return this.runFitnessWriteTransaction(userId, async (tx) => {
        const validationContext = await this.getFitnessMetricValidationContext(
          userId,
          sport,
          recordedAt,
          tx,
        );
        for (const candidate of candidates) {
          validationContext[candidate.type] = candidate.value;
        }
        for (const candidate of candidates) {
          const validation = validateFitnessMetricCandidate(
            { ...candidate, sport, source: MetricSource.AUTO },
            validationContext,
            { requireReferenceMetrics: true },
          );
          if (validation.valid === false) {
            this.logger.warn(
              `[体能指标校验] 拒绝批量写入：用户ID=${userId}, 类型=${candidate.type}, 运动=${sport}, 值=${candidate.value}, 原因=${validation.reason}`,
            );
            return [];
          }
        }

        const persisted: Array<UserFitnessMetric | null> = [];
        for (const candidate of candidates) {
          persisted.push(
            await this.persistValidatedFitnessMetric(
              {
                userId,
                ...candidate,
                sport,
                source: MetricSource.AUTO,
                recordedAt,
                origin,
                autoUpdateEnabled:
                  autoUpdateEnabled.get(candidate.type) ?? true,
              },
              tx,
              changedMetrics,
            ),
          );
        }
        return persisted;
      });
    });
    for (const changed of changedMetrics)
      this.triggerRecomputeByFitnessMetricChange(changed);
    return result;
  }

  private async persistValidatedFitnessMetric(
    args: {
      userId: string;
      type: UserFitnessMetricType;
      value: number;
      sport: SportType;
      value2?: number;
      source: MetricSource;
      recordedAt: Date;
      origin?: FitnessMetricPersistOrigin;
      autoUpdateEnabled: boolean;
    },
    tx: Prisma.TransactionClient,
    changedMetrics: UserFitnessMetric[],
  ) {
    const {
      userId,
      type,
      value,
      sport,
      value2,
      source,
      recordedAt,
      origin,
      autoUpdateEnabled,
    } = args;
    if (source !== MetricSource.AUTO) {
      return this.persistFitnessMetricBySource(
        userId,
        type,
        value,
        sport,
        value2,
        source,
        recordedAt,
        origin,
        false,
        tx,
        changedMetrics,
      );
    }

    const estimatedMetric = await this.persistFitnessMetricBySource(
      userId,
      type,
      value,
      sport,
      value2,
      MetricSource.ESTIMATED,
      recordedAt,
      origin,
      false,
      tx,
      changedMetrics,
    );
    if (!autoUpdateEnabled) {
      this.logger.debug(
        `[自动更新] 指标已关闭，仅更新估算值：用户ID=${userId}, 类型=${type}, 运动类型=${sport}, 记录时间=${dayjs(recordedAt).format('YYYY-MM-DD')}`,
      );
      return estimatedMetric;
    }

    return this.persistFitnessMetricBySource(
      userId,
      type,
      value,
      sport,
      value2,
      source,
      recordedAt,
      origin,
      false,
      tx,
      changedMetrics,
    );
  }

  private async getFitnessMetricValidationContext(
    userId: string,
    sport: SportType,
    at?: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<FitnessMetricValidationContext> {
    const candidates = await this.users.fitnessMetrics(tx).findMany({
      where: {
        userId,
        source: { in: [MetricSource.MANUAL, MetricSource.AUTO] },
        sport: { in: [sport, SportType.UNKNOWN] },
        ...(at ? { recordedAt: { lte: at } } : {}),
      },
      orderBy: { recordedAt: 'desc' },
    });
    const context: FitnessMetricValidationContext = {};
    for (const type of Object.values(UserFitnessMetricType)) {
      const selected = selectEffectiveFitnessMetric(candidates, type, sport);
      if (selected?.value != null) context[type] = Number(selected.value);
    }
    return context;
  }

  private normalizeFitnessMetricValue(
    type: UserFitnessMetricType,
    value: number,
  ): number {
    // Pace metrics use m/s, so rounding to integers changes the threshold itself.
    return type === UserFitnessMetricType.TP ||
      type === UserFitnessMetricType.CS
      ? value
      : round(value);
  }

  private async persistFitnessMetricBySource(
    userId: string,
    type: UserFitnessMetricType,
    value: number,
    sport: SportType,
    value2: number | undefined,
    source: MetricSource,
    recordedAt: Date,
    origin?: TrainingSettingOrigin,
    forceRecord: boolean = false,
    tx?: Prisma.TransactionClient,
    changedMetrics: UserFitnessMetric[] = [],
  ) {
    if (!tx) {
      const result = await this.serializeFitnessWrite(userId, () =>
        this.runFitnessWriteTransaction(userId, (client) =>
          this.persistFitnessMetricBySource(
            userId,
            type,
            value,
            sport,
            value2,
            source,
            recordedAt,
            origin,
            forceRecord,
            client,
            changedMetrics,
          ),
        ),
      );
      for (const changed of changedMetrics)
        this.triggerRecomputeByFitnessMetricChange(changed);
      return result;
    }
    if (
      derivedPowerMetricNeedsEvidence(source, type) &&
      !hasPowerPeakEvidence(origin?.originPayload)
    ) {
      this.logger.warn(
        `[体能指标校验] 拒绝缺少功率曲线证据的写入：用户ID=${userId}, 类型=${type}, 来源=${source}, 运动=${sport}`,
      );
      return null;
    }
    const originData = this.buildOriginWriteData(source, origin);
    // 先根据 recordedAt 来获取当前最新的
    const current = await this.users.fitnessMetrics(tx).findFirst({
      where: {
        userId,
        type,
        sport,
        source,
        recordedAt: { lte: recordedAt },
      },
      orderBy: { recordedAt: 'desc' },
    });

    const valueTolerance =
      type === UserFitnessMetricType.TP || type === UserFitnessMetricType.CS
        ? 0
        : 0.001;
    const isValueDiff =
      !current || Math.abs(current.value - value) > valueTolerance;
    const isOriginDiff = current
      ? this.hasOriginDiff(current, originData)
      : true;
    const persistedValue = this.normalizeFitnessMetricValue(type, value);
    const persistedValue2 =
      value2 == null ? value2 : this.normalizeFitnessMetricValue(type, value2);

    if (current && dayjs(current.recordedAt).isSame(dayjs(recordedAt), 'day')) {
      if (forceRecord || isValueDiff || isOriginDiff) {
        const updated = await this.users.fitnessMetrics(tx).update({
          where: { id: current.id },
          data: {
            value: persistedValue,
            value2: persistedValue2,
            source,
            recordedAt: new Date(
              `${dayjs(recordedAt).format('YYYY-MM-DD')}T00:00:00.000Z`,
            ),
            ...originData,
          },
        });

        changedMetrics.push(updated);
        return updated;
      }
      this.logger.debug(
        `[增量复算] 指标未变化，跳过触发：用户ID=${userId}, 类型=${type}, 来源=${source}, 运动类型=${sport}, 记录时间=${dayjs(recordedAt).format('YYYY-MM-DD')}`,
      );
      return current;
    }

    if (
      forceRecord ||
      isValueDiff ||
      (this.isExternalOrigin(origin) && isOriginDiff)
    ) {
      const created = await this.users.fitnessMetrics(tx).create({
        data: {
          userId,
          type,
          sport,
          value: persistedValue,
          value2: persistedValue2,
          source,
          recordedAt: new Date(
            `${dayjs(recordedAt).format('YYYY-MM-DD')}T00:00:00.000Z`,
          ),
          ...originData,
        },
      });

      changedMetrics.push(created);
      return created;
    }

    this.logger.debug(
      `[增量复算] 指标未变化且无需新增，跳过触发：用户ID=${userId}, 类型=${type}, 来源=${source}, 运动类型=${sport}, 记录时间=${dayjs(recordedAt).format('YYYY-MM-DD')}`,
    );
    return current;
  }

  /**
   * 获取指定来源轨道的体能指标。
   * - source 默认 MANUAL；明确读取 AUTO 时必须主动传入；
   * - sportType 存在且 strict=false 时，运动专项优先，再降级 UNKNOWN；
   * - at 存在时，以它为上限向过去追溯最近记录（recordedAt <= at）；
   * - 需要 MANUAL/AUTO 合并后的业务生效值时，应使用 getEffectiveUserFitnessMetric。
   */
  async getUserFitnessMetric(
    userId: string,
    type: UserFitnessMetricType,
    at?: Date,
    sportType?: SportType | null,
    source: MetricSource = MetricSource.MANUAL,
    strict: boolean = false,
  ) {
    const sport = sportType ?? SportType.UNKNOWN;
    const tryFind = async (options: {
      source: MetricSource;
      sport: SportType;
      at?: Date;
    }) => {
      const where: Prisma.UserFitnessMetricWhereInput = {
        userId,
        type,
        source: options.source,
        sport: options.sport,
      };
      if (options.at) where.recordedAt = { lte: options.at };
      return this.users.fitnessMetrics().findFirst({
        where,
        orderBy: { recordedAt: 'desc' },
      });
    };

    const sports =
      sport !== SportType.UNKNOWN && !strict
        ? [sport, SportType.UNKNOWN]
        : [sport];
    for (const s of sports) {
      const metric = await tryFind({ source: source, sport: s, at });
      if (metric) return metric;
    }

    return null;
  }

  /**
   * 获取指定时点真正生效的体能指标。
   *
   * 规则：
   * - 候选来源同时包含 MANUAL / AUTO；
   * - 以 at 为上限向过去追溯，直到找到最近记录（recordedAt <= at）；
   * - 运动专项优先于 UNKNOWN；
   * - 同一运动范围内按 recordedAt 取最新，同一时间 MANUAL 优先。
   *
   * 明确需要查看单一来源历史时，继续使用 getUserFitnessMetric。
   */
  async getEffectiveUserFitnessMetric(
    userId: string,
    type: UserFitnessMetricType,
    at?: Date | null,
    sportType?: SportType | null,
    tx?: PrismaTx,
  ) {
    const sport = sportType ?? SportType.UNKNOWN;
    const sports =
      sport === SportType.UNKNOWN
        ? [SportType.UNKNOWN]
        : [sport, SportType.UNKNOWN];
    const candidates = await this.users.fitnessMetrics(tx).findMany({
      where: {
        userId,
        type,
        source: { in: [MetricSource.MANUAL, MetricSource.AUTO] },
        sport: { in: sports },
        ...(type === UserFitnessMetricType.CS && sport === SportType.RUN
          ? {
              NOT: {
                sport: SportType.RUN,
                source: MetricSource.AUTO,
                value: { lt: 1.8 },
              },
            }
          : {}),
        ...(at ? { recordedAt: { lte: at } } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      distinct: ['sport', 'source'],
    });

    return selectEffectiveFitnessMetric(candidates, type, sport) ?? null;
  }

  /**
   * 手动设置 FitnessMetric
   * @param options
   * @returns
   */
  async setFitnessMetric(options: {
    userId: string;
    type: UserFitnessMetricType;
    value: number;
    sportType?: SportType;
  }) {
    const sportType =
      options.type === UserFitnessMetricType.VO2_MAX
        ? SportType.UNKNOWN
        : (options.sportType ?? SportType.UNKNOWN);
    const recordedAt = dayjs().startOf('day').toDate();
    return this.upsertFitnessMetric(
      options.userId,
      options.type,
      this.normalizeFitnessMetricValue(options.type, options.value),
      sportType,
      undefined,
      MetricSource.MANUAL,
      recordedAt,
    );
  }

  /**
   * 第三方同步来的训练指标会写入 MANUAL 轨道作为当前采用值，同时保留来源归因。
   */
  async upsertImportedFitnessMetric(options: {
    userId: string;
    provider: ThirdPartyProvider;
    type: UserFitnessMetricType;
    value: number;
    sportType?: SportType;
    value2?: number;
    recordedAt?: Date;
    externalId?: string | number | null;
    rawPayload?: unknown;
  }) {
    const sport =
      options.type === UserFitnessMetricType.VO2_MAX
        ? SportType.UNKNOWN
        : (options.sportType ?? SportType.UNKNOWN);
    return this.upsertFitnessMetric(
      options.userId,
      options.type,
      options.value,
      sport,
      options.value2,
      MetricSource.MANUAL,
      options.recordedAt ?? dayjs().startOf('day').toDate(),
      {
        changeSource: ChangeSource.SYSTEM_IMPORTED,
        originProvider: options.provider,
        originExternalId: options.externalId,
        originPayload: options.rawPayload ?? {
          type: options.type,
          value: options.value,
          value2: options.value2 ?? null,
          sport,
        },
      },
    );
  }

  /** Read-only model comparisons using the same generators as automatic zones. */
  async getZoneModelPreviews(
    userId: string,
    sportType: SportType,
    zoneType: ZoneType,
  ) {
    const [profile, saved] = await Promise.all([
      this.getComposedUserProfile(userId, sportType),
      this.prisma.userZoneSetting.findUnique({
        where: { userId_sportType_zoneType: { userId, sportType, zoneType } },
        select: { id: true },
      }),
    ]);
    const models: Record<string, UserZoneSetting> = {};
    const add = (
      model: string,
      generated: UserZoneSetting | null,
      benchmark?: ZoneBase,
    ) => {
      models[model] = {
        ...(generated ?? { benchmark, zones: [] }),
        model,
        configurationSource: 'generated',
      };
    };
    if (zoneType === ZoneType.HEART_RATE) {
      for (const model of Object.values($Enums.HeartRateZoneModel)) {
        add(
          model,
          generateHeartRateZonesFromProfile(
            { ...profile, heartRateZoneModel: model },
            sportType,
          ),
          model === $Enums.HeartRateZoneModel.KARVONEN
            ? ZoneBase.HRR
            : model === $Enums.HeartRateZoneModel.MHR
              ? ZoneBase.MHR
              : ZoneBase.LTHR,
        );
      }
    } else if (zoneType === ZoneType.POWER) {
      for (const model of Object.values($Enums.PowerZoneModel)) {
        add(
          model,
          generatePowerZonesFromProfile(
            { FTP: profile.ftp, CP: profile.cp, powerZoneModel: model },
            sportType,
          ),
        );
      }
    } else if (zoneType === ZoneType.PACE) {
      for (const model of Object.values($Enums.PaceZoneModel)) {
        add(
          model,
          generatePaceZonesFromProfile(
            { ...profile, paceZoneModel: model },
            sportType,
          ),
          model === $Enums.PaceZoneModel.DANIELS
            ? ZoneBase.VO2MAX
            : ZoneBase.TP,
        );
      }
    }
    return { models, hasSavedSetting: Boolean(saved) };
  }

  /**
   * 获取用户的心率区间配置
   * 规则：
   * 1. 如果用户有自定义配置，解析后根据 userProfile 直接生成区间
   * 2. 如果用户没有自定义配置，根据用户的 maxHeartRate、restingHeartRate、lthr、heartRateZoneModel 生成默认配置
   * @param userId
   * @param sportType
   * @param userProfile
   * @returns
   */
  async getHeartRateZoneSetting(
    userId: string,
    sportType: SportType,
    userProfile?: {
      maxHeartRate?: number;
      restingHeartRate?: number;
      lthr?: number;
      heartRateZoneModel?: $Enums.HeartRateZoneModel;
    },
    tx?: PrismaTx,
  ): Promise<UserZoneSetting> {
    const profile =
      userProfile ??
      (await this.getComposedUserProfile(userId, sportType, undefined, tx));
    const saved = await this.users.zoneSettings(tx).findUnique({
      where: {
        userId_sportType_zoneType: {
          userId,
          sportType,
          zoneType: ZoneType.HEART_RATE,
        },
      },
      include: {
        zones: {
          orderBy: { order: 'asc' },
        },
      },
    });
    if (saved) {
      const resolved = resolveHeartRateSettings(saved, profile);
      if (resolved)
        return {
          benchmark: saved?.benchmark,
          configurationSource: 'saved',
          model: null,
          benchmarkSource:
            saved?.benchmark === ZoneBase.LTHR
              ? (resolveLthrForCalculation({
                  lthr: profile?.lthr,
                  maxHeartRate: profile?.maxHeartRate,
                })?.source ?? 'UNKNOWN')
              : saved?.benchmark === ZoneBase.CUSTOM
                ? 'CUSTOM'
                : 'PROFILE',
          zones: resolved,
        };
    }
    const generated = generateHeartRateZonesFromProfile(profile, sportType);
    if (!generated) {
      return {
        benchmark: undefined,
        zones: [],
      };
    }
    return {
      ...generated,
      configurationSource: 'generated',
      model: profile?.heartRateZoneModel ?? $Enums.HeartRateZoneModel.MHR,
    };
  }

  /**
   * 获取用户的功率区间配置（直接可用，已解析为绝对瓦值）
   * 规则：
   * 1. 如果用户有自定义配置（可能是百分比），按 FTP/CP 转换为绝对值
   * 2. 如果没有用户配置，依据用户的 FTP/CP 和 powerZoneModel 生成默认绝对区间
   */
  async getPowerZoneSettingResolved(
    userId: string,
    sportType: SportType,
    userProfile?: {
      FTP?: number;
      CP?: number;
      powerZoneModel?: $Enums.PowerZoneModel;
    },
    tx?: PrismaTx,
  ): Promise<UserZoneSetting> {
    const profile = await this.getComposedUserProfile(
      userId,
      sportType,
      undefined,
      tx,
    );
    const saved = await this.users.zoneSettings(tx).findUnique({
      where: {
        userId_sportType_zoneType: {
          userId,
          sportType,
          zoneType: ZoneType.POWER,
        },
      },
      include: {
        zones: { orderBy: { order: 'asc' } },
      },
    });
    const context = {
      FTP: userProfile?.FTP || profile?.ftp,
      CP: userProfile?.CP || profile?.cp,
      powerZoneModel: userProfile?.powerZoneModel || profile?.powerZoneModel,
    };
    if (saved) {
      if (saved?.benchmark) {
        const resolved = resolvePowerZoneSettings(saved, context);
        if (resolved)
          return {
            benchmark: saved?.benchmark,
            configurationSource: 'saved',
            model: null,
            zones: resolved,
          };
      }
    }
    const generated = generatePowerZonesFromProfile(context, sportType);
    if (!generated) {
      return {
        benchmark: undefined,
        zones: [],
      };
    }
    return {
      ...generated,
      configurationSource: 'generated',
      model: context.powerZoneModel ?? null,
    };
  }
  /**
   * 获取用户的最大有氧功率（MAP）
   * @param userId
   * @param sportType
   * @param at
   * @returns
   */
  async getUserMaxAerobicPowerMAP(
    userId: string,
    sportType?: SportType,
    at?: Date,
  ): Promise<number | undefined> {
    if (!userId) return undefined;
    if (sportType === SportType.UNKNOWN) return undefined;

    const cutoff = at ?? dayjs().toDate();
    const peak = await this.prisma.activityPeakMetric.findFirst({
      where: {
        sport: sportType,
        type: PeakType.power,
        scaleType: ScaleType.TIME,
        scaleValue: 300,
        value: { not: null },
        activity: readyActivityWhere({
          userId,
          startTime: { not: null, lte: cutoff },
        }),
      },
      orderBy: { value: 'desc' },
      select: { value: true },
    });

    const mmp5 =
      peak?.value !== null && peak?.value !== undefined
        ? peak.value
        : undefined;
    if (typeof mmp5 !== 'number' || !Number.isFinite(mmp5) || mmp5 <= 0) {
      return undefined;
    }

    return round(mmp5 * 0.92, 2);
  }

  /**
   * 获取用户的配速区间配置（直接可用，已解析为绝对 GAP 边界，单位：秒/米）
   * 规则：
   * 1. 有用户自定义配置且为百分比时，按 VO2MAX/TP/CS 转换为绝对速度后再转 GAP
   * 2. 无用户配置则依据 paceZoneModel 生成默认百分比并转换
   */
  async getPaceZoneSettingResolved(
    userId: string,
    sportType: SportType,
    userProfile?: {
      vo2max?: number;
      tp?: number;
      cs?: number;
      paceZoneModel?: $Enums.PaceZoneModel;
    },
    tx?: PrismaTx,
  ): Promise<UserZoneSetting> {
    const profile = await this.getComposedUserProfile(
      userId,
      sportType,
      undefined,
      tx,
    );
    const saved = await this.users.zoneSettings(tx).findUnique({
      where: {
        userId_sportType_zoneType: {
          userId,
          sportType,
          zoneType: ZoneType.PACE,
        },
      },
      include: {
        zones: { orderBy: { order: 'asc' } },
      },
    });
    const context = {
      vo2max: userProfile?.vo2max || profile?.vo2max,
      tp: userProfile?.tp || profile?.tp,
      cs: userProfile?.cs || profile?.cs,
      paceZoneModel: userProfile?.paceZoneModel || profile?.paceZoneModel,
    };
    if (saved) {
      const resolved = resolvePaceZoneSettings(saved, context);
      // A missing configured benchmark must not switch to an automatic model.
      return {
        benchmark: saved.benchmark,
        configurationSource: 'saved',
        model: null,
        zones: resolved ?? [],
      };
    }

    const generated = generatePaceZonesFromProfile(context, sportType);
    if (!generated) {
      return {
        benchmark: undefined,
        zones: [],
      };
    }
    return {
      ...generated,
      configurationSource: 'generated',
      model: context.paceZoneModel ?? null,
    };
  }

  async deleteZoneSetting(
    userId: string,
    sportType: SportType,
    zoneType: ZoneType,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userZoneSetting.findUnique({
        where: {
          userId_sportType_zoneType: {
            userId,
            sportType,
            zoneType,
          },
        },
        include: {
          zones: { orderBy: { order: 'asc' } },
        },
      });
      let changedAt: Date | null = null;
      if (existing) {
        const version = await tx.userZoneSettingVersion.create({
          data: {
            userId,
            sportType,
            zoneType,
            benchmark: null,
            zones: [],
            changeSource: ChangeSource.USER_MANUAL,
            rawPayload: {
              action: 'delete',
              previousBenchmark: existing.benchmark,
              previousZones: existing.zones.map((z) => ({
                order: z.order,
                min: z.min ?? null,
                max: z.max ?? null,
                name: z.name ?? null,
                color: z.color ?? null,
              })),
            },
          },
          select: { createdAt: true },
        });
        changedAt = version.createdAt;
      }
      const deleted = await tx.userZoneSetting.deleteMany({
        where: {
          userId,
          sportType,
          zoneType,
        },
      });
      return { deleted, changed: Boolean(existing), changedAt };
    });
    if (result.changed) {
      await emitUserZoneSettingChanged(
        this.events,
        new UserZoneSettingChangedEvent(
          userId,
          sportType,
          zoneType,
          true,
          result.changedAt ?? new Date(),
        ),
      );
    }
    return result.deleted;
  }

  /**
   * 获取用户所有的自定义区间配置
   * @param userId
   * @param sportType
   * @param zoneType
   * @returns
   */
  async getAllUserZones(
    userId: string,
    sportType?: SportType,
    zoneType?: ZoneType,
  ) {
    return await this.prisma.userZoneSetting.findMany({
      where: {
        userId,
        sportType,
        zoneType,
      },
      include: {
        zones: { orderBy: { order: 'asc' } },
      },
    });
  }

  async getZoneSourceStatus(
    userId: string,
    sportType: SportType,
    userProfile?: UserProfileResponse,
  ): Promise<{
    heartRate: {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    };
    pace: {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    };
    power: {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    };
  }> {
    const profile =
      userProfile ?? (await this.getComposedUserProfile(userId, sportType));
    const customRows = await this.getAllUserZones(userId, sportType);
    const hasCustomByType = new Set(
      customRows.map((row) => String(row.zoneType)),
    );

    const [heartRateSetting, paceSetting, powerSetting] = await Promise.all([
      this.getHeartRateZoneSetting(userId, sportType, {
        maxHeartRate: profile?.maxHeartRate,
        restingHeartRate: profile?.restingHeartRate,
        lthr: profile?.lthr,
        heartRateZoneModel: profile?.heartRateZoneModel,
      }),
      this.getPaceZoneSettingResolved(userId, sportType, {
        vo2max: profile?.vo2max,
        tp: profile?.tp,
        cs: profile?.cs,
        paceZoneModel: profile?.paceZoneModel,
      }),
      this.getPowerZoneSettingResolved(userId, sportType, {
        FTP: profile?.ftp,
        CP: profile?.cp,
        powerZoneModel: profile?.powerZoneModel,
      }),
    ]);

    const build = (
      zoneType: ZoneType,
      zones: Array<{ min?: number; max?: number }> | undefined,
    ): {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    } => {
      const zoneCount = Array.isArray(zones) ? zones.length : 0;
      const configured = zoneCount > 0;
      const hasCustom = hasCustomByType.has(String(zoneType));
      const source: 'custom' | 'derived' | 'none' = !configured
        ? 'none'
        : hasCustom
          ? 'custom'
          : 'derived';
      return { configured, source, zoneCount };
    };

    return {
      heartRate: build(ZoneType.HEART_RATE, heartRateSetting?.zones),
      pace: build(ZoneType.PACE, paceSetting?.zones),
      power: build(ZoneType.POWER, powerSetting?.zones),
    };
  }
  /**
   * 更新用户的自定义区间
   * @param userId
   * @param sportType
   * @param zoneType
   * @param zones
   * @param base
   * @returns
   */
  async upsertZoneSetting(
    userId: string,
    sportType: SportType,
    zoneType: ZoneType,
    zones: unknown[],
    benchmark?: ZoneBase,
    origin?: TrainingSettingOrigin,
  ) {
    const rows = Array.isArray(zones) ? zones : [];
    const normalizedRows = normalizeZoneSettingRows(rows);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userZoneSetting.findUnique({
        where: {
          userId_sportType_zoneType: {
            userId,
            sportType,
            zoneType,
          },
        },
        include: {
          zones: { orderBy: { order: 'asc' } },
        },
      });
      const snapshotPayload = {
        sportType,
        zoneType,
        benchmark: benchmark ?? null,
        zones: normalizedRows,
      };
      const originData = this.buildZoneOriginWriteData({
        ...origin,
        originPayload: origin?.originPayload ?? snapshotPayload,
        originChecksum:
          origin?.originChecksum ??
          checksumTrainingSettingPayload(snapshotPayload),
      });
      const previousSnapshot = existing
        ? {
            benchmark: existing.benchmark ?? null,
            zones: existing.zones.map((z) => ({
              order: z.order,
              min: z.min ?? null,
              max: z.max ?? null,
              name: z.name ?? null,
              color: z.color ?? null,
            })),
          }
        : null;
      const nextSnapshot = {
        benchmark: benchmark ?? null,
        zones: normalizedRows,
      };
      const changed =
        stableStringify(previousSnapshot) !== stableStringify(nextSnapshot) ||
        (existing ? this.hasOriginDiff(existing, originData) : true);

      const saved = await tx.userZoneSetting.upsert({
        where: {
          userId_sportType_zoneType: {
            userId,
            sportType,
            zoneType,
          },
        },
        update: {
          benchmark,
          ...originData,
        },
        create: {
          userId,
          sportType,
          zoneType,
          benchmark,
          ...originData,
        },
      });

      await tx.userZones.deleteMany({
        where: { userZoneSettingId: saved.id },
      });

      if (rows.length > 0) {
        await tx.userZones.createMany({
          data: normalizedRows.map((z) => ({
            userZoneSettingId: saved.id,
            order: z.order,
            min: z.min ?? undefined,
            max: z.max ?? undefined,
            name: z.name ?? undefined,
            color: z.color ?? undefined,
          })),
        });
      }

      let changedAt: Date | null = null;
      if (changed) {
        const version = await tx.userZoneSettingVersion.create({
          data: {
            userId,
            sportType,
            zoneType,
            benchmark,
            zones: normalizedRows as Prisma.InputJsonValue,
            changeSource: originData.changeSource ?? ChangeSource.USER_MANUAL,
            originProvider: originData.originProvider,
            originExternalId: originData.originExternalId,
            originChecksum: originData.originChecksum,
            rawPayload: (origin?.originPayload ??
              snapshotPayload) as Prisma.InputJsonValue,
          },
          select: { createdAt: true },
        });
        changedAt = version.createdAt;
      }

      const setting = await tx.userZoneSetting.findUnique({
        where: { id: saved.id },
        include: {
          zones: { orderBy: { order: 'asc' } },
        },
      });
      return { setting, changed, changedAt };
    });
    if (result.changed) {
      await emitUserZoneSettingChanged(
        this.events,
        new UserZoneSettingChangedEvent(
          userId,
          sportType,
          zoneType,
          false,
          result.changedAt ?? new Date(),
        ),
      );
    }
    return result.setting;
  }

  async upsertImportedZoneSetting(options: {
    userId: string;
    provider: ThirdPartyProvider;
    sportType: SportType;
    zoneType: ZoneType;
    zones: unknown[];
    benchmark?: ZoneBase;
    externalId?: string | number | null;
    rawPayload?: unknown;
  }) {
    return this.upsertZoneSetting(
      options.userId,
      options.sportType,
      options.zoneType,
      options.zones,
      options.benchmark,
      {
        changeSource: ChangeSource.SYSTEM_IMPORTED,
        originProvider: options.provider,
        originExternalId: options.externalId,
        originPayload: options.rawPayload ?? {
          sportType: options.sportType,
          zoneType: options.zoneType,
          benchmark: options.benchmark ?? null,
          zones: options.zones,
        },
      },
    );
  }
  /**
   * 获取用户实际生效的指标历史。
   *
   * AUTO 和 MANUAL 共同构成时间线；同一生效时间的两个来源也完整返回，
   * 以便用户看到当时的系统估算和手动设置。当前生效值由独立的选择规则计算。
   * 系统计算/导入记录只读，仅用户手动记录允许前端编辑或删除。
   */
  async listEffectiveFitnessMetricsForDialog(
    userId: string,
    type: UserFitnessMetricType,
    sportType?: SportType,
  ) {
    const metrics = await this.users.fitnessMetrics().findMany({
      where: {
        userId,
        type,
        source: { in: [MetricSource.AUTO, MetricSource.MANUAL] },
        sport: sportType ?? SportType.UNKNOWN,
      },
      orderBy: { recordedAt: 'desc' },
    });

    return metrics.map((m) => ({
      id: m.id,
      value: m.value,
      value2: m.value2,
      recordedAt: m.recordedAt,
      // recordedAt 是时间戳；effectiveDate 是服务端分析语义下的日历日期。
      // 客户端必须优先使用该字段，避免本地零点序列化成 UTC 后显示为前一天。
      effectiveDate: dayjs(m.recordedAt).format('YYYY-MM-DD'),
      time: m.recordedAt,
      source: m.source,
      editable:
        m.source === MetricSource.MANUAL &&
        (m.changeSource === null ||
          m.changeSource === ChangeSource.USER_MANUAL),
      sourceInfo: this.toSourceInfo(m),
    }));
  }

  /**
   * 返回某项体能指标已经建立的运动轨道，用于 Coach 消除运动类型歧义。
   * 这里只返回用户实际可采用的 AUTO/MANUAL 记录，不把 ESTIMATED 候选值
   * 当作用户已经选择的档案。
   */
  async listRecordedFitnessMetricSports(
    userId: string,
    type: UserFitnessMetricType,
  ): Promise<SportType[]> {
    const rows = await this.users.fitnessMetrics().findMany({
      where: {
        userId,
        type,
        source: { in: [MetricSource.AUTO, MetricSource.MANUAL] },
        sport: { not: SportType.UNKNOWN },
      },
      distinct: ['sport'],
      select: { sport: true },
    });
    return rows.map((row) => row.sport);
  }

  async listAutoFitnessMetricsForChart(
    userId: string,
    type: UserFitnessMetricType,
    sportType?: SportType,
    range?: { startDate?: Date; endDate?: Date },
  ) {
    const startDate = range?.startDate;
    const endDate = range?.endDate;
    const recordedAtFilter =
      startDate || endDate
        ? {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          }
        : undefined;

    const metrics = await this.users.fitnessMetrics().findMany({
      where: {
        userId,
        type,
        source: MetricSource.AUTO,
        sport: sportType ?? SportType.UNKNOWN,
        ...(recordedAtFilter ? { recordedAt: recordedAtFilter } : {}),
      },
      orderBy: { recordedAt: 'asc' },
      select: { id: true, recordedAt: true, value: true },
    });

    return metrics.map((m) => ({
      id: m.id,
      value: m.value,
      time: m.recordedAt,
    }));
  }

  /** Bounded, identifier-free metric history for read-only MCP clients. */
  async listFitnessMetricTrendForMcp(args: {
    userId: string;
    type: UserFitnessMetricType;
    sportType: SportType;
    source: 'ESTIMATED' | 'AUTO' | 'MANUAL';
    from: Date;
    to: Date;
    limit: number;
  }) {
    const rows = await this.users.fitnessMetrics().findMany({
      where: {
        userId: args.userId,
        type: args.type,
        sport:
          args.type === UserFitnessMetricType.VO2_MAX
            ? SportType.UNKNOWN
            : args.sportType,
        source: args.source,
        recordedAt: { gte: args.from, lte: args.to },
      },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: args.limit + 1,
      select: {
        recordedAt: true,
        value: true,
        value2: true,
      },
    });
    return {
      items: rows.slice(0, args.limit).reverse(),
      truncated: rows.length > args.limit,
    };
  }

  async getFitnessMetricPairs(options: {
    userId: string;
    sportType: SportType;
  }) {
    const { userId, sportType } = options;

    // Dashboard 用户配置类指标（单次返回，减少前端请求次数）
    const types: UserFitnessMetricType[] = [
      UserFitnessMetricType.FTP,
      UserFitnessMetricType.CP,
      UserFitnessMetricType.P_MAX,
      UserFitnessMetricType.TP,
      UserFitnessMetricType.CS,
      UserFitnessMetricType.MAX_HR,
      UserFitnessMetricType.RESTING_HR,
      UserFitnessMetricType.LTHR,
      UserFitnessMetricType.VO2_MAX,
    ];

    // CS/TP 统一返回 paceSeconds，前端可直接按配速格式展示
    const paceDistanceMeters = sportType === SportType.SWIM ? 100 : 1000;

    const normalizeSportType = (type: UserFitnessMetricType) => {
      if (type === UserFitnessMetricType.VO2_MAX) return SportType.UNKNOWN;
      return sportType;
    };

    const normalizeValue = (type: UserFitnessMetricType, v: unknown) => {
      if (v === undefined || v === null) return null;

      if (
        type === UserFitnessMetricType.CS ||
        type === UserFitnessMetricType.TP
      ) {
        const speed = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(speed) || speed <= 0) return null;
        const paceSeconds = Math.round(paceDistanceMeters / speed);
        if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) return null;
        return paceSeconds;
      }

      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return null;
      return n;
    };

    const getCurrentMetric = async (
      type: UserFitnessMetricType,
      source: MetricSource,
    ) => {
      return await this.getUserFitnessMetric(
        userId,
        type,
        undefined,
        normalizeSportType(type),
        source,
        false,
      );
    };

    const rows = await Promise.all(
      types.map(async (type) => ({
        type,
        estimated: await getCurrentMetric(type, MetricSource.ESTIMATED),
        automatic: await getCurrentMetric(type, MetricSource.AUTO),
        manual: await getCurrentMetric(type, MetricSource.MANUAL),
      })),
    );
    const estimatedEntries = rows.map(
      ({ type, estimated }) =>
        [type, normalizeValue(type, estimated?.value)] as const,
    );
    const manualEntries = rows.map(
      ({ type, manual }) =>
        [type, normalizeValue(type, manual?.value)] as const,
    );
    const automaticEntries = rows.map(
      ({ type, automatic }) =>
        [type, normalizeValue(type, automatic?.value)] as const,
    );
    const effectiveRows = rows.map(({ type, automatic, manual }) => {
      const effective = selectEffectiveFitnessMetric(
        [automatic, manual].filter(
          (metric): metric is NonNullable<typeof metric> => metric != null,
        ),
        type,
        normalizeSportType(type),
      );
      return { type, effective };
    });
    const effectiveEntries = effectiveRows.map(
      ({ type, effective }) =>
        [type, normalizeValue(type, effective?.value)] as const,
    );
    const effectiveDetailsEntries = effectiveRows.map(
      ({ type, effective }) =>
        [
          type,
          effective
            ? {
                value: normalizeValue(type, effective.value),
                source:
                  effective.source === MetricSource.MANUAL
                    ? MetricSource.MANUAL
                    : MetricSource.AUTO,
                recordedAt: effective.recordedAt,
              }
            : null,
        ] as const,
    );

    return {
      estimated: Object.fromEntries(estimatedEntries) as Partial<
        Record<UserFitnessMetricType, number | null>
      >,
      manual: Object.fromEntries(manualEntries) as Partial<
        Record<UserFitnessMetricType, number | null>
      >,
      automatic: Object.fromEntries(automaticEntries) as Partial<
        Record<UserFitnessMetricType, number | null>
      >,
      effective: Object.fromEntries(effectiveEntries) as Partial<
        Record<UserFitnessMetricType, number | null>
      >,
      effectiveDetails: Object.fromEntries(effectiveDetailsEntries) as Partial<
        Record<
          UserFitnessMetricType,
          {
            value: number | null;
            source: 'MANUAL' | 'AUTO';
            recordedAt: Date;
          } | null
        >
      >,
    };
  }
  /**
   * 替换用户手动设置的值的历史记录
   * @param userId
   * @param type
   * @param sportType
   * @param rows
   * @returns
   */
  /** Adopt a frozen estimate without replacing any other date's history. Caller owns the transaction. */
  async applyFitnessEstimateBatch(args: {
    userId: string;
    sport: SportType;
    effectiveDate: string;
    changes: Array<{ metric: UserFitnessMetricType; value: number }>;
    calculationId: string;
    provenance: Prisma.InputJsonValue;
    tx: Prisma.TransactionClient;
  }) {
    const { tx, userId, sport } = args;
    await lockFitnessUser(tx, userId);
    const recordedAt = new Date(`${args.effectiveDate}T00:00:00.000Z`);
    if (
      !Number.isFinite(recordedAt.getTime()) ||
      recordedAt.toISOString().slice(0, 10) !== args.effectiveDate
    )
      throw new Error('Invalid metric date');
    const context = await this.getFitnessMetricValidationContext(
      userId,
      sport,
      undefined,
      tx,
    );
    for (const c of args.changes) context[c.metric] = c.value;
    for (const c of args.changes) {
      const validation = validateFitnessMetricCandidate(
        { type: c.metric, value: c.value, sport },
        context,
        { requireReferenceMetrics: true },
      );
      if (validation.valid === false)
        throw new Error(`REFERENCE_CONFLICT:${validation.reason}`);
    }
    const before = await this.users.fitnessMetrics(tx).findMany({
      where: {
        userId,
        sport,
        source: 'MANUAL',
        recordedAt,
        type: { in: args.changes.map((c) => c.metric) },
      },
    });
    for (const c of args.changes) {
      const data = {
        value: c.value,
        changeSource: ChangeSource.USER_MANUAL,
        originExternalId: args.calculationId,
        originPayload: args.provenance,
      };
      await this.users.fitnessMetrics(tx).upsert({
        where: {
          userId_type_source_sport_recordedAt: {
            userId,
            sport,
            type: c.metric,
            source: 'MANUAL',
            recordedAt,
          },
        },
        create: {
          userId,
          sport,
          type: c.metric,
          source: 'MANUAL',
          recordedAt,
          ...data,
        },
        update: data,
      });
    }
    // A global reference can become the fallback in several sports. Validate
    // only scopes that actually inherit it, preserving sport-specific overrides.
    if (sport === SportType.UNKNOWN) {
      const scopes = await this.users.fitnessMetrics(tx).findMany({
        where: { userId, sport: { not: SportType.UNKNOWN } },
        distinct: ['sport'],
        select: { sport: true },
      });
      for (const scope of scopes) {
        const effective = await this.getFitnessMetricValidationContext(
          userId,
          scope.sport,
          undefined,
          tx,
        );
        for (const change of args.changes) {
          if (effective[change.metric] !== change.value) continue;
          const validation = validateFitnessMetricCandidate(
            { type: change.metric, value: change.value, sport: scope.sport },
            effective,
            { requireReferenceMetrics: true },
          );
          if (validation.valid === false)
            throw new Error(
              `REFERENCE_CONFLICT:${scope.sport}:${validation.reason}`,
            );
        }
      }
    }
    return { before, recordedAt };
  }

  async replaceManualFitnessMetricsForDialog(options: {
    userId: string;
    type: UserFitnessMetricType;
    sportType?: SportType;
    metrics: Array<{ effectiveDate: string; value: string; value2?: string }>;
    /** Coach appends/corrects specified dates; settings owns full-history replacement. */
    preserveOtherDates?: boolean;
    tx?: Prisma.TransactionClient;
  }) {
    if (!options.tx) {
      const result = await this.prisma.$transaction((tx) =>
        this.replaceManualFitnessMetricsForDialog({ ...options, tx }),
      );
      await result.afterCommit();
      return result;
    }
    await lockFitnessUser(options.tx, options.userId);
    const sport = options?.sportType ?? SportType.UNKNOWN;
    const validationContext = await this.getFitnessMetricValidationContext(
      options.userId,
      sport,
      undefined,
      options.tx,
    );
    const existing = await this.users.fitnessMetrics(options.tx).findMany({
      where: {
        userId: options.userId,
        type: options.type,
        source: MetricSource.MANUAL,
        sport,
      },
      select: { recordedAt: true, value: true, value2: true },
    });
    const rowsByTime = new Map<
      number,
      { recordedAt: Date; value: number; value2?: number | null }
    >();
    for (const r of options.metrics) {
      const datePart = String(r.effectiveDate ?? '')
        .trim()
        .slice(0, 10);
      const recordedAt = new Date(`${datePart}T00:00:00.000Z`);
      if (!Number.isFinite(recordedAt.getTime())) continue;
      const value = Number(r.value);
      if (!Number.isFinite(value)) continue;
      const value2 =
        r.value2 === undefined
          ? undefined
          : (() => {
              const raw = String(r.value2).trim();
              if (!raw) return null;
              const n = Number(raw);
              if (!Number.isFinite(n)) return undefined;
              return round(n, 3);
            })();
      const roundedValue = round(value, 3);
      const validation = validateFitnessMetricCandidate(
        {
          type: options.type,
          value: roundedValue,
          value2,
          sport,
        },
        validationContext,
      );
      if (validation.valid === false) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `[体能指标校验] ${options.type}=${roundedValue} 无效：${validation.reason}`,
        });
      }
      rowsByTime.set(recordedAt.getTime(), {
        recordedAt,
        value: roundedValue,
        ...(value2 !== undefined ? { value2 } : {}),
      });
    }
    const rows = [...rowsByTime.values()];
    const recordedAts = rows.map((r) => r.recordedAt);

    const write = async (tx: Prisma.TransactionClient) => {
      // 设置页提交完整历史时允许清空；Coach 只负责指定日期，空输入不得清空历史。
      if (recordedAts.length === 0) {
        if (!options.preserveOtherDates) {
          await this.users.fitnessMetrics(tx).deleteMany({
            where: {
              userId: options.userId,
              type: options.type,
              source: MetricSource.MANUAL,
              sport,
            },
          });
        }
        return;
      }
      // 设置页提交完整历史时删除缺失日期；Coach 追加/纠正单日时保留其他历史。
      if (!options.preserveOtherDates) {
        await this.users.fitnessMetrics(tx).deleteMany({
          where: {
            userId: options.userId,
            type: options.type,
            source: MetricSource.MANUAL,
            sport,
            recordedAt: { notIn: recordedAts },
          },
        });
      }
      // 后替换所有回传上来的记录
      await Promise.all(
        rows.map(async (r) => {
          const manualOrigin = this.buildOriginWriteData(MetricSource.MANUAL, {
            changeSource: ChangeSource.USER_MANUAL,
          });
          return this.users.fitnessMetrics(tx).upsert({
            where: {
              userId_type_source_sport_recordedAt: {
                userId: options.userId,
                type: options.type,
                source: MetricSource.MANUAL,
                sport,
                recordedAt: r.recordedAt,
              },
            },
            update: {
              value: r.value,
              ...(r.value2 !== undefined ? { value2: r.value2 } : {}),
              ...manualOrigin,
            },
            create: {
              userId: options.userId,
              type: options.type,
              source: MetricSource.MANUAL,
              sport,
              value: r.value,
              ...(r.value2 !== undefined ? { value2: r.value2 } : {}),
              recordedAt: r.recordedAt,
              ...manualOrigin,
            },
          });
        }),
      );
    };
    if (options.tx) await write(options.tx);
    else await this.prisma.$transaction(write);

    const metricType = options.type;
    const oldByTime = new Map<
      number,
      { value: number; value2: number | null }
    >();
    for (const m of existing) {
      if (
        options.preserveOtherDates &&
        !rowsByTime.has(m.recordedAt.getTime())
      ) {
        continue;
      }
      oldByTime.set(m.recordedAt.getTime(), {
        value: Number(m.value),
        value2: m.value2 === null ? null : Number(m.value2),
      });
    }
    const allTimes = new Set<number>();
    for (const t of oldByTime.keys()) allTimes.add(t);
    for (const t of rowsByTime.keys()) allTimes.add(t);

    const changedTimes: number[] = [];
    for (const t of allTimes) {
      const oldRow = oldByTime.get(t);
      const newRow = rowsByTime.get(t);
      if (!oldRow && newRow) {
        changedTimes.push(t);
        continue;
      }
      if (oldRow && !newRow) {
        changedTimes.push(t);
        continue;
      }
      if (!oldRow || !newRow) continue;
      const valueChanged = oldRow.value !== newRow.value;
      const value2Changed =
        newRow.value2 !== undefined &&
        oldRow.value2 !== (newRow.value2 ?? null);
      if (valueChanged || value2Changed) changedTimes.push(t);
    }

    if (changedTimes.length === 0) {
      this.logger.debug(
        `[增量复算] 批量替换指标无实际变更，跳过入队：用户ID=${options.userId}, 类型=${metricType}, 运动类型=${sport}`,
      );
      return { afterCommit: async () => undefined };
    }

    const afterCommit = () =>
      emitUserFitnessInvalidated(
        this.events,
        new UserFitnessInvalidatedEvent(
          options.userId,
          options.type,
          sport === SportType.UNKNOWN ? undefined : sport,
          changedTimes,
          MetricSource.MANUAL,
        ),
      );
    if (!options.tx) await afterCommit();
    return { afterCommit };
  }

  /**
   * 指标写库完成后通知 Analyze。是否入队复算由消费方决定。
   */
  private triggerRecomputeByFitnessMetricChange(metric: UserFitnessMetric) {
    const sportType =
      metric.sport === SportType.UNKNOWN ? undefined : metric.sport;
    this.logger.log(
      `[增量复算] 指标写入完成，准备触发：用户ID=${metric.userId}, 类型=${metric.type}, 运动类型=${sportType ?? 'ALL'}, 记录时间=${dayjs(metric.recordedAt).format('YYYY-MM-DD')}, 来源=${metric.source}`,
    );
    void emitUserFitnessInvalidated(
      this.events,
      new UserFitnessInvalidatedEvent(
        metric.userId,
        metric.type,
        sportType,
        [metric.recordedAt.getTime()],
        metric.source,
      ),
    );
  }

  /**
   * 获取用户的临界功率历史记录
   */
  // async getUserCriticalPowerHistory(userId: string, sportType?: SportType) {
  //   const metrics = await this.users.fitnessMetrics().findMany({
  //     where: {
  //       userId,
  //       sport: sportType,
  //       type: {
  //         in: [
  //           UserFitnessMetricType.CP,
  //           UserFitnessMetricType.W_PRIME,
  //           UserFitnessMetricType.FTP,
  //         ],
  //       },
  //     },
  //     orderBy: { recordedAt: 'asc' },
  //     select: {
  //       recordedAt: true,
  //       type: true,
  //       value: true,
  //       source: true,
  //     },
  //   });

  //   return metrics.map((m) => ({
  //     recordedAt: m.recordedAt,
  //     source: m.source,
  //     cp: m.type === UserFitnessMetricType.CP ? m.value : null,
  //     ftp: m.type === UserFitnessMetricType.FTP ? m.value : null,
  //     wPrime: m.type === UserFitnessMetricType.W_PRIME ? m.value : null,
  //   }));
  // }

  // /**
  //  * 获取用户设定的 CP、FTP 值
  //  */
  // //
  // async getUserCriticalPower(
  //   userId: string,
  //   sportType?: 'all' | SportType,
  //   at?: Date,
  //   activityId?: number,
  // ) {
  //   if (!sportType || sportType === 'all') {
  //     return {
  //       cp: undefined,
  //       wPrime: undefined,
  //       ftp: undefined,
  //       recordedAt: undefined,
  //     };
  //   }

  //   // Prefer bound metrics when activityId is provided
  //   if (activityId) {
  //     const bindings = await this.prisma.activityFitnessMetricBinding.findMany({
  //       where: {
  //         activityId,
  //         metricType: {
  //           in: [
  //             UserFitnessMetricType.CP,
  //             UserFitnessMetricType.W_PRIME,
  //             UserFitnessMetricType.FTP,
  //           ],
  //         },
  //       },
  //       include: { metric: true },
  //     });
  //     const cpMetric = bindings.find(
  //       (b) => b.metricType === UserFitnessMetricType.CP,
  //     )?.metric;
  //     const wPrimeMetric = bindings.find(
  //       (b) => b.metricType === UserFitnessMetricType.W_PRIME,
  //     )?.metric;
  //     const ftpMetric = bindings.find(
  //       (b) => b.metricType === UserFitnessMetricType.FTP,
  //     )?.metric;
  //     if (cpMetric || ftpMetric || wPrimeMetric) {
  //       const recordedAt = (
  //         [
  //           cpMetric?.recordedAt,
  //           ftpMetric?.recordedAt,
  //           wPrimeMetric?.recordedAt,
  //         ].filter((d): d is Date => !!d) ?? []
  //       ).reduce<Date | undefined>(
  //         (max, d) => (!max || d > max ? d : max),
  //         undefined,
  //       );
  //       return {
  //         cp: cpMetric?.value ?? undefined,
  //         ftp: ftpMetric?.value ?? undefined,
  //         wPrime: wPrimeMetric?.value ?? cpMetric?.value2 ?? undefined,
  //         recordedAt,
  //       };
  //     }
  //   }
  //   // Fallback to dynamic lookup
  //   const cpMetric = await this.getUserFitnessMetric(
  //     userId,
  //     UserFitnessMetricType.CP,
  //     at,
  //     sportType,
  //   );
  //   const wPrimeMetric = await this.getUserFitnessMetric(
  //     userId,
  //     UserFitnessMetricType.W_PRIME,
  //     at,
  //     sportType,
  //   );
  //   const ftpMetric = await this.getUserFitnessMetric(
  //     userId,
  //     UserFitnessMetricType.FTP,
  //     at,
  //     sportType,
  //   );

  //   const recordedAt = (
  //     [
  //       cpMetric?.recordedAt,
  //       ftpMetric?.recordedAt,
  //       wPrimeMetric?.recordedAt,
  //     ].filter((d): d is Date => !!d) ?? []
  //   ).reduce<Date | undefined>(
  //     (max, d) => (!max || d > max ? d : max),
  //     undefined,
  //   );

  //   return {
  //     cp: cpMetric?.value ?? undefined,
  //     ftp: ftpMetric?.value ?? undefined,
  //     wPrime: wPrimeMetric?.value ?? cpMetric?.value2 ?? undefined,
  //     recordedAt,
  //   };
  // }

  /**
   * 按运动类型组合当前档案：身体指标 + 生效健身指标 + 区间偏好。
   * TODO: 暂时取 lastMetrics 是有点问题的
   */
  async getComposedUserProfile(
    userId: string,
    sport?: SportType,
    at?: Date,
    tx?: PrismaTx,
  ): Promise<UserProfileResponse | undefined> {
    if (!userId) {
      return undefined;
    }
    // 获取组合档案运动类型
    const responseSport = resolveComposedProfileSport(sport);
    // 截止时间
    const cutoff = at ?? dayjs().toDate();
    // 加载用户基本信息、身体指标、健身指标
    const [currentBase, historicalConfig, bodyMetrics, fitnessMetrics] =
      await Promise.all([
        this.users.profiles(tx).findUnique({ where: { userId } }),
        at
          ? this.analysisConfigVersions().resolveAt(userId, cutoff, tx)
          : Promise.resolve(null),
        this.loadComposedBodyMetrics(userId, cutoff, at != null, tx),
        this.loadComposedFitnessMetrics(userId, responseSport, cutoff, tx),
      ]);
    const base = historicalConfig
      ? {
          ...currentBase,
          loadSources: historicalConfig.loadSources.join(','),
          altitudeOptimizationModel: historicalConfig.altitudeOptimizationModel,
          altitudeThreshold: historicalConfig.altitudeThreshold,
          defaultVdotSource: historicalConfig.defaultVdotSource,
          vo2maxCorrectionFactor: historicalConfig.vo2maxCorrectionFactor,
          heartRateZoneModel: historicalConfig.heartRateZoneModel,
          paceZoneModel: historicalConfig.paceZoneModel,
          powerZoneModel: historicalConfig.powerZoneModel,
        }
      : currentBase;
    // 组合用户档案
    return composeUserProfile({
      sport: responseSport,
      base,
      bodyMetrics,
      fitnessMetrics,
      asOf: cutoff,
    });
  }

  /**
   * 加载用户身体指标。
   * @param userId - 用户 ID。
   * @param cutoff - 截止时间。
   * @returns 用户身体指标。
   */
  private async loadComposedBodyMetrics(
    userId: string,
    cutoff: Date,
    strictAsOf: boolean,
    tx?: PrismaTx,
  ) {
    // 身体指标类型
    const types = [...COMPOSED_BODY_METRIC_TYPES];
    const recent = await this.users.bodyMetrics(tx).findMany({
      where: {
        userId,
        type: { in: types },
        effectiveDate: { lte: cutoff },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    if (recent.length > 0 || strictAsOf) return recent;
    return this.users.bodyMetrics(tx).findMany({
      where: {
        userId,
        type: { in: types },
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  /**
   * 加载用户身体指标。
   * @param userId - 用户 ID。
   * @param cutoff - 截止时间。
   * @returns 用户身体指标。
   */
  private async loadComposedFitnessMetrics(
    userId: string,
    sport: ReturnType<typeof resolveComposedProfileSport>,
    cutoff: Date,
    tx?: PrismaTx,
  ) {
    return this.users.fitnessMetrics(tx).findMany({
      where: composedFitnessMetricWhere(userId, sport, cutoff),
      orderBy: { recordedAt: 'desc' },
      distinct: ['type', 'sport', 'source'],
    });
  }

  /**
   * 获取指定时间点（at）用户的心率阈值（MaxHR / RestHR / LTHR）
   *
   * 读取规则：
   * - 如果传了 activityId：优先读取分析时保存的 ActivityFitnessMetricsSnapshot
   *   - 适用于“查看活动当时用的指标”，保证回放/展示一致
   *   - 快照中某一项缺失时，该项继续回退到按时间点（at）向过去查询
   * - 如果不传 activityId：按 sportType + at 查询用户当时真正生效的 MANUAL/AUTO 指标
   *   - 适用于“分析/重新计算”；向过去找最近值，同一时间 MANUAL 优先
   *
   * 返回值：
   * - 找不到则返回 null；60 bpm 的版本化默认值只由 TRIMP/EPOC
   *   任务显式使用，不能进入通用 Profile、区间或阈值解析。
   */
  async getUserHeartRateThreshold(
    userId: string,
    sportType?: SportType,
    at?: Date,
    activityId?: number,
  ) {
    // 传 activityId 时优先取“活动绑定指标”，缺失字段继续向有效历史回退。
    let snapshot: {
      maxHrValue: number | null;
      restHrValue: number | null;
      lthrValue: number | null;
    } | null = null;
    if (activityId) {
      snapshot = await this.prisma.activityFitnessMetricsSnapshot.findUnique({
        where: { activityId },
        select: {
          maxHrValue: true,
          restHrValue: true,
          lthrValue: true,
        },
      });
      if (
        snapshot &&
        snapshot.maxHrValue != null &&
        snapshot.restHrValue != null &&
        snapshot.lthrValue != null
      ) {
        return {
          maxHeartRate: snapshot.maxHrValue,
          restingHeartRate: snapshot.restHrValue,
          lactateThresholdHeartRate: snapshot.lthrValue,
        };
      }
    }

    // 回退：按 sportType + at 查询用户真正生效的 MANUAL/AUTO 指标。
    const sport = sportType ?? SportType.UNKNOWN;
    const [maxHrMetric, restingHrMetric, lthrMetric] = await Promise.all([
      this.getEffectiveUserFitnessMetric(
        userId,
        UserFitnessMetricType.MAX_HR,
        at,
        sport,
      ),
      this.getEffectiveUserFitnessMetric(
        userId,
        UserFitnessMetricType.RESTING_HR,
        at,
        sport,
      ),
      this.getEffectiveUserFitnessMetric(
        userId,
        UserFitnessMetricType.LTHR,
        at,
        sport,
      ),
    ]);

    return {
      maxHeartRate: snapshot?.maxHrValue ?? maxHrMetric?.value ?? null,
      restingHeartRate: snapshot?.restHrValue ?? restingHrMetric?.value ?? null,
      lactateThresholdHeartRate:
        snapshot?.lthrValue ?? lthrMetric?.value ?? null,
    };
  }

  async updateUserProfile(userId: string, body: UpdateUserProfileRequest) {
    const changedAt = new Date();
    const previousProfile = await this.users.profiles().findUnique({
      where: { userId },
    });
    const updateData: {
      loadSources?: string | null;
      preferredSports?: string | null;
      altitudeOptimizationModel?: $Enums.AltitudeOptimizationModel;
      altitudeThreshold?: number | null;
      defaultVdotSource?: $Enums.DefaultVdotSource;
      vo2maxCorrectionFactor?: number | null;
      heartRateZoneModel?: $Enums.HeartRateZoneModel;
      paceZoneModel?: $Enums.PaceZoneModel;
      powerZoneModel?: $Enums.PowerZoneModel;
    } = {};

    if (body.loadSources !== undefined) {
      const normalized = normalizeLoadSources(
        body.loadSources.map((value) => String(value)),
      );
      updateData.loadSources =
        normalized.length > 0 ? normalized.join(',') : null;
    }
    if (body.preferredSports !== undefined) {
      const normalized = normalizePreferredSports(
        body.preferredSports.map((value) => String(value)),
      );
      updateData.preferredSports =
        normalized.length > 0 ? normalized.join(',') : null;
    }

    if (body.altitudeOptimizationModel) {
      updateData.altitudeOptimizationModel =
        body.altitudeOptimizationModel as $Enums.AltitudeOptimizationModel;
    }
    if (body.altitudeThreshold !== undefined) {
      updateData.altitudeThreshold = body.altitudeThreshold;
    }
    if (body.defaultVdotSource) {
      updateData.defaultVdotSource =
        body.defaultVdotSource === $Enums.DefaultVdotSource.STANDARD
          ? $Enums.DefaultVdotSource.STANDARD
          : $Enums.DefaultVdotSource.FACTOR;
    }
    if (body.vo2maxCorrectionFactor !== undefined) {
      if (
        typeof body.vo2maxCorrectionFactor !== 'number' ||
        !Number.isFinite(body.vo2maxCorrectionFactor) ||
        body.vo2maxCorrectionFactor <= 0 ||
        body.vo2maxCorrectionFactor > 1.2
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.invalid_vo2max_correction_factor'),
        });
      }
      updateData.vo2maxCorrectionFactor = body.vo2maxCorrectionFactor;
    }
    if (body.heartRateZoneModel) {
      updateData.heartRateZoneModel =
        body.heartRateZoneModel as $Enums.HeartRateZoneModel;
    }
    if (body.paceZoneModel) {
      updateData.paceZoneModel = body.paceZoneModel as $Enums.PaceZoneModel;
    }
    if (body.powerZoneModel) {
      updateData.powerZoneModel = body.powerZoneModel as $Enums.PowerZoneModel;
    }

    let timezoneChanged = false;
    let timezoneValue: string | null = null;
    if (body.timezone !== undefined) {
      const trimmed = String(body.timezone).trim();
      if (trimmed) {
        try {
          Intl.DateTimeFormat('en-US', { timeZone: trimmed });
        } catch {
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: this.i18n.t('common.error.invalid_timezone'),
          });
        }
        const previousTimezone = await this.getPreferredTimezone(userId);
        if (previousTimezone !== trimmed) {
          timezoneValue = trimmed;
          timezoneChanged = true;
        }
      }
    }

    const calculationProfileKeys = [
      'loadSources',
      'altitudeOptimizationModel',
      'altitudeThreshold',
      'defaultVdotSource',
      'vo2maxCorrectionFactor',
      'heartRateZoneModel',
      'paceZoneModel',
      'powerZoneModel',
    ] as const;
    const profileCalculationChanged = calculationProfileKeys.some(
      (key) =>
        key in updateData &&
        (previousProfile?.[key] ?? null) !== (updateData[key] ?? null),
    );
    await this.serializeFitnessWrite(userId, () =>
      this.runFitnessWriteTransaction(userId, async (tx) => {
        await this.users.profiles(tx).upsert({
          where: { userId },
          update: updateData,
          create: { userId, ...updateData },
        });
        if (profileCalculationChanged) {
          await this.analysisConfigVersions().recordCurrentVersion({
            userId,
            effectiveAt: changedAt,
            source: 'USER_PROFILE',
            tx,
          });
        }
        if (timezoneValue) {
          await this.users.bodyMetrics(tx).create({
            data: {
              userId,
              type: BodyMetricType.TIMEZONE,
              value: timezoneValue,
              effectiveDate: changedAt,
            },
          });
        }
      }),
    );
    if (timezoneChanged) {
      await emitUserFitnessContextChanged(
        this.events,
        new UserFitnessContextChangedEvent(
          userId,
          'BODY',
          [changedAt.getTime()],
          [BodyMetricType.TIMEZONE],
        ),
      );
    }

    return await this.getComposedUserProfile(userId, body.type);
  }

  /**
   * 获取用户的 bodyMetric 信息列表
   */
  async getUserBodyMetrics(userId: string, type: BodyMetricType) {
    const rows = await this.users.bodyMetrics().findMany({
      where: { userId, type },
      orderBy: { effectiveDate: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      effectiveDate: row.effectiveDate,
      value: row.value,
      sourceInfo: this.toSourceInfo(row),
    }));
  }
  /**
   * 获取用户的年龄和性别信息
   * @param userId
   * @param at
   * @returns
   */
  async getUserAgeGender(
    userId: string,
    at?: Date,
  ): Promise<{ age?: number; gender?: Gender }> {
    const cutoff = at ?? dayjs().toDate();
    let bodyMetrics = await this.users.bodyMetrics().findMany({
      where: {
        userId,
        type: { in: [BodyMetricType.BIRTHDAY, BodyMetricType.GENDER] },
        effectiveDate: { lte: cutoff },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    if ((!bodyMetrics || bodyMetrics.length === 0) && at == null) {
      bodyMetrics = await this.users.bodyMetrics().findMany({
        where: {
          userId,
          type: { in: [BodyMetricType.BIRTHDAY, BodyMetricType.GENDER] },
        },
        orderBy: { effectiveDate: 'desc' },
      });
    }

    const map = new Map<BodyMetricType, (typeof bodyMetrics)[number]>();
    for (const row of bodyMetrics) {
      if (!map.has(row.type)) map.set(row.type, row);
    }

    const birthDateRaw = map.get(BodyMetricType.BIRTHDAY)?.value
      ? String(map.get(BodyMetricType.BIRTHDAY)?.value)
      : undefined;
    const age =
      birthDateRaw && dayjs(birthDateRaw).isValid()
        ? dayjs().diff(dayjs(birthDateRaw), 'year')
        : undefined;

    const genderRaw = map.get(BodyMetricType.GENDER)?.value
      ? String(map.get(BodyMetricType.GENDER)?.value)
      : undefined;
    const genderUpper = genderRaw ? String(genderRaw).toUpperCase() : undefined;
    const gender =
      genderUpper === Gender.MALE || genderUpper === Gender.FEMALE
        ? (genderUpper as Gender)
        : undefined;

    return { age, gender };
  }
  /**
   * 更新用户的 bodyMetric 信息列表
   */
  async replaceUserBodyMetrics(
    userId: string,
    type: BodyMetricType,
    metrics: Array<{ effectiveDate: string; value: string }>,
  ) {
    const normalized = (metrics ?? [])
      .filter(
        (m) =>
          !!m?.effectiveDate &&
          m?.value !== undefined &&
          m?.value !== null &&
          String(m.value).trim() !== '',
      )
      .map((m) => {
        const rawValue = String(m.value);
        const value =
          type === BodyMetricType.GENDER ? rawValue.toUpperCase() : rawValue;
        return {
          effectiveDate: new Date(m.effectiveDate),
          value,
        };
      })
      .filter((m) => Number.isFinite(m.effectiveDate.getTime()));

    const existing = await this.users.bodyMetrics().findMany({
      where: { userId, type },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
      select: { effectiveDate: true, value: true },
    });
    const before = existing.map((row) => ({
      effectiveDate: row.effectiveDate.toISOString(),
      value: String(row.value),
    }));
    const after = [...normalized]
      .sort(
        (left, right) =>
          left.effectiveDate.getTime() - right.effectiveDate.getTime(),
      )
      .map((row) => ({
        effectiveDate: row.effectiveDate.toISOString(),
        value: row.value,
      }));
    if (stableStringify(before) === stableStringify(after)) return true;

    await this.prisma.$transaction(async (tx) => {
      await this.users.bodyMetrics(tx).deleteMany({
        where: { userId, type },
      });
      if (normalized.length > 0) {
        const manualOrigin = this.buildOriginWriteData(MetricSource.MANUAL, {
          changeSource: ChangeSource.USER_MANUAL,
        });
        await this.users.bodyMetrics(tx).createMany({
          data: normalized.map((m) => ({
            userId,
            type,
            value: m.value,
            effectiveDate: m.effectiveDate,
            ...manualOrigin,
          })),
        });
      }
    });
    const changedTimes = [
      ...existing.map((row) => row.effectiveDate.getTime()),
      ...normalized.map((row) => row.effectiveDate.getTime()),
    ];
    await emitUserFitnessContextChanged(
      this.events,
      new UserFitnessContextChangedEvent(userId, 'BODY', changedTimes, [type]),
    );
    return true;
  }

  /**
   * Append or correct one athlete-local day's manual weight measurement.
   *
   * Coach mutations call this inside their audit transaction. Repeated writes
   * for the same local day update the existing manual row instead of creating
   * duplicate measurements, while imported provider rows remain untouched.
   */
  async recordManualWeight(options: {
    userId: string;
    weightKg: number;
    effectiveAt: Date;
    dayStart: Date;
    dayEnd: Date;
    tx: Prisma.TransactionClient;
  }) {
    const validation = validateManualWeightKg(options.weightKg);
    if (validation.valid === false) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: `[体重校验] WEIGHT=${options.weightKg} 无效：${validation.reason}`,
      });
    }
    if (
      !Number.isFinite(options.effectiveAt.getTime()) ||
      !Number.isFinite(options.dayStart.getTime()) ||
      !Number.isFinite(options.dayEnd.getTime()) ||
      options.dayEnd <= options.dayStart ||
      options.effectiveAt < options.dayStart ||
      options.effectiveAt >= options.dayEnd
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: '[体重校验] effectiveAt 不在指定的本地自然日内',
      });
    }

    await lockFitnessUser(options.tx, options.userId);
    const weightKg = round(options.weightKg, 3);
    const existing = await this.users.bodyMetrics(options.tx).findFirst({
      where: {
        userId: options.userId,
        type: BodyMetricType.WEIGHT,
        changeSource: ChangeSource.USER_MANUAL,
        originProvider: null,
        effectiveDate: {
          gte: options.dayStart,
          lt: options.dayEnd,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        value: true,
        effectiveDate: true,
      },
    });
    const manualOrigin = this.buildOriginWriteData(MetricSource.MANUAL, {
      changeSource: ChangeSource.USER_MANUAL,
    });

    if (existing) {
      const previousValue = String(existing.value);
      const previousEffectiveAt = existing.effectiveDate;
      if (
        previousValue !== String(weightKg) ||
        previousEffectiveAt.getTime() !== options.effectiveAt.getTime()
      ) {
        await this.users.bodyMetrics(options.tx).update({
          where: { id: existing.id },
          data: {
            value: String(weightKg),
            effectiveDate: options.effectiveAt,
            ...manualOrigin,
          },
        });
      }
      const changed =
        previousValue !== String(weightKg) ||
        previousEffectiveAt.getTime() !== options.effectiveAt.getTime();
      return {
        id: existing.id,
        operation: 'update' as const,
        changed,
        previousValue,
        previousEffectiveAt,
        weightKg,
        afterCommit: changed
          ? () =>
              emitUserFitnessContextChanged(
                this.events,
                new UserFitnessContextChangedEvent(
                  options.userId,
                  'BODY',
                  [
                    previousEffectiveAt.getTime(),
                    options.effectiveAt.getTime(),
                  ],
                  [BodyMetricType.WEIGHT],
                ),
              )
          : async () => undefined,
      };
    }

    const created = await this.users.bodyMetrics(options.tx).create({
      data: {
        userId: options.userId,
        type: BodyMetricType.WEIGHT,
        value: String(weightKg),
        effectiveDate: options.effectiveAt,
        ...manualOrigin,
      },
      select: { id: true },
    });
    return {
      id: created.id,
      operation: 'create' as const,
      changed: true,
      previousValue: null,
      previousEffectiveAt: null,
      weightKg,
      afterCommit: () =>
        emitUserFitnessContextChanged(
          this.events,
          new UserFitnessContextChangedEvent(
            options.userId,
            'BODY',
            [options.effectiveAt.getTime()],
            [BodyMetricType.WEIGHT],
          ),
        ),
    };
  }

  async upsertImportedBodyMetrics(
    userId: string,
    input: {
      provider: ThirdPartyProvider;
      weight?: number | null;
      height?: number | null;
      birthdate?: string | null;
      gender?: string | null;
      effectiveAt?: Date | null;
      externalId?: string | number | null;
      rawPayload?: unknown;
    },
  ) {
    return this.upsertBodyMetricsSnapshot(userId, {
      weight: input.weight,
      height: input.height,
      birthdate: input.birthdate,
      gender: input.gender,
      effectiveAt: input.effectiveAt,
      origin: {
        changeSource: ChangeSource.SYSTEM_IMPORTED,
        originProvider: input.provider,
        originExternalId: input.externalId,
        originPayload: input.rawPayload,
      },
    });
  }

  /**
   * 由第三方资料同步写入用户体征。
   * 仅当新值与当前最新值不同才追加一条历史记录，避免重复写入。
   */
  async upsertBodyMetricsSnapshot(
    userId: string,
    input: {
      weight?: number | null;
      height?: number | null;
      birthdate?: string | null;
      gender?: string | null;
      effectiveAt?: Date | null;
      origin?: TrainingSettingOrigin;
    },
  ): Promise<BodyMetricType[]> {
    const changed: BodyMetricType[] = [];
    const effectiveDate = input.effectiveAt ?? new Date();

    const candidates: Array<{ type: BodyMetricType; value?: string }> = [];

    if (typeof input.weight === 'number' && Number.isFinite(input.weight)) {
      candidates.push({
        type: BodyMetricType.WEIGHT,
        value: String(input.weight),
      });
    }

    if (typeof input.height === 'number' && Number.isFinite(input.height)) {
      candidates.push({
        type: BodyMetricType.HEIGHT,
        value: String(input.height),
      });
    }

    if (input.birthdate) {
      const birth = dayjs(String(input.birthdate).trim());
      if (birth.isValid()) {
        candidates.push({
          type: BodyMetricType.BIRTHDAY,
          value: birth.format('YYYY-MM-DD'),
        });
      }
    }

    if (input.gender) {
      const genderUpper = String(input.gender).trim().toUpperCase();
      if (genderUpper === Gender.MALE || genderUpper === Gender.FEMALE) {
        candidates.push({
          type: BodyMetricType.GENDER,
          value: genderUpper,
        });
      }
    }

    for (const candidate of candidates) {
      if (!candidate.value) continue;
      const latest = await this.users.bodyMetrics().findFirst({
        where: {
          userId,
          type: candidate.type,
        },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          value: true,
          effectiveDate: true,
          changeSource: true,
          originProvider: true,
          originExternalId: true,
          originChecksum: true,
        },
      });

      const prev = latest?.value ? String(latest.value).trim() : '';
      const next = String(candidate.value).trim();
      const originData = this.buildOriginWriteData(MetricSource.MANUAL, {
        changeSource: ChangeSource.SYSTEM_IMPORTED,
        ...input.origin,
        originPayload: input.origin?.originPayload ?? {
          type: candidate.type,
          value: next,
          effectiveDate: effectiveDate.toISOString(),
        },
      });
      const originDiff = latest ? this.hasOriginDiff(latest, originData) : true;
      const sameDay =
        latest && dayjs(latest.effectiveDate).isSame(effectiveDate, 'day');

      if (prev === next && sameDay && latest && originDiff) {
        await this.users.bodyMetrics().update({
          where: { id: latest.id },
          data: originData,
        });
        changed.push(candidate.type);
        continue;
      }

      if (
        prev === next &&
        (!this.isExternalOrigin(input.origin) || !originDiff)
      ) {
        continue;
      }

      await this.users.bodyMetrics().create({
        data: {
          userId,
          type: candidate.type,
          value: next,
          effectiveDate,
          ...originData,
        },
      });
      changed.push(candidate.type);
    }

    if (changed.length > 0) {
      await emitUserFitnessContextChanged(
        this.events,
        new UserFitnessContextChangedEvent(
          userId,
          'BODY',
          [effectiveDate.getTime()],
          [...new Set(changed)],
        ),
      );
    }

    return changed;
  }

  /**
   * 根据选中活动校准 VO2max 指标
   * @param userId
   * @param activityHashId
   * @returns
   */
  async calibrateVo2maxFromActivity(userId: string, activityHashId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ hashId: activityHashId, userId }),
      select: {
        vo2max: {
          select: {
            vo2maxVdotByRace: true,
            vo2maxVdotByHr: true,
          },
        },
      },
    });

    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: 'Activity not found',
      });
    }

    if (!activity.vo2max?.vo2maxVdotByHr || !activity.vo2max.vo2maxVdotByRace) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          'Activity does not have both HR and race VO2max data for calibration',
      });
    }

    // Calculate new factor
    // Factor = Target (VDOT) / Base (HR-based VDOT)
    let newFactor =
      activity.vo2max.vo2maxVdotByRace / activity.vo2max.vo2maxVdotByHr;
    newFactor = Math.max(0.01, Math.min(1.2, newFactor));

    const changedAt = new Date();
    await this.serializeFitnessWrite(userId, () =>
      this.runFitnessWriteTransaction(userId, async (tx) => {
        await this.users.profiles(tx).update({
          where: { userId },
          data: {
            vo2maxCorrectionFactor: newFactor,
          },
        });
        await this.analysisConfigVersions().recordCurrentVersion({
          userId,
          effectiveAt: changedAt,
          source: 'VO2MAX_CALIBRATION',
          tx,
        });
      }),
    );

    return newFactor;
  }

  /**
   * 软删除用户的第三方活动数据和关联的活动记录
   * @param userId
   * @param provider
   * @returns
   */
  async softDeleteThirdPartyDataAndActivities(
    userId: string,
    provider: ThirdPartyProvider,
  ) {
    if (!this.activitySourceLifecycle) {
      throw new Error('ActivitySourceLifecycleService is unavailable');
    }
    return this.activitySourceLifecycle.deactivateProviderData({
      userId,
      provider,
    });
  }

  async upsertAppleHealthWeight(args: {
    userId: string;
    date: Date;
    bodyMassKg: number;
  }) {
    const existing = await this.users.bodyMetrics().findFirst({
      where: {
        userId: args.userId,
        type: BodyMetricType.WEIGHT,
        effectiveDate: args.date,
      },
      select: { id: true, value: true },
    });
    if (existing) {
      if (String(existing.value) === String(args.bodyMassKg)) return;
      await this.users.bodyMetrics().update({
        where: { id: existing.id },
        data: { value: String(args.bodyMassKg) },
      });
    } else {
      await this.users.bodyMetrics().create({
        data: {
          userId: args.userId,
          type: BodyMetricType.WEIGHT,
          value: String(args.bodyMassKg),
          effectiveDate: args.date,
        },
      });
    }
    await emitUserFitnessContextChanged(
      this.events,
      new UserFitnessContextChangedEvent(
        args.userId,
        'BODY',
        [args.date.getTime()],
        [BodyMetricType.WEIGHT],
      ),
    );
  }

  async upsertAppleHealthFitnessMetrics(args: {
    userId: string;
    date: Date;
    restingHeartRateBpm?: number;
    vo2Max?: number;
  }) {
    const write = async (type: UserFitnessMetricType, value?: number) => {
      if (typeof value !== 'number') return;
      await Promise.all(
        [MetricSource.ESTIMATED, MetricSource.AUTO].map((source) =>
          this.users.fitnessMetrics().upsert({
            where: {
              userId_type_source_sport_recordedAt: {
                userId: args.userId,
                type,
                source,
                sport: SportType.UNKNOWN,
                recordedAt: args.date,
              },
            },
            create: {
              userId: args.userId,
              type,
              source,
              sport: SportType.UNKNOWN,
              value,
              recordedAt: args.date,
            },
            update: { value },
          }),
        ),
      );
    };
    await write(UserFitnessMetricType.RESTING_HR, args.restingHeartRateBpm);
    await write(UserFitnessMetricType.VO2_MAX, args.vo2Max);
  }
}
