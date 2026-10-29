import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import type { Request } from 'express';
import { $Enums, Prisma, type Activity } from '@prisma/client';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import {
  CanonicalActivityMaterializer,
  ImportBatchService,
  type CanonicalActivityPayload,
} from '@/importing';
import { ImportingJobService } from '@/importing/importing-job.service';
import { FileSourceAdapter } from '@/importing/source-adapters/file-source.adapter';
import { ActivityReadService } from './activity-read.service';
import { ActivityAnalyzeMode, ActivityService } from './activity.service';

type ActivityImportDraftStatus =
  | 'READY'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'DISCARDED';

type ActivityImportDraftRow = {
  id: string;
  userId: string;
  sourceObjectId: string | null;
  sourceKind: string;
  sourceUid: string;
  fileName: string | null;
  fileKey: string | null;
  rawStorageKey: string | null;
  status: ActivityImportDraftStatus;
  payload: unknown;
  summary: unknown;
  sessionRpe: number | null;
  committedActivityId: number | null;
  committedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ActivityImportDraftIdempotencyRow = {
  id: string;
  idempotencyHash: string | null;
};

type ActivityImportDraftCoordinate = {
  latitude: number;
  longitude: number;
};

type ActivityImportDraftLap = {
  index?: number | null;
  distance?: number | null;
  elapsedTime?: number | null;
  timerTime?: number | null;
};

export type ActivityImportDraftPreview = {
  id: string;
  status: ActivityImportDraftStatus;
  sourceKind: string;
  sourceUid: string;
  fileName: string | null;
  activityName: string | null;
  sportType: string | null;
  subSportType: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  distance: number | null;
  elapsedTime: number | null;
  timerTime: number | null;
  ascent: number | null;
  descent: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  calories: number | null;
  sessionRpe: number | null;
  routeCoordinates: ActivityImportDraftCoordinate[];
  laps: ActivityImportDraftLap[];
  committedActivityId: number | null;
  committedActivityHashId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CommitActivityImportDraftResult = {
  activityHashId: string;
  activityId: number;
  batchId: string;
  importItemId: string;
  preview: ActivityImportDraftPreview;
};

function fileSourceUid(file: Express.Multer.File, userId: string) {
  const hash = createHash('sha1')
    .update(userId)
    .update('|')
    .update(file.originalname ?? '')
    .update('|')
    .update(file.buffer ?? Buffer.alloc(0))
    .digest('hex');
  return `file:${hash}`;
}

function stableId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function jsonForDb(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parsePayload(value: unknown): CanonicalActivityPayload {
  if (typeof value === 'string') {
    return JSON.parse(value) as CanonicalActivityPayload;
  }
  return value as CanonicalActivityPayload;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSessionRpe(raw: number | null | undefined) {
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message: 'Invalid session RPE',
    });
  }
  return value;
}

function pickPrimaryPayload(payloads: CanonicalActivityPayload[]) {
  return payloads.reduce((best, payload) => {
    const bestScore =
      (best.summary.timerTime ?? best.summary.elapsedTime ?? 0) * 1000 +
      (best.summary.distance ?? 0);
    const nextScore =
      (payload.summary.timerTime ?? payload.summary.elapsedTime ?? 0) * 1000 +
      (payload.summary.distance ?? 0);
    return nextScore > bestScore ? payload : best;
  }, payloads[0]!);
}

function routeCoordinatesFromPayload(
  payload: CanonicalActivityPayload,
  maxPoints = 600,
): ActivityImportDraftCoordinate[] {
  const coordinates = payload.records
    .map((record) => ({
      latitude: finiteNumber(record.positionLat),
      longitude: finiteNumber(record.positionLong),
    }))
    .filter(
      (coordinate): coordinate is ActivityImportDraftCoordinate =>
        coordinate.latitude != null && coordinate.longitude != null,
    );

  if (coordinates.length <= maxPoints) return coordinates;
  const stride = Math.ceil(coordinates.length / maxPoints);
  const sampled = coordinates.filter((_, index) => index % stride === 0);
  const last = coordinates[coordinates.length - 1];
  if (last && sampled.at(-1) !== last) sampled.push(last);
  return sampled;
}

/**
 * 从文件创建活动草稿。
 * @param row - 文件。
 * @param activityHashId - 活动哈希 ID。
 * @returns 活动草稿预览。
 */
function previewFromDraftRow(
  row: ActivityImportDraftRow,
  activityHashId?: string | null,
): ActivityImportDraftPreview {
  const payload = parsePayload(row.payload);
  const summary = payload.summary;
  return {
    id: row.id,
    status: row.status,
    sourceKind: row.sourceKind,
    sourceUid: row.sourceUid,
    fileName: row.fileName,
    activityName: summary.name ?? null,
    sportType: summary.sportType ?? null,
    subSportType: summary.subSportType ?? null,
    startTime: summary.startTime ?? summary.timestamp ?? null,
    endTime: summary.endTime ?? null,
    timezone: summary.timezone ?? null,
    distance: finiteNumber(summary.distance),
    elapsedTime: finiteNumber(summary.elapsedTime),
    timerTime: finiteNumber(summary.timerTime),
    ascent: finiteNumber(summary.enhancedAscent ?? summary.ascent),
    descent: finiteNumber(summary.enhancedDescent ?? summary.descent),
    averageSpeed: finiteNumber(summary.avgSpeed),
    maxSpeed: finiteNumber(summary.maxSpeed),
    avgHeartRate: finiteNumber(summary.avgHeartRate),
    maxHeartRate: finiteNumber(summary.maxHeartRate),
    avgPower: finiteNumber(summary.avgPower),
    maxPower: finiteNumber(summary.maxPower),
    avgCadence: finiteNumber(summary.avgCadence),
    maxCadence: finiteNumber(summary.maxCadence),
    calories: finiteNumber(summary.calories),
    sessionRpe: row.sessionRpe,
    routeCoordinates: routeCoordinatesFromPayload(payload),
    laps: payload.laps.map((lap) => ({
      index: lap.index ?? null,
      distance: finiteNumber(lap.distance),
      elapsedTime: finiteNumber(lap.elapsedTime),
      timerTime: finiteNumber(lap.timerTime),
    })),
    committedActivityId: row.committedActivityId,
    committedActivityHashId: activityHashId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ActivityImportDraftService {
  private readonly logger = new Logger(ActivityImportDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly fileSourceAdapter: FileSourceAdapter,
    private readonly materializer: CanonicalActivityMaterializer,
    private readonly activityService: ActivityService,
    private readonly activityRead: ActivityReadService,
    private readonly importBatchService: ImportBatchService,
    private readonly i18n: I18nService,
    private readonly importJobs: ImportingJobService,
  ) {}

  /**
   * 从文件创建活动草稿。
   * @param args - 参数。
   * @param args.file - 文件。
   * @param args.req - 请求。
   * @param args.userId - 用户 ID。
   * @returns 活动草稿预览。
   */
  async createFromFile(args: {
    file: Express.Multer.File;
    idempotencyKey?: string;
    req?: Request;
    userId: string;
  }): Promise<ActivityImportDraftPreview> {
    const idempotencyKey = this.normalizeIdempotencyKey(args.idempotencyKey);
    const rawChecksum = createHash('sha256')
      .update(args.file.buffer)
      .digest('hex');
    if (idempotencyKey) {
      const existing = await this.findDraftByIdempotencyKey(
        args.userId,
        idempotencyKey,
      );
      if (existing) {
        this.assertMatchingIdempotencyHash(existing, rawChecksum);
        return this.getDraftPreview({
          draftId: existing.id,
          userId: args.userId,
        });
      }
    }
    const uploaded = await this.storage.uploadFile(
      args.file,
      undefined,
      args.req,
    );
    const sourceUid = fileSourceUid(args.file, args.userId);
    const metadata = {
      draft: true,
      size: args.file.size,
      mimeType: args.file.mimetype,
      originalFileName: args.file.originalname,
    };

    const sourceObject = await this.importJobs.sourceObjects().upsert({
      where: {
        import_source_object_identity_unique: {
          userId: args.userId,
          sourceKind: 'FILE',
          sourceUid,
        },
      },
      create: {
        id: stableId('src'),
        userId: args.userId,
        sourceKind: 'FILE',
        sourceUid,
        objectType: 'activity_import_draft_file',
        fileName: args.file.originalname,
        fileKey: uploaded.fileKey,
        rawStorageKey: uploaded.fileKey,
        rawChecksum,
        metadata: metadata as Prisma.InputJsonValue,
      },
      update: {
        objectType: 'activity_import_draft_file',
        fileName: args.file.originalname,
        fileKey: uploaded.fileKey,
        rawStorageKey: uploaded.fileKey,
        rawChecksum,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    const normalized = await this.fileSourceAdapter.normalize({
      kind: 'FILE',
      sourceUid,
      file: args.file,
      fileKey: uploaded.fileKey,
      rawStorageKey: uploaded.fileKey,
      metadata,
    });
    if (!normalized.payloads.length) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'No activity found in file',
      });
    }

    const payload = pickPrimaryPayload(normalized.payloads);
    payload.summary.subSportType =
      await this.materializer.resolveSportDefinitionCode(payload, null);
    const draftId = stableId('draft');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<
      ActivityImportDraftRow[]
    >(Prisma.sql`
      INSERT INTO "t_activity_import_draft" (
        "id",
        "user_id",
        "source_object_id",
        "source_kind",
        "source_uid",
        "file_name",
        "file_key",
        "raw_storage_key",
        "status",
        "idempotency_key",
        "idempotency_hash",
        "payload",
        "summary",
        "expires_at",
        "created_at",
        "updated_at"
      )
      VALUES (
        ${draftId},
        ${args.userId},
        ${sourceObject.id},
        ${$Enums.ImportSourceKind.FILE}::"enum_import_source_kind",
        ${payload.source.sourceUid},
        ${args.file.originalname},
        ${uploaded.fileKey},
        ${uploaded.fileKey},
        ${'READY'},
        ${idempotencyKey},
        ${idempotencyKey ? rawChecksum : null},
        ${jsonForDb(payload)}::jsonb,
        ${jsonForDb(payload.summary)}::jsonb,
        ${expiresAt},
        NOW(),
        NOW()
      )
      ON CONFLICT ("user_id", "idempotency_key") DO NOTHING
      RETURNING
        "id",
        "user_id" AS "userId",
        "source_object_id" AS "sourceObjectId",
        "source_kind"::text AS "sourceKind",
        "source_uid" AS "sourceUid",
        "file_name" AS "fileName",
        "file_key" AS "fileKey",
        "raw_storage_key" AS "rawStorageKey",
        "status",
        "payload",
        "summary",
        "session_rpe" AS "sessionRpe",
        "committed_activity_id" AS "committedActivityId",
        "committed_at" AS "committedAt",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `);
    if (rows[0]) {
      return previewFromDraftRow(rows[0]);
    }
    if (!idempotencyKey) {
      throw new ConflictException('Activity draft could not be created');
    }
    const raced = await this.findDraftByIdempotencyKey(
      args.userId,
      idempotencyKey,
    );
    if (!raced) {
      throw new ConflictException(
        'Activity draft idempotency race was not resolved',
      );
    }
    this.assertMatchingIdempotencyHash(raced, rawChecksum);
    return this.getDraftPreview({
      draftId: raced.id,
      userId: args.userId,
    });
  }

  private normalizeIdempotencyKey(value?: string) {
    const normalized = value?.trim() ?? '';
    if (!normalized) return null;
    if (normalized.length < 8 || normalized.length > 200) {
      throw new BadRequestException('Invalid Idempotency-Key');
    }
    return normalized;
  }

  private async findDraftByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ) {
    const rows = await this.prisma.$queryRaw<
      ActivityImportDraftIdempotencyRow[]
    >(Prisma.sql`
      SELECT
        "id",
        "idempotency_hash" AS "idempotencyHash"
      FROM "t_activity_import_draft"
      WHERE "user_id" = ${userId}
        AND "idempotency_key" = ${idempotencyKey}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private assertMatchingIdempotencyHash(
    draft: ActivityImportDraftIdempotencyRow,
    expectedHash: string,
  ) {
    if (draft.idempotencyHash !== expectedHash) {
      throw new ConflictException(
        'Idempotency-Key was already used with different activity data',
      );
    }
  }

  /**
   * 获取活动草稿预览。
   * @param args - 参数。
   * @param args.draftId - 草稿 ID。
   * @param args.userId - 用户 ID。
   * @returns 活动草稿预览。
   */
  async getDraftPreview(args: {
    draftId: string;
    userId: string;
  }): Promise<ActivityImportDraftPreview> {
    const row = await this.getDraftRow(args.draftId, args.userId);
    const activityHashId = row.committedActivityId
      ? await this.activityRead.findHashIdById(
          args.userId,
          row.committedActivityId,
        )
      : null;
    return previewFromDraftRow(row, activityHashId);
  }

  /**
   * 提交活动草稿。
   * @param args - 参数。
   * @param args.draftId - 草稿 ID。
   * @param args.sessionRpe - 会话 RPE。
   * @param args.userId - 用户 ID。
   * @returns 提交结果。
   */
  async commitDraft(args: {
    draftId: string;
    sessionRpe: number | null;
    userId: string;
  }): Promise<CommitActivityImportDraftResult> {
    const sessionRpe = normalizeSessionRpe(args.sessionRpe);
    let row = await this.getDraftRow(args.draftId, args.userId);
    if (row.status === 'COMMITTED' && row.committedActivityId) {
      // 提交接口是幂等的；首次响应若在后续关联阶段丢失，重试仍应把用户
      // 最新选择的 RPE 对齐到已提交活动，而不是静默返回旧草稿值。
      if (row.sessionRpe !== sessionRpe) {
        await this.prisma.$transaction([
          this.prisma.activity.updateMany({
            where: { id: row.committedActivityId, userId: args.userId },
            data: { sessionRpe },
          }),
          this.prisma.activityImportDraft.update({
            where: { id: row.id },
            data: { sessionRpe },
          }),
        ]);
        row = await this.getDraftRow(args.draftId, args.userId);
      }
      const activityHashId = await this.activityRead.findHashIdById(
        args.userId,
        row.committedActivityId,
      );
      if (!activityHashId) {
        throw new NotFoundException('Committed activity not found');
      }
      return {
        activityHashId,
        activityId: row.committedActivityId,
        batchId: '',
        importItemId: '',
        preview: previewFromDraftRow(row, activityHashId),
      };
    }
    if (
      row.status === 'COMMITTING' &&
      Date.now() - row.updatedAt.getTime() > 10 * 60 * 1_000
    ) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "t_activity_import_draft"
        SET "status" = ${'READY'}, "updated_at" = NOW()
        WHERE "id" = ${row.id}
          AND "user_id" = ${args.userId}
          AND "status" = ${'COMMITTING'}
          AND "updated_at" = ${row.updatedAt}
      `);
      row = await this.getDraftRow(args.draftId, args.userId);
    }
    if (row.status !== 'READY') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_draft_not_ready'),
      });
    }
    if (!row.sourceObjectId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_draft_source_file_missing'),
      });
    }

    const claimed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "t_activity_import_draft"
      SET "status" = ${'COMMITTING'}, "updated_at" = NOW()
      WHERE "id" = ${row.id}
        AND "user_id" = ${args.userId}
        AND "status" = ${'READY'}
    `);
    if (claimed !== 1) {
      throw new ConflictException('Activity draft is already being committed');
    }

    const payload = parsePayload(row.payload);
    let batch: { id: string } | null = null;
    let item: { id: string } | null = null;
    try {
      // 批次和导入项也属于提交过程；任何一步失败都必须释放草稿锁。
      batch = await this.importJobs.batchJobs().create({
        data: {
          userId: args.userId,
          sourceKind: 'FILE',
          status: 'RUNNING',
          totalCount: 1,
          requestContext: {
            draftId: row.id,
            source: 'activity_import_draft',
            fileName: row.fileName,
          } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      });
      item = await this.importJobs.itemJobs().create({
        data: {
          batchJobId: batch.id,
          userId: args.userId,
          sourceObjectId: row.sourceObjectId,
          sourceKind: 'FILE',
          sourceUid: row.sourceUid,
          position: 0,
          status: 'MATERIALIZING',
          // 此 item 由当前 HTTP 请求内联实体化。没有 lease 时，后台 worker 会把
          // MATERIALIZING 视为可回收任务并并发实体化，导致同一草稿生成两条活动。
          lockToken: `draft-inline:${randomUUID()}`,
          leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1_000),
          sourceRef: {
            draftId: row.id,
            fileName: row.fileName,
            fileKey: row.fileKey,
            kind: 'activity_import_draft',
          } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      });
      const materialized = await this.materializer.materialize({
        itemJobId: item.id,
        userId: args.userId,
        batchJobId: batch.id,
        sourceObjectId: row.sourceObjectId,
        payload,
      });
      const activity = await this.prepareCommittedActivity({
        activity: materialized.activity,
        payload,
        sessionRpe,
        userId: args.userId,
      });

      await this.importJobs.itemJobs().update({
        where: { id: item.id },
        data: {
          activityId: activity.id,
          dedupeKey: payload.identity.dedupeKey,
          status: 'DONE',
          completedAt: new Date(),
          lockToken: null,
          leaseExpiresAt: null,
          lastError: null,
          lastErrorCode: null,
        },
      });
      await this.importBatchService.refreshBatchProgress(batch.id);

      const updatedRows = await this.prisma.$queryRaw<
        ActivityImportDraftRow[]
      >(Prisma.sql`
        UPDATE "t_activity_import_draft"
        SET
          "status" = ${'COMMITTED'},
          "session_rpe" = ${sessionRpe},
          "committed_activity_id" = ${activity.id},
          "committed_at" = NOW(),
          "updated_at" = NOW()
        WHERE "id" = ${row.id}
          AND "user_id" = ${args.userId}
          AND "status" = ${'COMMITTING'}
        RETURNING
          "id",
          "user_id" AS "userId",
          "source_object_id" AS "sourceObjectId",
          "source_kind"::text AS "sourceKind",
          "source_uid" AS "sourceUid",
          "file_name" AS "fileName",
          "file_key" AS "fileKey",
          "raw_storage_key" AS "rawStorageKey",
          "status",
          "payload",
          "summary",
          "session_rpe" AS "sessionRpe",
          "committed_activity_id" AS "committedActivityId",
          "committed_at" AS "committedAt",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt"
      `);

      return {
        activityHashId: activity.hashId,
        activityId: activity.id,
        batchId: batch.id,
        importItemId: item.id,
        preview: previewFromDraftRow(updatedRows[0]!, activity.hashId),
      };
    } catch (error) {
      this.logger.error(
        `[活动草稿] 保存失败 draft=${row.id} batch=${batch?.id ?? '-'} item=${item?.id ?? '-'}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (item) {
        await this.importJobs.itemJobs().update({
          where: { id: item.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            lastError: error instanceof Error ? error.message : String(error),
          },
        });
      }
      if (batch) {
        await this.importBatchService.refreshBatchProgress(batch.id);
      }
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "t_activity_import_draft"
        SET "status" = ${'READY'}, "updated_at" = NOW()
        WHERE "id" = ${row.id}
          AND "user_id" = ${args.userId}
          AND "status" = ${'COMMITTING'}
      `);
      throw error;
    }
  }

  /**
   * 获取活动草稿行。
   * @param draftId - 草稿 ID。
   * @param userId - 用户 ID。
   * @returns 活动草稿行。
   */
  private async getDraftRow(draftId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<
      ActivityImportDraftRow[]
    >(Prisma.sql`
      SELECT
        "id",
        "user_id" AS "userId",
        "source_object_id" AS "sourceObjectId",
        "source_kind"::text AS "sourceKind",
        "source_uid" AS "sourceUid",
        "file_name" AS "fileName",
        "file_key" AS "fileKey",
        "raw_storage_key" AS "rawStorageKey",
        "status",
        "payload",
        "summary",
        "session_rpe" AS "sessionRpe",
        "committed_activity_id" AS "committedActivityId",
        "committed_at" AS "committedAt",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "t_activity_import_draft"
      WHERE "id" = ${draftId} AND "user_id" = ${userId}
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Activity draft not found');
    }
    return row;
  }

  /**
   * 准备提交的活动。
   * @param args - 参数。
   * @param args.activity - 活动。
   * @param args.payload - 负载。
   * @param args.sessionRpe - 会话 RPE。
   * @param args.userId - 用户 ID。
   * @returns 准备提交的活动。
   */
  private async prepareCommittedActivity(args: {
    activity: Activity;
    payload: CanonicalActivityPayload;
    sessionRpe: number | null;
    userId: string;
  }) {
    const activityWithRpe =
      args.sessionRpe == null
        ? args.activity
        : await this.prisma.activity.update({
            where: { id: args.activity.id },
            data: { sessionRpe: args.sessionRpe },
          });

    await this.activityService.generateParquetFileByCanonicalPayload(
      activityWithRpe,
      args.payload,
      args.userId,
      { analysisMode: ActivityAnalyzeMode.LIGHT },
    );
    return this.prisma.activity.update({
      where: { id: activityWithRpe.id },
      data: {
        processingStatus: 'ANALYZING',
        processingUpdatedAt: new Date(),
        readyAt: null,
      },
    });
  }
}
