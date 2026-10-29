import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { UserDataExportJob } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import {
  USER_DATA_EXPORT_FORMAT,
  type UserDataExportJobDto,
  type UserDataExportLocationPrivacy,
  type UserDataExportMode,
} from '@shared/user-data-export';

const ACTIVE_STATUSES = [
  'QUEUED',
  'SNAPSHOTTING',
  'PACKAGING',
  'UPLOADING',
  'RETRY_WAIT',
] as const;

@Injectable()
export class UserDataExportService {
  private readonly logger = new Logger(UserDataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    users: UserQueryService,
  ) {
    this.users = users;
  }

  private readonly users: UserQueryService;

  async create(args: {
    userId: string;
    idempotencyKey: string;
    mode: UserDataExportMode;
    locationPrivacy: UserDataExportLocationPrivacy;
    includeOriginalFiles: boolean;
  }): Promise<UserDataExportJobDto> {
    const idempotencyKey = args.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    }
    if (args.mode === 'AI_ANALYSIS' && args.includeOriginalFiles) {
      throw new BadRequestException(
        'ORIGINAL_FILES_NOT_AVAILABLE_IN_AI_ANALYSIS',
      );
    }
    if (args.includeOriginalFiles && args.locationPrivacy !== 'EXACT') {
      throw new BadRequestException('ORIGINAL_FILES_REQUIRE_EXACT_LOCATION');
    }
    const requestHash = createHash('sha256')
      .update(`${args.userId}\u0000${idempotencyKey}`)
      .digest('hex');
    const scopedKey = `user-data-export:${requestHash}`;

    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "t_user"
        WHERE "id" = ${args.userId}
        FOR UPDATE
      `;

      const user = await this.users.users(tx).findUnique({
        where: { id: args.userId },
        select: { id: true, accountDeletionRequestedAt: true },
      });
      if (!user) throw new NotFoundException('ACCOUNT_NOT_FOUND');
      if (user.accountDeletionRequestedAt) {
        throw new ConflictException('ACCOUNT_DELETION_IN_PROGRESS');
      }

      const reused = await tx.userDataExportJob.findUnique({
        where: { idempotencyKey: scopedKey },
      });
      if (reused) {
        if (
          reused.userId !== args.userId ||
          reused.mode !== args.mode ||
          reused.locationPrivacy !== args.locationPrivacy ||
          reused.includeOriginalFiles !== args.includeOriginalFiles
        ) {
          throw new ConflictException('IDEMPOTENCY_KEY_ALREADY_USED');
        }
        return reused;
      }

      const active = await tx.userDataExportJob.findFirst({
        where: { userId: args.userId, status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { requestedAt: 'desc' },
      });
      if (active) return active;

      return await tx.userDataExportJob.create({
        data: {
          userId: args.userId,
          idempotencyKey: scopedKey,
          mode: args.mode,
          locationPrivacy: args.locationPrivacy,
          includeOriginalFiles: args.includeOriginalFiles,
          schemaVersion: USER_DATA_EXPORT_FORMAT,
          dataCutoffAt: new Date(),
          progressStage: 'queued',
        },
      });
    });
    this.logger.log(
      `Export request accepted job=${job.id} status=${job.status} mode=${job.mode} privacy=${job.locationPrivacy} originals=${job.includeOriginalFiles}`,
    );
    return this.toDto(job);
  }

  async list(userId: string): Promise<UserDataExportJobDto[]> {
    const jobs = await this.prisma.userDataExportJob.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
    return jobs.map((job) => this.toDto(job));
  }

  async get(userId: string, id: string): Promise<UserDataExportJobDto> {
    return this.toDto(await this.requireOwnedJob(userId, id));
  }

  async openDownload(userId: string, id: string) {
    const job = await this.requireOwnedJob(userId, id);
    if (
      job.status !== 'READY' ||
      !job.artifactStorageKey ||
      !job.artifactFileName ||
      !job.artifactSizeBytes ||
      !job.artifactSha256 ||
      !job.expiresAt ||
      job.expiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException('EXPORT_NOT_READY');
    }
    this.logger.log(
      `Export download opened job=${job.id} sizeBytes=${job.artifactSizeBytes.toString()}`,
    );
    return {
      stream: await this.storage.openReadStream(
        job.artifactStorageKey,
        'private',
      ),
      fileName: job.artifactFileName,
      sizeBytes: job.artifactSizeBytes,
      sha256: job.artifactSha256,
    };
  }

  async remove(userId: string, id: string) {
    const job = await this.requireOwnedJob(userId, id);
    if (
      ACTIVE_STATUSES.includes(job.status as (typeof ACTIVE_STATUSES)[number])
    ) {
      throw new ConflictException('EXPORT_IN_PROGRESS');
    }
    if (job.artifactStorageKey) {
      await this.storage.deleteFile(job.artifactStorageKey, 'private');
    }
    await this.prisma.userDataExportJob.delete({
      where: { id: job.id },
    });
    this.logger.log(`Export removed job=${job.id} status=${job.status}`);
    return { deleted: true };
  }

  private async requireOwnedJob(userId: string, id: string) {
    const job = await this.prisma.userDataExportJob.findFirst({
      where: { id, userId },
    });
    if (!job) throw new NotFoundException('EXPORT_NOT_FOUND');
    return job;
  }

  private toDto(job: UserDataExportJob): UserDataExportJobDto {
    const warnings = Array.isArray(job.warnings)
      ? job.warnings.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    return {
      id: job.id,
      mode: job.mode,
      locationPrivacy: job.locationPrivacy,
      includeOriginalFiles: job.includeOriginalFiles,
      status: job.status,
      schemaVersion: job.schemaVersion,
      dataCutoffAt: job.dataCutoffAt.toISOString(),
      progress: {
        stage: job.progressStage,
        current: job.progressCurrent,
        total: job.progressTotal,
      },
      artifact:
        job.status === 'READY' &&
        job.artifactFileName &&
        job.artifactSizeBytes != null &&
        job.artifactSha256 &&
        job.expiresAt
          ? {
              fileName: job.artifactFileName,
              sizeBytes: job.artifactSizeBytes.toString(),
              sha256: job.artifactSha256,
              expiresAt: job.expiresAt.toISOString(),
            }
          : null,
      warnings,
      requestedAt: job.requestedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      lastError: job.lastErrorCode
        ? { code: job.lastErrorCode, detail: null }
        : null,
    };
  }
}
