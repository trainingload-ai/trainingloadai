import { createHash } from 'crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { I18nService } from 'nestjs-i18n';
import {
  ImportBatchJobStatus,
  ImportItemJobStatus,
  ImportPipelineStage,
  ImportSourceKind,
  Prisma,
  ThirdPartyProvider,
} from '@prisma/client';
import { asImportJsonRecord } from './import-item-job.types';
import type { IntervalsIcuActivityListItem } from '@/integrations/intervals-icu/intervals-icu.client';
import {
  selectActivityGlobalRefreshScope,
  type ActivityGlobalRefreshCandidate,
} from '@/utils/activity-global-refresh-window';
import { forEachWithConcurrency } from '@/utils/async-concurrency.util';
import { ExternalActivitySourceRouter } from './external-activity-source-router.service';

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
function intervalsIcuSourceUid(userId: string, externalId: string) {
  return `intervals_icu:${userId}:${externalId}`;
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
): IntervalsIcuDiscoveredImport[] {
  const discovered: IntervalsIcuDiscoveredImport[] = [];
  for (const activity of activities) {
    const externalId = String(activity.id ?? '').trim();
    if (!externalId) continue;
    discovered.push({
      externalId,
      activity,
      checksum: stableChecksum(activity),
      sourceUid: intervalsIcuSourceUid(userId, externalId),
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
    | 'third_party_activity_file'
    | 'third_party_health_file'
    | 'third_party_mixed_fit';
  metadata?: Record<string, unknown>;
};

export type ExternalProviderImportCandidate = {
  sourceUid: string;
  externalId: string;
  accountRef?: string | null;
  objectType: string;
  rawChecksum?: string | null;
  rawPayload?: unknown;
  metadata?: unknown;
  sourceRef?: unknown;
  timelineTitle?: string | null;
  timelineStartTime?: Date | null;
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

function summarizeBatchStatus(args: {
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
}): ImportBatchJobStatus {
  // item job 是异步完成的，批次状态由三类终态计数汇总得到。
  const completedCount =
    args.successCount + args.failedCount + args.skippedCount;
  if (completedCount < args.totalCount) return 'RUNNING';
  if (args.failedCount > 0 && args.successCount > 0) return 'PARTIAL_FAILED';
  if (args.failedCount > 0 && args.successCount === 0) return 'FAILED';
  return 'COMPLETED';
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
        sourceKind: 'FILE',
        status: 'QUEUED',
        totalCount: args.files.length,
        requestContext: {
          source: 'upload',
          fileCount: args.files.length,
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
      stage: 'BATCH_CREATED',
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
              sourceKind: 'FILE',
              sourceUid,
            },
          },
          create: {
            userId: args.userId,
            sourceKind: 'FILE',
            sourceUid,
            objectType: 'activity_file',
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
            sourceKind: 'FILE',
            sourceUid,
            position: index,
            status: 'QUEUED',
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
  async createExternalProviderImportBatch(args: {
    userId: string;
    sourceKind: ImportSourceKind;
    provider: ThirdPartyProvider;
    candidates: ExternalProviderImportCandidate[];
    totalDiscovered?: number;
    requestContext: Record<string, unknown>;
    skipCompletedUnchanged?: boolean;
    reuseRunningBatch?: boolean;
  }) {
    await this.assertUserCanImport(args.userId);
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
  async createIntervalsIcuImportBatch(args: {
    userId: string;
    connectionId: string;
    activities: IntervalsIcuActivityListItem[];
    reason?: ThirdPartyImportReason;
    discoveryWindow?: { start: Date; end: Date };
  }) {
    await this.assertUserCanImport(args.userId);

    // 序列化活动列表项
    const discovered = discoverIntervalsIcuActivities(
      args.userId,
      args.activities,
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
            accountRef: '0',
            externalId: item.externalId,
            objectType: 'third_party_activity_file',
            rawChecksum: item.checksum,
            rawPayload: {
              listActivity: item.activity,
              connectionId: args.connectionId,
            } as Prisma.InputJsonValue,
            timelineTitle: item.activity.name?.trim() || null,
            timelineStartTime: intervalsIcuTimelineStartTime(item.activity),
            metadata: {
              connectionId: args.connectionId,
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
            accountRef: '0',
            externalId: item.externalId,
            objectType: 'third_party_activity_file',
            rawChecksum: item.checksum,
            rawPayload: {
              listActivity: item.activity,
              connectionId: args.connectionId,
            } as Prisma.InputJsonValue,
            timelineTitle: item.activity.name?.trim() || null,
            timelineStartTime: intervalsIcuTimelineStartTime(item.activity),
            metadata: {
              connectionId: args.connectionId,
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
    const queuedInputs: typeof discovered = [];

    // 只有 IMPORT_VIA_DISCOVERY_PROVIDER 才能进入正式导入队列。ROUTING/BLOCKED
    // 的来源对象不会创建 item job，因此不会物化 Activity 或进入后处理计算。
    for (const item of directlyImportable) {
      const existingObject = discoveryState.sourceObjectsByUid.get(
        item.sourceUid,
      );
      const existingMetadata = (existingObject?.metadata ?? null) as Record<
        string,
        unknown
      > | null;
      const existingListChecksum =
        typeof existingMetadata?.listChecksum === 'string'
          ? existingMetadata.listChecksum
          : existingObject?.rawChecksum;
      if (existingListChecksum === item.checksum) {
        if (
          discoveryState.completedSourceUids.has(item.sourceUid) &&
          discoveryState.activeSourceUids.has(item.sourceUid)
        )
          continue;
      }
      if (!discoveryState.runningSourceUids.has(item.sourceUid)) {
        queuedInputs.push(item);
      }
    }

    if (queuedInputs.length === 0) {
      return {
        batch: null,
        totalDiscovered: discovered.length,
        queuedCount: 0,
        skippedCount: discovered.length,
        directlyQueued: 0,
        routedToOrigin: routedToOriginCount,
        // 保留既有返回字段名以兼容调用方；它实际统计 BLOCKED 来源，没有创建 Mirror 记录。
        mirrorsCreated: blockedSourceCount,
        alreadyResolved: alreadyResolvedCount,
        duplicateOrRunning: directlyImportable.length,
      };
    }

    // 创建导入批次
    const batch = await this.importJobs.batchJobs().create({
      data: {
        userId: args.userId,
        sourceKind: ImportSourceKind.INTERVALS_ICU,
        status: ImportBatchJobStatus.QUEUED,
        totalCount: queuedInputs.length,
        requestContext: {
          source: 'intervals_icu',
          reason: args.reason ?? 'manual',
          connectionId: args.connectionId,
          totalDiscovered: discovered.length,
        } as Prisma.InputJsonValue,
      },
    });

    // 登记 source object 并创建导入任务
    await forEachWithConcurrency(
      queuedInputs,
      IMPORT_SOURCE_REGISTRATION_CONCURRENCY,
      async (item, position) => {
        const sourceObjectId = sourceObjectIds.get(item.sourceUid);
        if (!sourceObjectId) {
          throw new Error(
            `Intervals.icu source object missing: ${item.sourceUid}`,
          );
        }

        const importItem = await this.importJobs.itemJobs().create({
          data: {
            batchJobId: batch.id,
            userId: args.userId,
            sourceObjectId,
            sourceKind: ImportSourceKind.INTERVALS_ICU,
            sourceUid: item.sourceUid,
            position,
            status: ImportItemJobStatus.QUEUED,
            sourceRef: {
              externalId: item.externalId,
              connectionId: args.connectionId,
            } as Prisma.InputJsonValue,
          },
        });
        this.logImportPipelineEvent({
          batchJobId: batch.id,
          itemJobId: importItem.id,
          userId: args.userId,
          stage: ImportPipelineStage.SOURCE_REGISTERED,
          message: `已登记 Intervals.icu 活动源对象：${item.externalId}`,
          data: {
            externalId: item.externalId,
            sourceUid: item.sourceUid,
          },
        });
      },
    );
    // 记录导入批次创建事件
    this.logImportPipelineEvent({
      batchJobId: batch.id,
      userId: args.userId,
      stage: ImportPipelineStage.BATCH_CREATED,
      message: `已创建 Intervals.icu 导入批次，待处理 ${queuedInputs.length} 个活动`,
      data: {
        totalDiscovered: discovered.length,
        queuedCount: queuedInputs.length,
        skippedCount: discovered.length - queuedInputs.length,
      },
    });

    return {
      batch,
      totalDiscovered: discovered.length,
      queuedCount: queuedInputs.length,
      skippedCount: discovered.length - queuedInputs.length,
      directlyQueued: queuedInputs.length,
      routedToOrigin: routedToOriginCount,
      // 保留既有返回字段名以兼容调用方；它实际统计 BLOCKED 来源，没有创建 Mirror 记录。
      mirrorsCreated: blockedSourceCount,
      alreadyResolved: alreadyResolvedCount,
      duplicateOrRunning: directlyImportable.length - queuedInputs.length,
    };
  }

  /**
   * 获取导入批次的摘要信息
   * @param batchJobId 导入批次ID
   * @param userId 用户ID
   * @returns
   */
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
      items: items.map((item) => ({
        id: item.id,
        position: item.position,
        status: item.status,
        sourceKind: item.sourceKind,
        sourceUid: item.sourceUid,
        dedupeKey: item.dedupeKey,
        attempts: item.attempts,
        lastErrorCode: item.lastErrorCode,
        lastError: item.lastError,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceObject: item.sourceObject,
        canonicalSnapshot: item.canonicalSnapshot,
        activity: item.activity,
      })),
    };
  }
  /**
   * 创建批次级后处理任务
   * @param batchJobId - 导入批次ID
   * @returns - 批次级后处理任务
   * @returns
   */
  async createPostProcessJob(batchJobId: string) {
    // 获取导入批次
    const batch = await this.importJobs.batchJobs().findUnique({
      where: { id: batchJobId },
      include: {
        items: {
          where: {
            activityId: { not: null },
            analysisRequired: true,
            status: ImportItemJobStatus.DONE,
          },
          select: {
            activity: { select: { sportType: true, startTime: true } },
          },
        },
      },
    });
    if (!batch) throw new Error(`Import batch not found: ${batchJobId}`);

    // 获取请求上下文
    const requestContext = (batch.requestContext ?? {}) as Record<
      string,
      unknown
    >;

    const forcedCandidates = Array.isArray(
      requestContext.globalRefreshCandidates,
    )
      ? (requestContext.globalRefreshCandidates as ActivityGlobalRefreshCandidate[])
      : [];
    const refreshScope = selectActivityGlobalRefreshScope([
      ...batch.items.map((item) => ({
        sportType: item.activity?.sportType,
        startTime: item.activity?.startTime,
      })),
      ...forcedCandidates,
    ]);

    const job = await this.importJobs.ensurePostProcessJob({
      batchJobId: batch.id,
      create: {
        userId: batch.userId,
        batchJobId: batch.id,
        status: 'PENDING',
        recomputeFrom: refreshScope.recomputeFrom,
        recomputeTo: refreshScope.recomputeTo,
        affectedSportTypes: refreshScope.sportTypes as Prisma.InputJsonValue,
        summary: {
          batchStatus: batch.status,
          totalCount: batch.totalCount,
          successCount: batch.successCount,
          failedCount: batch.failedCount,
          skippedCount: batch.skippedCount,
          globalRefreshWindowDays: refreshScope.windowDays,
          globalRefreshEligibleCount: refreshScope.eligibleCount,
        } as Prisma.InputJsonValue,
      } satisfies Prisma.UserPostProcessJobUncheckedCreateInput,
    });

    if (job.status !== 'COMPLETED' && job.status !== 'DEAD') {
      await this.importJobs.batchJobs().update({
        where: { id: batch.id },
        data: { status: 'POST_PROCESSING' },
      });
    }

    this.logImportPipelineEvent({
      batchJobId: batch.id,
      postProcessJobId: job.id,
      userId: batch.userId,
      stage: 'POST_PROCESSING',
      message: '已确保批次级后处理任务存在',
    });

    return job;
  }
  /**
   * 刷新批次进度
   * 导入
   * @param batchJobId 导入批次ID
   *
   * @returns
   */
  async refreshBatchProgress(batchJobId: string) {
    const batch = await this.importJobs.batchJobs().findUnique({
      where: { id: batchJobId },
      select: { id: true, userId: true, totalCount: true, startedAt: true },
    });
    if (!batch) throw new Error(`Import batch not found: ${batchJobId}`);

    const statuses = await this.importJobs.itemJobs().groupBy({
      by: ['status'],
      where: { batchJobId },
      _count: { _all: true },
    });
    const actualTotalCount = statuses.reduce(
      (total, row) => total + row._count._all,
      0,
    );

    const countOf = (status: ImportItemJobStatus) =>
      statuses.find((row) => row.status === status)?._count._all ?? 0;

    const successCount = countOf('DONE');
    // FAILED 仍在指数退避重试，不是终态；只有 DEAD 才计入批次失败数。
    const failedCount = countOf('DEAD');
    const skippedCount = countOf('SKIPPED');
    const nextStatus = summarizeBatchStatus({
      totalCount: actualTotalCount,
      successCount,
      failedCount,
      skippedCount,
    });

    const updated = await this.importJobs.batchJobs().update({
      where: { id: batchJobId },
      data: {
        totalCount: actualTotalCount,
        successCount,
        failedCount,
        skippedCount,
        status: nextStatus,
        startedAt:
          nextStatus === 'RUNNING'
            ? (batch.startedAt ?? new Date())
            : batch.startedAt,
        completedAt:
          nextStatus === 'COMPLETED' ||
          nextStatus === 'PARTIAL_FAILED' ||
          nextStatus === 'FAILED'
            ? new Date()
            : null,
      },
    });

    if (
      nextStatus === 'COMPLETED' ||
      nextStatus === 'PARTIAL_FAILED' ||
      nextStatus === 'FAILED'
    ) {
      await this.createPostProcessJob(batchJobId);
    }

    return updated;
  }
}
