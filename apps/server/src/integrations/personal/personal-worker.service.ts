import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PersonalProviderJob } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SELF_HOST_MODES } from '@/runtime-capabilities/runtime-capability.types';
import type { ThirdPartyScheduledTask } from '@/third-party-scheduler/third-party-scheduled-task';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { PersonalSyncService } from './personal-sync.service';
import { PersonalWriteService } from './personal-write.service';
import { isPersonalConnection } from './personal-connection.service';
import {
  PersonalProviderError,
  providerError,
  record,
} from './personal-errors';

const personalWorkerEnabled = () =>
  process.env.DEPLOYMENT_MODE !== 'cloud' &&
  (SELF_HOST_MODES as readonly string[]).includes(
    process.env.SELF_HOST_MODE?.trim() ?? '',
  );

@Injectable()
export class PersonalWorkerService
  implements OnModuleInit, OnModuleDestroy, ThirdPartyScheduledTask
{
  readonly name = 'personal-provider-sync';
  private readonly logger = new Logger(PersonalWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerConnections: ExternalProviderConnectionService,
    private readonly sync: PersonalSyncService,
    private readonly writes: PersonalWriteService,
  ) {}
  onModuleInit() {
    if (!personalWorkerEnabled()) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        this.logger.warn({
          code: providerError(error),
          stage: 'personal-job-claim',
        }),
      );
    }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    if (!personalWorkerEnabled()) return;
    await this.sync.schedule();
  }
  async tick() {
    if (!personalWorkerEnabled()) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.personalProviderJob.updateMany({
        where: {
          status: 'RUNNING',
          leaseUntil: { lt: new Date() },
          kind: 'WRITE',
        },
        data: {
          status: 'UNKNOWN',
          errorCode: 'PROVIDER_RESULT_UNKNOWN',
          leaseUntil: null,
        },
      });
      await this.prisma.personalProviderJob.updateMany({
        where: {
          status: 'RUNNING',
          leaseUntil: { lt: new Date() },
          kind: { not: 'WRITE' },
        },
        data: { status: 'WAITING', leaseUntil: null },
      });
      const ids = await this.prisma.$queryRaw<
        Array<{ id: string; reconcile: boolean }>
      >`
        WITH picked AS (
          SELECT j.id, (j.status='UNKNOWN' AND j.kind='WRITE') AS reconcile FROM t_personal_provider_job j
          JOIN t_external_provider_connection c ON c.id=j.connection_id AND c.status='ACTIVE'
          WHERE (j.status IN ('QUEUED','WAITING') OR (j.status='UNKNOWN' AND j.kind='WRITE' AND j.attempts < 20)) AND j.next_attempt_at <= (now() AT TIME ZONE 'UTC')
            AND c.metadata->>'connectionMode' IN ('mcp','personal_api')
            AND NOT EXISTS (SELECT 1 FROM t_personal_provider_job active WHERE active.connection_id=j.connection_id AND active.status='RUNNING')
            AND NOT EXISTS (SELECT 1 FROM t_personal_provider_job limited WHERE limited.connection_id=j.connection_id
              AND limited.status='WAITING' AND limited.error_code='PROVIDER_RATE_LIMITED'
              AND limited.payload->>'credentialVersion'=c.credential_fingerprint
              AND limited.next_attempt_at > (now() AT TIME ZONE 'UTC'))
          ORDER BY j.next_attempt_at, j.created_at LIMIT 1 FOR UPDATE OF j, c SKIP LOCKED
        ) UPDATE t_personal_provider_job j SET status='RUNNING', lease_until=(now() AT TIME ZONE 'UTC')+interval '15 minutes', attempts=attempts+1, updated_at=(now() AT TIME ZONE 'UTC')
          FROM picked WHERE j.id=picked.id RETURNING j.id, picked.reconcile`;
      if (!ids.length) return;
      const job = await this.prisma.personalProviderJob.findUnique({
        where: { id: ids[0].id },
      });
      if (!job) return;
      const connection =
        await this.providerConnections.model().findUnique({
          where: { id: job.connectionId },
        });
      if (!connection || !isPersonalConnection(connection)) return;
      try {
        if (ids[0].reconcile) await this.writes.reconcile(job, connection);
        else if (job.kind === 'WRITE') await this.writes.run(job, connection);
        else await this.sync.run(job, connection);
      } catch (error) {
        await this.fail(job, error);
      }
    } finally {
      this.running = false;
    }
  }
  private async fail(job: PersonalProviderJob, error: unknown) {
    const code = providerError(error);
    // The lease recovery pass owns expired jobs. A stale worker must not turn
    // a recoverable READ (or an uncertain WRITE) into a terminal failure.
    if (code === 'PROVIDER_LEASE_LOST') return;
    const retry =
      error instanceof PersonalProviderError ? error.retryAfterMs : undefined;
    const httpStatus =
      error instanceof PersonalProviderError
        ? error.upstreamHttpStatus
        : undefined;
    // ACTIVITY FIT downloads: one brief retry then fail-forward so the parent
    // can release the next serial slot instead of thrashing every child.
    const transientAttempts =
      job.kind === 'ACTIVITY' ? 2 : 5;
    const canRetry =
      code === 'PROVIDER_RATE_LIMITED' ||
      code === 'PROVIDER_BUSY' ||
      (job.attempts < transientAttempts &&
        [
          'PROVIDER_REQUEST_FAILED',
          'PROVIDER_UNREACHABLE',
          'PROVIDER_MCP_FAILED',
          'PROVIDER_DOWNLOAD_FAILED',
        ].includes(code));
    const nextAttemptAt = new Date(
      Date.now() + (retry ?? Math.min(30 * 60_000, 30_000 * 2 ** job.attempts)),
    );
    const changed = await this.prisma.personalProviderJob.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseUntil: job.leaseUntil },
      data: {
        status: canRetry ? 'WAITING' : 'FAILED',
        errorCode: code,
        ...(httpStatus != null
          ? {
              result: {
                ...record(job.result),
                httpStatus,
              },
            }
          : {}),
        ...(job.kind === 'WRITE' && !record(job.result).sentAt
          ? { dedupKey: null }
          : {}),
        leaseUntil: null,
        nextAttemptAt,
      },
    });
    // A disconnected/replaced connection cancelled this lease; do not overwrite its new status.
    if (!changed.count) return;
    if (code === 'PROVIDER_RATE_LIMITED') {
      await this.prisma.personalProviderJob.updateMany({
        where: {
          connectionId: job.connectionId,
          connection: {
            credentialFingerprint: String(
              record(job.payload).credentialVersion ?? '',
            ),
          },
          status: { in: ['QUEUED', 'WAITING'] },
          nextAttemptAt: { lt: nextAttemptAt },
        },
        data: { nextAttemptAt },
      });
    }
    await this.providerConnections.model().updateMany({
      where: {
        id: job.connectionId,
        ...(typeof record(job.payload).credentialVersion === 'string'
          ? {
              credentialFingerprint: String(
                record(job.payload).credentialVersion,
              ),
            }
          : {}),
      },
      data: { lastError: code },
    });
    const activityId = record(job.payload).id;
    this.logger.warn({
      providerJobId: job.id,
      code,
      retry: canRetry,
      ...(httpStatus != null ? { httpStatus } : {}),
      ...(job.kind === 'ACTIVITY' &&
      (typeof activityId === 'string' || typeof activityId === 'number')
        ? { activityId: String(activityId) }
        : {}),
    });
  }
}
