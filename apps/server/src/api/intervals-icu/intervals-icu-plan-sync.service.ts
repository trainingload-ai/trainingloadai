import { Injectable, Logger } from '@nestjs/common';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { SportCatalogService } from '@/sports/sport-catalog.service';
import type {
  ExternalProviderConnection,
  Prisma,
  SportType,
} from '@prisma/client';
import { exactSportCode, type SportFamily } from '@/sports/sport-catalog.types';
import { PrismaService } from '@/prisma/prisma.service';
import {
  IntervalsIcuApiError,
  IntervalsIcuClient,
  type IntervalsIcuEvent,
  type IntervalsIcuEventPayload,
} from '@/integrations/intervals-icu/intervals-icu.client';
import {
  IntervalsIcuCredentialService,
  type IntervalsIcuApiCredential,
} from '@/integrations/intervals-icu/intervals-icu-credential.service';
import {
  intervalsIcuMetadataJson,
  intervalsIcuMetadataOf,
  intervalsIcuPlanSyncOf,
  type IntervalsIcuPlanSyncMetadata,
} from '@/integrations/intervals-icu/intervals-icu-metadata';
import { WorkoutService, type PlanBlock } from '@/api/workout/workout.service';
import { PlanExternalSyncService } from '@/api/plan/application/plan-external-sync.service';
import {
  THIRD_PARTY_ERRORS,
  thirdPartyError,
} from '@/integrations/external-provider/external-provider-errors';
import {
  jsonSafe,
  normalizeWorkoutBlocks,
  syncChecksum as computeSyncChecksum,
} from './intervals-icu-workout-checksum.util';

/** 计划同步入口与内部步骤实际依赖的最小 connection 形状。 */
export type IntervalsIcuPlanConnection = Pick<
  ExternalProviderConnection,
  'id'
> &
  Partial<
    Pick<
      ExternalProviderConnection,
      | 'userId'
      | 'status'
      | 'credentialCiphertext'
      | 'metadata'
      | 'externalAthleteId'
    >
  >;
import {
  mapIntervalsSportType,
  parseIntervalsIcuCalendarEvent,
} from './intervals-icu-workout-doc.mapper';
import { IntervalsIcuPlanSyncLock } from './intervals-icu-plan-sync-lock.service';
import {
  decidePlanSyncDeletion,
  planSyncChecksum,
  planSyncMetadata,
} from './intervals-icu-plan-sync-state';

const PROVIDER = 'intervals_icu';
// 我们上传到 Intervals.icu 的计划课都带这个 external_id。
// 同步回来时用它直接找回本地 PlanWorkout，避免重复创建。
const TRAININGLOAD_EXTERNAL_KEY_PREFIX = 'trainingload.ai:plan_workout:';
const TRAININGLOAD_UID_SUFFIX = '@trainingload.ai';
// 早期实现会把远端课程放到系统计划容器里；现在改成独立课程。
// 这个前缀只用于兼容旧数据，遇到旧容器课程时会迁回 independent workout。
const REMOTE_PLAN_GOAL_PREFIX = 'intervals_icu_calendar:';
const DEFAULT_WEEK_DAYS = 7;
// 凌晨计划课同步看「昨天 + 未来 7 天」：既能捕捉昨天移动/删除，也不会扫太远。
const SCHEDULED_LOOKBACK_DAYS = 1;
const SCHEDULED_LOOKAHEAD_DAYS = 7;

/** 计划课同步触发来源。 */
type SyncTrigger = 'initial' | 'manual' | 'scheduled' | 'webhook';

/** connection.metadata.planSync 里的双向开关。 */
type PlanSyncFlags = {
  syncPlannedWorkouts: boolean;
  exportPlannedWorkouts: boolean;
};

/** 同步日期窗口（YYYY-MM-DD）。 */
type WeekWindow = {
  oldest: string;
  newest: string;
};

/** 下行（远端→本地）计数。 */
type PlanSyncCounters = {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicted: number;
  skipped: number;
  failed: number;
  remoteDeleted: number;
};

/** 上行（本地→远端）计数。 */
type ExportCounters = {
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicted: number;
  skipped: number;
  failed: number;
  deleted: number;
};

/** 解析后的远端计划课，带 content/sync 两套 checksum。 */
type ParsedRemoteWorkout = {
  scheduledDate: string;
  sportType: SportType;
  sportDefinitionCode: string;
  name: string | null;
  notes: string | null;
  text: string;
  blocks: PlanBlock[];
  /** 双向 sync 冲突检测 */
  checksum: string;
};

/** 两位数补零。 */
function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/** Date → `YYYY-MM-DD`（按 UTC 年月日）。 */
function ymd(date: Date) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('-');
}

/** Intervals.icu 本地日起始字符串 `YYYY-MM-DDT00:00:00`。 */
function startOfLocalDay(date: Date) {
  return `${ymd(date)}T00:00:00`;
}

/** 解析 `YYYY-MM-DD`，非法则抛业务错误。 */
function parseYmd(value: string) {
  const normalized = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw thirdPartyError(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.INVALID_PLANNED_WORKOUT_SYNC_DATE,
    );
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw thirdPartyError(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.INVALID_PLANNED_WORKOUT_SYNC_DATE,
    );
  }
  return date;
}

/** UTC 日期加减天数。 */
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** 两日期间整天差。 */
function diffDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

/** 今天的 UTC 0 点。 */
function currentUtcDay(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** 用户时区下的「今天」日历日（失败回退 UTC）。 */
function currentDayForTimezone(timezone?: string | null, now = new Date()) {
  const timeZone =
    typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return parseYmd(`${values.year}-${values.month}-${values.day}`);
  } catch {
    return currentUtcDay(now);
  }
}

// 计划课同步窗口和活动同步不同：
// - 手动指定 weekStart：从该日起 7 天，方便用户重扫某一周。
// - 凌晨定时：用户本地日期的 T-1 到 T+7。
// - 其他手动/初始：今天到未来 6 天。
function resolveSyncWindow(
  trigger: SyncTrigger,
  oldest?: string | null,
  timezone?: string | null,
): WeekWindow {
  if (oldest?.trim()) {
    const start = parseYmd(oldest);
    return {
      oldest: ymd(start),
      newest: ymd(addDays(start, DEFAULT_WEEK_DAYS - 1)),
    };
  }

  const today = currentDayForTimezone(timezone);
  if (trigger === 'scheduled') {
    return {
      oldest: ymd(addDays(today, -SCHEDULED_LOOKBACK_DAYS)),
      newest: ymd(addDays(today, SCHEDULED_LOOKAHEAD_DAYS)),
    };
  }

  return {
    oldest: ymd(today),
    newest: ymd(addDays(today, DEFAULT_WEEK_DAYS - 1)),
  };
}

/** trim 后非空字符串，否则 null。 */
function cleanString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length ? text : null;
}

/** 规范化 PlanBlock 树。 */
function normalizeBlocks(blocks: PlanBlock[]) {
  return normalizeWorkoutBlocks(blocks);
}

/** 组装 ParsedRemoteWorkout，并计算两套 checksum。 */
function buildParsedRemoteWorkout(args: {
  scheduledDate: string;
  sportType: SportType;
  sportDefinitionCode: string;
  name: string | null;
  notes: string | null;
  text: string;
  blocks: PlanBlock[];
}): ParsedRemoteWorkout {
  const blocks = normalizeBlocks(args.blocks);
  return {
    ...args,
    blocks,
    checksum: computeSyncChecksum({
      scheduledDate: args.scheduledDate,
      sportType: args.sportType,
      subSportType: args.sportDefinitionCode,
      name: args.name,
      notes: args.notes,
      blocks,
    }),
  };
}

/** 我方上传用的 external_id：`trainingload.ai:plan_workout:{id}`。 */
function externalKeyForWorkout(workoutId: string) {
  return `${TRAININGLOAD_EXTERNAL_KEY_PREFIX}${workoutId}`;
}

