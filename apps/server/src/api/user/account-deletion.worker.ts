import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from './user-query.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { WorkerDrainProgress } from '@/workers/worker-drain-progress';

import { decryptAccountDeletionValue } from './account-deletion-crypto';
import {
  AccountDeletionService,
  type AccountDeletionStorageManifest,
} from './account-deletion.service';
import {
  ACCOUNT_PROVIDER_CLEANUP,
  type AccountProviderCleanup,
} from './account-provider-lifecycle.port';
import { PlanAccountDeletionService } from '@/api/plan/application/plan-account-deletion.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { getAccountDeletionNotifier } from './account-deletion-notifier.port';
import {
  ACCOUNT_DELETION_LOCAL_DATA,
  type AccountDeletionLocalData,
} from '@/account-lifecycle/account-deletion-local-data.port';

type ClaimedJob = {
  id: string;
  userId: string | null;
  subjectHash: string;
  lockToken: string;
  resumeStage: 'REVOKING_PROVIDERS' | 'DELETING_STORAGE' | 'PURGING_DATABASE';
};

type StoredJob = ClaimedJob & {
  attempts: number;
  maxAttempts: number;
  storageManifest: AccountDeletionStorageManifest;
  notificationEmailCiphertext: string;
  notificationLocale: string;
};

