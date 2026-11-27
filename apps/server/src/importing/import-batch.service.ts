import {
  IMPORT_ACTIVITY_START_IN_FUTURE,
  ImportSourceObjectType,
  importJsonValue,
} from './import-item-job.types';
import type { IntervalsAuthorization } from '@/integrations/intervals-icu/intervals-icu-authorization';
import { createHash } from 'crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { I18nService } from 'nestjs-i18n';
import {
  $Enums,
  ImportBatchJobStatus,
  ImportItemJobStatus,
  ImportPipelineStage,
  ImportSourceKind,
  Prisma,
  ThirdPartyProvider,
  type ImportBatchJob,
} from '@prisma/client';
import type { IntervalsIcuActivityListItem } from '@/integrations/intervals-icu/intervals-icu.client';
import { forEachWithConcurrency } from '@/utils/async-concurrency.util';
import { ExternalActivitySourceRouter } from './external-activity-source-router.service';
import { webhookContentChecksum } from '@/integrations/external-provider/external-provider-webhook-inbox.service';

const ACTIVE_IMPORT_ITEM_STATUSES = [
  ImportItemJobStatus.QUEUED,
  ImportItemJobStatus.NORMALIZING,
  ImportItemJobStatus.MATERIALIZING,
  ImportItemJobStatus.PARQUET_BUILDING,
  ImportItemJobStatus.ANALYZING,
];
const IMPORT_SOURCE_REGISTRATION_CONCURRENCY = 4;

/**
 * 第三方导入批次原因
 * initial：用户新建、重新授权或更新第三方连接后，拉最近 60 天
 * manual：用户手动触发，拉指定时间窗口
 * scheduled：定时任务触发，拉指定时间窗口
 * backfill：用户手动触发，拉指定时间窗口
 * webhook：第三方 Webhook 触发，拉指定时间窗口
 */
type ThirdPartyImportReason =
  | 'initial'
  | 'manual'
  | 'scheduled'
  | 'webhook'
  | 'backfill';

function fileSourceUid(file: Express.Multer.File, userId: string) {
  // 文件来源没有外部 id，用用户 id + 文件名 + 内容 hash 生成稳定幂等键。
  const hash = createHash('sha1')
    .update(userId)
    .update('|')
    .update(file.originalname ?? '')
    .update('|')
    .update(file.buffer ?? Buffer.alloc(0))
    .digest('hex');
  return `file:${hash}`;
}

/** 使用用户 ID + Intervals.icu 活动 ID 生成稳定的导入源标识。 */
function intervalsIcuSourceUid(
  userId: string,
  externalId: string,
  authorization?: IntervalsAuthorization,
) {
  return authorization
    ? `intervals_icu:${userId}:account:${encodeURIComponent(authorization.athleteId)}:grant:${stableChecksum(authorization.revision)}:${externalId}`
    : `intervals_icu:${userId}:${externalId}`;
}

type IntervalsIcuDiscoveredImport = {
  externalId: string;
  activity: IntervalsIcuActivityListItem;
  checksum: string;
  sourceUid: string;
};

/**
 * 把 Intervals.icu 摘要中的开始时间写成可索引的时间线字段。
 * 优先使用带时区的 start_date；仅有当地时间时按 UTC 保存其墙钟值，
 * 这样至少能稳定排序，原始值仍完整保留在 rawPayload 中供展示和匹配。
 */
