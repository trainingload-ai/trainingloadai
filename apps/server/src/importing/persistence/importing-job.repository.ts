import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import {
  type ImportSourceKind,
  type ImportBatchJobStatus,
  ImportItemJobStatus,
} from '@prisma/client';
import {
  assertImportPublicationAuthorized,
  IMPORT_PUBLICATION_AUTHORIZATION,
  type ImportPublicationAuthorizationExtension,
} from '../import-publication-authorization';

const ACTIVE_REVISION_STATUSES = [
  'QUEUED',
  'NORMALIZING',
  'DEDUPING',
  'MATERIALIZING',
  'PARQUET_BUILDING',
  'ANALYZING',
  'FAILED',
] as const;

type PrismaUniqueConstraintError = {
  code?: unknown;
  meta?: { target?: unknown };
};

function isBatchJobIdUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const prismaError = error as PrismaUniqueConstraintError;
  if (prismaError.code !== 'P2002') return false;

  const target = prismaError.meta?.target;
  const fields = (Array.isArray(target) ? target : [target])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  return fields.some(
    (field) =>
      field === 'batchjobid' ||
      field === 'batch_job_id' ||
      field.endsWith('_batchjobid_key') ||
      field.endsWith('_batch_job_id_key'),
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
export class ImportingJobRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(IMPORT_PUBLICATION_AUTHORIZATION)
    private readonly publicationAuthorization?: ImportPublicationAuthorizationExtension,
  ) {}

  /** Serialize discovery and completion for each stable source identity. */
  async withSourceLocks<T>(
    identity: {
      userId: string;
      sourceKind: ImportSourceKind;
      sourceUids: string[];
    },
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    transaction?: Prisma.TransactionClient,
  ): Promise<T> {
    const run = async (tx: Prisma.TransactionClient) => {
      for (const sourceUid of [...new Set(identity.sourceUids)].sort()) {
        const key = JSON.stringify([
          identity.userId,
          identity.sourceKind,
          sourceUid,
        ]);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      }
      return work(tx);
    };
    return transaction
      ? run(transaction)
      : withSerializableRetry(() =>
          this.prisma.$transaction(run, { timeout: 15_000 }),
        );
  }

  /** Terminal work and a pending newer discovery commit under the same source lock. */
  async finishRevisionedItem(
    args: {
      id: string;
      lockToken: string;
      data: Prisma.ImportItemJobUncheckedUpdateInput;
    },
    transaction?: Prisma.TransactionClient,
  ) {
    const db = transaction ?? this.prisma;
    const identity = await db.importItemJob.findUnique({
      where: { id: args.id },
      select: {
        userId: true,
        sourceKind: true,
        sourceUid: true,
        sourceObject: { select: { sourceUid: true } },
      },
    });
    if (!identity) throw new Error('IMPORT_ITEM_NOT_FOUND');
    return this.withSourceLocks(
      { ...identity, sourceUids: [identity.sourceObject.sourceUid] },
      async (tx) => {
        const item = await tx.importItemJob.findFirst({
          where: { id: args.id, lockToken: args.lockToken },
          include: { sourceObject: true },
        });
        if (!item) throw new Error('IMPORT_ITEM_LEASE_LOST');
        const source = item.sourceObject;
        const changed =
          source?.importRevision &&
          source.importRevision !== item.sourceRevision;
        const others = await tx.importItemJob.count({
          where: {
            sourceObjectId: source.id,
            id: { not: item.id },
            status: { in: [...ACTIVE_REVISION_STATUSES] },
          },
        });
        let successorItemId: string | undefined;
        if (
          changed &&
          !source.importRevokedAt &&
          source.completedImportRevision !== source.importRevision &&
          others === 0
        ) {
          const batch = await tx.importBatchJob.create({
            data: {
              userId: item.userId,
              sourceKind: item.sourceKind,
              status: 'QUEUED',
              totalCount: 1,
              requestContext: {
                source: 'source_revision_handoff',
                previousBatchJobId: item.batchJobId,
              },
            },
          });
          const successor = await tx.importItemJob.create({
            data: {
              userId: item.userId,
              sourceKind: item.sourceKind,
              sourceUid: source.sourceUid,
              sourceObjectId: item.sourceObjectId,
              sourceRevision: source.importRevision,
              batchJobId: batch.id,
              position: 0,
              sourceRef: source.importRequest ?? undefined,
              status: 'QUEUED',
            },
          });
          successorItemId = successor.id;
        }
        const result = await tx.importItemJob.updateMany({
          where: { id: item.id, lockToken: args.lockToken },
          data:
            changed && args.data.status !== 'DONE'
              ? {
                  status: 'SKIPPED',
                  outcome: 'SUPERSEDED',
                  completedAt: new Date(),
                  lockToken: null,
                  leaseExpiresAt: null,
                }
              : args.data,
        });
        if (result.count !== 1) throw new Error('IMPORT_ITEM_LEASE_LOST');
        if (
          !changed &&
          !source.importRevokedAt &&
          source.importRevision &&
          args.data.status === 'DONE'
        ) {
          const pendingRevision = await tx.importItemJob.count({
            where: {
              sourceObjectId: source.id,
              batchJobId: item.batchJobId,
              sourceRevision: item.sourceRevision,
              id: { not: item.id },
              NOT: {
                OR: [
                  { status: 'DONE' },
                  { status: 'SKIPPED', lastErrorCode: 'spawned_child_items' },
                ],
              },
            },
          });
          if (pendingRevision === 0)
            await tx.importSourceObject.update({
              where: { id: source.id },
              data: { completedImportRevision: source.importRevision },
            });
        }
        await this.refreshBatchProgress(item.batchJobId, tx);
        return { requeued: Boolean(changed), successorItemId };
      },
      transaction,
    );
  }

  /** Publish only while this lease still owns the current, visible source input. */
  async withCurrentImport<T>(
    args: { itemJobId: string; userId: string; lockToken: string },
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    transaction?: Prisma.TransactionClient,
  ): Promise<T> {
    const db = transaction ?? this.prisma;
    const identity = await db.importItemJob.findUnique({
      where: { id: args.itemJobId },
      include: { sourceObject: true },
    });
    if (!identity || identity.userId !== args.userId)
      throw new Error('IMPORT_ITEM_LEASE_LOST');
    return this.withSourceLocks(
      {
        userId: args.userId,
        sourceKind: identity.sourceKind,
        sourceUids: [identity.sourceObject.sourceUid],
      },
      async (tx) => {
        const item = await tx.importItemJob.findFirst({
          where: {
            id: args.itemJobId,
            userId: args.userId,
            lockToken: args.lockToken,
            leaseExpiresAt: { gt: new Date() },
            status: { in: [...ACTIVE_REVISION_STATUSES] },
          },
          include: { sourceObject: true },
        });
        if (!item) throw new Error('IMPORT_ITEM_LEASE_LOST');
        if (item.sourceObject.importRevokedAt)
          throw new Error('IMPORT_SOURCE_REVOKED');
        if (
          item.sourceObject.importRevision &&
          item.sourceObject.importRevision !== item.sourceRevision
        )
          throw new Error('IMPORT_SOURCE_REVISION_CHANGED');
        await assertImportPublicationAuthorized(
          tx,
          item,
          this.publicationAuthorization,
        );
        // A Serializable withdrawal that started before this publication must retry.
        await tx.importSourceObject.update({
          where: { id: item.sourceObjectId },
          data: { updatedAt: new Date() },
        });
        return work(tx);
      },
      transaction,
    );
  }

  batchJobs(tx?: PrismaClientSlice<'importBatchJob'>) {
    return prismaModel(this.prisma, tx).importBatchJob;
  }

  itemJobs(tx?: PrismaClientSlice<'importItemJob'>) {
    return prismaModel(this.prisma, tx).importItemJob;
  }

  sourceObjects(tx?: PrismaClientSlice<'importSourceObject'>) {
    return prismaModel(this.prisma, tx).importSourceObject;
  }

  postProcessJobs(tx?: PrismaClientSlice<'userPostProcessJob'>) {
    return prismaModel(this.prisma, tx).userPostProcessJob;
  }

  /**
   * Prisma upsert 在两个 worker 同时创建同一 batch job 时仍可能竞争。
   * 唯一约束决定胜者；败者只在确认冲突字段后回读同一行并视为成功。
   */
  async ensurePostProcessJob(
    options: {
      batchJobId: string;
      create: Prisma.UserPostProcessJobUncheckedCreateInput;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const jobs = this.postProcessJobs(tx);
    try {
      return await jobs.upsert({
        where: { batchJobId: options.batchJobId },
        update: {},
        create: options.create,
      });
    } catch (error) {
      // A statement failure aborts a PostgreSQL transaction; let its owner retry.
      if (tx || !isBatchJobIdUniqueConflict(error)) throw error;

      const concurrentJob = await jobs.findUnique({
        where: { batchJobId: options.batchJobId },
      });
      if (!concurrentJob) throw error;
      return concurrentJob;
    }
  }
  /** Ensure one postprocess job after terminal item publication. */
  async createPostProcessJob(
    batchJobId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (!tx)
      return this.prisma.$transaction(
        (transaction) => this.createPostProcessJob(batchJobId, transaction),
        { timeout: 15_000 },
      );
    await tx.$queryRaw`SELECT id FROM t_import_batch_job WHERE id=${batchJobId} FOR UPDATE`;
    // Read committed terminal item counts and correctness replay candidates.
    const batch = await this.batchJobs(tx).findUnique({
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
      ? (requestContext.globalRefreshCandidates as Array<{
          sportType?: string | null;
          startTime?: Date | string | null;
        }>)
      : [];
    const correctnessCandidates = [
      ...batch.items.map((item) => ({
        sportType: item.activity?.sportType,
        startTime: item.activity?.startTime,
      })),
      ...forcedCandidates,
    ]
      .map((candidate) => ({
        sportType: candidate.sportType,
        startTime:
          candidate.startTime instanceof Date
            ? candidate.startTime
            : candidate.startTime
              ? new Date(candidate.startTime)
              : null,
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          sportType: string | null | undefined;
          startTime: Date;
        } =>
          candidate.startTime instanceof Date &&
          Number.isFinite(candidate.startTime.getTime()),
      )
      .sort(
        (left, right) => left.startTime.getTime() - right.startTime.getTime(),
      );
    const sportTypes = Array.from(
      new Set(
        correctnessCandidates
          .map((candidate) => candidate.sportType)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const job = await this.ensurePostProcessJob(
      {
        batchJobId: batch.id,
        create: {
          userId: batch.userId,
          batchJobId: batch.id,
          status: 'PENDING',
          recomputeFrom: correctnessCandidates[0]?.startTime,
          recomputeTo: correctnessCandidates.at(-1)?.startTime,
          affectedSportTypes: sportTypes as Prisma.InputJsonValue,
          summary: {
            batchStatus: batch.status,
            totalCount: batch.totalCount,
            successCount: batch.successCount,
            failedCount: batch.failedCount,
            skippedCount: batch.skippedCount,
            correctnessReplayActivityCount: correctnessCandidates.length,
          } as Prisma.InputJsonValue,
        } satisfies Prisma.UserPostProcessJobUncheckedCreateInput,
      },
      tx,
    );

    if (job.status !== 'COMPLETED' && job.status !== 'DEAD') {
      await this.batchJobs(tx).update({
        where: { id: batch.id },
        data: { status: 'POST_PROCESSING' },
      });
    }

    return job;
  }
  /** Publish aggregate progress in the transaction that changes item state. */
  async refreshBatchProgress(
    batchJobId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (!tx) {
      return this.prisma.$transaction(
        (transaction) => this.refreshBatchProgress(batchJobId, transaction),
        { timeout: 15_000 },
      );
    }
    // Serialize count publication with terminal item writes and job creation.
    await tx.$queryRaw`SELECT id FROM t_import_batch_job
      WHERE id = ${batchJobId} FOR UPDATE`;
    const batch = await this.batchJobs(tx).findUnique({
      where: { id: batchJobId },
      select: { id: true, userId: true, totalCount: true, startedAt: true },
    });
    if (!batch) throw new Error(`Import batch not found: ${batchJobId}`);

    const statuses = await this.itemJobs(tx).groupBy({
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
    // Items are registered while workers are already consuming the batch.
    // Never shrink the declared count to the few items registered so far:
    // doing so can start post-processing before the remaining files exist.
    const totalCount = Math.max(batch.totalCount, actualTotalCount);
    const nextStatus = summarizeBatchStatus({
      totalCount,
      successCount,
      failedCount,
      skippedCount,
    });

    const updated = await this.batchJobs(tx).update({
      where: { id: batchJobId },
      data: {
        totalCount,
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
      await this.createPostProcessJob(batchJobId, tx);
    }

    return updated;
  }
}
