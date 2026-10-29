import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import type { PrismaClientSlice } from '@/prisma/prisma-db';
import { ConfigService } from '@nestjs/config';
import {
  ThirdPartyProvider,
  type ExternalProviderConnection,
} from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportBatchService } from '@/importing/import-batch.service';
import { HealthDataIngestService } from '@/health-data/health-data-ingest.service';
import {
  IntervalsIcuClient,
  type IntervalsIcuActivityListItem,
  type IntervalsIcuWellness,
} from '@/integrations/intervals-icu/intervals-icu.client';
import { IntervalsIcuCredentialService } from '@/integrations/intervals-icu/intervals-icu-credential.service';
import { UserService } from '@/api/user/user.service';
import { mapIntervalsIcuFitnessRecordsToMetricWrites } from './intervals-icu-fitness.mapper';
import {
  dateKeyFromWellness,
  intervalsIcuWellnessPatchMetricTypes,
  mapIntervalsIcuWellnessToHealthCandidates,
} from './intervals-icu-health.mapper';
import { mapIntervalsIcuAthleteToSportSettingsMetrics } from './intervals-icu-sport-settings.mapper';
import { IntervalsIcuPlanSyncService } from './intervals-icu-plan-sync.service';
import { ExternalProviderWebhookInboxService } from '@/integrations/external-provider/external-provider-webhook-inbox.service';
import { importJsonValue } from '@/importing/import-item-job.types';
import { ActivitySourceLifecycleService } from '@/sync/activity-source-lifecycle.service';

/** Intervals.icu 推送的顶层 payload（含 shared secret）。 */
export type IntervalsIcuWebhookPayload = {
  secret?: string;
  events?: IntervalsIcuWebhookEvent[];
};

/** 单条 webhook 事件；字段随 type 变化（activity / records / calendar events）。 */
export type IntervalsIcuWebhookEvent = {
  athlete_id?: string;
  type?: string;
  timestamp?: string;
  records?: IntervalsIcuWellness[];
  activity?: IntervalsIcuActivityListItem;
  events?: Array<Record<string, unknown>>;
  deleted_events?: Array<Record<string, unknown> | string | number>;
  [key: string]: unknown;
};

/** 写入 fitness/健康 rawPayload 的来源标记。 */
const INTERVALS_ICU_WEBHOOK_ORIGIN = {
  source: 'intervals_icu',
  trigger: 'webhook',
} as const;

/** athlete_id 可能带或不带 `i` 前缀，生成两边都查的变体。 */
function athleteIdVariants(raw: string) {
  const trimmed = raw.trim();
  const variants = new Set<string>();
  if (!trimmed) return [];
  variants.add(trimmed);
  if (trimmed.startsWith('i')) {
    variants.add(trimmed.slice(1));
  } else if (/^\d+$/.test(trimmed)) {
    variants.add(`i${trimmed}`);
  }
  return [...variants];
}

/** 从 activity 对象或顶层字段提取远端活动 id。 */
function extractActivityExternalId(event: IntervalsIcuWebhookEvent) {
  const activity = event.activity;
  if (activity && typeof activity === 'object') {
    const id = activity.id ?? activity.activity_id ?? activity.activityId;
    if (id != null && id !== '') return String(id);
  }
  const topLevelId = event.activity_id ?? event.object_id;
  if (topLevelId != null && topLevelId !== '') return String(topLevelId);
  return null;
}

/** constant-time 比较 webhook secret；不匹配抛 401。 */
const verifySecret = (provided: string, expected: string) => {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new UnauthorizedException('Intervals.icu webhook secret 无效');
  }
};

/** 处理 Intervals.icu webhook 事件（验签后由 controller 异步调用）。 */
@Injectable()
export class IntervalsIcuWebhookService {
  private readonly logger = new Logger(IntervalsIcuWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly importBatchService: ImportBatchService,
    private readonly healthDataIngest: HealthDataIngestService,
    private readonly intervalsIcuPlanSync: IntervalsIcuPlanSyncService,
    private readonly intervalsIcuClient: IntervalsIcuClient,
    private readonly intervalsIcuCredentials: IntervalsIcuCredentialService,
    private readonly userService: UserService,
    private readonly inbox: ExternalProviderWebhookInboxService,
    private readonly providerConnections: ExternalProviderConnectionService,
    @Optional()
    private readonly activitySourceLifecycle?: ActivitySourceLifecycleService,
  ) {}