@Injectable()
export class AccountDeletionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly deletion: AccountDeletionService,
    @Inject(ACCOUNT_PROVIDER_CLEANUP)
    private readonly providerCleanup: AccountProviderCleanup,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly planDeletion: PlanAccountDeletionService,
    private readonly users: UserQueryService,
    private readonly capabilities: RuntimeCapabilityService,
    @Inject(ACCOUNT_DELETION_LOCAL_DATA)
    private readonly deploymentLocalData: AccountDeletionLocalData,
  ) {}

  onModuleInit() {
    if (this.config.get<boolean>('accountDeletionWorker.enabled') === false) {
      return;
    }
    const pollMs =
      this.config.get<number>('accountDeletionWorker.pollMs') ?? 1000;
    this.timer = setInterval(() => void this.drain(), pollMs);
    void this.drain();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async drain() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const batchSize =
        this.config.get<number>('accountDeletionWorker.batchSize') ?? 1;
      const jobs = await this.claim(Math.max(1, batchSize));
      const progress = new WorkerDrainProgress(
        this.logger,
        '账户删除队列',
        async () => ({
          remaining: await this.prisma.accountDeletionJob.count({
            where: {
              status: { notIn: ['COMPLETED', 'MANUAL_REVIEW'] },
            },
          }),
        }),
      );
      await Promise.all(
        jobs.map((job, index) =>
          progress.run({
            batchPosition: index + 1,
            batchTotal: jobs.length,
            details: `任务ID=${job.id} 恢复阶段=${job.resumeStage}`,
            task: () => this.process(job),
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Account deletion worker drain failed: ${
          error instanceof Error ? error.stack : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claim(batchSize: number): Promise<ClaimedJob[]> {
    const leaseMs =
      this.config.get<number>('accountDeletionWorker.leaseMs') ?? 300_000;
    const lockToken = randomUUID();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string | null;
        subject_hash: string;
        lock_token: string;
        resume_stage: ClaimedJob['resumeStage'];
      }>
    >(
      `
      WITH picked AS (
        SELECT id
        FROM t_account_deletion_job
        WHERE status NOT IN ('COMPLETED', 'MANUAL_REVIEW')
          AND available_at <= NOW()
          AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
        ORDER BY requested_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_account_deletion_job j
      SET status = j.resume_stage::text::enum_account_deletion_job_status,
          lock_token = $2,
          lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
          started_at = COALESCE(j.started_at, NOW()),
          updated_at = NOW()
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id, j.user_id, j.subject_hash, j.lock_token, j.resume_stage
      `,
      batchSize,
      lockToken,
      leaseMs,
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      subjectHash: row.subject_hash,
      lockToken: row.lock_token,
      resumeStage: row.resume_stage,
    }));
  }

  private async process(claim: ClaimedJob) {
    const job = (await this.prisma.accountDeletionJob.findFirst({
      where: { id: claim.id, lockToken: claim.lockToken },
    })) as unknown as StoredJob | null;
    if (!job) return;
    try {
      if (job.resumeStage === 'REVOKING_PROVIDERS') {
        if (job.userId) {
          await this.providerCleanup.revokeAndDisconnect(
            job.userId,
            job.subjectHash,
          );
        }
        await this.advance(job, 'DELETING_STORAGE');
        job.resumeStage = 'DELETING_STORAGE';
      }
      if (job.resumeStage === 'DELETING_STORAGE') {
        await this.deleteStorage(job);
        await this.advance(job, 'PURGING_DATABASE');
        job.resumeStage = 'PURGING_DATABASE';
      }
      if (job.resumeStage === 'PURGING_DATABASE') {
        await this.purgeDatabase(job);
      }
    } catch (error) {
      await this.retryOrEscalate(job, error);
    }
  }

  private async advance(job: StoredJob, stage: ClaimedJob['resumeStage']) {
    const leaseMs =
      this.config.get<number>('accountDeletionWorker.leaseMs') ?? 300_000;
    await this.prisma.accountDeletionJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: {
        status: stage,
        resumeStage: stage,
        availableAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + leaseMs),
        lastErrorCode: null,
        lastErrorDetail: null,
      },
    });
  }

  private async deleteStorage(job: StoredJob) {
    let manifest = this.normalizeManifest(job.storageManifest);
    if (job.userId) {
      const current = await this.deletion.collectStorageManifest(
        this.prisma,
        job.userId,
      );
      manifest = this.mergeManifests(manifest, current);
      await this.persistManifest(job, manifest);
    }

    for (const bucket of ['private', 'public'] as const) {
      while (manifest[bucket].length) {
        const key = manifest[bucket][0];
        await this.storage.deleteFile(key, bucket);
        manifest[bucket] = manifest[bucket].slice(1);
        await this.persistManifest(job, manifest);
      }
    }
  }

  private async persistManifest(
    job: StoredJob,
    manifest: AccountDeletionStorageManifest,
  ) {
    await this.prisma.accountDeletionJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: {
        storageManifest: manifest,
        leaseExpiresAt: new Date(
          Date.now() +
            (this.config.get<number>('accountDeletionWorker.leaseMs') ??
              300_000),
        ),
      },
    });
  }

  private normalizeManifest(value: unknown): AccountDeletionStorageManifest {
    const manifest = (value ?? {}) as Partial<AccountDeletionStorageManifest>;
    return {
      private: Array.isArray(manifest.private)
        ? manifest.private.filter(
            (key): key is string => typeof key === 'string',
          )
        : [],
      public: Array.isArray(manifest.public)
        ? manifest.public.filter(
            (key): key is string => typeof key === 'string',
          )
        : [],
    };
  }

  private mergeManifests(
    first: AccountDeletionStorageManifest,
    second: AccountDeletionStorageManifest,
  ) {
    return {
      private: [...new Set([...first.private, ...second.private])].sort(),
      public: [...new Set([...first.public, ...second.public])].sort(),
    };
  }

  private async purgeDatabase(job: StoredJob) {
    if (job.userId) {
      await this.prisma.$transaction(async (tx) => {
        const revokedAt = new Date();
        await this.planDeletion.revokeOwnedUnlistedShares(
          tx,
          job.userId!,
          revokedAt,
        );
        await this.deploymentLocalData.beforeUserDeletion({
          tx,
          userId: job.userId!,
        });
        await this.users.users(tx).deleteMany({ where: { id: job.userId! } });
      });
    }

    await this.sendCompletionEmail(job);

    await this.prisma.accountDeletionJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        userId: null,
        storageManifest: { private: [], public: [] },
        providerManifest: {},
        extensionSnapshot: {},
        notificationEmailCiphertext: '',
        leaseExpiresAt: null,
        lockToken: null,
        lastErrorCode: null,
        lastErrorDetail: null,
      },
    });
  }

  private async sendCompletionEmail(job: StoredJob) {
    if (
      !job.notificationEmailCiphertext ||
      this.capabilities.isEnabled('mail') === false
    )
      return;
    const email = decryptAccountDeletionValue(job.notificationEmailCiphertext);
    await getAccountDeletionNotifier()?.notifyCompletion({
      email,
      locale: job.notificationLocale,
    });
  }

  private async retryOrEscalate(job: StoredJob, error: unknown) {
    const attempts = job.attempts + 1;
    const detail = error instanceof Error ? error.message : String(error);
    const manualReview = attempts >= job.maxAttempts;
    const delayMs = Math.min(6 * 60 * 60_000, 2 ** attempts * 30_000);
    await this.prisma.accountDeletionJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken },
      data: {
        attempts,
        status: manualReview ? 'MANUAL_REVIEW' : 'RETRY_WAIT',
        availableAt: new Date(Date.now() + delayMs),
        leaseExpiresAt: null,
        lockToken: null,
        lastErrorCode:
          error instanceof Error ? error.name : 'ACCOUNT_DELETION_ERROR',
        lastErrorDetail: detail.slice(0, 4000),
      },
    });
    const method = manualReview ? 'error' : 'warn';
    this.logger[method](
      `Account deletion ${
        manualReview ? 'requires manual review' : 'will retry'
      } request=${job.id} stage=${job.resumeStage} attempts=${attempts}: ${detail}`,
    );
  }
}
