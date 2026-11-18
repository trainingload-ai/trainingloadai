import { acquireActivityWriteLock } from '@/prisma/activity-write-lock';
import { inheritedImportAuthorization } from './import-publication-authorization';
import { matchesIntervalsAuthorization } from '@/integrations/intervals-icu/intervals-icu-authorization';
import { ImportIdentityConflictError } from './import-identity-conflict.error';
import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import {
  ACTIVITY_MATERIALIZATION_VERSION,
  type ActivityDatasetRepair,
} from './activity-dataset-repair';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import {
  ActivityAnalyzeMode,
  ActivityService,
} from '@/api/activity/activity.service';
import { ActivityMapDerivationService } from '@/api/activity/activity-map-derivation.service';
import {
  IntervalsIcuApiError,
  IntervalsIcuClient,
} from '@/integrations/intervals-icu/intervals-icu.client';
import { IntervalsIcuCredentialService } from '@/integrations/intervals-icu/intervals-icu-credential.service';
import { ThirdPartyActivityService } from '@/sync/third-party-activity.service';
import {
  $Enums,
  Prisma,
  type ImportItemJobStatus,
  type ImportPipelineStage,
  type ImportSourceKind,
} from '@prisma/client';
import type { CanonicalActivityPayload } from './canonical-activity.types';
import {
  CanonicalActivityMaterializer,
  type CanonicalDatasetCommitToken,
} from './canonical-activity.materializer';
import { ThirdPartyActivityProjectorService } from './third-party-activity-projector.service';
import { ImportBatchService } from './import-batch.service';
import { RemoteActivityFileService } from './remote-activity-file.service';
import { ExternalActivityMirrorService } from './external-activity-mirror.service';
import { ExternalActivitySourceRouter } from './external-activity-source-router.service';
import { getExternalActivityOriginRoutingExtension } from './external-activity-origin-routing.port';
import {
  asImportItemSourceRef,
  asImportJsonRecordOrUndefined,
  asImportSourceObjectMeta,
  importJsonValue,
  pickImportField,
  readImportString,
  type ImportItemJobStatusExtra,
  type ImportItemJobWithSource,
  type ImportItemJobWithSourceObject,
  type ImportItemSourceRef,
  type ImportJobJsonFields,
  type ImportJsonRecord,
} from './import-item-job.types';
import { WorkerDrainProgress } from '@/workers/worker-drain-progress';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import type { FileType } from 'trackswap';
import { SourceAdapterRegistry } from './source-adapters/source-adapter.registry';
import type {
  FileNormalizeInput,
  ExternalFileNormalizeInput,
  SourceNormalizeInput,
} from './source-adapters/source-adapter.interface';
import { ActivityWeatherService } from '@/weather/activity-weather.service';
import {
  IMPORT_ITEM_EXTENSION,
  ImportSourceDataUnavailableError,
  type ImportItemExtension,
} from './import-item-provider.port';

const IMPORT_SOURCE_KIND_VALUES = new Set<string>(
  Object.values($Enums.ImportSourceKind),
);

function asImportSourceKind(value: string): ImportSourceKind {
  if (!IMPORT_SOURCE_KIND_VALUES.has(value)) {
    throw new Error(`Unknown import source kind: ${value}`);
  }
  return value as ImportSourceKind;
}

/** claimBatch 原生 SQL 领到的一行。sourceKind 在映射时收成枚举。 */
type ClaimedImportItemJob = {
  id: string;
  batchJobId: string;
  userId: string;
  sourceObjectId: string;
  sourceKind: ImportSourceKind;
  lockToken?: string;
  sourceRevision?: string;
};

function backoffMs(attempts: number) {
  const base = 30_000;
  const max = 30 * 60_000;
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
}

