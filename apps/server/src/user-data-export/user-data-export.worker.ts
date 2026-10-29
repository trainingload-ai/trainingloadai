import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type UserDataExportJob } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';

import { UserDataExportArchiveService } from './user-data-export-archive.service';

type ClaimedJob = UserDataExportJob & { lockToken: string };

function errorType(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

@Injectable()
export class UserDataExportWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDataExportWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopping = false;
  private retryDrainAfter = 0;
  private lastDrainErrorLogAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly archive: UserDataExportArchiveService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  onModuleInit() {
    if (this.config.get<boolean>('userDataExportWorker.enabled') === false) {
      this.logger.log('User data export worker is disabled');
      return;
    }
    const pollMs =
      this.config.get<number>('userDataExportWorker.pollMs') ?? 1000;
    const batchSize =
      this.config.get<number>('userDataExportWorker.batchSize') ?? 1;
    const leaseMs =
      this.config.get<number>('userDataExportWorker.leaseMs') ?? 5 * 60_000;
    const retentionDays =
      this.config.get<number>('userDataExportWorker.retentionDays') ?? 7;
    this.timer = setInterval(() => void this.drain(), pollMs);
    this.logger.log(
      `User data export worker started pollMs=${pollMs} batchSize=${batchSize} leaseMs=${leaseMs} retentionDays=${retentionDays}`,
    );
    void this.archive
      .cleanupStaleWorkingDirectories()
      .catch((error) =>
        this.logger.warn(
          `Could not clean stale export working directories: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    void this.drain();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.logger.log(
      `User data export worker stopped runningDrain=${this.running}`,
    );
  }

  private async drain() {
    if (this.running || this.stopping || Date.now() < this.retryDrainAfter) {
      return;
    }
    this.running = true;
    try {
      await this.expireArtifacts();
      await this.failExhaustedJobs();
      const batchSize =
        this.config.get<number>('userDataExportWorker.batchSize') ?? 1;
      const jobs = await this.claim(Math.max(1, batchSize));
      await Promise.all(jobs.map((job) => this.process(job)));
      this.retryDrainAfter = 0;
      this.lastDrainErrorLogAt = 0;
    } catch (error) {
      const now = Date.now();
      const missingTable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021';
      this.retryDrainAfter = now + (missingTable ? 60_000 : 5_000);
      if (now - this.lastDrainErrorLogAt >= 60_000) {
        this.lastDrainErrorLogAt = now;
        if (missingTable) {
          this.logger.warn(
            'User data export worker is waiting for its database migration. Run `pnpm prisma:deploy`; it will retry automatically.',
          );
        } else {
          this.logger.error(
            `User data export drain failed errorType=${errorType(error)} retryAfterMs=5000`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async claim(batchSize: number): Promise<ClaimedJob[]> {
    const leaseMs =
      this.config.get<number>('userDataExportWorker.leaseMs') ?? 5 * 60_000;
    const lockToken = randomUUID();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
      WITH picked AS (
        SELECT j.id
        FROM t_user_data_export_job j
        INNER JOIN t_user u ON u.id = j.user_id
        WHERE j.status IN (
          'QUEUED', 'RETRY_WAIT', 'SNAPSHOTTING', 'PACKAGING', 'UPLOADING'
        )
          AND u.account_deletion_requested_at IS NULL
          AND j.attempts < j.max_attempts
          AND j.available_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          AND (
            j.lease_expires_at IS NULL
            OR j.lease_expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          )
        ORDER BY j.requested_at ASC
        LIMIT $1
        FOR UPDATE OF j SKIP LOCKED
      )
      UPDATE t_user_data_export_job j
      SET status = 'SNAPSHOTTING',
          progress_stage = 'starting',
          lock_token = $2,
          lease_expires_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ($3 * INTERVAL '1 millisecond'),
          started_at = COALESCE(j.started_at, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
          attempts = j.attempts + 1,
          last_error_code = NULL,
          last_error_detail = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id
      `,
      batchSize,
      lockToken,
      leaseMs,
    );
    const jobs = await this.prisma.userDataExportJob.findMany({
      where: { id: { in: rows.map((row) => row.id) }, lockToken },
    });
    return jobs as ClaimedJob[];
  }

  private async process(job: ClaimedJob) {
    let result: Awaited<
      ReturnType<UserDataExportArchiveService['build']>
    > | null = null;
    let uploadedKey: string | null = null;
    const leaseMs =
      this.config.get<number>('userDataExportWorker.leaseMs') ?? 5 * 60_000;
    const processStartedAt = Date.now();
    this.logger.log(
      `Export started job=${job.id} attempt=${job.attempts}/${job.maxAttempts} mode=${job.mode} privacy=${job.locationPrivacy} originals=${job.includeOriginalFiles} cutoff=${job.dataCutoffAt.toISOString()}`,
    );
    const leaseTimer = setInterval(
      () => void this.extendLease(job, leaseMs),
      Math.max(5_000, Math.min(60_000, Math.floor(leaseMs / 3))),
    );
    try {
      result = await this.archive.build(job, async (stage, current, total) => {
        const status = stage === 'packaging' ? 'PACKAGING' : 'SNAPSHOTTING';
        await this.heartbeat(job, status, stage, current, total);
        this.logger.log(
          `Export progress job=${job.id} stage=${stage} progress=${current}/${total} elapsedMs=${Date.now() - processStartedAt}`,
        );
      });
      await this.heartbeat(
        job,
        'UPLOADING',
        'uploading',
        job.progressTotal || 1,
        job.progressTotal || 1,
      );
      const [stat, sha256] = await Promise.all([
        fs.stat(result.archivePath),
        this.sha256(result.archivePath),
      ]);
      this.logger.log(
        `Export archive built job=${job.id} file=${result.fileName} sizeBytes=${stat.size} warnings=${result.warnings.length} elapsedMs=${Date.now() - processStartedAt}`,
      );
      this.logger.log(
        `Export upload started job=${job.id} sizeBytes=${stat.size}`,
      );
      const uploaded = await this.storage.uploadFileFromPath(
        {
          path: result.archivePath,
          originalname: result.fileName,
          mimetype: 'application/zip',
          size: stat.size,
        },
        'private',
      );
      uploadedKey = uploaded.fileKey;
      const retentionDays =
        this.config.get<number>('userDataExportWorker.retentionDays') ?? 7;
      const completedAt = new Date();
      const expiresAt = new Date(
        completedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000,
      );
      const updated = await this.prisma.$transaction(async (tx) => {
        // Account deletion takes the same user-row lock before collecting its
        // storage manifest. Whichever operation gets the lock first therefore
        // determines whether this artifact is published or discarded, without
        // leaving an object outside the deletion manifest.
        await tx.$queryRaw`
          SELECT "id"
          FROM "t_user"
          WHERE "id" = ${job.userId}
          FOR UPDATE
        `;
        return await tx.userDataExportJob.updateMany({
          where: {
            id: job.id,
            lockToken: job.lockToken,
            user: { accountDeletionRequestedAt: null },
          },
          data: {
            status: 'READY',
            progressStage: 'ready',
            progressCurrent: 1,
            progressTotal: 1,
            artifactStorageKey: uploaded.fileKey,
            artifactFileName: result.fileName,
            artifactSizeBytes: BigInt(stat.size),
            artifactSha256: sha256,
            warnings: result.warnings,
            completedAt,
            expiresAt,
            availableAt: completedAt,
            leaseExpiresAt: null,
            lockToken: null,
          },
        });
      });
      if (updated.count !== 1) {
        await this.storage.deleteFile(uploaded.fileKey, 'private');
        uploadedKey = null;
        throw new Error('Export lease was lost before completion');
      }
      this.logger.log(
        `Export ready job=${job.id} sizeBytes=${stat.size} warnings=${result.warnings.length} expiresAt=${expiresAt.toISOString()} elapsedMs=${Date.now() - processStartedAt}`,
      );
      uploadedKey = null;
    } catch (error) {
      if (uploadedKey) {
        await this.storage
          .deleteFile(uploadedKey, 'private')
          .catch((cleanupError) =>
            this.logger.warn(
              `Could not remove orphaned export artifact job=${job.id} errorType=${errorType(cleanupError)}`,
            ),
          );
      }
      await this.retryOrFail(job, error);
    } finally {
      clearInterval(leaseTimer);
      if (result) await this.archive.cleanup(result).catch(() => undefined);
    }
  }

  private async extendLease(job: ClaimedJob, leaseMs: number) {
    try {
      await this.prisma.userDataExportJob.updateMany({
        where: { id: job.id, lockToken: job.lockToken },
        data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
      });
    } catch (error) {
      this.logger.warn(
        `Could not extend export lease job=${job.id} errorType=${errorType(error)}`,
      );
    }
  }

  private async heartbeat(
    job: ClaimedJob,
    status: 'SNAPSHOTTING' | 'PACKAGING' | 'UPLOADING',
    stage: string,
    current: number,
    total: number,
  ) {
    const leaseMs =
      this.config.get<number>('userDataExportWorker.leaseMs') ?? 5 * 60_000;
    const result = await this.prisma.userDataExportJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: {
        status,
        progressStage: stage,
        progressCurrent: current,
        progressTotal: total,
        leaseExpiresAt: new Date(Date.now() + leaseMs),
      },
    });
    if (result.count !== 1) throw new Error('Export lease was lost');
    job.progressCurrent = current;
    job.progressTotal = total;
  }

  private async retryOrFail(job: ClaimedJob, error: unknown) {
    const retry = job.attempts < job.maxAttempts;
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    const delayMs = Math.min(
      60 * 60_000,
      30_000 * 2 ** Math.max(0, job.attempts - 1),
    );
    await this.prisma.userDataExportJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: {
        status: retry ? 'RETRY_WAIT' : 'FAILED',
        progressStage: retry ? 'retry-wait' : 'failed',
        availableAt: retry ? new Date(Date.now() + delayMs) : new Date(),
        leaseExpiresAt: null,
        lockToken: null,
        lastErrorCode: 'EXPORT_GENERATION_FAILED',
        lastErrorDetail: detail.slice(0, 20_000),
      },
    });
    this.logger.error(
      `Export attempt failed job=${job.id} attempt=${job.attempts}/${job.maxAttempts} nextStatus=${retry ? 'RETRY_WAIT' : 'FAILED'} retryDelayMs=${retry ? delayMs : 0} errorType=${errorType(error)}`,
    );
  }

  private async expireArtifacts() {
    const expired = await this.prisma.userDataExportJob.findMany({
      where: { status: 'READY', expiresAt: { lte: new Date() } },
      select: { id: true, artifactStorageKey: true },
      take: 20,
    });
    for (const job of expired) {
      if (job.artifactStorageKey) {
        try {
          await this.storage.deleteFile(job.artifactStorageKey, 'private');
        } catch (error) {
          this.logger.warn(
            `Could not delete expired export job=${job.id} errorType=${errorType(error)}`,
          );
          continue;
        }
      }
      await this.prisma.userDataExportJob.updateMany({
        where: { id: job.id, status: 'READY' },
        data: {
          status: 'EXPIRED',
          progressStage: 'expired',
          artifactStorageKey: null,
          artifactFileName: null,
          artifactSizeBytes: null,
          artifactSha256: null,
        },
      });
      this.logger.log(`Export expired and artifact removed job=${job.id}`);
    }
  }

  private async failExhaustedJobs() {
    const count = await this.prisma.$executeRaw`
      UPDATE t_user_data_export_job
      SET status = 'FAILED',
          progress_stage = 'failed',
          available_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          lease_expires_at = NULL,
          lock_token = NULL,
          last_error_code = 'EXPORT_GENERATION_FAILED',
          last_error_detail = COALESCE(
            last_error_detail,
            'The export worker stopped before completing the final allowed attempt.'
          ),
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE status IN (
        'QUEUED', 'RETRY_WAIT', 'SNAPSHOTTING', 'PACKAGING', 'UPLOADING'
      )
        AND attempts >= max_attempts
        AND (
          lease_expires_at IS NULL
          OR lease_expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        )
    `;
    if (count > 0) {
      this.logger.warn(`Marked exhausted export jobs as failed count=${count}`);
    }
  }

  private async sha256(filePath: string) {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('hex');
  }
}