function intervalsIcuTimelineStartTime(
  activity: IntervalsIcuActivityListItem,
): Date | null {
  const raw = String(
    activity.start_date ?? activity.start_date_local ?? '',
  ).trim();
  if (!raw) return null;
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const parsed = new Date(hasTimeZone ? raw : `${raw}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 将 Intervals.icu 活动列表项标准化为导入候选。
 * sourceUid 为 intervals_icu:${userId}:${externalId}
 * checksum 为 activity 的稳定校验和
 * @param userId 用户ID
 * @param activities Intervals.icu 活动列表项
 * @returns Intervals.icu 活动列表项标准化为导入候选
 */
function discoverIntervalsIcuActivities(
  userId: string,
  activities: IntervalsIcuActivityListItem[],
  authorization?: IntervalsAuthorization,
): IntervalsIcuDiscoveredImport[] {
  const discovered: IntervalsIcuDiscoveredImport[] = [];
  for (const activity of activities) {
    const externalId = String(activity.id ?? '').trim();
    if (!externalId) continue;
    discovered.push({
      externalId,
      activity,
      checksum: stableChecksum(activity),
      sourceUid: intervalsIcuSourceUid(userId, externalId, authorization),
    });
  }
  return discovered;
}

export type ExternalArchiveImportFile = {
  sourceUid: string;
  externalId?: string | null;
  fileName: string;
  fileKey: string;
  checksum: string;
  size: number;
  archivePath: string;
  objectType:
    | typeof ImportSourceObjectType.THIRD_PARTY_ACTIVITY_FILE
    | typeof ImportSourceObjectType.THIRD_PARTY_HEALTH_FILE
    | typeof ImportSourceObjectType.THIRD_PARTY_MIXED_FIT;
  metadata?: Record<string, unknown>;
};

export type ExternalProviderImportCandidate = {
  sourceUid: string;
  externalId: string;
  accountRef?: string | null;
  objectType: string;
  rawChecksum?: string | null;
  /** Producer-owned stable input version; excludes leases and scheduling metadata. */
  inputRevision?: string;
  rawPayload?: unknown;
  metadata?: unknown;
  sourceRef?: unknown;
  timelineTitle?: string | null;
  timelineStartTime?: Date | null;
};

type ExternalProviderImportBatchArgs = {
  userId: string;
  sourceKind: ImportSourceKind;
  provider: ThirdPartyProvider;
  candidates: ExternalProviderImportCandidate[];
  totalDiscovered?: number;
  requestContext: Record<string, unknown>;
  skipCompletedUnchanged?: boolean;
  reuseRunningBatch?: boolean;
};

function toSafeJson<T>(value: T) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableChecksum(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(toSafeJson(value)))
    .digest('hex');
}

function redactImportRequestContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactImportRequestContext);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(?:ciphertext|secret|token)$/i.test(key))
      .map(([key, entry]) => [key, redactImportRequestContext(entry)]),
  );
}

@Injectable()
export class ImportBatchService {
  private readonly logger = new Logger(ImportBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly i18n: I18nService,
    private readonly importJobs: ImportingJobService,
    private readonly users: UserQueryService,
    private readonly externalActivityRouter: ExternalActivitySourceRouter,
  ) {}

  private logImportPipelineEvent(args: {
    batchJobId?: string | null;
    itemJobId?: string | null;
    postProcessJobId?: string | null;
    userId?: string | null;
    stage: ImportPipelineStage;
    message: string;
    data?: Record<string, unknown>;
    level?: 'INFO' | 'WARN' | 'ERROR';
  }) {
    const ctx = [
      `stage=${args.stage}`,
      args.batchJobId ? `batch=${args.batchJobId}` : null,
      args.itemJobId ? `item=${args.itemJobId}` : null,
      args.postProcessJobId ? `postProcess=${args.postProcessJobId}` : null,
      args.userId ? `user=${args.userId}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const dataSuffix =
      args.data != null && Object.keys(args.data).length > 0
        ? ` data=${JSON.stringify(args.data)}`
        : '';
    const line = `[导入批次] ${ctx} ${args.message}${dataSuffix}`;
    switch (args.level ?? 'INFO') {
      case 'ERROR':
        this.logger.error(line);
        break;
      case 'WARN':
        this.logger.warn(line);
        break;
      default:
        this.logger.log(line);
    }
  }
  /**
   * 断言导入批次的所有权
   * @param batchJobId 导入批次ID
   * @param userId 用户ID
   * @returns 导入批次
   */
  private async assertBatchOwnership(batchJobId: string, userId: string) {
    const batch = await this.importJobs.batchJobs().findFirst({
      where: {
        id: batchJobId,
        userId,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(
        this.i18n.t('common.error.import_batch_not_found'),
      );
    }

    return batch;
  }
  /**
   * 判断当前用户是否可以导入，通过检查用户是否被删除来判断 accountDeletionRequestedAt 来表明用户是否被删除
   * @param userId 用户ID
   * @returns 用户是否可以导入
   */
  async assertUserCanImport(userId: string) {
    const user = await this.users.users().findUnique({
      where: { id: userId },
      select: { accountDeletionRequestedAt: true },
    });
    if (!user || user.accountDeletionRequestedAt) {
      throw new Error('ACCOUNT_DELETION_IN_PROGRESS');
    }
  }

  private async isMaterializedSourceActive(args: {
    userId: string;
    sourceKind: ImportSourceKind;
    sourceUid: string;
  }) {
    const source = await this.prisma.activitySource.findUnique({
      where: {
        activity_source_identity_unique: {
          userId: args.userId,
          sourceKind: args.sourceKind,
          sourceUid: args.sourceUid,
        },
      },
      select: {
        isActive: true,
      },
    });
    return source?.isActive === true;
  }

  /**
   * 批量读取第三方活动的发现状态，避免对每个活动分别查询源对象、任务和物化状态。
   */
  private async loadImportDiscoveryState(args: {
    userId: string;
    sourceKind: ImportSourceKind;
    sourceUids: string[];
  }) {
    const sourceUids = Array.from(new Set(args.sourceUids));
    if (sourceUids.length === 0) {
      return {
        sourceObjectsByUid: new Map() as Map<
          string,
          { rawChecksum: string | null; metadata: unknown }
        >,
        completedSourceUids: new Set<string>(),
        runningSourceUids: new Set<string>(),
        activeSourceUids: new Set<string>(),
      };
    }

    const [sourceObjects, itemJobs, activeSources] = await Promise.all([
      this.importJobs.sourceObjects().findMany({
        where: {
          userId: args.userId,
          sourceKind: args.sourceKind,
          sourceUid: { in: sourceUids },
        },
        select: {
          sourceUid: true,
          rawChecksum: true,
          metadata: true,
        },
      }),
      this.importJobs.itemJobs().findMany({
        where: {
          userId: args.userId,
          sourceKind: args.sourceKind,
          sourceUid: { in: sourceUids },
          status: {
            in: [ImportItemJobStatus.DONE, ...ACTIVE_IMPORT_ITEM_STATUSES],
          },
        },
        select: {
          sourceUid: true,
          status: true,
        },
      }),
      this.prisma.activitySource.findMany({
        where: {
          userId: args.userId,
          sourceKind: args.sourceKind,
          sourceUid: { in: sourceUids },
          isActive: true,
        },
        select: { sourceUid: true },
      }),
    ]);

    const sourceObjectsByUid = new Map(
      sourceObjects.map((sourceObject) => [
        sourceObject.sourceUid,
        sourceObject,
      ]),
    );
    const completedSourceUids = new Set<string>();
    const runningSourceUids = new Set<string>();
    for (const itemJob of itemJobs as Array<{
      sourceUid: string;
      status: ImportItemJobStatus;
    }>) {
      if (itemJob.status === ImportItemJobStatus.DONE) {
        completedSourceUids.add(itemJob.sourceUid);
      } else {
        runningSourceUids.add(itemJob.sourceUid);
      }
    }

    return {
      sourceObjectsByUid,
      completedSourceUids,
      runningSourceUids,
      activeSourceUids: new Set(
        activeSources.map((source) => source.sourceUid),
      ),
    };
  }
  /**
   * 创建文件导入批次。
   * @param args - 参数。
   * @param args.userId - 用户 ID。
   * @param args.files - 文件。
   * @param args.req - 请求。
   * @param args
   * @returns 文件导入批次。
   */
  async createFileImportBatch(args: {
    userId: string;
    files: Express.Multer.File[];
    req?: Express.Request;
    postProcessPolicy?: {
      suppressAutomaticAiReview?: boolean;
      suppressAthleteStateReassessment?: boolean;
      suppressThirdPartyExport?: boolean;
    };
  }) {
    // 检查当前用户是否可以导入
    await this.assertUserCanImport(args.userId);
    // 上传文件先落源对象与 item job，真正解析/实体化交给 import item worker 异步处理。
    if (!args.files.length) {
      throw new Error('files are required');
    }
    // 创建导入批次
    const batch = await this.importJobs.batchJobs().create({
      data: {
        userId: args.userId,
        sourceKind: $Enums.ImportSourceKind.FILE,
        status: $Enums.ImportBatchJobStatus.QUEUED,
        totalCount: args.files.length,
        requestContext: {
          source: 'upload',
          fileCount: args.files.length,
          ...(args.postProcessPolicy?.suppressAutomaticAiReview === true
            ? { suppressAutomaticAiReview: true }
            : {}),
          ...(args.postProcessPolicy?.suppressAthleteStateReassessment === true
            ? { suppressAthleteStateReassessment: true }
            : {}),
          ...(args.postProcessPolicy?.suppressThirdPartyExport === true
            ? { suppressThirdPartyExport: true }
            : {}),
        } as Prisma.InputJsonValue,
      } satisfies Prisma.ImportBatchJobUncheckedCreateInput,
    });

    this.logger.log(
      `已创建文件导入批次：批次ID=${batch.id}，用户ID=${args.userId}，文件数=${args.files.length}`,
    );
    // 记录导入批次创建事件
    this.logImportPipelineEvent({
      batchJobId: batch.id,
      userId: args.userId,
      stage: $Enums.ImportPipelineStage.BATCH_CREATED,
      message: `已创建文件导入批次，共 ${args.files.length} 个源对象`,
      data: { totalCount: args.files.length },
    });
    // 并发处理文件
    await forEachWithConcurrency(
      args.files,
      IMPORT_SOURCE_REGISTRATION_CONCURRENCY,
      async (file, index) => {
        const uploaded = await this.storage.uploadFile(
          file,
          undefined,
          args.req,
        );
        const sourceUid = fileSourceUid(file, args.userId);

        const sourceObject = await this.importJobs.sourceObjects().upsert({
          where: {
            import_source_object_identity_unique: {
              userId: args.userId,
              sourceKind: $Enums.ImportSourceKind.FILE,
              sourceUid,
            },
          },
          create: {
            userId: args.userId,
            sourceKind: $Enums.ImportSourceKind.FILE,
            sourceUid,
            objectType: ImportSourceObjectType.ACTIVITY_FILE,
            fileName: file.originalname,
            fileKey: uploaded.fileKey,
            rawStorageKey: uploaded.fileKey,
            rawChecksum: createHash('sha256').update(file.buffer).digest('hex'),
            metadata: {
              size: file.size,
              mimeType: file.mimetype,
              originalFileName: file.originalname,
            } as Prisma.InputJsonValue,
          } satisfies Prisma.ImportSourceObjectUncheckedCreateInput,
          update: {
            fileName: file.originalname,
            fileKey: uploaded.fileKey,
            rawStorageKey: uploaded.fileKey,
            rawChecksum: createHash('sha256').update(file.buffer).digest('hex'),
            metadata: {
              size: file.size,
              mimeType: file.mimetype,
              originalFileName: file.originalname,
            } as Prisma.InputJsonValue,
          } satisfies Prisma.ImportSourceObjectUncheckedUpdateInput,
        });

        const item = await this.importJobs.itemJobs().create({
          data: {
            batchJobId: batch.id,
            userId: args.userId,
            sourceObjectId: sourceObject.id,
            sourceKind: $Enums.ImportSourceKind.FILE,
            sourceUid,
            position: index,
            status: $Enums.ImportItemJobStatus.QUEUED,
            sourceRef: {
              fileName: file.originalname,
              fileKey: uploaded.fileKey,
            } as Prisma.InputJsonValue,
          } satisfies Prisma.ImportItemJobUncheckedCreateInput,
        });

        this.logImportPipelineEvent({
          batchJobId: batch.id,
          itemJobId: item.id,
          userId: args.userId,
          stage: 'SOURCE_REGISTERED',
          message: `已登记文件源对象：${file.originalname}`,
          data: {
            fileName: file.originalname,
            fileKey: uploaded.fileKey,
            sourceUid,
          },
        });
      },
    );

    return batch;
  }

  /**
   * 为由部署适配器拥有的归档导入创建空批次。
   * Core 只维护批次生命周期，不解释 provider、区域或下载方式。
   */
  async createExternalArchiveImportBatch(args: {
    userId: string;
    sourceKind: ImportSourceKind;
    requestContext: Record<string, unknown>;
    summary: Record<string, unknown>;
  }) {
    await this.assertUserCanImport(args.userId);
    const active = await this.importJobs.batchJobs().findFirst({
      where: {
        userId: args.userId,
        sourceKind: args.sourceKind,
        status: { in: ['QUEUED', 'RUNNING', 'POST_PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return active;

    return this.importJobs.batchJobs().create({
      data: {
        userId: args.userId,
        sourceKind: args.sourceKind,
        status: 'QUEUED',
        totalCount: 0,
        requestContext: toSafeJson(
          args.requestContext,
        ) as Prisma.InputJsonValue,
        summary: toSafeJson(args.summary) as Prisma.InputJsonValue,
      },
    });
  }

  /** 判断外部归档中的源对象是否需要再次入队。 */
  async shouldQueueExternalArchiveSource(args: {
    userId: string;
    sourceKind: ImportSourceKind;
    sourceUid: string;
  }) {
    const [completed, running] = await Promise.all([
      this.importJobs.itemJobs().findFirst({
        where: {
          userId: args.userId,
          sourceKind: args.sourceKind,
          sourceUid: args.sourceUid,
          status: 'DONE',
        },
        select: { id: true },
      }),
      this.importJobs.itemJobs().findFirst({
        where: {
          userId: args.userId,
          sourceKind: args.sourceKind,
          sourceUid: args.sourceUid,
          status: {
            in: ACTIVE_IMPORT_ITEM_STATUSES,
          },
        },
        select: { id: true },
      }),
    ]);
    if (
      completed &&
      (await this.isMaterializedSourceActive({
        userId: args.userId,
        sourceKind: args.sourceKind,
        sourceUid: args.sourceUid,
      }))
    )
      return false;

    return !running;
  }

  /**
   * 登记由部署适配器解析出的归档文件。
   * provider 专属上下文和统计信息以不透明 JSON 传入并原样持久化。
   */
  async registerExternalArchiveFiles(args: {
    batchJobId: string;
    userId: string;
    sourceKind: ImportSourceKind;
    provider: ThirdPartyProvider;
    accountRef?: string | null;
    files: ExternalArchiveImportFile[];
    completedRequestContext: Record<string, unknown>;
    emptySummary: Record<string, unknown>;
    runningSummary: Record<string, unknown>;
  }) {
    await this.assertBatchOwnership(args.batchJobId, args.userId);

    if (args.files.length === 0) {
      return this.importJobs.batchJobs().update({
        where: { id: args.batchJobId },
        data: {
          status: 'COMPLETED',
          totalCount: 0,
          completedAt: new Date(),
          requestContext: toSafeJson(
            args.completedRequestContext,
          ) as Prisma.InputJsonValue,
          summary: toSafeJson(args.emptySummary) as Prisma.InputJsonValue,
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      let position = 0;
      for (const file of args.files) {
        const sourceObject = await this.importJobs.sourceObjects(tx).upsert({
          where: {
            import_source_object_identity_unique: {
              userId: args.userId,
              sourceKind: args.sourceKind,
              sourceUid: file.sourceUid,
            },
          },
          create: {
            userId: args.userId,
            sourceKind: args.sourceKind,
            provider: args.provider,
            sourceUid: file.sourceUid,
            accountRef: args.accountRef ?? undefined,
            externalId: file.externalId ?? undefined,
            objectType: file.objectType,
            fileName: file.fileName,
            fileKey: file.fileKey,
            rawStorageKey: file.fileKey,
            rawChecksum: file.checksum,
            metadata: toSafeJson(file.metadata ?? {}) as Prisma.InputJsonValue,
            discoveredAt: new Date(),
          },
          update: {
            provider: args.provider,
            accountRef: args.accountRef ?? undefined,
            externalId: file.externalId ?? undefined,
            objectType: file.objectType,
            fileName: file.fileName,
            fileKey: file.fileKey,
            rawStorageKey: file.fileKey,
            rawChecksum: file.checksum,
            metadata: toSafeJson(file.metadata ?? {}) as Prisma.InputJsonValue,
            discoveredAt: new Date(),
          },
        });

        const item = await this.importJobs.itemJobs(tx).create({
          data: {
            batchJobId: args.batchJobId,
            userId: args.userId,
            sourceObjectId: sourceObject.id,
            sourceKind: args.sourceKind,
            sourceUid: file.sourceUid,
            position,
            status: 'QUEUED',
            sourceRef: {
              fileName: file.fileName,
              fileKey: file.fileKey,
              externalId: file.externalId ?? null,
            } as Prisma.InputJsonValue,
          },
        });
        position += 1;

        await tx.importEventLog.create({
          data: {
            batchJobId: args.batchJobId,
            itemJobId: item.id,
            userId: args.userId,
            stage: 'SOURCE_REGISTERED',
            level: 'INFO',
            message: `Registered external archive item: ${file.fileName}`,
            data: {
              fileName: file.fileName,
              sourceUid: file.sourceUid,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return this.importJobs.batchJobs(tx).update({
        where: { id: args.batchJobId },
        data: {
          status: 'RUNNING',
          totalCount: args.files.length,
          requestContext: toSafeJson(
            args.completedRequestContext,
          ) as Prisma.InputJsonValue,
          summary: toSafeJson(args.runningSummary) as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * 登记部署适配器已经标准化的外部活动候选。
   * Core 只处理幂等、批次和 source object 生命周期，不包含 provider 字段解析。
   */
  async createExternalProviderImportBatch(
    args: ExternalProviderImportBatchArgs,
  ) {
    await this.assertUserCanImport(args.userId);
    if (['STRAVA', 'GARMIN', 'GARMIN_PERSONAL_API'].includes(args.sourceKind)) {
      return this.createRevisionedProviderImportBatch(args);
    }
    const totalDiscovered = args.totalDiscovered ?? args.candidates.length;
    const discoveryState = await this.loadImportDiscoveryState({
      userId: args.userId,
      sourceKind: args.sourceKind,
      sourceUids: args.candidates.map((candidate) => candidate.sourceUid),
    });

    if (args.reuseRunningBatch && args.candidates.length === 1) {
      const candidate = args.candidates[0];
      if (discoveryState.runningSourceUids.has(candidate.sourceUid)) {
        const running = await this.importJobs.itemJobs().findFirst({
          where: {
            userId: args.userId,
            sourceKind: args.sourceKind,
            sourceUid: candidate.sourceUid,
            status: { in: ACTIVE_IMPORT_ITEM_STATUSES },
          },
          include: { batchJob: true },
          orderBy: { createdAt: 'desc' },
        });
        if (running?.batchJob) {
          return {
            batch: running.batchJob,
            totalDiscovered,
            queuedCount: 0,
            skippedCount: totalDiscovered,
            reused: true,
          };
        }
      }
    }

    const queuedInputs = args.candidates.filter((candidate) => {
      if (discoveryState.runningSourceUids.has(candidate.sourceUid)) {
        return false;
      }
      if (args.skipCompletedUnchanged === false) return true;
      const existing = discoveryState.sourceObjectsByUid.get(
        candidate.sourceUid,
      );
      return !(
        candidate.rawChecksum != null &&
        existing?.rawChecksum === candidate.rawChecksum &&
        discoveryState.completedSourceUids.has(candidate.sourceUid) &&
        discoveryState.activeSourceUids.has(candidate.sourceUid)
      );
    });

    if (queuedInputs.length === 0) {
      return {
        batch: null,
        totalDiscovered,
        queuedCount: 0,
        skippedCount: totalDiscovered,
        reused: false,
      };
    }

    const batch = await this.importJobs.batchJobs().create({
      data: {
        userId: args.userId,
        sourceKind: args.sourceKind,
        status: ImportBatchJobStatus.QUEUED,
        totalCount: queuedInputs.length,
        requestContext: toSafeJson(
          args.requestContext,
        ) as Prisma.InputJsonValue,
      },
    });

    await forEachWithConcurrency(
      queuedInputs,
      IMPORT_SOURCE_REGISTRATION_CONCURRENCY,
      async (candidate, position) => {
        const sourceObject = await this.importJobs.sourceObjects().upsert({
          where: {
            import_source_object_identity_unique: {
              userId: args.userId,
              sourceKind: args.sourceKind,
              sourceUid: candidate.sourceUid,
            },
          },
          create: {
            userId: args.userId,
            sourceKind: args.sourceKind,
            provider: args.provider,
            sourceUid: candidate.sourceUid,
            accountRef: candidate.accountRef ?? undefined,
            externalId: candidate.externalId,
            objectType: candidate.objectType,
            rawChecksum: candidate.rawChecksum ?? undefined,
            rawPayload: toSafeJson(
              candidate.rawPayload ?? null,
            ) as Prisma.InputJsonValue,
            metadata: toSafeJson(
              candidate.metadata ?? {},
            ) as Prisma.InputJsonValue,
            timelineTitle: candidate.timelineTitle ?? undefined,
            timelineStartTime: candidate.timelineStartTime ?? undefined,
            discoveredAt: new Date(),
            sourceUpdatedAt: new Date(),
          },
          update: {
            provider: args.provider,
            accountRef: candidate.accountRef ?? undefined,
            externalId: candidate.externalId,
            objectType: candidate.objectType,
            rawChecksum: candidate.rawChecksum ?? undefined,
            rawPayload: toSafeJson(
              candidate.rawPayload ?? null,
            ) as Prisma.InputJsonValue,
            metadata: toSafeJson(
              candidate.metadata ?? {},
            ) as Prisma.InputJsonValue,
            timelineTitle: candidate.timelineTitle ?? undefined,
            timelineStartTime: candidate.timelineStartTime ?? undefined,
            discoveredAt: new Date(),
            sourceUpdatedAt: new Date(),
          },
        });
        const item = await this.importJobs.itemJobs().create({
          data: {
            batchJobId: batch.id,
            userId: args.userId,
            sourceObjectId: sourceObject.id,
            sourceKind: args.sourceKind,
            sourceUid: candidate.sourceUid,
            position,
            status: ImportItemJobStatus.QUEUED,
            sourceRef: toSafeJson(
              candidate.sourceRef ?? { externalId: candidate.externalId },
            ) as Prisma.InputJsonValue,
          },
        });
        this.logImportPipelineEvent({
          batchJobId: batch.id,
          itemJobId: item.id,
          userId: args.userId,
          stage: ImportPipelineStage.SOURCE_REGISTERED,
          message: `已登记外部活动源对象：${candidate.externalId}`,
          data: {
            externalId: candidate.externalId,
            sourceUid: candidate.sourceUid,
          },
        });
      },
    );

    this.logImportPipelineEvent({
      batchJobId: batch.id,
      userId: args.userId,
      stage: ImportPipelineStage.BATCH_CREATED,
      message: `已创建外部活动导入批次，待处理 ${queuedInputs.length} 个活动`,
      data: {
        totalDiscovered,
        queuedCount: queuedInputs.length,
        skippedCount: totalDiscovered - queuedInputs.length,
      },
    });

    return {
      batch,
      totalDiscovered,
      queuedCount: queuedInputs.length,
      skippedCount: totalDiscovered - queuedInputs.length,
      reused: false,
    };
  }

  /**
   * 将 Intervals.icu 活动列表项登记为 source object，并创建导入任务。
   */
  /** Keep one active item per source; its terminal transition hands off newer input. */
  private createRevisionedProviderImportBatch(
    args: ExternalProviderImportBatchArgs,
  ) {
    return this.importJobs.withSourceLocks(
      {
        ...args,
        sourceUids: args.candidates.map((candidate) => candidate.sourceUid),
      },
      async (tx) => {
        let batch: ImportBatchJob | null = null;
        let runningBatch: typeof batch = null;
        let queuedCount = 0;
        const totalDiscovered = args.totalDiscovered ?? args.candidates.length;
        for (const candidate of args.candidates) {
          const identity = {
            userId: args.userId,
            sourceKind: args.sourceKind,
            sourceUid: candidate.sourceUid,
          };
          const previous = await this.importJobs.sourceObjects(tx).findUnique({
            where: { import_source_object_identity_unique: identity },
          });
          const revision =
            candidate.inputRevision ||
            webhookContentChecksum({
              rawChecksum: candidate.rawChecksum ?? null,
              rawPayload: toSafeJson(candidate.rawPayload ?? null),
              sourceRef: toSafeJson(candidate.sourceRef ?? null),
            });
          const sourceRef = toSafeJson(
            candidate.sourceRef ?? { externalId: candidate.externalId },
          ) as Prisma.InputJsonValue;
          const values = {
            provider: args.provider,
            accountRef: candidate.accountRef ?? undefined,
            externalId: candidate.externalId,
            objectType: candidate.objectType,
            rawChecksum: candidate.rawChecksum ?? undefined,
            ...(candidate.sourceRef &&
            typeof candidate.sourceRef === 'object' &&
            'fileKey' in candidate.sourceRef &&
            typeof candidate.sourceRef.fileKey === 'string'
              ? {
                  fileKey: candidate.sourceRef.fileKey,
                  rawStorageKey: candidate.sourceRef.fileKey,
                  ...('fileName' in candidate.sourceRef &&
                  typeof candidate.sourceRef.fileName === 'string'
                    ? { fileName: candidate.sourceRef.fileName }
                    : {}),
                }
              : {}),
            rawPayload: toSafeJson(
              candidate.rawPayload ?? null,
            ) as Prisma.InputJsonValue,
            metadata: toSafeJson(
              candidate.metadata ?? {},
            ) as Prisma.InputJsonValue,
            timelineTitle: candidate.timelineTitle ?? undefined,
            timelineStartTime: candidate.timelineStartTime ?? undefined,
            importRevision: revision,
            // An acknowledgement covers only the uninterrupted desired revision.
            ...(previous?.importRevision !== revision
              ? { completedImportRevision: null }
              : {}),
            importRevokedAt: null,
            importRequest: sourceRef,
            ...(args.provider === 'intervals_icu' &&
            previous?.importRevision !== revision
              ? { fileKey: null, rawStorageKey: null, fileName: null }
              : {}),
            discoveredAt: new Date(),
            sourceUpdatedAt: new Date(),
          };
          const source = await this.importJobs.sourceObjects(tx).upsert({
            where: { import_source_object_identity_unique: identity },
            create: { ...identity, ...values },
            update: values,
          });
          const running = await this.importJobs.itemJobs(tx).findFirst({
            where: {
              userId: args.userId,
              sourceObjectId: source.id,
              status: {
                in: [...ACTIVE_IMPORT_ITEM_STATUSES, 'DEDUPING', 'FAILED'],
              },
            },
            include: { batchJob: true },
            orderBy: { createdAt: 'desc' },
          });
          let retired = false;
          if (
            running?.sourceRevision &&
            (running.startedAt || running.status === 'FAILED') &&
            previous?.importRevision !== revision &&
            running.sourceUid === source.sourceUid &&
            ['QUEUED', 'FAILED'].includes(running.status)
          ) {
            const result = await this.importJobs.itemJobs(tx).updateMany({
              where: {
                id: running.id,
                status: { in: ['QUEUED', 'FAILED'] },
                lockToken: null,
              },
              data: {
                status: 'SKIPPED',
                outcome: 'SUPERSEDED',
                completedAt: new Date(),
              },
            });
            retired = result.count === 1;
            if (retired)
              await this.importJobs.refreshBatchProgress(
                running.batchJobId,
                tx,
              );
          }
          if (running && !retired) {
            runningBatch ??= running.batchJob;
            if (
              previous?.importRevision !== revision &&
              running.sourceUid === source.sourceUid &&
              ['QUEUED', 'FAILED'].includes(running.status)
            ) {
              await this.importJobs.itemJobs(tx).updateMany({
                where: {
                  id: running.id,
                  status: { in: ['QUEUED', 'FAILED'] },
                  lockToken: null,
                },
                data: {
                  ...(running.sourceUid === source.sourceUid
                    ? { sourceRevision: revision, sourceRef }
                    : {}),
                  status: 'QUEUED',
                  availableAt: new Date(),
                  attempts: 0,
                  lastError: null,
                  lastErrorCode: null,
                },
              });
            }
            continue;
          }
          if (
            args.skipCompletedUnchanged !== false &&
            !previous?.importRevokedAt &&
            previous?.importRevision === revision &&
            previous?.completedImportRevision === revision
          )
            continue;
          batch ??= await this.importJobs.batchJobs(tx).create({
            data: {
              userId: args.userId,
              sourceKind: args.sourceKind,
              status: 'QUEUED',
              totalCount: args.candidates.length,
              requestContext: toSafeJson(
                args.requestContext,
              ) as Prisma.InputJsonValue,
            },
          });
          await this.importJobs.itemJobs(tx).create({
            data: {
              ...identity,
              batchJobId: batch.id,
              sourceObjectId: source.id,
              sourceRevision: revision,
              position: queuedCount++,
              status: 'QUEUED',
              sourceRef,
            },
          });
        }
        if (batch && queuedCount !== args.candidates.length) {
          batch = await this.importJobs.batchJobs(tx).update({
            where: { id: batch.id },
            data: { totalCount: queuedCount },
          });
        }
        return {
          batch: batch ?? runningBatch,
          totalDiscovered,
          queuedCount,
          skippedCount: totalDiscovered - queuedCount,
          reused: !batch && Boolean(runningBatch),
        };
      },
    );
  }

  async createIntervalsIcuImportBatch(args: {
    userId: string;
    connectionId: string;
    authorization?: IntervalsAuthorization;
    activities: IntervalsIcuActivityListItem[];
    revisionHint?: string;
    reason?: ThirdPartyImportReason;
    discoveryWindow?: { start: Date; end: Date };
  }) {
    await this.assertUserCanImport(args.userId);

    // 序列化活动列表项
    const discovered = discoverIntervalsIcuActivities(
      args.userId,
      args.activities,
      args.authorization,
    );

    // 加载导入发现状态
    const discoveryState = await this.loadImportDiscoveryState({
      userId: args.userId,
      sourceKind: ImportSourceKind.INTERVALS_ICU,
      sourceUids: discovered.map((item) => item.sourceUid),
    });

    const routeResults = new Map<
      string,
      Awaited<
        ReturnType<ExternalActivitySourceRouter['routeIntervalsDiscovery']>
      >
    >();
    const sourceObjectIds = new Map<string, string>();
    // 并发处理活动列表项
    await forEachWithConcurrency(
      discovered,
      IMPORT_SOURCE_REGISTRATION_CONCURRENCY,
      async (item) => {
        // 持久化“远端存在这条活动”的事实，再决定是否具备可导入数据。
        // 受限活动也必须保留在 ImportSourceObject；它不会因此成为 Activity。
        const sourceObject = await this.importJobs.sourceObjects().upsert({
          where: {
            import_source_object_identity_unique: {
              userId: args.userId,
              sourceKind: ImportSourceKind.INTERVALS_ICU,
              sourceUid: item.sourceUid,
            },
          },
          create: {
            userId: args.userId,
            sourceKind: ImportSourceKind.INTERVALS_ICU,
            provider: ThirdPartyProvider.intervals_icu,
            sourceUid: item.sourceUid,
            accountRef: args.authorization?.athleteId ?? '0',
            externalId: item.externalId,
            objectType: ImportSourceObjectType.THIRD_PARTY_ACTIVITY_FILE,
            // The discovery-list checksum is not a hash of the downloaded file.
            // Keep it in metadata and fill rawChecksum only after file resolution.
            rawChecksum: null,
            rawPayload: {
              listActivity: item.activity,
              connectionId: args.connectionId,
              ...(args.authorization
                ? { authorization: importJsonValue(args.authorization) }
                : {}),
            } as Prisma.InputJsonValue,
            timelineTitle: item.activity.name?.trim() || null,
            timelineStartTime: intervalsIcuTimelineStartTime(item.activity),
            metadata: {
              connectionId: args.connectionId,
              ...(args.authorization
                ? { authorization: importJsonValue(args.authorization) }
                : {}),
              listChecksum: item.checksum,
              listActivityName: item.activity.name ?? null,
              listActivityStartDate:
                item.activity.start_date ??
                item.activity.start_date_local ??
                null,
            } as Prisma.InputJsonValue,
            discoveredAt: new Date(),
            lastSeenAt: new Date(),
            sourceUpdatedAt: new Date(),
          },
          update: {
            provider: ThirdPartyProvider.intervals_icu,
            accountRef: args.authorization?.athleteId ?? '0',
            externalId: item.externalId,
            objectType: ImportSourceObjectType.THIRD_PARTY_ACTIVITY_FILE,
            rawPayload: {
              listActivity: item.activity,
              connectionId: args.connectionId,
              ...(args.authorization
                ? { authorization: importJsonValue(args.authorization) }
                : {}),
            } as Prisma.InputJsonValue,
            timelineTitle: item.activity.name?.trim() || null,
            timelineStartTime: intervalsIcuTimelineStartTime(item.activity),
            metadata: {
              connectionId: args.connectionId,
              ...(args.authorization
                ? { authorization: importJsonValue(args.authorization) }
                : {}),
              listChecksum: item.checksum,
              listActivityName: item.activity.name ?? null,
              listActivityStartDate:
                item.activity.start_date ??
                item.activity.start_date_local ??
                null,
            } as Prisma.InputJsonValue,
            lastSeenAt: new Date(),
            sourceUpdatedAt: new Date(),
          },
        });
        sourceObjectIds.set(item.sourceUid, sourceObject.id);
        // 路由结果决定：直接创建 item job、转向真实来源同步，或保留为影子。
        routeResults.set(
          item.sourceUid,
          await this.externalActivityRouter.routeIntervalsDiscovery({
            userId: args.userId,
            sourceObjectId: sourceObject.id,
            activity: item.activity,
            reason: args.reason ?? 'manual',
            discoveryWindow: args.discoveryWindow,
            refreshResolved:
              Boolean(args.revisionHint) ||
              (
                discoveryState.sourceObjectsByUid.get(item.sourceUid)
                  ?.metadata as Record<string, unknown> | null
              )?.listChecksum !== item.checksum,
          }),
        );
      },
    );

    // 这组活动会继续创建 ImportItemJob，是下面四个分类中唯一会驱动本方法后续流程的集合。
    const directlyImportable = discovered.filter(
      (item) =>
        routeResults.get(item.sourceUid)?.kind ===
        'IMPORT_VIA_DISCOVERY_PROVIDER',
    );

    // routeIntervalsDiscovery 已经完成状态写入和来源同步请求登记。下面三个值只是
    // 本轮结果的分类计数，不会再次创建任务或改变状态。返回给调用方，是为了区分
    // “没有新活动”和“活动正在真实来源同步 / 被阻塞 / 早已解析”。
    const routedToOriginCount = discovered.filter(
      (item) => routeResults.get(item.sourceUid)?.kind === 'ROUTE_TO_ORIGIN',
    ).length;
    const blockedSourceCount = discovered.filter(
      (item) =>
        routeResults.get(item.sourceUid)?.kind === 'KEEP_BLOCKED_SOURCE',
    ).length;
    const alreadyResolvedCount = discovered.filter(
      (item) => routeResults.get(item.sourceUid)?.kind === 'ALREADY_RESOLVED',
    ).length;
    const result = await this.createRevisionedProviderImportBatch({
      userId: args.userId,
      sourceKind: ImportSourceKind.INTERVALS_ICU,
      provider: ThirdPartyProvider.intervals_icu,
      candidates: directlyImportable
        .filter((item) => {
          const previous = discoveryState.sourceObjectsByUid.get(
            item.sourceUid,
          );
          const previousChecksum =
            (previous?.metadata as Record<string, unknown> | null)
              ?.listChecksum ?? previous?.rawChecksum;
          return (
            Boolean(args.revisionHint) ||
            previousChecksum !== item.checksum ||
            !discoveryState.completedSourceUids.has(item.sourceUid) ||
            !discoveryState.activeSourceUids.has(item.sourceUid)
          );
        })
        .map((item) => ({
          inputRevision: webhookContentChecksum({
            listChecksum: item.checksum,
            authorization: args.authorization ?? null,
            revisionHint: args.revisionHint ?? null,
          }),
          sourceUid: item.sourceUid,
          externalId: item.externalId,
          accountRef: args.authorization?.athleteId ?? '0',
          objectType: ImportSourceObjectType.THIRD_PARTY_ACTIVITY_FILE,
          rawPayload: {
            listActivity: item.activity,
            connectionId: args.connectionId,
            ...(args.authorization
              ? { authorization: args.authorization }
              : {}),
          },
          metadata: {
            connectionId: args.connectionId,
            ...(args.authorization
              ? { authorization: args.authorization }
              : {}),
            listChecksum: item.checksum,
            listActivityName: item.activity.name ?? null,
          },
          sourceRef: {
            externalId: item.externalId,
            connectionId: args.connectionId,
            ...(args.authorization
              ? { authorization: args.authorization }
              : {}),
            ...(args.revisionHint ? { revisionHint: args.revisionHint } : {}),
          },
          timelineTitle: item.activity.name?.trim() || null,
          timelineStartTime: intervalsIcuTimelineStartTime(item.activity),
        })),
      requestContext: {
        source: 'intervals_icu',
        reason: args.reason ?? 'manual',
        connectionId: args.connectionId,
        totalDiscovered: discovered.length,
      },
      reuseRunningBatch: true,
    });
    return {
      batch: result.batch,
      queuedCount: result.queuedCount,
      totalDiscovered: discovered.length,
      skippedCount: discovered.length - result.queuedCount,
      directlyQueued: result.queuedCount,
      routedToOrigin: routedToOriginCount,
      mirrorsCreated: blockedSourceCount,
      alreadyResolved: alreadyResolvedCount,
      duplicateOrRunning: directlyImportable.length - result.queuedCount,
    };
  }

  async getLatestProviderBatchProgress(args: {
    userId: string;
    sourceKind: ImportSourceKind;
    connectionId: string;
  }) {
    const batch = await this.importJobs.batchJobs().findFirst({
      where: {
        userId: args.userId,
        sourceKind: args.sourceKind,
        requestContext: { path: ['connectionId'], equals: args.connectionId },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalCount: true,
        successCount: true,
        failedCount: true,
        skippedCount: true,
        completedAt: true,
        postProcessJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });
    return batch
      ? {
          batchId: batch.id,
          status: batch.status,
          totalCount: batch.totalCount,
          successCount: batch.successCount,
          failedCount: batch.failedCount,
          skippedCount: batch.skippedCount,
          completedAt: batch.completedAt,
          postProcessingStatus: batch.postProcessJobs[0]?.status ?? null,
        }
      : null;
  }

  async getBatchSummary(batchJobId: string, userId: string) {
    // 先判断所有权，当前用户和批次是否相关
    await this.assertBatchOwnership(batchJobId, userId);

    const batch = await this.importJobs.batchJobs().findUnique({
      where: { id: batchJobId },
      include: {
        postProcessJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            items: true,
            createdActivities: true,
            eventLogs: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(
        this.i18n.t('common.error.import_batch_not_found'),
      );
    }

    const postProcessJob = batch.postProcessJobs[0] ?? null;
    const activityProcessingStatusCounts = batch._count.createdActivities
      ? await this.prisma.activity.groupBy({
          by: ['processingStatus'],
          where: {
            userId,
            createdByBatchJobId: batch.id,
            // These activities already contribute to the batch's failed item count.
            importItemJobs: {
              none: { batchJobId: batch.id, status: 'DEAD', lastErrorCode: IMPORT_ACTIVITY_START_IN_FUTURE },
            },
          },
          _count: { _all: true },
        })
      : [];
    const countActivitiesWithStatus = (
      ...statuses: $Enums.ActivityProcessingStatus[]
    ) =>
      activityProcessingStatusCounts.reduce(
        (total, row) =>
          row.processingStatus && statuses.includes(row.processingStatus)
            ? total + row._count._all
            : total,
        0,
      );
    const readyActivities = countActivitiesWithStatus(
      $Enums.ActivityProcessingStatus.READY,
    );
    const analysisFailedActivities = countActivitiesWithStatus(
      $Enums.ActivityProcessingStatus.PARTIAL_FAILED,
      $Enums.ActivityProcessingStatus.FAILED,
    );
    const processingActivities = Math.max(
      0,
      activityProcessingStatusCounts.reduce((total, row) => total + row._count._all, 0) -
        readyActivities -
        analysisFailedActivities,
    );
    const firstActivity =
      batch.successCount > 0
        ? await this.prisma.activity.findFirst({
            where: {
              userId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { createdByBatchJobId: true },
          })
        : null;

    return {
      id: batch.id,
      userId: batch.userId,
      sourceKind: batch.sourceKind,
      status: batch.status,
      totalCount: batch.totalCount,
      successCount: batch.successCount,
      failedCount: batch.failedCount,
      skippedCount: batch.skippedCount,
      isFirstActivityImport: firstActivity?.createdByBatchJobId === batch.id,
      requestContext: redactImportRequestContext(batch.requestContext),
      summary: batch.summary,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      notificationSentAt: batch.notificationSentAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      counts: {
        items: batch._count.items,
        createdActivities: batch._count.createdActivities,
        readyActivities,
        processingActivities,
        analysisFailedActivities,
        eventLogs: batch._count.eventLogs,
      },
      postProcessJob: postProcessJob
        ? {
            id: postProcessJob.id,
            status: postProcessJob.status,
            recomputeFrom: postProcessJob.recomputeFrom,
            recomputeTo: postProcessJob.recomputeTo,
            startedAt: postProcessJob.startedAt,
            completedAt: postProcessJob.completedAt,
            createdAt: postProcessJob.createdAt,
            updatedAt: postProcessJob.updatedAt,
          }
        : null,
    };
  }
  /**
   * 获取导入批次的详细项目信息
   * @param batchJobId 导入批次ID
   * @param userId 用户ID
   * @returns
   */
  async getBatchItems(batchJobId: string, userId: string) {
    await this.assertBatchOwnership(batchJobId, userId);

    const items = await this.importJobs.itemJobs().findMany({
      where: {
        batchJobId,
        userId,
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        sourceObject: {
          select: {
            id: true,
            sourceKind: true,
            provider: true,
            externalId: true,
            fileName: true,
            fileKey: true,
            objectType: true,
          },
        },
        canonicalSnapshot: {
          select: {
            id: true,
            dedupeKey: true,
            sportType: true,
            startTime: true,
            createdAt: true,
          },
        },
        activity: {
          select: {
            id: true,
            hashId: true,
            activityName: true,
            sportType: true,
            startTime: true,
            status: true,
            processingStatus: true,
            processingUpdatedAt: true,
            readyAt: true,
          },
        },
      },
    });

    return {
      batchId: batchJobId,
      totalCount: items.length,
      items: items.map((item) => {
        const failed = item.status === 'FAILED' || item.status === 'DEAD';
        const presentation =
          item.status === 'SKIPPED' && item.outcome === 'UPSTREAM_DATA_UNAVAILABLE'
            ? { code: 'IMPORT_SOURCE_UNAVAILABLE', key: 'common.error.activity_not_found_or_no_permission' as const }
            : failed ? importFailurePresentation(item) : null;
        return {
          id: item.id,
          position: item.position,
          status: item.status,
          sourceKind: item.sourceKind,
          sourceUid: item.sourceUid,
          dedupeKey: item.dedupeKey,
          attempts: item.attempts,
          // Keep operator diagnostics on the server.
          lastErrorCode: presentation?.code ?? null,
          lastError: presentation ? this.i18n.t(presentation.key) : null,
          startedAt: item.startedAt,
          completedAt: item.completedAt,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          sourceObject: item.sourceObject,
          canonicalSnapshot: item.canonicalSnapshot,
          activity: item.activity,
        };
      }),
    };
  }
  async createPostProcessJob(
    batchJobId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.importJobs.createPostProcessJob(batchJobId, tx);
  }

  async refreshBatchProgress(
    batchJobId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.importJobs.refreshBatchProgress(batchJobId, tx);
  }
}

function importFailurePresentation(item: { outcome: string | null; lastErrorCode: string | null }) {
  if (item.lastErrorCode === IMPORT_ACTIVITY_START_IN_FUTURE)
    return { code: item.lastErrorCode, key: 'common.error.import_activity_start_in_future' as const };
  if (item.lastErrorCode === 'IMPORT_IDENTITY_CONFLICT')
    return { code: item.lastErrorCode, key: 'common.error.import_identity_conflict' as const };
  if (item.outcome === 'UPSTREAM_ACCESS_DENIED')
    return { code: 'IMPORT_SOURCE_ACCESS_DENIED', key: 'common.error.activity_not_found_or_no_permission' as const };
  return {
    code: item.outcome === 'UPSTREAM_FETCH_FAILED' ? 'IMPORT_SOURCE_FETCH_FAILED' : 'IMPORT_PROCESSING_FAILED',
    key: 'common.error.internal' as const,
  };
}