@Injectable()
export class ImportItemWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportItemWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private draining = false;
  private readonly activeLeaseTokens = new Map<string, string>();
  private readonly revisionedItems = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly activityService: ActivityService,
    private readonly activityMapDerivation: ActivityMapDerivationService,
    @Optional()
    @Inject(IMPORT_ITEM_EXTENSION)
    private readonly extension: ImportItemExtension | undefined,
    private readonly intervalsIcuClient: IntervalsIcuClient,
    private readonly intervalsIcuCredentials: IntervalsIcuCredentialService,
    private readonly thirdPartyActivityService: ThirdPartyActivityService,
    private readonly adapterRegistry: SourceAdapterRegistry,
    private readonly materializer: CanonicalActivityMaterializer,
    private readonly thirdPartyProjector: ThirdPartyActivityProjectorService,
    private readonly importBatchService: ImportBatchService,
    private readonly remoteActivityFiles: RemoteActivityFileService,
    private readonly externalConnections: ExternalProviderConnectionService,
    @Optional()
    private readonly activityWeather: ActivityWeatherService | undefined,
    private readonly importJobs: ImportingJobService,
    private readonly externalActivityMirrors: ExternalActivityMirrorService,
    private readonly externalActivityRouter: ExternalActivitySourceRouter,
  ) {}

  /**
   * 是否启用导入项任务。
   * @returns 是否启用导入项任务。
   */
  private enabled() {
    return this.configService.get<boolean>('importItemWorker.enabled') ?? true;
  }

  /**
   * 初始化导入项任务。
   */
  onModuleInit() {
    if (!this.enabled()) return;
    const pollMs =
      this.configService.get<number>('importItemWorker.pollMs') ?? 1000;
    this.timer = setInterval(() => {
      void this.drain().catch((e) => {
        this.logger.error(
          `[导入项任务] 拉取队列失败：${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
    }, pollMs);
    void this.drain();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private logImportPipelineEvent(args: {
    batchJobId?: string | null;
    itemJobId?: string | null;
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
      args.userId ? `user=${args.userId}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const dataSuffix =
      args.data != null && Object.keys(args.data).length > 0
        ? ` data=${JSON.stringify(args.data)}`
        : '';
    const line = `[导入项] ${ctx} ${args.message}${dataSuffix}`;
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
   * 从数据库中获取待处理的导入项任务
   * @param batchSize 一次获取的任务数量
   * @returns 待处理的导入项任务列表
   */
  private async claimBatch(batchSize: number) {
    const now = new Date();
    const lockToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + this.itemLeaseMs());
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        batch_job_id: string;
        user_id: string;
        source_object_id: string;
        source_kind: string;
        lock_token: string;
        source_revision: string | null;
      }>
    >(
      // source_kind 是 PG 枚举，queryRaw 只能给出 string，下面再收成 ImportSourceKind。
      `
      WITH picked AS (
        SELECT id
        FROM t_import_item_job
        WHERE (
          (status IN ('QUEUED','FAILED') AND available_at <= $1)
          OR (
            status IN ('NORMALIZING','DEDUPING','MATERIALIZING','PARQUET_BUILDING','ANALYZING')
            AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
          )
        )
        ORDER BY position ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_import_item_job j
      SET status='NORMALIZING',
          started_at=COALESCE(j.started_at, $1),
          lock_token=$3,
          lease_expires_at=$4,
          source_revision=COALESCE(source_revision, CASE WHEN source_ref->>'kind'='canonical_payload'
            THEN 'legacy-unversioned-canonical' ELSE (SELECT import_revision FROM t_import_source_object s WHERE s.id=j.source_object_id) END),
          updated_at=$1
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id, j.batch_job_id, j.user_id, j.source_object_id, j.source_kind, j.lock_token, j.source_revision;
      `,
      now,
      batchSize,
      lockToken,
      leaseExpiresAt,
    );

    return rows.map(
      (row): ClaimedImportItemJob => ({
        id: row.id,
        batchJobId: row.batch_job_id,
        userId: row.user_id,
        sourceObjectId: row.source_object_id,
        sourceKind: asImportSourceKind(row.source_kind),
        lockToken: row.lock_token,
        ...(row.source_revision ? { sourceRevision: row.source_revision } : {}),
      }),
    );
  }

  private itemLeaseMs() {
    const configured =
      this.configService.get<number>('importItemWorker.leaseMs') ?? 15 * 60_000;
    return Math.max(60_000, configured);
  }

  private async renewItemLease(job: { id: string; lockToken?: string }) {
    if (!job.lockToken) return;
    const result = await this.importJobs.itemJobs().updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: { leaseExpiresAt: new Date(Date.now() + this.itemLeaseMs()) },
    });
    if (result.count !== 1) {
      this.logger.warn(`[导入项] 租约续期失败，item=${job.id}`);
    }
  }

  private async updateClaimedItem(
    id: string,
    data: Prisma.ImportItemJobUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const lockToken = this.activeLeaseTokens.get(id);
    if (!lockToken) {
      await this.importJobs.itemJobs(tx).update({
        where: { id },
        data,
      });
      return;
    }
    const result = await this.importJobs.itemJobs(tx).updateMany({
      where: { id, lockToken },
      data,
    });
    if (result.count !== 1) {
      throw new Error(`Import item lease lost: ${id}`);
    }
  }

  private async markStatus(
    id: string,
    status: ImportItemJobStatus,
    extra?: ImportItemJobStatusExtra,
    tx?: Prisma.TransactionClient,
  ) {
    const terminal = ['DONE', 'SKIPPED', 'DEAD'].includes(status);
    const lockToken = this.activeLeaseTokens.get(id);
    if (terminal && lockToken && this.revisionedItems.has(id)) {
      await this.importJobs.finishRevisionedItem(
        {
          id,
          lockToken,
          data: {
            status,
            ...extra,
            lockToken: null,
            leaseExpiresAt: null,
          },
        },
        tx,
      );
      return;
    }
    await this.updateClaimedItem(
      id,
      {
        status,
        ...extra,
        ...(terminal ? { lockToken: null, leaseExpiresAt: null } : {}),
      },
      tx,
    );
  }

  private async completeActivityItem(
    jobId: string,
    batchJobId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const finish = async (transaction: Prisma.TransactionClient) => {
      await this.markStatus(
        jobId,
        'DONE',
        { completedAt: new Date(), lastError: null, lastErrorCode: null },
        transaction,
      );
      await this.importBatchService.refreshBatchProgress(
        batchJobId,
        transaction,
      );
    };
    return tx
      ? finish(tx)
      : this.prisma.$transaction(finish, { timeout: 15_000 });
  }

  private async withCurrentDataset<T>(
    args: { jobId: string; userId: string },
    token: CanonicalDatasetCommitToken,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const publish = async (tx: Prisma.TransactionClient) => {
      await acquireActivityWriteLock(tx, token.activityId);
      const primary = await tx.activitySource.findFirst({
        where: {
          activityId: token.activityId,
          userId: args.userId,
          isPrimary: true,
          isActive: true,
        },
        select: { canonicalSnapshotId: true },
      });
      if (primary?.canonicalSnapshotId !== token.canonicalSnapshotId)
        throw new Error('IMPORT_DATASET_CHANGED');
      return work(tx);
    };
    const lockToken = this.activeLeaseTokens.get(args.jobId);
    return lockToken
      ? this.importJobs.withCurrentImport(
          { itemJobId: args.jobId, userId: args.userId, lockToken },
          publish,
        )
      : this.prisma.$transaction(publish, { timeout: 15_000 });
  }

  private extractThirdPartyActivityId(job: ImportJobJsonFields) {
    const fields = pickImportField(
      asImportItemSourceRef(job.sourceRef) as ImportJsonRecord,
      asImportSourceObjectMeta(job.sourceObject?.metadata),
      asImportSourceObjectMeta(job.sourceObject?.rawPayload),
    );
    return fields.number('thirdPartyActivityId');
  }

  private extractIntervalsIcuConnectionId(job: ImportJobJsonFields) {
    const fields = pickImportField(
      asImportItemSourceRef(job.sourceRef) as ImportJsonRecord,
      asImportSourceObjectMeta(job.sourceObject?.metadata),
      asImportSourceObjectMeta(job.sourceObject?.rawPayload),
    );
    return fields.string('connectionId');
  }

  private async buildIntervalsIcuNormalizeInput(
    job: ImportItemJobWithSourceObject,
  ): Promise<ExternalFileNormalizeInput> {
    if (!job.sourceObject) {
      throw new Error(`导入任务缺少源对象：任务=${job.id}`);
    }

    const sourceRef = asImportItemSourceRef(job.sourceRef);
    const metadata = asImportSourceObjectMeta(job.sourceObject.metadata);
    const externalId =
      job.sourceObject.externalId ?? readImportString(sourceRef.externalId);
    if (!externalId) {
      throw new Error(
        `Intervals.icu 源对象缺少远端活动 ID：源对象=${job.sourceObject.id}`,
      );
    }

    const connectionId = this.extractIntervalsIcuConnectionId(job);
    if (!connectionId) {
      throw new Error(
        `Intervals.icu 源对象缺少连接 ID：源对象=${job.sourceObject.id}`,
      );
    }
    const resolved = await this.remoteActivityFiles.resolve({
      capability: 'intervals-icu-api-key',
      sourceRevision: job.sourceRevision ?? null,
      sourceObject: {
        ...job.sourceObject,
        fileKey:
          job.sourceObject.fileKey ?? readImportString(sourceRef.fileKey),
        fileName:
          job.sourceObject.fileName ?? readImportString(sourceRef.fileName),
      },
      fallbackFileName:
        readImportString(sourceRef.fileName) ?? `${externalId}.fit`,
      metadata,
      download: async () => {
        const connection = await this.externalConnections.findActiveById(
          connectionId,
          job.userId,
          'intervals_icu',
        );
        if (
          !connection ||
          !matchesIntervalsAuthorization(sourceRef.authorization, connection)
        ) {
          throw new Error('INTERVALS_IMPORT_AUTHORIZATION_CHANGED');
        }
        try {
          const apiKey =
            this.intervalsIcuCredentials.resolveConnectionCredential(
              connection,
            );
          const downloaded = await this.intervalsIcuClient.downloadActivityFile(
            apiKey,
            String(externalId),
            ...(job.sourceRevision ? [{ preferEdited: true }] : []),
          );
          return { ...downloaded, metadata: { connectionId } };
        } catch (error) {
          if (
            error instanceof IntervalsIcuApiError &&
            (error.status === 401 || error.status === 403)
          ) {
            await this.externalConnections.model().updateMany({
              where: {
                id: connectionId,
                userId: job.userId,
                status: 'ACTIVE',
                credentialCiphertext: connection.credentialCiphertext,
                metadata: { equals: connection.metadata ?? Prisma.DbNull },
              },
              data: {
                status: 'INVALID',
                lastError: 'Intervals.icu API 密钥无效或未授权',
              },
            });
          }
          throw error;
        }
      },
    });

    return {
      kind: 'INTERVALS_ICU',
      provider: 'intervals_icu',
      sourceUid: job.sourceUid,
      accountRef: job.sourceObject.accountRef ?? '0',
      externalId: String(externalId),
      activityFile: {
        buffer: resolved.buffer,
        originalname: resolved.fileName,
        mimetype: 'application/octet-stream',
        size: resolved.buffer.length,
      } as Express.Multer.File,
      fileKey: resolved.fileKey,
      rawStorageKey: resolved.rawStorageKey,
      sourceChecksum: resolved.sourceChecksum,
      rawPayload: job.sourceObject.rawPayload ?? undefined,
      metadata: {
        ...metadata,
        source: 'intervals_icu',
      },
    };
  }

  /** 按 Core 内建来源或可选扩展准备标准化输入。 */
  private async buildNormalizeInput(jobId: string): Promise<{
    job: ImportItemJobWithSource;
    input?: SourceNormalizeInput;
    directPayload?: CanonicalActivityPayload;
    thirdPartyActivityId?: number;
  }> {
    const job = (await this.importJobs.itemJobs().findUnique({
      where: { id: jobId },
      include: { sourceObject: true },
    })) as ImportItemJobWithSource | null;
    if (!job) throw new Error(`Import item job not found: ${jobId}`);

    const sourceRef = asImportItemSourceRef(job.sourceRef);
    if (sourceRef.kind === 'canonical_payload' && sourceRef.payload) {
      return {
        job,
        directPayload: sourceRef.payload,
        thirdPartyActivityId: this.extractThirdPartyActivityId(job),
      };
    }
    if (!job.sourceObject) {
      throw new Error(`Source object missing for item job: ${job.id}`);
    }
    const jobWithSource: ImportItemJobWithSourceObject = {
      ...job,
      sourceObject: job.sourceObject,
    };

    if (job.sourceKind === 'FILE') {
      const fileKey =
        job.sourceObject.fileKey ?? readImportString(sourceRef.fileKey);
      if (!fileKey) {
        throw new Error(
          `fileKey missing for source object ${job.sourceObject.id}`,
        );
      }
      const buffer = await this.storage.getFileWithKey(fileKey);
      if (!buffer) throw new Error(`Failed to read file content: ${fileKey}`);
      const file = {
        buffer,
        originalname:
          job.sourceObject.fileName ??
          readImportString(sourceRef.fileName) ??
          `${job.sourceObject.sourceUid}.fit`,
        mimetype: 'application/octet-stream',
        size: buffer.length,
      } as Express.Multer.File;
      const input: FileNormalizeInput = {
        kind: 'FILE',
        sourceUid: job.sourceUid,
        file,
        fileKey,
        rawStorageKey: job.sourceObject.rawStorageKey ?? undefined,
        sourceChecksum: createHash('sha256').update(buffer).digest('hex'),
        metadata: asImportJsonRecordOrUndefined(job.sourceObject.metadata),
      };
      return { job, input };
    }

    if (job.sourceKind === 'INTERVALS_ICU') {
      return {
        job,
        input: await this.buildIntervalsIcuNormalizeInput(jobWithSource),
      };
    }

    if (
      job.sourceKind === 'GARMIN_PERSONAL_API' ||
      job.sourceKind === 'COROS_MCP'
    ) {
      // The personal worker registers a cached file only after download succeeds.
      const fileKey =
        job.sourceObject.fileKey ?? readImportString(sourceRef.fileKey);
      if (!fileKey) throw new Error('Personal provider file missing');
      const buffer = await this.storage.getFileWithKey(fileKey);
      if (!buffer) throw new Error('Personal provider file unavailable');
      const fileName =
        job.sourceObject.fileName ??
        readImportString(sourceRef.fileName) ??
        `${job.sourceObject.externalId}.fit`;
      return {
        job,
        input: {
          kind: job.sourceKind,
          sourceUid: job.sourceUid,
          provider: job.sourceObject.provider,
          accountRef: job.sourceObject.accountRef ?? undefined,
          externalId: job.sourceObject.externalId ?? undefined,
          activityFile: {
            buffer,
            originalname: fileName,
            size: buffer.length,
            mimetype: 'application/octet-stream',
          } as Express.Multer.File,
          fileKey,
          rawStorageKey: fileKey,
          sourceChecksum: createHash('sha256').update(buffer).digest('hex'),
          rawPayload: job.sourceObject.rawPayload ?? undefined,
          metadata: asImportJsonRecordOrUndefined(job.sourceObject.metadata),
        },
      };
    }

    if (this.extension?.supportsNormalize(job.sourceKind)) {
      const prepared =
        await this.extension.prepareNormalizeInput(jobWithSource);
      return { job, ...prepared };
    }

    throw new Error(`Unsupported import source kind: ${job.sourceKind}`);
  }

  /**
   * 分发导入项任务
   * @param args 分发导入项任务的参数
   * 逻辑：
   * 如果有多个子活动，每个子活动都需要创建一个导入项任务
   * 跳过当前父任务，只处理子活动任务
   * 标记当前父任务为已跳过
   *
   */
  private async fanOutCanonicalPayloads(args: {
    jobId: string;
    batchJobId: string;
    userId: string;
    sourceObjectId: string;
    payloads: CanonicalActivityPayload[];
  }) {
    const lockToken = this.activeLeaseTokens.get(args.jobId);
    const work = async (tx?: Prisma.TransactionClient) => {
      const parent = lockToken
        ? await this.importJobs
            .itemJobs(tx)
            .findUnique({ where: { id: args.jobId } })
        : null;
      const maxPositionRow = await this.importJobs.itemJobs(tx).aggregate({
        where: { batchJobId: args.batchJobId },
        _max: { position: true },
      });
      const firstPosition = (maxPositionRow._max.position ?? 0) + 1;
      if (args.payloads.length)
        await this.importJobs.itemJobs(tx).createMany({
          data: args.payloads.map((payload, index) => ({
            batchJobId: args.batchJobId,
            userId: args.userId,
            sourceObjectId: args.sourceObjectId,
            sourceKind: payload.source.kind,
            sourceUid: payload.source.sourceUid,
            ...(parent?.sourceRevision
              ? { sourceRevision: parent.sourceRevision }
              : {}),
            position: firstPosition + index,
            status: 'QUEUED',
            sourceRef: importJsonValue({
              ...inheritedImportAuthorization(parent?.sourceRef),
              kind: 'canonical_payload',
              payload,
            } as ImportItemSourceRef),
          })),
        });
      await this.markStatus(
        args.jobId,
        'SKIPPED',
        {
          completedAt: new Date(),
          lastErrorCode: 'spawned_child_items',
          lastError: `Spawned ${args.payloads.length} canonical item jobs`,
        },
        tx,
      );
    };
    if (lockToken)
      await this.importJobs.withCurrentImport(
        { itemJobId: args.jobId, userId: args.userId, lockToken },
        work,
      );
    else await work();
  }

  /**
   * 核心导入处理逻辑：
   * @param args 处理导入项任务的参数
   * 逻辑：
   * 1. 从数据库中获取导入项任务
   * 2. 处理导入项任务
   * 3. 更新导入项任务状态
   */
  private async processCanonicalPayload(args: {
    jobId: string;
    batchJobId: string;
    userId: string;
    sourceObjectId: string;
    payload: CanonicalActivityPayload;
    thirdPartyActivityId?: number;
    repair?: ActivityDatasetRepair;
  }) {
    const payload = args.payload;
    const thirdPartyActivity = await this.thirdPartyProjector.project({
      itemJobId: args.jobId,
      itemLockToken: this.activeLeaseTokens.get(args.jobId),
      userId: args.userId,
      sourceObjectId: args.sourceObjectId,
      batchJobId: args.batchJobId,
      payload,
      preferredThirdPartyActivityId: args.thirdPartyActivityId,
    });
    const thirdPartyActivityId =
      thirdPartyActivity?.id ?? args.thirdPartyActivityId;
    try {
      this.logImportPipelineEvent({
        batchJobId: args.batchJobId,
        itemJobId: args.jobId,
        userId: args.userId,
        stage: $Enums.ImportPipelineStage.MATERIALIZING,
        message: '正在将标准活动载荷实体化为活动聚合',
        data: {
          sourceUid: payload.source.sourceUid,
          dedupeKey: payload.identity.dedupeKey,
        },
      });

      await this.markStatus(
        args.jobId,
        $Enums.ImportItemJobStatus.MATERIALIZING,
      );
      // 将 canonical payload 物化成 Activity
      const materialized = await this.materializer.materialize({
        itemLockToken: this.activeLeaseTokens.get(args.jobId),
        itemJobId: args.jobId,
        userId: args.userId,
        batchJobId: args.batchJobId,
        sourceObjectId: args.sourceObjectId,
        payload,
        thirdPartyActivityId,
        repair: args.repair,
      });

      // Activity 已经由任意 Provider 正式物化后，再尝试解析影子。影子本身从不
      // 进入 materializer；匹配成功只是添加次级来源并将来源对象标记 RESOLVED。
      await this.externalActivityMirrors.resolveForImportedActivity({
        itemJobId: args.jobId,
        itemLockToken: this.activeLeaseTokens.get(args.jobId),
        userId: args.userId,
        activityId: materialized.activity.id,
        provider: payload.source.provider,
        sourceObjectId: args.sourceObjectId,
      });

      await this.updateClaimedItem(args.jobId, {
        activityId: materialized.activity.id,
        dedupeKey: payload.identity.dedupeKey,
        outcome: materialized.outcome,
        analysisRequired: materialized.shouldRebuild,
      });

      const extensionNotices = this.extension
        ? await this.extension.afterMaterialize({
            userId: args.userId,
            activityId: materialized.activity.id,
            payload,
          })
        : [];
      for (const notice of extensionNotices) {
        this.logImportPipelineEvent({
          batchJobId: args.batchJobId,
          itemJobId: args.jobId,
          userId: args.userId,
          stage: $Enums.ImportPipelineStage.MATERIALIZING,
          message: notice.message,
          data: notice.data,
        });
      }

      this.logImportPipelineEvent({
        batchJobId: args.batchJobId,
        itemJobId: args.jobId,
        userId: args.userId,
        stage: materialized.shouldRebuild
          ? $Enums.ImportPipelineStage.PARQUET_BUILDING
          : $Enums.ImportPipelineStage.COMPLETED,
        message: materialized.shouldRebuild
          ? '正在生成活动分析数据并执行首轮分析'
          : '已关联补充数据，无需重新生成分析',
        data: {
          activityId: materialized.activity.id,
          reusedReason: materialized.reusedReason,
          outcome: materialized.outcome,
          shouldRebuild: materialized.shouldRebuild,
          primaryChanged: materialized.primaryChanged,
          primaryDatasetChanged: materialized.primaryDatasetChanged,
          selection: materialized.selection,
        },
      });

      if (!materialized.shouldRebuild) {
        const finish = async (tx: Prisma.TransactionClient) => {
          if (thirdPartyActivityId)
            await this.thirdPartyActivityService.markImportCompleted(
              thirdPartyActivityId,
              tx,
            );
          await this.markStatus(
            args.jobId,
            'DONE',
            { completedAt: new Date(), lastError: null, lastErrorCode: null },
            tx,
          );
        };
        const lockToken = this.activeLeaseTokens.get(args.jobId);
        if (lockToken)
          await this.importJobs.withCurrentImport(
            { itemJobId: args.jobId, userId: args.userId, lockToken },
            finish,
          );
        else await this.prisma.$transaction(finish, { timeout: 15_000 });
        return;
      }

      await this.markStatus(
        args.jobId,
        $Enums.ImportItemJobStatus.PARQUET_BUILDING,
      );
      if (thirdPartyActivityId) {
        await this.thirdPartyActivityService.markImportProcessing(
          thirdPartyActivityId,
        );
      }
      if (materialized.pendingCommit) {
        // 已有 Activity 的 primary 切换采用两阶段提交：先上传不可见的
        // Parquet，再原子切换 source / summary / laps / Parquet 指针，最后
        // 基于新指针重算 LIGHT 指标。
        const stagedParquetFiles =
          await this.activityService.stageParquetFilesByCanonicalPayload(
            materialized.activity,
            payload,
          );
        try {
          await this.materializer.commitStagedDataset({
            token: materialized.pendingCommit,
            userId: args.userId,
            batchJobId: args.batchJobId,
            sourceObjectId: args.sourceObjectId,
            payload,
            stagedParquetFiles,
            itemJobId: args.jobId,
            itemLockToken: this.activeLeaseTokens.get(args.jobId),
          });
        } catch (error) {
          // 事务结果可能不确定，不能立即删对象。先进入延迟清单，GC
          // 会在删除前检查路径是否已经成为 live manifest。
          await this.activityService
            .retireStagedParquetFiles(
              stagedParquetFiles,
              'canonical_commit_failed',
            )
            .catch(() => undefined);
          throw error;
        }
        await this.activityService.runLightMetricsPipeline(
          materialized.activity.id,
          args.userId,
          {
            publish: (work) =>
              this.withCurrentDataset(args, materialized.pendingCommit!, work),
          },
        );
        await this.activityMapDerivation.scheduleAfterCanonicalCommit(
          materialized.activity.id,
          args.userId,
        );
      } else {
        // 新活动没有旧数据集需要保护，继续复用完整生成管线。
        await this.activityService.generateParquetFileByCanonicalPayload(
          materialized.activity,
          payload,
          args.userId,
          { analysisMode: ActivityAnalyzeMode.LIGHT },
        );
      }
      // Parquet 一旦成为 canonical 数据集即可异步排队。天气失败不能阻塞
      // 活动进入 ANALYZING/READY，也不能延长主导入链路。
      await this.activityWeather
        ?.schedule({
          activityId: materialized.activity.id,
          userId: args.userId,
          force: materialized.primaryChanged,
        })
        .catch(() => {
          this.logger.warn(
            `[活动天气排队] 失败 activityId=${materialized.activity.id} code=SCHEDULE_FAILED`,
          );
        });
      const finish = async (tx: Prisma.TransactionClient) => {
        await tx.activity.update({
          where: { id: materialized.activity.id },
          data: {
            status: $Enums.ActivityStatus.FINISHED,
            processingStatus: 'ANALYZING',
            processingUpdatedAt: new Date(),
            readyAt: null,
          },
        });
        if (thirdPartyActivityId)
          await this.thirdPartyActivityService.markImportCompleted(
            thirdPartyActivityId,
            tx,
          );
        await this.completeActivityItem(args.jobId, args.batchJobId, tx);
      };
      if (materialized.pendingCommit)
        await this.withCurrentDataset(args, materialized.pendingCommit, finish);
      else await this.prisma.$transaction(finish, { timeout: 15_000 });
    } catch (error) {
      if (thirdPartyActivityId && !args.thirdPartyActivityId) {
        const lockToken = this.activeLeaseTokens.get(args.jobId);
        if (lockToken)
          await this.importJobs
            .withCurrentImport(
              { itemJobId: args.jobId, userId: args.userId, lockToken },
              (tx) =>
                this.thirdPartyActivityService.markImportFailed(
                  thirdPartyActivityId,
                  error instanceof Error ? error.message : String(error),
                  tx,
                ),
            )
            .catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * 处理一条已领取的导入项。
   * 顺序：续租 → 可选来源扩展前处理 → 标准化并物化活动 → 刷新批次进度。
   * 失败走退避重试；租约被别人抢走则不再写状态。
   */
  private async processJob(job: ClaimedImportItemJob) {
    const startedAt = Date.now();
    let thirdPartyActivityId: number | undefined;
    if (job.lockToken) this.activeLeaseTokens.set(job.id, job.lockToken);
    if (
      job.sourceRevision ||
      ['STRAVA', 'GARMIN', 'GARMIN_PERSONAL_API', 'INTERVALS_ICU'].includes(
        job.sourceKind,
      )
    )
      this.revisionedItems.add(job.id);
    const heartbeat = setInterval(
      () => void this.renewItemLease(job).catch(() => undefined),
      Math.max(30_000, Math.floor(this.itemLeaseMs() / 3)),
    );
    heartbeat.unref?.();
    try {
      const preprocessing = this.extension?.supportsPreprocess(job.sourceKind)
        ? await this.extension.preprocess(job)
        : null;
      if (preprocessing?.notice) {
        this.logImportPipelineEvent({
          batchJobId: job.batchJobId,
          itemJobId: job.id,
          userId: job.userId,
          stage: $Enums.ImportPipelineStage.MATERIALIZING,
          message: preprocessing.notice.message,
          data: preprocessing.notice.data,
        });
      }
      if (preprocessing?.finished) {
        await this.markStatus(job.id, $Enums.ImportItemJobStatus.DONE, {
          completedAt: new Date(),
          lastError: null,
          lastErrorCode: null,
        });
        return;
      }

      thirdPartyActivityId = await this.importNormalizedActivity({
        job,
        parsedExtensionFile: preprocessing?.parsedFile,
        startedAt,
      });
    } catch (error) {
      // 失败时重试
      await this.failClaimedItem(job, error, thirdPartyActivityId);
    } finally {
      // 清理心跳定时器
      clearInterval(heartbeat);
      this.activeLeaseTokens.delete(job.id);
      this.revisionedItems.delete(job.id);
      // 刷新批次进度
      await this.importBatchService.refreshBatchProgress(job.batchJobId);
    }
  }

  /**
   * 把源对象变成 Activity。
   *
   * - 已有 canonical payload（fan-out 子任务）：直接物化
   * - 否则按 sourceKind 走 adapter.normalize
   *   Core 内建来源由 Core adapter 处理，其他来源由可选扩展提供 adapter input。
   *   0 条 → SKIPPED；多条 → 拆成子 item；1 条 → 物化
   */
  private async importNormalizedActivity(args: {
    job: ClaimedImportItemJob;
    parsedExtensionFile?: FileType;
    startedAt: number;
  }): Promise<number | undefined> {
    const { job } = args;

    // 标准化 input 构建
    const resolved = await this.buildNormalizeInput(job.id);
    const thirdPartyActivityId = resolved.thirdPartyActivityId;
    // 已有 canonical payload（fan-out 子任务）：直接物化
    if (resolved.directPayload) {
      await this.processCanonicalPayload({
        jobId: job.id,
        batchJobId: job.batchJobId,
        userId: job.userId,
        sourceObjectId: job.sourceObjectId,
        payload: resolved.directPayload,
        thirdPartyActivityId,
        repair: asImportItemSourceRef(resolved.job.sourceRef).repair,
      });
    } else if (resolved.input) {
      if ('activityFile' in resolved.input && args.parsedExtensionFile) {
        (
          resolved.input as SourceNormalizeInput & { parsedFile?: FileType }
        ).parsedFile = args.parsedExtensionFile;
      }
      // 记录标准化事件
      this.logImportPipelineEvent({
        batchJobId: job.batchJobId,
        itemJobId: job.id,
        userId: job.userId,
        stage: $Enums.ImportPipelineStage.NORMALIZING,
        message: `开始标准化源对象，适配器=${resolved.input.kind}`,
      });

      // 开始根据 sourceKind 走 adapter.normalize
      const normalized = await this.adapterRegistry.normalize(resolved.input);

      // 0 条 → SKIPPED；多条 → 拆成子 item；1 条 → 物化
      if (normalized.payloads.length === 0) {
        await this.markStatus(job.id, $Enums.ImportItemJobStatus.SKIPPED, {
          completedAt: new Date(),
          lastErrorCode: 'no_payloads',
          lastError: '适配器未返回标准活动载荷',
        });
      } else if (normalized.payloads.length > 1) {
        // 多条 → 拆成子 item
        await this.fanOutCanonicalPayloads({
          jobId: job.id,
          batchJobId: job.batchJobId,
          userId: job.userId,
          sourceObjectId: job.sourceObjectId,
          payloads: normalized.payloads,
        });
      } else {
        // 如果只有一条，则物化
        await this.processCanonicalPayload({
          jobId: job.id,
          batchJobId: job.batchJobId,
          userId: job.userId,
          sourceObjectId: job.sourceObjectId,
          payload: normalized.payloads[0]!,
          thirdPartyActivityId,
        });
      }
    } else {
      throw new Error('No normalization input or direct payload resolved');
    }

    this.logImportPipelineEvent({
      batchJobId: job.batchJobId,
      itemJobId: job.id,
      userId: job.userId,
      stage: $Enums.ImportPipelineStage.COMPLETED,
      message: `导入项处理完成，耗时=${Date.now() - args.startedAt}ms`,
    });
    return thirdPartyActivityId;
  }

  /**
   * 处理失败：FAILED + 退避；次数用尽变 DEAD。
   * 已 READY 的旧 Activity 不改；租约丢失则放弃写库。
   */
  private async completeUnavailableItem(
    job: ClaimedImportItemJob,
    args: {
      error: ImportSourceDataUnavailableError | null;
      routeToOrigin: boolean;
      diagnostic: string;
      code: string;
    },
  ) {
    const lockToken = this.activeLeaseTokens.get(job.id);
    const work = async (tx: Prisma.TransactionClient) => {
      if (lockToken && this.revisionedItems.has(job.id)) {
        const current = await this.importJobs.itemJobs(tx).findFirst({
          where: { id: job.id, lockToken },
          include: { sourceObject: true },
        });
        if (!current) return false;
        if (current.sourceObject.importRevision !== current.sourceRevision) {
          await this.importJobs.finishRevisionedItem(
            {
              id: job.id,
              lockToken,
              data: {
                status: 'SKIPPED',
                lockToken: null,
                leaseExpiresAt: null,
              },
            },
            tx,
          );
          return false;
        }
      }
      // Fence both the item completion and source routing with the current lease.
      const result = await this.importJobs.itemJobs(tx).updateMany({
        where: {
          id: job.id,
          userId: job.userId,
          ...(lockToken ? { lockToken } : {}),
        },
        data: {
          status: 'SKIPPED',
          attempts: { increment: 1 },
          analysisRequired: false,
          outcome: 'UPSTREAM_DATA_UNAVAILABLE',
          lastErrorCode: args.code,
          lastError: args.diagnostic,
          completedAt: new Date(),
          lockToken: null,
          leaseExpiresAt: null,
        },
      });
      if (result.count !== 1) return false;
      if (args.routeToOrigin) {
        await this.externalActivityRouter.routePersistedIntervalsDiscovery(
          {
            userId: job.userId,
            sourceObjectId: job.sourceObjectId,
            reason: 'fallback',
            confirmedOriginUnavailable: true,
          },
          tx,
        );
      } else {
        await this.externalActivityRouter.keepUnavailableSource(
          {
            userId: job.userId,
            sourceObjectId: job.sourceObjectId,
            error: args.error!,
          },
          tx,
        );
        await this.externalActivityMirrors.markOriginImportFailed(
          {
            userId: job.userId,
            sourceObjectId: job.sourceObjectId,
            reason: 'UPSTREAM_DATA_UNAVAILABLE',
          },
          tx,
        );
      }
      return true;
    };
    const identity =
      lockToken && this.revisionedItems.has(job.id)
        ? await this.importJobs.itemJobs().findUnique({
            where: { id: job.id },
            select: { userId: true, sourceKind: true, sourceUid: true },
          })
        : null;
    const completed = identity
      ? await this.importJobs.withSourceLocks(
          { ...identity, sourceUids: [identity.sourceUid] },
          work,
        )
      : await this.prisma.$transaction(work);
    if (!completed) return;
    this.logImportPipelineEvent({
      batchJobId: job.batchJobId,
      itemJobId: job.id,
      userId: job.userId,
      stage: $Enums.ImportPipelineStage.COMPLETED,
      message:
        'Source data unavailable; retained source without materializing an activity',
      data: { code: args.code },
      level: 'WARN',
    });
  }

  private async failClaimedItem(
    job: ClaimedImportItemJob,
    error: unknown,
    thirdPartyActivityId?: number,
  ) {
    const unavailable =
      error instanceof ImportSourceDataUnavailableError ? error : null;
    const routeToOrigin =
      job.sourceKind === 'INTERVALS_ICU' &&
      error instanceof IntervalsIcuApiError &&
      getExternalActivityOriginRoutingExtension()?.matchesUnavailableOriginError?.(
        {
          discoveryProvider: job.sourceKind,
          status: error.status,
          message: error.message,
          body: error.body,
        },
      ) === true;
    if (unavailable || routeToOrigin) {
      const lockToken = this.activeLeaseTokens.get(job.id);
      const current = await this.importJobs.itemJobs().findFirst({
        where: {
          id: job.id,
          userId: job.userId,
          ...(lockToken ? { lockToken } : {}),
        },
        select: { attempts: true },
      });
      if (!current) return;
      const maxAttempts =
        this.configService.get<number>('importItemWorker.maxAttempts') ?? 6;
      if (!unavailable?.retryable || current.attempts + 1 >= maxAttempts) {
        const diagnostic =
          routeToOrigin && error instanceof IntervalsIcuApiError
            ? `${error.message}${error.body ? `: ${error.body}` : ''}`
                .replace(/\s+/g, ' ')
                .slice(0, 2_000)
            : unavailable!.message;
        await this.completeUnavailableItem(job, {
          error: unavailable,
          routeToOrigin,
          diagnostic,
          code: unavailable?.code ?? 'INTERVALS_ICU_ORIGIN_DATA_UNAVAILABLE',
        });
        return;
      }
    }
    const revisionToken = this.activeLeaseTokens.get(job.id);
    if (revisionToken && this.revisionedItems.has(job.id)) {
      const identity = await this.importJobs.itemJobs().findUnique({
        where: { id: job.id },
        select: {
          userId: true,
          sourceKind: true,
          sourceObject: { select: { sourceUid: true } },
        },
      });
      if (!identity) return;
      await this.importJobs.withSourceLocks(
        { ...identity, sourceUids: [identity.sourceObject.sourceUid] },
        async (tx) => {
          const current = await this.importJobs
            .itemJobs(tx)
            .findFirst({ where: { id: job.id, lockToken: revisionToken } });
          if (!current) return;
          const attempts = current.attempts + 1;
          const invalidAuthorization =
            error instanceof Error &&
            [
              'IMPORT_AUTHORIZATION_CHANGED',
              'IMPORT_ACCOUNT_NO_LONGER_WRITABLE',
            ].includes(error.message);
          const terminal =
            invalidAuthorization ||
            error instanceof ImportIdentityConflictError ||
            attempts >=
              (this.configService.get<number>('importItemWorker.maxAttempts') ??
                6);
          const result = await this.importJobs.finishRevisionedItem(
            {
              id: job.id,
              lockToken: revisionToken,
              data: {
                status: invalidAuthorization
                  ? 'SKIPPED'
                  : terminal
                    ? 'DEAD'
                    : 'FAILED',
                ...(invalidAuthorization
                  ? { outcome: 'AUTHORIZATION_CHANGED' }
                  : {}),
                attempts,
                lastError:
                  error instanceof Error ? error.message : String(error),
                lastErrorCode:
                  error instanceof ImportIdentityConflictError
                    ? error.code
                    : null,
                completedAt: terminal ? new Date() : null,
                availableAt: new Date(Date.now() + backoffMs(attempts)),
                lockToken: null,
                leaseExpiresAt: null,
              },
            },
            tx,
          );
          if (!result.requeued && !invalidAuthorization) {
            if (
              thirdPartyActivityId &&
              !(error instanceof ImportIdentityConflictError)
            ) {
              await this.thirdPartyActivityService.markImportFailed(
                thirdPartyActivityId,
                error instanceof Error ? error.message : String(error),
                tx,
              );
            }
            if (terminal && this.extension)
              await this.extension.afterTerminalFailure(
                {
                  userId: job.userId,
                  sourceObjectId: job.sourceObjectId,
                  sourceKind: job.sourceKind,
                },
                tx,
              );
            this.logImportPipelineEvent({
              batchJobId: job.batchJobId,
              itemJobId: job.id,
              userId: job.userId,
              stage: 'FAILED',
              level: 'ERROR',
              message: error instanceof Error ? error.message : String(error),
            });
          }
          if (!result.requeued && !invalidAuthorization && current.activityId) {
            await tx.activity.updateMany({
              where: {
                id: current.activityId,
                userId: job.userId,
                processingStatus: { not: 'READY' },
              },
              data: {
                processingStatus: terminal ? 'FAILED' : 'PARTIAL_FAILED',
                processingUpdatedAt: new Date(),
                readyAt: null,
              },
            });
          }
        },
      );
      this.logger.warn(`Import revision failed or superseded: item=${job.id}`);
      return;
    }
    const identityConflict =
      error instanceof ImportIdentityConflictError ? error : null;
    const msg = error instanceof Error ? error.message : String(error);
    const lockToken = this.activeLeaseTokens.get(job.id);
    let row: { attempts: number; activityId: number | null } | null;
    if (lockToken) {
      const result = await this.importJobs.itemJobs().updateMany({
        where: { id: job.id, lockToken },
        data: {
          status: identityConflict ? 'DEAD' : 'FAILED',
          attempts: { increment: 1 },
          lastError: msg,
          ...(identityConflict ? { lastErrorCode: identityConflict.code } : {}),
          ...(unavailable ? { lastErrorCode: unavailable.code } : {}),
          completedAt: identityConflict ? new Date() : null,
          availableAt: new Date(Date.now() + 30 * 60_000),
          lockToken: null,
          leaseExpiresAt: null,
        },
      });
      row =
        result.count === 1
          ? await this.importJobs.itemJobs().findUnique({
              where: { id: job.id },
              select: { attempts: true, activityId: true },
            })
          : null;
    } else {
      row = await this.importJobs.itemJobs().update({
        where: { id: job.id },
        data: {
          status: identityConflict ? 'DEAD' : 'FAILED',
          attempts: { increment: 1 },
          lastError: msg,
          ...(identityConflict ? { lastErrorCode: identityConflict.code } : {}),
          ...(unavailable ? { lastErrorCode: unavailable.code } : {}),
          completedAt: identityConflict ? new Date() : null,
        },
        select: { attempts: true, activityId: true },
      });
    }
    if (!row) {
      this.logger.warn(`[导入项] 失败结果未写入：租约已转移，item=${job.id}`);
      return;
    }
    const attempts = row.attempts ?? 0;
    const maxAttempts =
      this.configService.get<number>('importItemWorker.maxAttempts') ?? 6;

    const terminal = Boolean(identityConflict) || attempts >= maxAttempts;

    if (row.activityId) {
      // staging 失败时旧 Activity 仍是 READY，不能把它隐藏；只有已经进入
      // 新建/提交处理态的 Activity 才随 item 标记为未完成或最终失败。
      await this.prisma.activity.updateMany({
        where: {
          id: row.activityId,
          userId: job.userId,
          processingStatus: { not: $Enums.ActivityProcessingStatus.READY },
        },
        data: {
          processingStatus: terminal
            ? $Enums.ActivityProcessingStatus.FAILED
            : $Enums.ActivityProcessingStatus.PARTIAL_FAILED,
          processingUpdatedAt: new Date(),
          readyAt: null,
        },
      });
    }

    if (thirdPartyActivityId && !identityConflict) {
      await this.thirdPartyActivityService.markImportFailed(
        thirdPartyActivityId,
        msg,
      );
    }

    this.logImportPipelineEvent({
      batchJobId: job.batchJobId,
      itemJobId: job.id,
      userId: job.userId,
      stage: $Enums.ImportPipelineStage.FAILED,
      message: msg,
      level: 'ERROR',
    });

    if (terminal) {
      if (this.extension) {
        await this.extension.afterTerminalFailure({
          userId: job.userId,
          sourceObjectId: job.sourceObjectId,
          sourceKind: job.sourceKind,
        });
      }
      await this.importJobs.itemJobs().update({
        where: { id: job.id },
        data: {
          status: 'DEAD',
          completedAt: new Date(),
          lockToken: null,
          leaseExpiresAt: null,
        },
      });
      return;
    }

    await this.importJobs.itemJobs().update({
      where: { id: job.id },
      data: {
        availableAt: new Date(Date.now() + backoffMs(attempts)),
      },
    });
  }
  /**
   * 处理导入项任务队列中的任务
   */
  private async drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;

    const batchSize =
      this.configService.get<number>('importItemWorker.batchSize') ?? 10;
    const concurrency =
      this.configService.get<number>('importItemWorker.concurrency') ?? 3;
    const progress = new WorkerDrainProgress(
      this.logger,
      '导入项队列',
      async () => ({
        remaining: await this.importJobs.itemJobs().count({
          where: {
            status: {
              in: [
                $Enums.ImportItemJobStatus.QUEUED,
                $Enums.ImportItemJobStatus.NORMALIZING,
                $Enums.ImportItemJobStatus.DEDUPING,
                $Enums.ImportItemJobStatus.MATERIALIZING,
                $Enums.ImportItemJobStatus.PARQUET_BUILDING,
                $Enums.ImportItemJobStatus.ANALYZING,
                $Enums.ImportItemJobStatus.FAILED,
              ],
            },
          },
        }),
      }),
    );

    try {
      while (!this.stopping) {
        const batch = await this.claimBatch(batchSize);
        if (!batch.length) return;

        let idx = 0;
        // 从队列中获取任务
        const runners = Array.from(
          { length: Math.min(concurrency, batch.length) },
          async () => {
            while (idx < batch.length && !this.stopping) {
              const current = batch[idx]!;
              const batchPosition = idx + 1;
              idx += 1;
              await progress.run({
                batchPosition,
                batchTotal: batch.length,
                details: `批次ID=${current.batchJobId} 导入项ID=${current.id} 用户ID=${current.userId}`,
                task: () => this.processJob(current),
              });
            }
          },
        );
        // 并发处理任务
        await Promise.all(runners);
      }
    } finally {
      this.draining = false;
    }
  }
}