/** 我方上传用的 uid（external_id + @trainingload.ai）。 */
function uidForWorkout(workoutId: string) {
  return `${externalKeyForWorkout(workoutId)}${TRAININGLOAD_UID_SUFFIX}`;
}

/** 是否为我方写出的 external_id。 */
function isTrainingloadExternalKey(value?: string | null) {
  return Boolean(value?.startsWith(TRAININGLOAD_EXTERNAL_KEY_PREFIX));
}

/** 从我方 external_id 反解本地 workoutId。 */
function workoutIdFromExternalKey(value?: string | null) {
  if (!isTrainingloadExternalKey(value)) return null;
  return value!.slice(TRAININGLOAD_EXTERNAL_KEY_PREFIX.length).trim() || null;
}

/** 远端日历事件 id。 */
function eventId(event: IntervalsIcuEvent) {
  return event.id == null ? null : String(event.id);
}

/** 事件本地日期（YYYY-MM-DD）。 */
function eventDate(event: IntervalsIcuEvent) {
  const value =
    cleanString(event.start_date_local) ?? cleanString(event.end_date_local);
  return value ? value.slice(0, 10) : null;
}

/** 从事件各字段里抽出 FIT base64（OpenAPI EventEx）。 */
function extractFitBase64(event: IntervalsIcuEvent) {
  const workout = event.workout ?? {};
  const candidates = [
    event.file_contents_base64,
    event.file_contents,
    workout.file_contents_base64,
    workout.file_contents,
  ];
  for (const candidate of candidates) {
    const text = cleanString(candidate);
    if (text) return text;
  }
  return null;
}

/** 事件是否带可解析的 workout_doc.steps。 */
function hasWorkoutDoc(event: IntervalsIcuEvent) {
  const doc = event.workout_doc;
  if (!doc || typeof doc !== 'object') return false;
  return Array.isArray(doc.steps) && doc.steps.length > 0;
}

/** 我方 SportType → Intervals.icu 事件 type 字符串。 */
function intervalsTypeForSport(value: string | null | undefined) {
  if (value === 'RUN') return 'Run';
  if (value === 'CYCLING') return 'Ride';
  if (value === 'SWIM') return 'Swim';
  if (value === 'STRETCHING') return 'Yoga';
  return 'Workout';
}

/** 我方 SportType → 生成 FIT 时的 sport 名。 */
function fitSportForWorkout(value: string | null | undefined) {
  if (value === 'RUN') return 'running';
  if (value === 'CYCLING') return 'cycling';
  if (value === 'SWIM') return 'swimming';
  return 'generic';
}

/** PlanWorkoutExternalMapping.metadata（审计用，非幂等主键）。 */
function mappingMetadata(args: {
  planId?: string | null;
  scheduledDate?: string | null;
  window?: WeekWindow;
  trigger?: SyncTrigger;
  remoteName?: string | null;
}) {
  // metadata 不是幂等主键，只用于审计、删除窗口过滤和 UI 展示。
  return jsonSafe({
    planId: args.planId ?? null,
    scheduledDate: args.scheduledDate ?? null,
    window: args.window ?? null,
    trigger: args.trigger ?? null,
    remoteName: args.remoteName ?? null,
  });
}

/** 是否为旧版 Intervals 系统容器计划（兼容迁移）。 */
function isRemoteManagedPlan(plan: { goal?: unknown } | null | undefined) {
  // 兼容旧的 Intervals.icu Calendar {year} 系统容器；新同步不再创建它。
  return cleanString(plan?.goal)?.startsWith(REMOTE_PLAN_GOAL_PREFIX) === true;
}

type SyncWorkout = {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
  revision?: number;
  name?: string | null;
  text?: string | null;
  notes?: string | null;
  sportType: SportType;
  sportDefinitionCode?: string | null;
  subSportType?: string | null;
  scheduledDate?: Date | null;
  sessionIndex?: number | null;
  status?: string | null;
  steps?: unknown;
  planId?: string | null;
  plan?: {
    id?: string;
    startDate?: Date | null;
    goal?: unknown;
    title?: string | null;
  } | null;
  links?: unknown[];
};

type SyncMapping = {
  id: string;
  origin?: string | null;
  externalEventId?: string | null;
  externalSourceKey?: string | null;
  externalUid?: string | null;
  metadata?: unknown;
  connectionId?: string | null;
  externalAthleteId?: string | null;
  planWorkoutId?: string | null;
  syncState?: string;
  lastLocalChecksum?: string | null;
  lastRemoteChecksum?: string | null;
  lastSyncedChecksum?: string | null;
  remoteDeletedAt?: Date | null;
  localDeletedAt?: Date | null;
  rawRemote?: unknown;
};

type SyncWeekRequest = {
  userId: string;
  connection: IntervalsIcuPlanConnection;
  apiKey?: string;
  credential?: IntervalsIcuApiCredential;
  weekStart?: string | null;
  timezone?: string | null;
  trigger: SyncTrigger;
};

type CalendarWebhookRequest = {
  userId: string;
  connection: IntervalsIcuPlanConnection;
  calendarEvents: Array<Record<string, unknown>>;
  deletedEvents: Array<Record<string, unknown> | string | number>;
};

/** 计划课双向同步：远端日历 ↔ 本地 PlanWorkout（import 优先于 export）。 */
@Injectable()
export class IntervalsIcuPlanSyncService {
  private readonly logger = new Logger(IntervalsIcuPlanSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intervalsIcuClient: IntervalsIcuClient,
    private readonly intervalsIcuCredentials: IntervalsIcuCredentialService,
    private readonly workoutService: WorkoutService,
    private readonly sportCatalog: SportCatalogService,
    private readonly planSync: PlanExternalSyncService,
    private readonly providerConnections: ExternalProviderConnectionService,
    private readonly syncLock: IntervalsIcuPlanSyncLock,
  ) {}

  /** 从 connection.metadata.planSync 读取计划课双向开关。 */
  getPlanSyncFlags(connection: { metadata?: unknown } | null): PlanSyncFlags {
    const planSync = intervalsIcuPlanSyncOf(connection);
    return {
      syncPlannedWorkouts: planSync.syncPlannedWorkouts === true,
      exportPlannedWorkouts: planSync.exportPlannedWorkouts === true,
    };
  }

  /**
   * 单连接一周（或指定窗口）计划课同步：先 import 再 export，便于正确判冲突。
   */
  async syncConnectionWeek(args: SyncWeekRequest) {
    return this.syncLock.run(args.connection.id, () =>
      this.syncConnectionWeekUnlocked(args),
    );
  }

  private async syncConnectionWeekUnlocked(args: SyncWeekRequest) {
    // 单次计划课同步的顺序固定：先 import 再 export。
    // 这样如果远端刚改过，本地会先看到最新版本，随后 export 阶段才能正确判断冲突。
    const connection = args.connection;
    if (!connection || connection.status !== 'ACTIVE') {
      throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED);
    }
    const flags = this.getPlanSyncFlags(connection);
    const enabled = flags.syncPlannedWorkouts || flags.exportPlannedWorkouts;
    const window = resolveSyncWindow(
      args.trigger,
      args.weekStart,
      args.timezone,
    );
    if (!enabled) {
      return {
        enabled: false,
        window,
        import: null,
        export: null,
      };
    }

