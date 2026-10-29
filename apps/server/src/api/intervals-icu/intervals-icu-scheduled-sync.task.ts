import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { IntervalsIcuService } from './intervals-icu.service';
import type {
  ThirdPartyScheduleContext,
  ThirdPartyScheduledTask,
} from '@/third-party-scheduler/third-party-scheduled-task';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

/**
 * 由统一 scheduler 认领到期连接，按用户本地「昨天」排队活动/wellness 同步。
 * 计划课滚动由另一 task 处理，但两者共用相同执行策略。
 */
@Injectable()
export class IntervalsIcuScheduledSyncTask implements ThirdPartyScheduledTask {
  readonly name = 'intervals-icu-scheduled-sync';
  private readonly logger = new Logger(IntervalsIcuScheduledSyncTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intervalsIcuService: IntervalsIcuService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  /** 由统一第三方 scheduler 下发执行。 */
  async run(context: ThirdPartyScheduleContext) {
    if (this.capabilities?.isEnabled('intervals-icu-api-key') === false) return;
    await this.syncDueConnections(context);
  }

  /**
   * SKIP LOCKED 认领到期 ACTIVE 连接：已过本地起始小时、今日尚未完成、且开启定时活动或 wellness。
   */
  private async claimDueConnections(context: ThirdPartyScheduleContext) {
    // 此任务只认领活动/健康数据同步；计划滚动由当地时间午夜的独立任务负责。
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        provider: string;
        external_athlete_id: string | null;
        credential_ciphertext: string;
        credential_last4: string | null;
        status: string;
        last_sync_started_at: Date | null;
        last_sync_completed_at: Date | null;
        last_synced_activity_at: Date | null;
        sync_activities: boolean;
        sync_scheduled_activities: boolean;
        sync_wellness: boolean;
        export_activities: boolean;
        export_wellness: boolean;
        sync_sport_settings: boolean;
        last_error: string | null;
        metadata: unknown;
        timezone: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `
      WITH latest_timezone AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          value_text AS timezone
        FROM t_user_body_metric
        WHERE type = 'TIMEZONE'
        ORDER BY user_id, effective_date DESC, created_at DESC
      ),
      picked AS (
        SELECT c.id, COALESCE(valid_tz.name, 'UTC') AS timezone
        FROM t_external_provider_connection c
        LEFT JOIN latest_timezone tz ON tz.user_id = c.user_id
        LEFT JOIN pg_timezone_names valid_tz ON valid_tz.name = tz.timezone
        WHERE c.provider = 'intervals_icu'::enum_third_party_provider
          AND c.status = 'ACTIVE'
          AND (
            $4::boolean
            OR LOWER(COALESCE(c.metadata->>'authType', 'api_key')) <> 'oauth'
          )
          AND (
            c.sync_scheduled_activities = TRUE
            OR c.sync_wellness = TRUE
          )
          AND COALESCE(c.credential_ciphertext, '') <> ''
          AND EXTRACT(
            HOUR FROM (NOW() AT TIME ZONE COALESCE(valid_tz.name, 'UTC'))
          )::int >= $1
          AND (
            c.last_sync_completed_at IS NULL
            OR (
              c.last_sync_completed_at
              AT TIME ZONE COALESCE(valid_tz.name, 'UTC')
            )::date
              < (NOW() AT TIME ZONE COALESCE(valid_tz.name, 'UTC'))::date
          )
          AND (
            c.last_sync_started_at IS NULL
            OR c.last_sync_started_at <= NOW() - ($2::text)::interval
          )
        ORDER BY COALESCE(c.last_sync_completed_at, c.created_at) ASC
        LIMIT $3
        FOR UPDATE OF c SKIP LOCKED
      )
      UPDATE t_external_provider_connection c
      SET last_sync_started_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
      FROM picked
      WHERE c.id = picked.id
      RETURNING
        c.id,
        c.user_id,
        c.provider::text AS provider,
        c.external_athlete_id,
        c.credential_ciphertext,
        c.credential_last4,
        c.status,
        c.last_sync_started_at,
        c.last_sync_completed_at,
        c.last_synced_activity_at,
        c.sync_activities,
        c.sync_scheduled_activities,
        c.sync_wellness,
        c.export_activities,
        c.export_wellness,
        c.sync_sport_settings,
        c.last_error,
        c.metadata,
        picked.timezone,
        c.created_at,
        c.updated_at;
      `,
      context.startHourLocal,
      `${context.staleStartedMinutes} minutes`,
      context.batchSize,
      this.capabilities?.isEnabled('third-party-sync') ?? true,
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      externalAthleteId: row.external_athlete_id,
      credentialCiphertext: row.credential_ciphertext,
      credentialLast4: row.credential_last4,
      status: row.status,
      lastSyncStartedAt: row.last_sync_started_at,
      lastSyncCompletedAt: row.last_sync_completed_at,
      lastSyncedActivityAt: row.last_synced_activity_at,
      syncActivities: row.sync_activities,
      syncScheduledActivities: row.sync_scheduled_activities,
      syncWellness: row.sync_wellness,
      exportActivities: row.export_activities,
      exportWellness: row.export_wellness,
      syncSportSettings: row.sync_sport_settings,
      lastError: row.last_error,
      metadata: row.metadata,
      timezone: row.timezone ?? 'UTC',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /** 对认领到的连接逐个调用 syncConnectionLatest。 */
  private async syncDueConnections(context: ThirdPartyScheduleContext) {
    const connections = await this.claimDueConnections(context);
    // 如果没有任何连接，则直接返回
    if (!connections.length) {
      this.logger.debug('[Intervals.icu][定时同步] 没有需要同步的连接');
      return;
    }

    this.logger.log(
      `[Intervals.icu][定时同步] 已认领 ${connections.length} 个到期连接`,
    );

    for (const connection of connections) {
      try {
        // 同步连接最新数据
        const result = await this.intervalsIcuService.syncConnectionLatest({
          connection,
          reason: 'scheduled',
          timezone: connection.timezone,
        });
        this.logger.log(
          `[Intervals.icu][定时同步] 已排队用户本地昨天的同步：连接=${connection.id} 用户=${connection.userId} 时区=${connection.timezone ?? 'UTC'} 同步窗口=${result.window?.oldest ?? '未知'} 已获取=${result.totalFetched ?? 0} 已入队=${result.queuedCount ?? 0}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[Intervals.icu][定时同步] 同步失败：连接=${connection.id} 用户=${connection.userId}，原因：${message}`,
        );
      }
    }
  }
}
