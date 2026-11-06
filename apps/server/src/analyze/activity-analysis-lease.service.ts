import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type ActivityAnalysisLeaseRequest = {
  userId: string;
  sourceJobType: 'USER_POST_PROCESS' | 'ACTIVITY_RECOMPUTE';
  sourceJobId: string;
  priority: number;
  dataRepair: boolean;
};

export type ActivityAnalysisLeaseHandle = ActivityAnalysisLeaseRequest & {
  ownerToken: string;
  leaseExpiresAt: Date;
};

@Injectable()
export class ActivityAnalysisLeaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private leaseMs() {
    return (
      (this.config.get<number>('activityReplay.leaseSeconds') ?? 5 * 60) * 1000
    );
  }

  private async lockCapacity(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'activity-analysis-lease-capacity'}, 0))::text`;
  }

  async acquire(
    request: ActivityAnalysisLeaseRequest,
  ): Promise<ActivityAnalysisLeaseHandle | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockCapacity(tx);
        const now = new Date();
        await tx.activityAnalysisLease.deleteMany({
          where: { leaseExpiresAt: { lte: now } },
        });
        const current = await tx.activityAnalysisLease.findUnique({
          where: { userId: request.userId },
        });
        if (current) return null;

        const active = await tx.activityAnalysisLease.count({
          where: { leaseExpiresAt: { gt: now } },
        });
        const globalLimit =
          this.config.get<number>('activityReplay.globalConcurrency') ?? 2;
        if (active >= globalLimit) return null;
        if (request.dataRepair) {
          const repairs = await tx.activityAnalysisLease.count({
            where: {
              sourceJobType: 'ACTIVITY_RECOMPUTE',
              priority: { lte: 10 },
              leaseExpiresAt: { gt: now },
            },
          });
          const repairLimit =
            this.config.get<number>('activityReplay.dataRepairConcurrency') ??
            1;
          if (repairs >= repairLimit) return null;
        }

        const ownerToken = randomUUID();
        const leaseExpiresAt = new Date(now.getTime() + this.leaseMs());
        await tx.activityAnalysisLease.create({
          data: {
            userId: request.userId,
            sourceJobType: request.sourceJobType,
            sourceJobId: request.sourceJobId,
            priority: request.priority,
            ownerToken,
            leaseExpiresAt,
          },
        });
        return { ...request, ownerToken, leaseExpiresAt };
      },
      // The capacity advisory lock serializes every acquisition. READ COMMITTED
      // takes a fresh snapshot after waiting for that lock; SERIALIZABLE would
      // keep the pre-lock snapshot and reject otherwise valid parallel users.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async heartbeat(handle: ActivityAnalysisLeaseHandle): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCapacity(tx);
      const now = new Date();
      const updated = await tx.activityAnalysisLease.updateMany({
        where: {
          userId: handle.userId,
          ownerToken: handle.ownerToken,
          leaseExpiresAt: { gt: now },
        },
        data: {
          leaseExpiresAt: new Date(now.getTime() + this.leaseMs()),
        },
      });
      return updated.count === 1;
    });
  }

  async assertOwned(
    tx: Prisma.TransactionClient,
    handle: ActivityAnalysisLeaseHandle,
  ): Promise<void> {
    const lease = await tx.activityAnalysisLease.findUnique({
      where: { userId: handle.userId },
      select: { ownerToken: true, leaseExpiresAt: true },
    });
    if (
      lease?.ownerToken !== handle.ownerToken ||
      lease.leaseExpiresAt.getTime() <= Date.now()
    ) {
      throw new Error('ACTIVITY_ANALYSIS_LEASE_FENCED');
    }
  }

  async release(handle: ActivityAnalysisLeaseHandle): Promise<void> {
    await this.prisma.activityAnalysisLease.deleteMany({
      where: { userId: handle.userId, ownerToken: handle.ownerToken },
    });
  }
}
