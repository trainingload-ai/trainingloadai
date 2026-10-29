import { Injectable, Optional, Logger } from '@nestjs/common';
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
  contentChecksum as computeContentChecksum,
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
      'userId' | 'status' | 'credentialCiphertext' | 'metadata'
    >
  >;
import {
  mapIntervalsSportType,
  parseIntervalsIcuCalendarEvent,
} from './intervals-icu-workout-doc.mapper';

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
  /** 计划内自动合并匹配 */
  contentChecksum: string;
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
    contentChecksum: computeContentChecksum({
      sportType: args.sportType,
      subSportType: args.sportDefinitionCode,
      blocks,
    }),
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
};

function mappingScheduledDate(metadata: unknown): string {
  const rec =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return cleanString(rec.scheduledDate);
}

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
  async syncConnectionWeek(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey?: string;
    credential?: IntervalsIcuApiCredential;
    weekStart?: string | null;
    timezone?: string | null;
    trigger: SyncTrigger;
  }) {
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
      };
      await this.updateConnectionPlanSyncMetadata(connection.id, {
        lastCompletedAt: completedAt.toISOString(),
        lastWindow: window,
        lastResult: result,
        lastError: null,
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
  async handleCalendarWebhookEvent(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    calendarEvents: Array<Record<string, unknown>>;
    deletedEvents: Array<Record<string, unknown> | string | number>;
  }) {
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
    const events = args.calendarEvents as IntervalsIcuEvent[];
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
      deleted += await this.markRemoteEventDeletedById({
        userId: args.userId,
        remoteEventId,
      });
    }

    return { skipped: false, imported, deleted, failed, workoutDocPending };
  }

  /**
   * Webhook 事件缺 FIT 时，可通过 API 补拉（供后续扩展；当前 workout_doc 分支走 TODO）。
   */
  private async resolveWebhookCalendarEvent(args: {
    apiKey: IntervalsIcuApiCredential;
    event: IntervalsIcuEvent;
    window: WeekWindow;
  }) {
    // 1. 如果事件已经包含 FIT 文件，则直接返回
    if (extractFitBase64(args.event)) return args.event;
    // 2. 获取事件 ID
    const remoteEventId = eventId(args.event);
    if (!remoteEventId) return args.event;

    const eventDay = eventDate(args.event);
    const queryWindow = eventDay
      ? { oldest: eventDay, newest: eventDay }
      : { oldest: args.window.oldest, newest: args.window.newest };

    try {
      const events = await this.intervalsIcuClient.listEvents(args.apiKey, {
        ...queryWindow,
        category: 'WORKOUT',
        ext: 'fit',
        resolve: true,
      });
      // 3. 判断是否匹配
      const matched = events.find((item) => eventId(item) === remoteEventId);
      // 4. 如果匹配，则返回
      if (matched) {
        this.logger.debug(
          `[resolveWebhookCalendarEvent] 已从 API 补拉 FIT eventId=${remoteEventId}`,
        );
        return matched;
      }
      // 5. 如果未匹配，则返回原事件
    } catch (error) {
      this.logger.warn(
        `[resolveWebhookCalendarEvent] 补拉 FIT 失败 eventId=${remoteEventId}：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return args.event;
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

  /** 远端删除：按 externalEventId 标记本地 mapping / 处理本地课。 */
  private async markRemoteEventDeletedById(args: {
    userId: string;
    remoteEventId: string;
  }) {
    const mapping = await this.planSync.findMapping({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        externalEventId: args.remoteEventId,
        remoteDeletedAt: null,
      },
    });
    if (!mapping) return 0;
    await this.planSync.updateMapping({
      where: { id: mapping.id },
      data: {
        syncState: 'REMOTE_DELETED',
        remoteDeletedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    return 1;
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

  /** 已解析的远端课 → 创建/更新本地课 + mapping（含冲突检测）。 */
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
    if (!remoteEventId) {
      return { ...zero, skipped: 1 };
    }

    const externalSourceKey = cleanString(args.event.external_id);
    const externalUid = cleanString(args.event.uid);
    const localWorkoutId = workoutIdFromExternalKey(externalSourceKey);
    if (localWorkoutId) {
      // 这是 Trainingload.ai 曾经上传过的课程。即使本地已经删除，也只标记映射，
      // 不把它当作新的远端课程重新导入，避免“删了又回来”。
      const local = await this.findLocalWorkout(args.userId, localWorkoutId);
      await this.upsertMapping({
        userId: args.userId,
        connectionId: args.connection.id,
        planWorkoutId: local?.id ?? null,
        externalEventId: remoteEventId,
        externalUid,
        externalSourceKey,
        externalAthleteId: cleanString(args.event.athlete_id),
        origin: 'LOCAL',
        syncState: local ? 'SYNCED' : 'LOCAL_DELETED',
        remoteDeletedAt: null,
        localDeletedAt: local ? null : new Date(),
        rawRemote: args.event,
        metadata: mappingMetadata({
          planId: local?.planId ?? null,
          scheduledDate: local?.scheduledDate
            ? ymd(local.scheduledDate)
            : eventDate(args.event),
          window: args.window,
          trigger: args.trigger,
          remoteName: cleanString(args.event.name),
        }),
        lastSeenAt: new Date(),
      });
      if (!local) return { ...zero, skipped: 1 };
    }

    const parsed = args.parsed;
    const mapping = await this.findMappingForRemote(args.userId, args.event);
    let targetWorkoutId = mapping?.planWorkoutId ?? localWorkoutId ?? null;
    let local = targetWorkoutId
      ? await this.findLocalWorkout(args.userId, targetWorkoutId)
      : null;

    if (!local) {
      local = await this.resolveImportTargetWorkout({
        userId: args.userId,
        parsed,
      });
      if (local) {
        targetWorkoutId = local.id;
      }
    }

    if (!local) {
      // 无 mapping 且 contentChecksum 未命中计划内课次 → 计划外 independent workout。
      const created = await this.createWorkoutFromRemote({
        userId: args.userId,
        parsed,
      });
      await this.upsertMapping({
        userId: args.userId,
        connectionId: args.connection.id,
        planWorkoutId: created.id,
        externalEventId: remoteEventId,
        externalUid,
        externalSourceKey,
        externalAthleteId: cleanString(args.event.athlete_id),
        origin: isTrainingloadExternalKey(externalSourceKey)
          ? 'LOCAL'
          : 'REMOTE',
        syncState: 'SYNCED',
        lastLocalChecksum: parsed.checksum,
        lastRemoteChecksum: parsed.checksum,
        lastSyncedChecksum: parsed.checksum,
        lastSeenAt: new Date(),
        lastPulledAt: new Date(),
        remoteDeletedAt: null,
        localDeletedAt: null,
        rawRemote: args.event,
        metadata: mappingMetadata({
          planId: created.planId,
          scheduledDate: parsed.scheduledDate,
          window: args.window,
          trigger: args.trigger,
          remoteName: parsed.name,
        }),
      });
      return { ...zero, created: 1 };
    }

    if (!mapping) {
      const updated = await this.updateWorkoutFromRemote({
        userId: args.userId,
        workout: local,
        parsed,
      });
      await this.upsertMapping({
        userId: args.userId,
        connectionId: args.connection.id,
        planWorkoutId: updated.id,
        externalEventId: remoteEventId,
        externalUid,
        externalSourceKey,
        externalAthleteId: cleanString(args.event.athlete_id),
        origin: isTrainingloadExternalKey(externalSourceKey)
          ? 'LOCAL'
          : 'REMOTE',
        syncState: 'SYNCED',
        lastLocalChecksum: parsed.checksum,
        lastRemoteChecksum: parsed.checksum,
        lastSyncedChecksum: parsed.checksum,
        lastSeenAt: new Date(),
        lastPulledAt: new Date(),
        remoteDeletedAt: null,
        localDeletedAt: null,
        rawRemote: args.event,
        metadata: mappingMetadata({
          planId: updated.planId,
          scheduledDate: parsed.scheduledDate,
          window: args.window,
          trigger: args.trigger,
          remoteName: parsed.name,
        }),
      });
      return { ...zero, updated: 1 };
    }

    const localChecksum = this.localWorkoutChecksum(local);
    const lastLocalChecksum = cleanString(mapping?.lastLocalChecksum);
    const lastRemoteChecksum = cleanString(mapping?.lastRemoteChecksum);
    const hasSyncBaseline = Boolean(lastLocalChecksum || lastRemoteChecksum);
    if (!hasSyncBaseline) {
      // 有映射但没有历史 checksum，说明是恢复/迁移场景。
      // 内容不一致时不能猜谁是主源，必须交给冲突处理。
      if (localChecksum !== parsed.checksum) {
        await this.updateMapping(mapping?.id, {
          syncState: 'CONFLICT',
          lastLocalChecksum: localChecksum,
          lastRemoteChecksum: parsed.checksum,
          lastSeenAt: new Date(),
          lastPulledAt: new Date(),
          lastConflictAt: new Date(),
          remoteDeletedAt: null,
          localDeletedAt: null,
          rawRemote: jsonSafe(args.event),
          lastError:
            '恢复的 Intervals.icu 映射没有同步基线，且内容与本地计划课不一致',
          metadata: mappingMetadata({
            planId: local.planId,
            scheduledDate: parsed.scheduledDate,
            window: args.window,
            trigger: args.trigger,
            remoteName: parsed.name,
          }),
        });
        return { ...zero, conflicted: 1 };
      }
      await this.updateMapping(mapping?.id, {
        syncState: 'SYNCED',
        lastLocalChecksum: localChecksum,
        lastRemoteChecksum: parsed.checksum,
        lastSyncedChecksum: localChecksum,
        lastSeenAt: new Date(),
        lastPulledAt: new Date(),
        remoteDeletedAt: null,
        localDeletedAt: null,
        lastError: null,
        rawRemote: jsonSafe(args.event),
        metadata: mappingMetadata({
          planId: local.planId,
          scheduledDate: parsed.scheduledDate,
          window: args.window,
          trigger: args.trigger,
          remoteName: parsed.name,
        }),
      });
      return { ...zero, unchanged: 1 };
    }
    const localChanged =
      Boolean(lastLocalChecksum) && localChecksum !== lastLocalChecksum;
    const remoteChanged = parsed.checksum !== lastRemoteChecksum;

    if (localChanged && remoteChanged) {
      // 两边都从上次同步后改过，自动覆盖会丢用户数据。
      await this.updateMapping(mapping?.id, {
        syncState: 'CONFLICT',
        lastRemoteChecksum: parsed.checksum,
        lastSeenAt: new Date(),
        lastPulledAt: new Date(),
        lastConflictAt: new Date(),
        remoteDeletedAt: null,
        localDeletedAt: null,
        rawRemote: jsonSafe(args.event),
        lastError:
          '上次同步后，Trainingload.ai 和 Intervals.icu 都修改了这节计划课',
        metadata: mappingMetadata({
          planId: local.planId,
          scheduledDate: parsed.scheduledDate,
          window: args.window,
          trigger: args.trigger,
          remoteName: parsed.name,
        }),
      });
      return { ...zero, conflicted: 1 };
    }

    if (remoteChanged) {
      // 只有远端变更时，远端是这一轮的事实来源，更新本地 workout。
      const updated = await this.updateWorkoutFromRemote({
        userId: args.userId,
        workout: local,
        parsed,
      });
      await this.updateMapping(mapping?.id, {
        planWorkoutId: updated.id,
        connectionId: args.connection.id,
        externalEventId: remoteEventId,
        externalUid,
        externalSourceKey,
        externalAthleteId: cleanString(args.event.athlete_id),
        syncState: 'SYNCED',
        lastLocalChecksum: parsed.checksum,
        lastRemoteChecksum: parsed.checksum,
        lastSyncedChecksum: parsed.checksum,
        lastSeenAt: new Date(),
        lastPulledAt: new Date(),
        remoteDeletedAt: null,
        localDeletedAt: null,
        lastError: null,
        rawRemote: jsonSafe(args.event),
        metadata: mappingMetadata({
          planId: updated.planId,
          scheduledDate: parsed.scheduledDate,
          window: args.window,
          trigger: args.trigger,
          remoteName: parsed.name,
        }),
      });
      return { ...zero, updated: 1 };
    }

    await this.updateMapping(mapping?.id, {
      connectionId: args.connection.id,
      externalEventId: remoteEventId,
      externalUid,
      externalSourceKey,
      externalAthleteId: cleanString(args.event.athlete_id),
      syncState: localChanged ? 'LOCAL_CHANGED' : 'SYNCED',
      lastSeenAt: new Date(),
      lastPulledAt: new Date(),
      remoteDeletedAt: null,
      localDeletedAt: null,
      lastRemoteChecksum: parsed.checksum,
      rawRemote: jsonSafe(args.event),
      metadata: mappingMetadata({
        planId: local.planId,
        scheduledDate: parsed.scheduledDate,
        window: args.window,
        trigger: args.trigger,
        remoteName: parsed.name,
      }),
    });
    return {
      ...zero,
      unchanged: localChanged ? 0 : 1,
      skipped: localChanged ? 1 : 0,
    };
  }

  /** 优先 FIT，其次 workout_doc，解析为 ParsedRemoteWorkout。 */
  private async parseRemoteWorkout(
    event: IntervalsIcuEvent,
  ): Promise<ParsedRemoteWorkout | null> {
    const scheduledDate = eventDate(event);
    const fitBase64 = extractFitBase64(event);
    if (!scheduledDate || !fitBase64) return null;

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

  /** 按 external_id/uid/mapping 找回或决定新建本地课。 */
  private async resolveImportTargetWorkout(args: {
    userId: string;
    parsed: ParsedRemoteWorkout;
  }) {
    const scheduledDate = parseYmd(args.parsed.scheduledDate);
    const plans = await this.planSync.findActivePausedPlans(args.userId);
    const planIds = plans.map((plan: { id: string }) => plan.id);
    if (!planIds.length) return null;

    const candidates = await this.planSync.findImportCandidateWorkouts({
      userId: args.userId,
      planIds,
      scheduledDate,
      sportType: args.parsed.sportType,
    });

    const matched = candidates.filter(
      (workout) =>
        this.localContentChecksum(workout) === args.parsed.contentChecksum,
    );
    if (!matched.length) return null;

    matched.sort((a, b) => {
      const aHasPrimary = Array.isArray(a.links) && a.links.length > 0 ? 1 : 0;
      const bHasPrimary = Array.isArray(b.links) && b.links.length > 0 ? 1 : 0;
      if (aHasPrimary !== bHasPrimary) return aHasPrimary - bHasPrimary;
      return (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1);
    });
    return matched[0] ?? null;
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

  /** 导出/更新单条本地计划课到远端日历。 */
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
    if (mapping?.syncState === 'CONFLICT') {
      // 冲突状态下不推送，防止把未确认的一边覆盖掉。
      return { ...zero, conflicted: 1 };
    }
    if (mapping?.remoteDeletedAt && mapping.origin === 'LOCAL') {
      // 用户在远端删过本地来源课程时，不自动“复活”远端事件。
      return { ...zero, skipped: 1 };
    }

    const localChecksum = this.localWorkoutChecksum(args.workout);
    if (
      mapping?.externalEventId &&
      mapping.lastLocalChecksum === localChecksum &&
      mapping.syncState === 'SYNCED'
    ) {
      await this.updateMapping(mapping.id, {
        lastSeenAt: new Date(),
        metadata: mappingMetadata({
          planId: args.workout.planId,
          scheduledDate: ymd(args.workout.scheduledDate),
          window: args.window,
          trigger: args.trigger,
          remoteName: args.workout.name,
        }),
      });
      return { ...zero, unchanged: 1 };
    }

    const payload = await this.buildEventPayload(args.workout, mapping);
    const externalKey = cleanString(payload.external_id);
    const uid = cleanString(payload.uid);
    const remoteExisting =
      (externalKey ? args.remoteIndex.byExternalKey.get(externalKey) : null) ??
      (uid ? args.remoteIndex.byUid.get(uid) : null) ??
      null;
    const remoteEventId =
      cleanString(mapping?.externalEventId) ?? eventId(remoteExisting);

    // 有 Intervals event id 就 PUT；没有就走 bulk upsert。
    // external_id 只能匹配本应用创建的事件，所以本地仍保存 event id 作为双保险。
    const response = remoteEventId
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

    const savedRemoteEventId = response
      ? (eventId(response) ?? remoteEventId)
      : remoteEventId;
    const remoteChecksum = localChecksum;
    await this.upsertMapping({
      id: mapping?.id,
      userId: args.userId,
      connectionId: args.connection.id,
      planWorkoutId: args.workout.id,
      externalEventId: savedRemoteEventId,
      externalUid: cleanString(response?.uid) ?? uid,
      externalSourceKey: cleanString(response?.external_id) ?? externalKey,
      externalAthleteId: cleanString(response?.athlete_id),
      origin: mapping?.origin ?? 'LOCAL',
      syncState: 'SYNCED',
      lastLocalChecksum: localChecksum,
      lastRemoteChecksum: remoteChecksum,
      lastSyncedChecksum: localChecksum,
      lastSeenAt: new Date(),
      lastPushedAt: new Date(),
      remoteDeletedAt: null,
      localDeletedAt: null,
      lastError: null,
      rawRemote: response ?? null,
      metadata: mappingMetadata({
        planId: args.workout.planId,
        scheduledDate: ymd(args.workout.scheduledDate),
        window: args.window,
        trigger: args.trigger,
        remoteName: args.workout.name,
      }),
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

  /** 本地已删但远端仍在的事件 → 远端 bulk-delete。 */
  private async deleteLocalRemovedRemoteEvents(args: {
    userId: string;
    connection: IntervalsIcuPlanConnection;
    apiKey: IntervalsIcuApiCredential;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    // planWorkoutId 被 FK 置空代表本地 workout 已删除；LOCAL 来源需要同步删除远端 event。
    const mappings = await this.planSync.findMappings({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        origin: 'LOCAL',
        planWorkoutId: null,
        externalEventId: { not: null },
        remoteDeletedAt: null,
      },
    });
    const due = mappings.filter((mapping) => {
      const scheduledDate = mappingScheduledDate(mapping.metadata);
      return (
        scheduledDate &&
        scheduledDate >= args.window.oldest &&
        scheduledDate <= args.window.newest
      );
    });
    if (!due.length) return 0;

    await this.intervalsIcuClient.deleteEventsBulk(
      args.apiKey,
      due.flatMap((mapping) =>
        mapping.externalEventId ? [{ id: mapping.externalEventId }] : [],
      ),
    );
    await this.planSync.updateManyMappings({
      where: { id: { in: due.map((mapping) => mapping.id) } },
      data: {
        syncState: 'LOCAL_DELETED',
        localDeletedAt: new Date(),
        remoteDeletedAt: new Date(),
        lastPushedAt: new Date(),
        lastError: null,
      },
    });
    return due.length;
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

    await this.intervalsIcuClient.deleteEventsBulk(
      args.apiKey,
      mappings.flatMap((mapping) =>
        mapping.externalEventId ? [{ id: mapping.externalEventId }] : [],
      ),
    );
    await this.planSync.updateManyMappings({
      where: { id: { in: mappings.map((mapping) => mapping.id) } },
      data: {
        syncState: 'LOCAL_DELETED',
        localDeletedAt: new Date(),
        remoteDeletedAt: new Date(),
        lastPushedAt: new Date(),
        lastError: null,
      },
    });
    return mappings.length;
  }

  /** 窗口内远端消失的事件 → 标记 mapping / 处理本地。 */
  private async markMissingRemoteEvents(args: {
    userId: string;
    connectionId: string;
    window: WeekWindow;
    seenRemoteEventIds: Set<string>;
  }) {
    // import 阶段没看到原 event，说明远端窗口内已删除；先标记，不直接删除本地。
    const mappings = await this.planSync.findMappings({
      where: {
        userId: args.userId,
        provider: PROVIDER,
        externalEventId: { not: null },
        remoteDeletedAt: null,
        planWorkout: {
          scheduledDate: {
            gte: parseYmd(args.window.oldest),
            lte: parseYmd(args.window.newest),
          },
        },
      },
      include: { planWorkout: true },
    });
    const missing = mappings.filter(
      (mapping) =>
        mapping.externalEventId &&
        !args.seenRemoteEventIds.has(String(mapping.externalEventId)),
    );
    if (!missing.length) return 0;
    await this.planSync.updateManyMappings({
      where: { id: { in: missing.map((mapping) => mapping.id) } },
      data: {
        syncState: 'REMOTE_DELETED',
        remoteDeletedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    return missing.length;
  }

  /** 按远端 event id / uid / external_id 查 mapping。 */
  private async findMappingForRemote(userId: string, event: IntervalsIcuEvent) {
    const remoteEventId = eventId(event);
    const externalSourceKey = cleanString(event.external_id);
    const externalUid = cleanString(event.uid);
    const clauses = [
      remoteEventId ? { externalEventId: remoteEventId } : null,
      externalSourceKey ? { externalSourceKey } : null,
      externalUid ? { externalUid } : null,
    ].filter(Boolean);
    if (!clauses.length) return null;
    return this.planSync.findMapping({
      where: {
        userId,
        provider: PROVIDER,
        OR: clauses,
      },
    });
  }

  /** 加载本地 PlanWorkout（含 steps）。 */
  private async findLocalWorkout(userId: string, workoutId: string) {
    return this.planSync.findLocalWorkout(userId, workoutId);
  }

  /** 本地课的 sync checksum（含日期/名称等）。 */
  private localWorkoutChecksum(workout: SyncWorkout) {
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

  /** 本地课的 content checksum（仅结构）。 */
  private localContentChecksum(workout: SyncWorkout) {
    const blocks = this.workoutService.buildPlanBlocksFromWorkoutSteps(
      Array.isArray(workout.steps) ? workout.steps : [],
      workout.sportType,
    );
    return computeContentChecksum({
      sportType: workout.sportType,
      subSportType: workout.sportDefinitionCode,
      blocks,
    });
  }

  /** 由远端解析结果创建本地独立课。 */
  private async createWorkoutFromRemote(args: {
    userId: string;
    parsed: ParsedRemoteWorkout;
  }) {
    return this.planSync.createIndependentWorkout({
      userId: args.userId,
      scheduledDate: parseYmd(args.parsed.scheduledDate),
      sportType: args.parsed.sportType,
      sportDefinitionCode: args.parsed.sportDefinitionCode,
      name: args.parsed.name,
      text: args.parsed.text,
      notes: args.parsed.notes,
      blocks: args.parsed.blocks,
    });
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
    });
  }

  /** 导入失败时写 mapping 失败状态。 */
  private async markRemoteEventFailed(args: {
    userId: string;
    connectionId: string;
    event: IntervalsIcuEvent;
    error: string;
    window: WeekWindow;
    trigger: SyncTrigger;
  }) {
    const remoteEventId = eventId(args.event);
    await this.upsertMapping({
      userId: args.userId,
      connectionId: args.connectionId,
      externalEventId: remoteEventId,
      externalUid: cleanString(args.event.uid),
      externalSourceKey: cleanString(args.event.external_id),
      externalAthleteId: cleanString(args.event.athlete_id),
      origin: isTrainingloadExternalKey(args.event.external_id)
        ? 'LOCAL'
        : 'REMOTE',
      syncState: 'FAILED',
      lastSeenAt: new Date(),
      lastError: args.error,
      remoteDeletedAt: null,
      localDeletedAt: null,
      rawRemote: args.event,
      metadata: mappingMetadata({
        scheduledDate: eventDate(args.event),
        window: args.window,
        trigger: args.trigger,
        remoteName: cleanString(args.event.name),
      }),
    });
  }

  /** 创建或更新 PlanWorkoutExternalMapping。 */
  private async upsertMapping(data: Record<string, unknown>) {
    // mapping 是幂等核心：任何一个稳定键命中，都更新同一条映射。
    const id = cleanString(data.id);
    const existing = id
      ? await this.planSync.findMappingUnique({ where: { id } })
      : await this.findExistingMapping(data);
    const write = this.mappingWriteData(data);
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

  /** 按 planWorkoutId / external ids 查找已有 mapping。 */
  private async findExistingMapping(data: Record<string, unknown>) {
    const clauses = [
      cleanString(data.planWorkoutId)
        ? { planWorkoutId: cleanString(data.planWorkoutId) }
        : null,
      cleanString(data.externalEventId)
        ? { externalEventId: cleanString(data.externalEventId) }
        : null,
      cleanString(data.externalUid)
        ? { externalUid: cleanString(data.externalUid) }
        : null,
      cleanString(data.externalSourceKey)
        ? { externalSourceKey: cleanString(data.externalSourceKey) }
        : null,
    ].filter(Boolean);
    if (!clauses.length) return null;
    return this.planSync.findMapping({
      where: {
        userId: data.userId,
        provider: PROVIDER,
        OR: clauses,
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
    return this.planSync.updateMapping({
      where: { id },
      data: this.mappingWriteData(
        data,
      ) as Prisma.PlanWorkoutExternalMappingUncheckedUpdateInput,
    });
  }
}