  /** 用配置的 `INTERVALS_ICU_WEBHOOK_SECRET` 校验 payload.secret。 */
  verifyPayloadSecret(payload: IntervalsIcuWebhookPayload) {
    const expectedSecret = (
      this.configService.get<string>('intervalsIcu.webhook.secret') ?? ''
    ).trim();
    const providedSecret = String(payload?.secret ?? '').trim();

    if (!expectedSecret) {
      throw new UnauthorizedException(
        '缺少 INTERVALS_ICU_WEBHOOK_SECRET 配置，无法校验 webhook',
      );
    }
    if (!providedSecret) {
      throw new UnauthorizedException('缺少 webhook secret');
    }
    verifySecret(providedSecret, expectedSecret);
  }

  /**
   * 验签并持久化后快速返回；实际业务由 worker 幂等处理。
   * @param payload Intervals.icu webhook payload
   * @returns
   */
  async enqueue(payload: IntervalsIcuWebhookPayload) {
    this.verifyPayloadSecret(payload);
    const events = Array.isArray(payload.events) ? payload.events : [];
    let acceptedCount = 0;
    let duplicateCount = 0;
    for (const event of events) {
      const eventType = String(event.type ?? 'UNKNOWN').trim() || 'UNKNOWN';
      const athleteId = String(event.athlete_id ?? '').trim() || null;
      const checksum = this.inbox.checksum(JSON.stringify(event));
      const remoteId =
        extractActivityExternalId(event) ??
        String(event.id ?? event.timestamp ?? '').trim();
      const dedupeKey = [
        eventType,
        athleteId ?? 'unknown',
        remoteId || checksum,
      ].join(':');
      const queued = await this.inbox.enqueue({
        provider: ThirdPartyProvider.intervals_icu,
        eventType,
        externalUserId: athleteId,
        dedupeKey,
        rawChecksum: checksum,
        payload: importJsonValue(event),
      });
      if (queued?.enqueued !== false) acceptedCount += 1;
      else duplicateCount += 1;
    }
    return {
      accepted: true,
      receivedCount: events.length,
      acceptedCount,
      duplicateCount,
    };
  }

  /** 处理单条 durable inbox 事件，并返回明确的终态语义。 */
  processEvent(event: IntervalsIcuWebhookEvent) {
    return this.handleEvent(event);
  }

  /** 按 type 分发：wellness / activity / fitness / calendar / sport settings。 */
  private async handleEvent(event: IntervalsIcuWebhookEvent) {
    // 1. 校验 event 类型和 athlete_id
    const eventType = String(event.type ?? '').trim();
    const athleteId = String(event.athlete_id ?? '').trim();
    if (!eventType) {
      this.logger.warn('[handleEvent] 忽略缺少 type 的 webhook 事件');
      return 'IGNORED' as const;
    }
    if (!athleteId) {
      this.logger.warn(
        `[handleEvent] 忽略缺少 athlete_id 的 webhook 事件 type=${eventType}`,
      );
      return 'IGNORED' as const;
    }

    const connection = await this.findConnectionByAthleteId(athleteId);
    if (!connection) {
      this.logger.warn(
        `[handleEvent] 未找到 Intervals.icu 连接 athlete_id=${athleteId} type=${eventType}`,
      );
      return 'IGNORED' as const;
    }
    // 2. 根据 event 类型执行不同的处理逻辑
    switch (eventType) {
      case 'WELLNESS_UPDATED':
        return this.handleWellnessUpdated(connection, event);
      case 'ACTIVITY_UPLOADED':
        return this.handleActivityEvent(connection, event, eventType);
      case 'ACTIVITY_DELETED':
        return this.handleActivityDeleted(connection, event);
      case 'FITNESS_UPDATED':
        return this.handleFitnessUpdated(connection, event);
      case 'CALENDAR_UPDATED':
        return this.handleCalendarUpdated(connection, event);
      case 'SPORT_SETTINGS_UPDATED':
        return this.handleSportSettingsUpdated(connection, event);
      default:
        this.logger.debug(
          `[handleEvent] 忽略未处理的 Intervals.icu webhook 类型=${eventType} userId=${connection.userId}`,
        );
        return 'IGNORED' as const;
    }
  }