    if (!args.apiKey && !args.credential && !connection.credentialCiphertext) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.CREDENTIAL_MISSING,
      );
    }

    const startedAt = new Date();
    await this.updateConnectionPlanSyncMetadata(connection.id, {
      lastStartedAt: startedAt.toISOString(),
      lastWindow: window,
      lastError: null,
    });

    try {
      const apiKey =
        args.credential ??
        args.apiKey ??
        this.intervalsIcuCredentials.resolveConnectionCredential({
          credentialCiphertext: connection.credentialCiphertext,
          metadata: connection.metadata,
        });

      const importResult = flags.syncPlannedWorkouts
        ? await this.importWeek({
            userId: args.userId,
            connection,
            apiKey,
            window,
            trigger: args.trigger,
          })
        : null;
      const exportResult = flags.exportPlannedWorkouts
        ? await this.exportWeek({
            userId: args.userId,
            connection,
            apiKey,
            window,
            trigger: args.trigger,
          })
        : null;

      const completedAt = new Date();
      const result = {
        enabled: true,
        window,
        import: importResult,
        export: exportResult,
        outcome:
          (importResult?.failed ?? 0) + (exportResult?.failed ?? 0) > 0
            ? 'PARTIAL_FAILURE'
            : 'SUCCESS',
      };
      await this.updateConnectionPlanSyncMetadata(connection.id, {
        lastCompletedAt: completedAt.toISOString(),
        lastWindow: window,
        lastResult: result,
        lastError:
          result.outcome === 'PARTIAL_FAILURE'
            ? 'INTERVALS_PLAN_SYNC_PARTIAL_FAILURE'
            : null,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.updateConnectionPlanSyncMetadata(connection.id, {
        lastError: message,
        lastWindow: window,
      });
      if (
        error instanceof IntervalsIcuApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        await this.providerConnections.model().update({
          where: { id: connection.id },
          data: {
            status: 'INVALID',
            lastError: message,
          },
        });
      }
      throw error;
    }
  }
  /**
   * Webhook CALENDAR_UPDATED：增量导入/删除计划课（需开启 syncPlannedWorkouts）。
   * 带 FIT 走完整导入；仅 workout_doc 的路径可能标记 pending。
   */
  async handleCalendarWebhookEvent(args: CalendarWebhookRequest) {
    return this.syncLock.run(args.connection.id, () =>
      this.handleCalendarWebhookEventUnlocked(args),
    );
  }

  private async handleCalendarWebhookEventUnlocked(
    args: CalendarWebhookRequest,
  ) {
    // 1. 获取计划同步标志
    const flags = this.getPlanSyncFlags(args.connection);
    if (!flags.syncPlannedWorkouts) {
      return {
        skipped: true,
        imported: 0,
        deleted: 0,
        failed: 0,
        workoutDocPending: 0,
      };
    }

    // 2. 解析事件
    const apiKey = this.connectionCredential(args.connection);
    const events: IntervalsIcuEvent[] = [];
    // Notifications are hints. Re-read current state so delayed updates cannot revive deletions.
    for (const hint of args.calendarEvents) {
      const id = eventId(hint);
      if (!id) continue;
      const current = await this.readRemoteEvent(apiKey, id);
      if (current) events.push(current);
      else
        await this.markRemoteEventDeletedById({
          userId: args.userId,
          remoteEventId: id,
          connection: args.connection,
        });
    }
    // 3. 解析窗口
    const window = this.resolveCalendarWebhookWindow(events);
    // 4. 初始化计数器
    let imported = 0;
    let failed = 0;
    let workoutDocPending = 0;

    // 5. 遍历事件（webhook 与 API 同步的 payload 形态不同，需分支处理）
    for (const rawEvent of events) {
      const remoteEventId = eventId(rawEvent) ?? 'unknown';

      if (extractFitBase64(rawEvent)) {
        try {
          const result = await this.importRemoteEvent({
            userId: args.userId,
            connection: args.connection,
            event: rawEvent,
            window,
            trigger: 'webhook',
          });
          imported +=
            result.created +
            result.updated +
            result.unchanged +
            result.conflicted;
          failed += result.failed;
          if (result.skipped > 0) {
            this.logger.debug(
              `[handleCalendarWebhookEvent] 跳过远端计划课 eventId=${remoteEventId} userId=${args.userId}`,
            );
          }
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `[handleCalendarWebhookEvent] 导入远端计划课失败 userId=${args.userId} eventId=${remoteEventId}：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        continue;
      }

      if (hasWorkoutDoc(rawEvent)) {
        try {
          const parsedFromDoc = await this.parseRemoteWorkoutFromDoc(rawEvent);
          if (!parsedFromDoc) {
            workoutDocPending += 1;
            this.logger.warn(
              `[handleCalendarWebhookEvent] workout_doc 解析失败 eventId=${remoteEventId} userId=${args.userId}`,
            );
            continue;
          }
          const result = await this.importParsedRemoteWorkout({
            userId: args.userId,
            connection: args.connection,
            event: rawEvent,
            parsed: parsedFromDoc,
            window,
            trigger: 'webhook',
          });
          imported +=
            result.created +
            result.updated +
            result.unchanged +
            result.conflicted;
          failed += result.failed;
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `[handleCalendarWebhookEvent] workout_doc 导入失败 userId=${args.userId} eventId=${remoteEventId}：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        continue;
      }

      this.logger.warn(
        `[handleCalendarWebhookEvent] 跳过无 FIT 且无 workout_doc 的 webhook 事件 eventId=${remoteEventId} userId=${args.userId}`,
      );
    }

    let deleted = 0;
    for (const item of args.deletedEvents) {
      const remoteEventId = this.extractDeletedEventId(item);
      if (!remoteEventId) continue;
      const current = await this.readRemoteEvent(apiKey, remoteEventId);
      if (current) continue;
      deleted += await this.markRemoteEventDeletedById({
        userId: args.userId,
        remoteEventId,
        connection: args.connection,
      });
    }

    return { skipped: false, imported, deleted, failed, workoutDocPending };
  }

  /** 根据 webhook 事件日期推一个尽量紧的补拉窗口。 */
  private resolveCalendarWebhookWindow(
    events: IntervalsIcuEvent[],
  ): WeekWindow {
    const dateKeys = events
      .map((event) => eventDate(event))
      .filter((value): value is string => Boolean(value))
      .sort();
    if (!dateKeys.length) {
      return resolveSyncWindow('manual', null, null);
    }
    return {
      oldest: dateKeys[0]!,
      newest: dateKeys[dateKeys.length - 1]!,
    };
  }

  /** 从 deleted_events 项提取远端 event id。 */
  private extractDeletedEventId(
    item: Record<string, unknown> | string | number,
  ) {
    if (typeof item === 'string' || typeof item === 'number') {
      return String(item);
    }
    if (item && typeof item === 'object') {
      const id = item.id ?? item.event_id ?? item.eventId;
      if (id == null || id === '') return null;
      return String(id);
    }
    return null;
  }

  /** A confirmed remote deletion is applied only to an unchanged local revision. */
  private async markRemoteEventDeletedById(args: {
    userId: string;
    remoteEventId: string;
    connection: IntervalsIcuPlanConnection;
  }) {
    const mapping = await this.planSync.findMapping({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        externalEventId: args.remoteEventId,
      },
    });
    if (!mapping || this.mappingIsClosed(mapping)) return 0;
    if (!this.mappingMatchesConnection(mapping, args.connection))
      throw new Error('INTERVALS_PLAN_ACCOUNT_MISMATCH');
    const local = mapping.planWorkoutId
      ? await this.findLocalWorkout(args.userId, mapping.planWorkoutId)
      : null;
    const decision = decidePlanSyncDeletion({
      exists: Boolean(local),
      currentChecksum: local
        ? this.localComparisonChecksum(local, mapping)
        : null,
      baselineChecksum: mapping.lastLocalChecksum,
    });
    const now = new Date();
    let detachedReason: string | undefined;
    if (decision === 'detach')
      detachedReason = mapping.lastLocalChecksum
        ? 'LOCAL_CHANGED'
        : 'LOCAL_BASELINE_UNKNOWN';
    if (local && !this.getPlanSyncFlags(args.connection).syncPlannedWorkouts)
      detachedReason = 'IMPORT_DISABLED';
    if (decision === 'delete' && local && !detachedReason) {
      this.syncLock.assertHeld();
      const result = await this.planSync.deleteSyncedWorkout({
        userId: args.userId,
        workoutId: local.id,
        updatedAt: local.updatedAt,
        revision: local.revision,
      });
      if (result === 'changed') detachedReason = 'LOCAL_CHANGED';
      if (result === 'protected') detachedReason = 'LOCAL_HISTORY_PROTECTED';
    }
    await this.updateMapping(mapping.id, {
      syncState: 'REMOTE_DELETED',
      remoteDeletedAt: now,
      ...(detachedReason ? {} : { localDeletedAt: now }),
      lastSeenAt: now,
      metadata: {
        ...planSyncMetadata(mapping.metadata),
        relationClosedAt: now.toISOString(),
        ...(detachedReason
          ? { detachedAt: now.toISOString(), detachedReason, survivor: 'local' }
          : {}),
      },
    });
    return 1;
  }

  private mappingIsClosed(mapping: SyncMapping): boolean {
    const metadata = planSyncMetadata(mapping.metadata);
    return Boolean(metadata.relationClosedAt || metadata.detachedAt);
  }

  private connectionCredential(connection: IntervalsIcuPlanConnection) {
    return this.intervalsIcuCredentials.resolveConnectionCredential({
      credentialCiphertext: connection.credentialCiphertext ?? '',
      metadata: connection.metadata,
    });
  }

  private mappingMatchesConnection(
    mapping: SyncMapping,
    connection: IntervalsIcuPlanConnection,
  ): boolean {
    return (
      (!mapping.connectionId || mapping.connectionId === connection.id) &&
      (!mapping.externalAthleteId ||
        !connection.externalAthleteId ||
        mapping.externalAthleteId.replace(/^i/, '') ===
          connection.externalAthleteId.replace(/^i/, ''))
    );
  }

  private localWorkoutChecksum(workout: SyncWorkout): string {
    return planSyncChecksum({
      id: workout.id,
      createdAt: workout.createdAt,
      contentChecksum: this.localContentSyncChecksum(workout),
    });
  }

  private localComparisonChecksum(
    workout: SyncWorkout,
    mapping: SyncMapping,
  ): string {
    return planSyncMetadata(mapping.metadata).syncVersion === 2
      ? this.localWorkoutChecksum(workout)
      : this.localContentSyncChecksum(workout);
  }

  private remoteWorkoutChecksum(
    event: IntervalsIcuEvent,
    parsed: ParsedRemoteWorkout,
  ): string {
    // The provider exposes no creation timestamp. Never substitute scheduling or update time.
    return planSyncChecksum({
      id: eventId(event)!,
      createdAt: null,
      contentChecksum: parsed.checksum,
    });
  }

  private remoteComparisonChecksum(
    event: IntervalsIcuEvent,
    parsed: ParsedRemoteWorkout,
    mapping: SyncMapping,
  ): string {
    return planSyncMetadata(mapping.metadata).syncVersion === 2
      ? this.remoteWorkoutChecksum(event, parsed)
      : parsed.checksum;
  }

  private async readRemoteEvent(
    apiKey: IntervalsIcuApiCredential,
    id: string,
  ): Promise<IntervalsIcuEvent | null> {
    this.syncLock.assertHeld();
    try {
      const event = await this.intervalsIcuClient.getEvent(apiKey, id);
      this.syncLock.assertHeld();
      return event;
    } catch (error) {
      if (error instanceof IntervalsIcuApiError && error.status === 404)
        return null;
      throw error;
    }
  }

  private async reconcileLocalDeletion(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey?: IntervalsIcuApiCredential;
    mapping: SyncMapping;
    event?: IntervalsIcuEvent | null;
    parsed?: ParsedRemoteWorkout;
  }): Promise<number> {
    const { mapping } = args;
    if (this.mappingIsClosed(mapping)) return 0;
    if (!this.mappingMatchesConnection(mapping, args.connection))
      throw new Error('INTERVALS_PLAN_ACCOUNT_MISMATCH');
    const apiKey = args.apiKey ?? this.connectionCredential(args.connection);
    const remote =
      args.event === undefined
        ? await this.readRemoteEvent(apiKey, mapping.externalEventId!)
        : args.event;
    const parsed = remote
      ? (args.parsed ?? (await this.parseRemoteWorkout(remote)))
      : null;
    if (remote && !parsed)
      return this.detachRemoteSurvivor(mapping, 'REMOTE_UNVERIFIABLE');
    const decision = decidePlanSyncDeletion({
      exists: Boolean(remote),
      currentChecksum:
        remote && parsed
          ? this.remoteComparisonChecksum(remote, parsed, mapping)
          : null,
      baselineChecksum: mapping.lastRemoteChecksum,
    });
    if (decision === 'delete') {
      if (!this.getPlanSyncFlags(args.connection).exportPlannedWorkouts)
        return 0;
      // Recheck immediately before destructive provider I/O.
      const latest = await this.readRemoteEvent(
        apiKey,
        mapping.externalEventId!,
      );
      const latestParsed = latest
        ? await this.parseRemoteWorkout(latest)
        : null;
      if (
        latest &&
        (!latestParsed ||
          this.remoteComparisonChecksum(latest, latestParsed, mapping) !==
            mapping.lastRemoteChecksum)
      ) {
        return this.detachRemoteSurvivor(mapping);
      }
      if (latest) {
        this.syncLock.assertHeld();
        try {
          await this.intervalsIcuClient.deleteEvent(
            apiKey,
            mapping.externalEventId!,
          );
        } catch (error) {
          if (!(error instanceof IntervalsIcuApiError && error.status === 404))
            throw error;
        }
      }
    } else if (decision === 'detach') {
      return this.detachRemoteSurvivor(
        mapping,
        mapping.lastRemoteChecksum
          ? 'REMOTE_CHANGED'
          : 'REMOTE_BASELINE_UNKNOWN',
      );
    }
    const now = new Date();
    await this.updateMapping(mapping.id, {
      syncState: 'LOCAL_DELETED',
      localDeletedAt: now,
      remoteDeletedAt: now,
      lastPushedAt: now,
      metadata: {
        ...planSyncMetadata(mapping.metadata),
        relationClosedAt: now.toISOString(),
      },
    });
    return decision === 'delete' ? 1 : 0;
  }

  private async detachRemoteSurvivor(
    mapping: SyncMapping,
    reason = 'REMOTE_CHANGED',
  ): Promise<number> {
    const now = new Date();
    await this.updateMapping(mapping.id, {
      syncState: 'LOCAL_DELETED',
      localDeletedAt: mapping.localDeletedAt ?? now,
      metadata: {
        ...planSyncMetadata(mapping.metadata),
        relationClosedAt: now.toISOString(),
        detachedAt: now.toISOString(),
        detachedReason: reason,
        survivor: 'remote',
      },
    });
    return 0;
  }

  /** 回写 connection.metadata.planSync 的最近窗口/错误等。 */
  private async updateConnectionPlanSyncMetadata(
    connectionId: string,
    patch: Partial<IntervalsIcuPlanSyncMetadata>,
  ) {
    // 计划同步状态放在 connection.metadata.planSync，避免给连接表继续膨胀字段。
    const connection = await this.providerConnections.model().findUnique({
      where: { id: connectionId },
      select: { metadata: true },
    });
    const metadata = intervalsIcuMetadataOf(connection);
    const planSync = intervalsIcuPlanSyncOf(metadata);
    await this.providerConnections.model().update({
      where: { id: connectionId },
      data: {
        metadata: intervalsIcuMetadataJson({
          ...metadata,
          planSync: {
            ...planSync,
            ...patch,
          },
        }),
      },
    });
  }

  /** 下行：拉取窗口内 WORKOUT 事件并导入本地。 */
  private async importWeek(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey: IntervalsIcuApiCredential;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    const counters: PlanSyncCounters = {
      fetched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicted: 0,
      skipped: 0,
      failed: 0,
      remoteDeleted: 0,
    };
    const errors: string[] = [];
    const seenRemoteEventIds = new Set<string>();
    // 使用 FIT 文件作为交换格式，避免依赖 Intervals.icu 自己的 workout_doc 语法。
    const events = await this.intervalsIcuClient.listEvents(args.apiKey, {
      oldest: args.window.oldest,
      newest: args.window.newest,
      category: 'WORKOUT',
      ext: 'fit',
      resolve: true,
    });

    counters.fetched = events.length;
    for (const event of events) {
      const id = eventId(event);
      if (id) seenRemoteEventIds.add(id);
      try {
        const imported = await this.importRemoteEvent({
          ...args,
          event,
        });
        counters.created += imported.created;
        counters.updated += imported.updated;
        counters.unchanged += imported.unchanged;
        counters.conflicted += imported.conflicted;
        counters.skipped += imported.skipped;
        counters.failed += imported.failed;
      } catch (error) {
        if (
          error instanceof IntervalsIcuApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        counters.failed += 1;
        this.logger.warn(
          `[Intervals.icu][计划同步] 导入远端计划课事件失败：用户=${args.userId} 远端事件=${id ?? '未知'}，原因：${message}`,
        );
      }
    }

    counters.remoteDeleted += await this.markMissingRemoteEvents({
      userId: args.userId,
      connectionId: args.connection.id,
      window: args.window,
      seenRemoteEventIds,
      apiKey: args.apiKey,
      connection: args.connection,
      trigger: args.trigger,
    });

    return {
      ...counters,
      errors,
    };
  }

  /** 导入单条远端事件（FIT 或 workout_doc）。 */
  private async importRemoteEvent(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    event: IntervalsIcuEvent;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    const zero = {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicted: 0,
      skipped: 0,
      failed: 0,
    };

    const parsed = await this.parseRemoteWorkout(args.event);
    if (!parsed) {
      await this.markRemoteEventFailed({
        userId: args.userId,
        connectionId: args.connection.id,
        event: args.event,
        error: 'Intervals.icu 计划课没有包含 FIT 训练文件',
        window: args.window,
        trigger: args.trigger,
      });
      return { ...zero, skipped: 1 };
    }

    return this.importParsedRemoteWorkout({
      userId: args.userId,
      connection: args.connection,
      event: args.event,
      parsed,
      window: args.window,
      trigger: args.trigger,
    });
  }

  /** Reconcile B -> A. The source wins edits; deletion uses the survivor baseline. */
  private async importParsedRemoteWorkout(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    event: IntervalsIcuEvent;
    parsed: ParsedRemoteWorkout;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    const zero = {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicted: 0,
      skipped: 0,
      failed: 0,
    };
    const remoteEventId = eventId(args.event);
    if (!remoteEventId) return { ...zero, skipped: 1 };
    let mapping = await this.findMappingForRemote(args.userId, args.event);
    if (mapping && !this.mappingMatchesConnection(mapping, args.connection)) {
      throw new Error('INTERVALS_PLAN_ACCOUNT_MISMATCH');
    }
    if (mapping && this.mappingIsClosed(mapping)) {
      return { ...zero, skipped: 1 };
    }
    if (mapping?.remoteDeletedAt) {
      // Legacy window-based tombstones are reversible only after a live read confirms existence.
      await this.updateMapping(mapping.id, { remoteDeletedAt: null });
      mapping = { ...mapping, remoteDeletedAt: null };
    }
    let local = mapping?.planWorkoutId
      ? await this.findLocalWorkout(args.userId, mapping.planWorkoutId)
      : null;
    if (mapping && (!local || mapping.localDeletedAt)) {
      // Importing a changed survivor must not recreate the deleted endpoint.
      await this.reconcileLocalDeletion({ ...args, mapping });
      return { ...zero, skipped: 1 };
    }
    if (!mapping) {
      const localId = workoutIdFromExternalKey(
        cleanString(args.event.external_id),
      );
      if (localId) {
        const previous = await this.planSync.findMapping({
          where: {
            userId: args.userId,
            provider: PROVIDER,
            planWorkoutId: localId,
          },
        });
        // An external key is only a recovery hint, not permission to reuse a closed identity.
        if (!previous)
          local = await this.findLocalWorkout(args.userId, localId);
      }
    }
    const remoteChanged =
      !mapping ||
      this.remoteComparisonChecksum(args.event, args.parsed, mapping) !==
        mapping.lastRemoteChecksum;
    const created = !local;
    if (!local) {
      this.syncLock.assertHeld();
      const row = await this.createWorkoutFromRemote(
        { userId: args.userId, parsed: args.parsed },
        (stored) =>
          ({
            provider: PROVIDER,
            ...this.importMappingData(args, stored),
          }) as Prisma.PlanWorkoutExternalMappingUncheckedCreateInput,
      );
      mapping = await this.findMappingForRemote(args.userId, args.event);
      local = await this.findLocalWorkout(args.userId, row.id);
      if (!local) throw new Error('INTERVALS_PLAN_LOCAL_READBACK_FAILED');
      if (
        row.updatedAt &&
        local.updatedAt &&
        row.updatedAt.getTime() !== local.updatedAt.getTime()
      )
        throw new Error('INTERVALS_PLAN_LOCAL_REVISION_CHANGED');
    } else if (remoteChanged) {
      this.syncLock.assertHeld();
      const row = await this.updateWorkoutFromRemote({
        userId: args.userId,
        workout: local,
        parsed: args.parsed,
      });
      local = await this.findLocalWorkout(args.userId, row.id);
      if (!local) throw new Error('INTERVALS_PLAN_LOCAL_READBACK_FAILED');
      if (
        row.updatedAt &&
        local.updatedAt &&
        row.updatedAt.getTime() !== local.updatedAt.getTime()
      )
        throw new Error('INTERVALS_PLAN_LOCAL_REVISION_CHANGED');
    } else {
      const localChanged =
        this.localComparisonChecksum(local, mapping!) !==
        mapping!.lastLocalChecksum;
      await this.updateMapping(mapping!.id, {
        lastSeenAt: new Date(),
        syncState: localChanged ? 'LOCAL_CHANGED' : 'SYNCED',
      });
      return {
        ...zero,
        unchanged: localChanged ? 0 : 1,
        skipped: localChanged ? 1 : 0,
      };
    }
    await this.upsertMapping(this.importMappingData(args, local, mapping));
    return created ? { ...zero, created: 1 } : { ...zero, updated: 1 };
  }

  private importMappingData(
    args: {
      userId: string;
      connection: IntervalsIcuPlanConnection;
      event: IntervalsIcuEvent;
      parsed: ParsedRemoteWorkout;
      window: WeekWindow;
      trigger: SyncTrigger;
    },
    local: SyncWorkout,
    mapping?: SyncMapping | null,
  ): Record<string, unknown> {
    const remoteEventId = eventId(args.event)!;
    const externalKey = cleanString(args.event.external_id);
    const ownsExternalIdentity =
      workoutIdFromExternalKey(externalKey) === local.id;
    return {
      id: mapping?.id,
      userId: args.userId,
      connectionId: args.connection.id,
      planWorkoutId: local.id,
      externalEventId: remoteEventId,
      // Provider-owned UIDs can be reused by copies. Event ID is the remote identity.
      externalUid: ownsExternalIdentity ? cleanString(args.event.uid) : null,
      externalSourceKey: ownsExternalIdentity ? externalKey : null,
      externalAthleteId: cleanString(args.event.athlete_id),
      origin: mapping?.origin ?? (ownsExternalIdentity ? 'LOCAL' : 'REMOTE'),
      syncState: 'SYNCED',
      lastLocalChecksum: this.localWorkoutChecksum(local),
      lastRemoteChecksum: this.remoteWorkoutChecksum(args.event, args.parsed),
      lastSyncedChecksum: args.parsed.checksum,
      lastSeenAt: new Date(),
      lastPulledAt: new Date(),
      remoteDeletedAt: null,
      localDeletedAt: null,
      lastError: null,
      rawRemote: args.event,
      metadata: {
        ...planSyncMetadata(mapping?.metadata),
        ...mappingMetadata({
          planId: local.planId,
          scheduledDate: args.parsed.scheduledDate,
          window: args.window,
          trigger: args.trigger,
          remoteName: args.parsed.name,
        }),
        syncVersion: 2,
        remoteUpdatedAt: args.event.updated ?? null,
      },
    };
  }

  /** 优先 FIT，其次 workout_doc，解析为 ParsedRemoteWorkout。 */
  private async parseRemoteWorkout(
    event: IntervalsIcuEvent,
  ): Promise<ParsedRemoteWorkout | null> {
    const scheduledDate = eventDate(event);
    const fitBase64 = extractFitBase64(event);
    if (!scheduledDate) return null;
    if (!fitBase64) return this.parseRemoteWorkoutFromDoc(event);

    const parsed = await this.workoutService.parseFile(
      Buffer.from(fitBase64, 'base64'),
    );
    const name = cleanString(event.name);
    const notes = cleanString(event.description);
    const sportType = mapIntervalsSportType(event.type);
    const sportDefinitionCode = await this.resolveIntervalsSportCode(
      event.type,
      sportType,
    );
    return buildParsedRemoteWorkout({
      scheduledDate,
      sportType,
      sportDefinitionCode,
      name,
      notes,
      text: parsed.plan,
      blocks: parsed.block,
    });
  }

  /** 仅走 workout_doc → PlanBlock 路径。 */
  private async parseRemoteWorkoutFromDoc(
    event: IntervalsIcuEvent,
  ): Promise<ParsedRemoteWorkout | null> {
    const parsed = parseIntervalsIcuCalendarEvent(event);
    if (!parsed) return null;
    const sportType =
      parsed.sportType === 'UNKNOWN'
        ? ('CYCLING' as SportType)
        : parsed.sportType;
    const sportDefinitionCode = await this.resolveIntervalsSportCode(
      event.type,
      sportType,
    );
    const text = this.workoutService.stringifyPlan(parsed.blocks, {
      sportType:
        sportType === 'CYCLING' || sportType === 'SWIM' || sportType === 'RUN'
          ? sportType
          : 'RUN',
    });
    return buildParsedRemoteWorkout({
      scheduledDate: parsed.scheduledDate,
      sportType,
      sportDefinitionCode,
      name: parsed.name,
      notes: parsed.notes,
      text,
      blocks: parsed.blocks,
    });
  }

  /** 解析/归一化运动 catalog code。 */
  private async resolveIntervalsSportCode(
    externalType: unknown,
    sportType: SportType,
  ) {
    const externalCode = cleanString(externalType);
    if (externalCode) {
      const mapped = await this.sportCatalog.fromProvider({
        provider: PROVIDER,
        externalCode,
      });
      if (mapped) return mapped.sport.code;
    }
    const fallback = await this.sportCatalog.resolve(
      null,
      sportType as SportFamily,
    );
    return fallback?.code ?? 'OTHER';
  }

  /** 上行：窗口内本地课推到 Intervals.icu，并清理远端多余事件。 */
  private async exportWeek(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey: IntervalsIcuApiCredential;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    const counters: ExportCounters = {
      discovered: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicted: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
    };
    const errors: string[] = [];
    // 先索引远端窗口，避免本地 mapping 丢失时重复创建同一个 external_id/uid。
    const remoteIndex = await this.loadRemoteEventIndex(
      args.apiKey,
      args.window,
    );
    counters.deleted += await this.deleteLocalRemovedRemoteEvents(args);
    counters.deleted += await this.deleteTerminalLocalWorkouts(args);

    const workouts = await this.planSync.findExportWindowWorkouts({
      userId: args.userId,
      start: parseYmd(args.window.oldest),
      end: parseYmd(args.window.newest),
    });

    counters.discovered = workouts.length;
    for (const workout of workouts) {
      try {
        const exported = await this.exportLocalWorkout({
          ...args,
          workout,
          remoteIndex,
        });
        counters.created += exported.created;
        counters.updated += exported.updated;
        counters.unchanged += exported.unchanged;
        counters.conflicted += exported.conflicted;
        counters.skipped += exported.skipped;
        counters.failed += exported.failed;
      } catch (error) {
        if (
          error instanceof IntervalsIcuApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        counters.failed += 1;
        this.logger.warn(
          `[Intervals.icu][计划同步] 导出本地计划课失败：用户=${args.userId} 计划课=${workout.id}，原因：${message}`,
        );
      }
    }

    return {
      ...counters,
      errors,
    };
  }

  /** 拉取窗口内远端事件，建成 id/external_id 索引。 */
  private async loadRemoteEventIndex(
    apiKey: IntervalsIcuApiCredential,
    window: WeekWindow,
  ) {
    const events = await this.intervalsIcuClient.listEvents(apiKey, {
      oldest: window.oldest,
      newest: window.newest,
      category: 'WORKOUT',
      resolve: false,
    });
    const byExternalKey = new Map<string, IntervalsIcuEvent>();
    const byUid = new Map<string, IntervalsIcuEvent>();
    for (const event of events) {
      const externalKey = cleanString(event.external_id);
      const uid = cleanString(event.uid);
      if (externalKey) byExternalKey.set(externalKey, event);
      if (uid) byUid.set(uid, event);
    }
    return { byExternalKey, byUid };
  }

  /** Reconcile A -> B. Local edits win concurrent edits in this direction. */
  private async exportLocalWorkout(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey: IntervalsIcuApiCredential;
    workout: SyncWorkout;
    window: WeekWindow;
    trigger: SyncTrigger;
    remoteIndex: {
      byExternalKey: Map<string, IntervalsIcuEvent>;
      byUid: Map<string, IntervalsIcuEvent>;
    };
  }) {
    const zero = {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicted: 0,
      skipped: 0,
      failed: 0,
    };
    const mapping = await this.planSync.findMapping({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        planWorkoutId: args.workout.id,
      },
    });
    if (mapping && !this.mappingMatchesConnection(mapping, args.connection))
      throw new Error('INTERVALS_PLAN_ACCOUNT_MISMATCH');
    if (mapping && (this.mappingIsClosed(mapping) || mapping.localDeletedAt))
      return { ...zero, skipped: 1 };
    let remote = mapping?.externalEventId
      ? await this.readRemoteEvent(args.apiKey, mapping.externalEventId)
      : (args.remoteIndex.byExternalKey.get(
          externalKeyForWorkout(args.workout.id),
        ) ?? null);
    if (mapping?.externalEventId && !remote) {
      await this.markRemoteEventDeletedById({
        userId: args.userId,
        remoteEventId: mapping.externalEventId,
        connection: args.connection,
      });
      return { ...zero, skipped: 1 };
    }
    const localChanged =
      !mapping ||
      this.localComparisonChecksum(args.workout, mapping) !==
        mapping.lastLocalChecksum;
    if (!localChanged && mapping) {
      const parsed = remote ? await this.parseRemoteWorkout(remote) : null;
      const remoteUnchanged =
        remote &&
        parsed &&
        this.remoteComparisonChecksum(remote, parsed, mapping) ===
          mapping.lastRemoteChecksum;
      await this.updateMapping(mapping.id, {
        lastSeenAt: new Date(),
        remoteDeletedAt: null,
        ...(remoteUnchanged
          ? {
              syncState: 'SYNCED',
              lastLocalChecksum: this.localWorkoutChecksum(args.workout),
              lastRemoteChecksum: this.remoteWorkoutChecksum(remote!, parsed!),
              metadata: {
                ...planSyncMetadata(mapping.metadata),
                syncVersion: 2,
              },
            }
          : {}),
      });
      return { ...zero, unchanged: 1 };
    }
    const payload = await this.buildEventPayload(args.workout, mapping);
    const remoteEventId = remote ? eventId(remote) : null;
    let response: IntervalsIcuEvent | undefined;
    try {
      this.syncLock.assertHeld();
      response = remoteEventId
        ? await this.intervalsIcuClient.updateEvent(
            args.apiKey,
            remoteEventId,
            payload,
          )
        : (
            await this.intervalsIcuClient.createEventsBulk(
              args.apiKey,
              [payload],
              {
                upsert: true,
                upsertOnUid: false,
                updatePlanApplied: false,
              },
            )
          )[0];
    } catch (error) {
      if (
        mapping &&
        error instanceof IntervalsIcuApiError &&
        error.status === 404
      ) {
        // A deletion racing with the PUT still follows deletion rules, never create fallback.
        const latest = await this.readRemoteEvent(
          args.apiKey,
          mapping.externalEventId!,
        );
        if (!latest) {
          await this.markRemoteEventDeletedById({
            userId: args.userId,
            remoteEventId: mapping.externalEventId!,
            connection: args.connection,
          });
          return { ...zero, skipped: 1 };
        }
      }
      throw error;
    }
    const savedId = response
      ? (eventId(response) ?? remoteEventId)
      : remoteEventId;
    if (!savedId) throw new Error('INTERVALS_PLAN_REMOTE_ID_MISSING');
    remote = await this.readRemoteEvent(args.apiKey, savedId);
    const parsed = remote ? await this.parseRemoteWorkout(remote) : null;
    if (!remote || !parsed)
      throw new Error('INTERVALS_PLAN_REMOTE_READBACK_FAILED');
    const latestLocal = await this.findLocalWorkout(
      args.userId,
      args.workout.id,
    );
    const changedDuringPush =
      !latestLocal ||
      this.localWorkoutChecksum(latestLocal) !==
        this.localWorkoutChecksum(args.workout);
    await this.upsertMapping({
      id: mapping?.id,
      userId: args.userId,
      connectionId: args.connection.id,
      planWorkoutId: latestLocal?.id ?? null,
      externalEventId: savedId,
      externalUid:
        mapping?.origin === 'REMOTE' ? null : cleanString(remote.uid),
      externalSourceKey:
        mapping?.origin === 'REMOTE' ? null : cleanString(remote.external_id),
      externalAthleteId: cleanString(remote.athlete_id),
      origin: mapping?.origin ?? 'LOCAL',
      syncState: !latestLocal
        ? 'LOCAL_DELETED'
        : changedDuringPush
          ? 'LOCAL_CHANGED'
          : 'SYNCED',
      lastLocalChecksum: this.localWorkoutChecksum(args.workout),
      lastRemoteChecksum: this.remoteWorkoutChecksum(remote, parsed),
      lastSyncedChecksum: parsed.checksum,
      lastSeenAt: new Date(),
      lastPushedAt: new Date(),
      remoteDeletedAt: null,
      localDeletedAt: latestLocal ? null : new Date(),
      lastError: null,
      rawRemote: remote,
      metadata: {
        ...planSyncMetadata(mapping?.metadata),
        ...mappingMetadata({
          planId: args.workout.planId,
          scheduledDate: ymd(args.workout.scheduledDate),
          window: args.window,
          trigger: args.trigger,
          remoteName: args.workout.name,
        }),
        syncVersion: 2,
        remoteUpdatedAt: remote.updated ?? null,
      },
    });
    return remoteEventId ? { ...zero, updated: 1 } : { ...zero, created: 1 };
  }

  /** 构造 Intervals.icu 日历事件 upsert payload（含 FIT/base64）。 */
  private async buildEventPayload(
    workout: SyncWorkout,
    mapping: SyncMapping | null,
  ): Promise<IntervalsIcuEventPayload> {
    const providerSport = await this.sportCatalog.toProvider({
      provider: 'intervals_icu',
      sportCode: exactSportCode(workout),
      family: workout.sportType as SportFamily,
    });
    const providerMetadata = (providerSport?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const blocks = this.workoutService.buildPlanBlocksFromWorkoutSteps(
      Array.isArray(workout.steps) ? workout.steps : [],
      workout.sportType,
    );
    const bytes = await this.workoutService.buildFITFromPlan(blocks, {
      sport:
        providerSport?.sport.fitSport ?? fitSportForWorkout(workout.sportType),
      subSport: providerSport?.sport.fitSubSport ?? undefined,
      name: workout.name ?? workout.text ?? 'Trainingload.ai Workout',
      manufacturer: 'development',
      product: 1,
    });
    const localOrigin = !mapping || mapping.origin !== 'REMOTE';
    // LOCAL 来源用 Trainingload.ai 自己的稳定 key；REMOTE 来源保留远端原 key，
    // 避免把第三方/Intervals 原生课程伪装成我们创建的课程。
    const externalKey = localOrigin
      ? externalKeyForWorkout(workout.id)
      : cleanString(mapping.externalSourceKey);
    const uid = localOrigin
      ? uidForWorkout(workout.id)
      : cleanString(mapping.externalUid);
    const name =
      cleanString(workout.name) ??
      cleanString(String(workout.text ?? '').split(/\r?\n/)[0]) ??
      'Trainingload.ai Workout';
    const description = [
      cleanString(workout.notes),
      workout.plan?.title
        ? `Trainingload.ai plan: ${workout.plan.title}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      category: 'WORKOUT',
      start_date_local: startOfLocalDay(workout.scheduledDate),
      name,
      description: description || null,
      type:
        (typeof providerMetadata.apiType === 'string'
          ? providerMetadata.apiType
          : null) ?? intervalsTypeForSport(workout.sportType),
      ...(externalKey ? { external_id: externalKey } : {}),
      ...(uid ? { uid } : {}),
      filename: `${workout.id}.fit`,
      file_contents_base64: Buffer.from(bytes).toString('base64'),
    };
  }

  /** Local deletion is symmetric, regardless of where the course originated. */
  private async deleteLocalRemovedRemoteEvents(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey: IntervalsIcuApiCredential;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    const mappings = await this.planSync.findMappings({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        externalEventId: { not: null },
        OR: [{ planWorkoutId: null }, { localDeletedAt: { not: null } }],
      },
    });
    let deleted = 0;
    for (const mapping of mappings) {
      if (this.mappingIsClosed(mapping)) continue;
      // Stable event IDs can be verified without a calendar-window restriction.
      deleted += await this.reconcileLocalDeletion({ ...args, mapping });
    }
    return deleted;
  }

  /** 本地终态课对应远端仍存在时删除远端。 */
  private async deleteTerminalLocalWorkouts(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey: IntervalsIcuApiCredential;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    // 本应用创建的计划课完成、跳过或所属计划结束后，远端 planned event 不应继续显示为待执行。
    const mappings = await this.planSync.findMappings({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        origin: 'LOCAL',
        externalEventId: { not: null },
        remoteDeletedAt: null,
        planWorkout: {
          scheduledDate: {
            gte: parseYmd(args.window.oldest),
            lte: parseYmd(args.window.newest),
          },
          OR: [
            { status: { in: ['SKIPPED', 'DONE'] } },
            { plan: { is: { status: { in: ['COMPLETED', 'CANCELLED'] } } } },
          ],
        },
      },
      include: { planWorkout: true },
    });
    if (!mappings.length) return 0;

    let deleted = 0;
    for (const mapping of mappings) {
      deleted += await this.reconcileLocalDeletion({ ...args, mapping });
    }
    return deleted;
  }

  /** Absence from a date window is only a hint: the course may have moved. */
  private async markMissingRemoteEvents(args: {
    userId: string;
    connectionId: string;
    window: WeekWindow;
    seenRemoteEventIds: Set<string>;
    apiKey: IntervalsIcuApiCredential;
    connection: IntervalsIcuPlanConnection;
    trigger: SyncTrigger;
  }) {
    const mappings = await this.planSync.findMappings({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        externalEventId: { not: null },
        planWorkout: {
          scheduledDate: {
            gte: parseYmd(args.window.oldest),
            lte: parseYmd(args.window.newest),
          },
        },
      },
    });
    let deleted = 0;
    for (const mapping of mappings) {
      if (
        !mapping.externalEventId ||
        this.mappingIsClosed(mapping) ||
        args.seenRemoteEventIds.has(mapping.externalEventId)
      )
        continue;
      if (!this.mappingMatchesConnection(mapping, args.connection))
        throw new Error('INTERVALS_PLAN_ACCOUNT_MISMATCH');
      const current = await this.readRemoteEvent(
        args.apiKey,
        mapping.externalEventId,
      );
      if (!current)
        deleted += await this.markRemoteEventDeletedById({
          userId: args.userId,
          remoteEventId: mapping.externalEventId,
          connection: args.connection,
        });
      else await this.importRemoteEvent({ ...args, event: current });
    }
    return deleted;
  }

  /** Event ID identifies a creation instance; names, dates and UIDs do not. */
  private async findMappingForRemote(userId: string, event: IntervalsIcuEvent) {
    const id = eventId(event);
    if (!id) return null;
    return this.planSync.findMapping({
      where: { userId, provider: PROVIDER, externalEventId: id },
    });
  }

  /** 加载本地 PlanWorkout（含 steps）。 */
  private async findLocalWorkout(userId: string, workoutId: string) {
    return this.planSync.findLocalWorkout(userId, workoutId);
  }

  /** 本地课的 sync checksum（含日期/名称等）。 */
  private localContentSyncChecksum(workout: SyncWorkout) {
    const blocks = this.workoutService.buildPlanBlocksFromWorkoutSteps(
      Array.isArray(workout.steps) ? workout.steps : [],
      workout.sportType,
    );
    return computeSyncChecksum({
      scheduledDate: workout.scheduledDate ? ymd(workout.scheduledDate) : '',
      sportType: workout.sportType,
      subSportType: workout.sportDefinitionCode,
      name: cleanString(workout.name),
      notes: cleanString(workout.notes),
      blocks,
    });
  }

  /** 由远端解析结果创建本地独立课。 */
  private async createWorkoutFromRemote(
    args: {
      userId: string;
      parsed: ParsedRemoteWorkout;
    },
    initializeMapping?: (
      workout: SyncWorkout,
    ) => Prisma.PlanWorkoutExternalMappingUncheckedCreateInput,
  ) {
    return this.planSync.createIndependentWorkout(
      {
        userId: args.userId,
        scheduledDate: parseYmd(args.parsed.scheduledDate),
        sportType: args.parsed.sportType,
        sportDefinitionCode: args.parsed.sportDefinitionCode,
        name: args.parsed.name,
        text: args.parsed.text,
        notes: args.parsed.notes,
        blocks: args.parsed.blocks,
      },
      initializeMapping,
    );
  }

  /** 用远端内容更新本地课（冲突时标记 conflicted）。 */
  private async updateWorkoutFromRemote(args: {
    userId: string;
    workout: SyncWorkout;
    parsed: ParsedRemoteWorkout;
  }) {
    const scheduledDate = parseYmd(args.parsed.scheduledDate);
    // 已经属于用户正式计划的课程，远端更新只改内容和日期，不挪出原计划；
    // 旧系统容器或 independent workout 则保持/迁回 independent。
    const plan =
      args.workout.planId && !isRemoteManagedPlan(args.workout.plan)
        ? args.workout.plan
        : null;
    if (
      args.workout.planId &&
      !isRemoteManagedPlan(args.workout.plan) &&
      !plan?.id
    ) {
      throw new Error('已同步的计划课缺少所属训练计划，无法更新');
    }
    const dayOffset = plan?.startDate
      ? diffDays(plan.startDate, scheduledDate)
      : 0;
    return this.planSync.updateImportedWorkout({
      userId: args.userId,
      workoutId: args.workout.id,
      preferredSessionIndex: args.workout.sessionIndex ?? 1,
      scheduledDate,
      targetPlanId: plan?.id ?? null,
      targetPlanStartDate: plan?.startDate ?? null,
      sportType: args.parsed.sportType,
      sportDefinitionCode: args.parsed.sportDefinitionCode,
      name: args.parsed.name,
      text: args.parsed.text,
      notes: args.parsed.notes,
      status:
        args.workout.status === 'DONE' || args.workout.status === 'SKIPPED'
          ? args.workout.status
          : 'PLANNED',
      blocks: args.parsed.blocks,
      dayOffset,
      expectedUpdatedAt: args.workout.updatedAt,
    });
  }

  /** Parsing failures do not mutate an existing synchronization baseline or tombstone. */
  private async markRemoteEventFailed(_args: {
    userId: string;
    connectionId: string;
    event: IntervalsIcuEvent;
    error: string;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    this.logger.warn(
      `Intervals.icu plan event skipped: reason=UNSUPPORTED_WORKOUT_DOCUMENT`,
    );
  }

  /** 创建或更新 PlanWorkoutExternalMapping。 */
  private async upsertMapping(data: Record<string, unknown>) {
    this.syncLock.assertHeld();
    // mapping 是幂等核心：任何一个稳定键命中，都更新同一条映射。
    const id = cleanString(data.id);
    const existing = id
      ? await this.planSync.findMappingUnique({ where: { id } })
      : await this.findExistingMapping(data);
    const write = this.mappingWriteData(data);
    this.syncLock.assertHeld();
    if (existing) {
      return this.planSync.updateMapping({
        where: { id: existing.id },
        data: write as Prisma.PlanWorkoutExternalMappingUncheckedUpdateInput,
      });
    }
    return this.planSync.createMapping({
      data: {
        userId: String(data.userId),
        provider: PROVIDER,
        ...write,
      } as Prisma.PlanWorkoutExternalMappingUncheckedCreateInput,
    });
  }

  private async findExistingMapping(data: Record<string, unknown>) {
    const remoteId = cleanString(data.externalEventId);
    if (!remoteId) return null;
    return this.planSync.findMapping({
      where: {
        userId: data.userId,
        provider: PROVIDER,
        externalEventId: remoteId,
      },
    });
  }

  /** 规范化 mapping 写库字段。 */
  private mappingWriteData(data: Record<string, unknown>) {
    const jsonFields = {
      ...(data.rawRemote !== undefined
        ? { rawRemote: jsonSafe(data.rawRemote) }
        : {}),
      ...(data.metadata !== undefined
        ? { metadata: jsonSafe(data.metadata) }
        : {}),
    };
    return {
      ...(data.connectionId !== undefined
        ? { connectionId: data.connectionId }
        : {}),
      ...(data.planWorkoutId !== undefined
        ? { planWorkoutId: data.planWorkoutId }
        : {}),
      ...(data.externalEventId !== undefined
        ? { externalEventId: data.externalEventId }
        : {}),
      ...(data.externalUid !== undefined
        ? { externalUid: data.externalUid }
        : {}),
      ...(data.externalSourceKey !== undefined
        ? { externalSourceKey: data.externalSourceKey }
        : {}),
      ...(data.externalAthleteId !== undefined
        ? { externalAthleteId: data.externalAthleteId }
        : {}),
      ...(data.origin !== undefined ? { origin: data.origin } : {}),
      ...(data.syncState !== undefined ? { syncState: data.syncState } : {}),
      ...(data.lastLocalChecksum !== undefined
        ? { lastLocalChecksum: data.lastLocalChecksum }
        : {}),
      ...(data.lastRemoteChecksum !== undefined
        ? { lastRemoteChecksum: data.lastRemoteChecksum }
        : {}),
      ...(data.lastSyncedChecksum !== undefined
        ? { lastSyncedChecksum: data.lastSyncedChecksum }
        : {}),
      ...(data.lastSeenAt !== undefined ? { lastSeenAt: data.lastSeenAt } : {}),
      ...(data.lastPulledAt !== undefined
        ? { lastPulledAt: data.lastPulledAt }
        : {}),
      ...(data.lastPushedAt !== undefined
        ? { lastPushedAt: data.lastPushedAt }
        : {}),
      ...(data.lastConflictAt !== undefined
        ? { lastConflictAt: data.lastConflictAt }
        : {}),
      ...(data.localDeletedAt !== undefined
        ? { localDeletedAt: data.localDeletedAt }
        : {}),
      ...(data.remoteDeletedAt !== undefined
        ? { remoteDeletedAt: data.remoteDeletedAt }
        : {}),
      ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
      ...jsonFields,
    };
  }

  /** 更新已有 mapping 行。 */
  private async updateMapping(
    id: string | null | undefined,
    data: Record<string, unknown>,
  ) {
    if (!id) return null;
    this.syncLock.assertHeld();
    return this.planSync.updateMapping({
      where: { id },
      data: this.mappingWriteData(
        data,
      ) as Prisma.PlanWorkoutExternalMappingUncheckedUpdateInput,
    });
  }
}