  /** 按 athlete_id 变体查找 ACTIVE 连接。 */
  private async findConnectionByAthleteId(athleteId: string) {
    const variants = athleteIdVariants(athleteId);
    if (!variants.length) return null;
    return await this.providerConnections.model().findFirst({
      where: {
        provider: 'intervals_icu',
        status: 'ACTIVE',
        externalAthleteId: { in: variants },
      },
    });
  }
  /** WELLNESS_UPDATED → 健康管道。 */
  private async handleWellnessUpdated(
    connection: ExternalProviderConnection,
    event: IntervalsIcuWebhookEvent,
  ) {
    if (connection.syncWellness !== true) {
      this.logger.log(
        `[intervals_icu wellness] 用户未开启 wellness 同步,跳过 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }
    // 2. 提取 records
    const records = Array.isArray(event.records) ? event.records : [];
    if (!records.length) {
      this.logger.warn(
        `[intervals_icu wellness] WELLNESS_UPDATED 无 records userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }
    // 3. 将 records 转换为 health candidates
    let sampleCount = 0;
    let replacedDays = 0;
    for (const record of records) {
      const dateKey = dateKeyFromWellness(record);
      if (!dateKey) continue;
      const candidates = mapIntervalsIcuWellnessToHealthCandidates({
        externalAthleteId: connection.externalAthleteId,
        connectionId: connection.id,
        record,
      });
      const managedMetricTypes = intervalsIcuWellnessPatchMetricTypes(record);
      if (managedMetricTypes.length === 0) continue;
      await this.healthDataIngest.replaceProviderDailyCandidates({
        userId: connection.userId,
        provider: 'INTERVALS_ICU',
        connectionId: connection.id,
        localDate: new Date(`${dateKey}T00:00:00.000Z`),
        managedMetricTypes,
        candidates: candidates.filter((candidate) =>
          managedMetricTypes.includes(candidate.metricType),
        ),
      });
      sampleCount += candidates.length;
      replacedDays += 1;
    }
    if (replacedDays === 0) {
      this.logger.log(
        `[intervals_icu wellness] 无有效日期的 wellness 记录 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }
    this.logger.log(
      `[intervals_icu wellness] 已替换 wellness userId=${connection.userId} records=${records.length} days=${replacedDays} samples=${sampleCount}`,
    );
    return 'DONE' as const;
  }

  /** ACTIVITY_UPLOADED → 创建统一 import batch。 */
  private async handleActivityEvent(
    connection: ExternalProviderConnection,
    event: IntervalsIcuWebhookEvent,
    eventType: string,
  ) {
    // 1. 校验用户是否开启自动活动导入
    if (connection.syncScheduledActivities !== true) {
      this.logger.log(
        `[intervals_icu activity] 用户未开启自动活动导入 userId=${connection.userId} type=${eventType}`,
      );
      return 'IGNORED' as const;
    }

    // 2. 校验 activity 是否存在
    const activity = event.activity;
    if (!activity || typeof activity !== 'object') {
      this.logger.warn(
        `[intervals_icu activity] ${eventType} 缺少 activity userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }
    // 3. 创建导入批次
    const result = await this.importBatchService.createIntervalsIcuImportBatch({
      userId: connection.userId,
      connectionId: connection.id,
      activities: [activity],
      reason: 'webhook',
    });
    this.logger.log(
      `[intervals_icu activity] ${eventType} userId=${connection.userId} activityId=${String(activity.id ?? 'unknown')} queued=${result.queuedCount} skipped=${result.skippedCount}`,
    );
    return 'DONE' as const;
  }

  /** CALENDAR_UPDATED → 计划课增量同步。 */
  private async handleCalendarUpdated(
    connection: ExternalProviderConnection,
    event: IntervalsIcuWebhookEvent,
  ) {
    // 1. 过滤掉非对象的元素
    const calendarEvents = Array.isArray(event.events)
      ? event.events.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object',
        )
      : [];
    // 2. 过滤掉非对象的元素
    const deletedEvents = Array.isArray(event.deleted_events)
      ? event.deleted_events
      : [];

    const result = await this.intervalsIcuPlanSync.handleCalendarWebhookEvent({
      userId: connection.userId,
      connection,
      calendarEvents,
      deletedEvents,
    });
    this.logger.log(
      `[intervals_icu calendar] 用户=${connection.userId} 导入=${result.imported} 删除=${result.deleted} 失败=${result.failed} 计划课待处理=${result.workoutDocPending ?? 0}`,
    );
    return result.skipped ? ('IGNORED' as const) : ('DONE' as const);
  }

  /** ACTIVITY_DELETED → 软删除统一活动记录。 */
  private async handleActivityDeleted(
    connection: ExternalProviderConnection,
    event: IntervalsIcuWebhookEvent,
  ) {
    if (connection.syncScheduledActivities !== true) {
      this.logger.log(
        `[intervals_icu activity] 用户未开启自动活动导入 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }
    // 2. 提取 activity externalId
    const externalId = extractActivityExternalId(event);
    if (!externalId) {
      this.logger.warn(
        `[intervals_icu activity] 缺少 activity id userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }

    // 3. 软删除 activity
    const result = await this.softDeleteActivityByExternalId(
      connection.userId,
      externalId,
    );
    this.logger.log(
      `[intervals_icu activity] 用户=${connection.userId} 外部ID=${externalId} 第三方活动=${result.thirdPartyActivities} 活动=${result.activities}`,
    );
    return 'DONE' as const;
  }

  /**
   * 按 externalId 软删除：第三方活动状态为 1，
   * 映射失活，关联活动状态为 0。
   * @param userId 用户 ID
   * @param externalId 第三方活动 ID
   * @returns 删除结果
   */
  private async softDeleteActivityByExternalId(
    userId: string,
    externalId: string,
  ) {
    const thirdPartyActivity = await this.prisma.thirdPartyActivity.findFirst({
      where: {
        userId,
        provider: ThirdPartyProvider.intervals_icu,
        externalId,
        state: 1,
      },
      select: { id: true },
    });
    if (!thirdPartyActivity) {
      return { thirdPartyActivities: 0, activities: 0 };
    }

    if (!this.activitySourceLifecycle) {
      throw new Error('ActivitySourceLifecycleService is unavailable');
    }
    return this.activitySourceLifecycle.deactivateProviderData({
      userId,
      provider: ThirdPartyProvider.intervals_icu,
      thirdPartyActivityIds: [thirdPartyActivity.id],
      externalIds: [externalId],
    });
  }

  /** FITNESS_UPDATED → 写入 fitness metrics。 */
  private async handleFitnessUpdated(
    connection: ExternalProviderConnection,
    event: IntervalsIcuWebhookEvent,
  ) {
    if (connection.syncSportSettings !== true) {
      this.logger.log(
        `[intervals_icu fitness] 用户未开启运动设置同步 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }

    const records = Array.isArray(event.records) ? event.records : [];
    if (!records.length) {
      this.logger.warn(
        `[intervals_icu fitness] FITNESS_UPDATED 无 records userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }

    // 4. 将 records 转换为 fitness 指标
    const writes = mapIntervalsIcuFitnessRecordsToMetricWrites({
      externalAthleteId: connection.externalAthleteId,
      records,
    });
    if (!writes.length) {
      this.logger.log(
        `[intervals_icu fitness] 无可写入的 fitness 指标 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }

    // 写入 fitness 指标
    let written = 0;
    for (const write of writes) {
      const saved = await this.userService.upsertImportedFitnessMetric({
        userId: connection.userId,
        provider: ThirdPartyProvider.intervals_icu,
        type: write.type,
        value: write.value,
        sportType: write.sport,
        value2: write.value2,
        recordedAt: write.recordedAt,
        externalId: write.externalId,
        rawPayload: {
          ...INTERVALS_ICU_WEBHOOK_ORIGIN,
          eventType: 'FITNESS_UPDATED',
          record: write,
        },
      });
      if (saved) written += 1;
    }

    this.logger.log(
      `[intervals_icu fitness] 已写入 fitness 指标 userId=${connection.userId} records=${records.length} metrics=${written}`,
    );
    return 'DONE' as const;
  }

  /**
   * SPORT_SETTINGS_UPDATED：再拉 athlete，映射正式运动设置并 upsert。
   * 需开启 syncSportSettings。
   */
  private async handleSportSettingsUpdated(
    connection: ExternalProviderConnection,
    event: IntervalsIcuWebhookEvent,
  ) {
    if (connection.syncSportSettings !== true) {
      this.logger.log(
        `[intervals_icu sport settings] 用户未开启运动设置同步 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }

    if (!connection.credentialCiphertext) {
      this.logger.warn(
        `[intervals_icu sport settings] 缺少 Intervals.icu 凭证 userId=${connection.userId}`,
      );
      return 'IGNORED' as const;
    }

    try {
      const credential =
        this.intervalsIcuCredentials.resolveConnectionCredential(connection);
      const athlete = await this.intervalsIcuClient.getAthlete(credential);
      const writes = mapIntervalsIcuAthleteToSportSettingsMetrics(athlete);
      if (!writes.length) {
        this.logger.log(
          `[intervals_icu sport settings] 远端 athlete 无可同步的运动设置 userId=${connection.userId}`,
        );
        return 'IGNORED' as const;
      }

      const recordedAt = new Date();
      let written = 0;
      for (const write of writes) {
        const saved = await this.userService.upsertImportedFitnessMetric({
          userId: connection.userId,
          provider: ThirdPartyProvider.intervals_icu,
          type: write.type,
          value: write.value,
          sportType: write.sport,
          value2: write.value2,
          recordedAt,
          externalId: `sport-settings:${write.type}:${write.sport}`,
          rawPayload: {
            ...INTERVALS_ICU_WEBHOOK_ORIGIN,
            eventType: 'SPORT_SETTINGS_UPDATED',
            athlete,
          },
        });
        if (saved) written += 1;
      }

      this.logger.log(
        `[intervals_icu sport settings] 已同步运动设置 userId=${connection.userId} athlete_id=${event.athlete_id ?? 'unknown'} metrics=${written}`,
      );
      return 'DONE' as const;
    } catch (error) {
      this.logger.error(
        `[intervals_icu sport settings] 同步运动设置失败 userId=${connection.userId}：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
