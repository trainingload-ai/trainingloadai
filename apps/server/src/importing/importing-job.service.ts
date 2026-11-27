import { Injectable } from '@nestjs/common';
import { ImportingJobRepository } from './persistence/importing-job.repository';

/**
 * Import job 表对外门面。Repository 不 export。
 */
@Injectable()
export class ImportingJobService {
  constructor(private readonly jobs: ImportingJobRepository) {}

  withSourceLocks<T>(
    identity: Parameters<ImportingJobRepository['withSourceLocks']>[0],
    work: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
    transaction?: import('@prisma/client').Prisma.TransactionClient,
  ): Promise<T> {
    return this.jobs.withSourceLocks(identity, work, transaction);
  }

  finishRevisionedItem(
    args: Parameters<ImportingJobRepository['finishRevisionedItem']>[0],
    transaction?: import('@prisma/client').Prisma.TransactionClient,
  ) {
    return this.jobs.finishRevisionedItem(args, transaction);
  }

  withCurrentImport<T>(
    args: Parameters<ImportingJobRepository['withCurrentImport']>[0],
    work: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
    transaction?: import('@prisma/client').Prisma.TransactionClient,
  ): Promise<T> {
    return this.jobs.withCurrentImport(args, work, transaction);
  }

  createPostProcessJob(
    batchJobId: string,
    tx?: import('@prisma/client').Prisma.TransactionClient,
  ) {
    return this.jobs.createPostProcessJob(batchJobId, tx);
  }

  refreshBatchProgress(
    batchJobId: string,
    tx?: import('@prisma/client').Prisma.TransactionClient,
  ) {
    return this.jobs.refreshBatchProgress(batchJobId, tx);
  }

  recoverFinishedBatches() {
    return this.jobs.recoverFinishedBatches();
  }

  batchJobs(tx?: Parameters<ImportingJobRepository['batchJobs']>[0]) {
    return this.jobs.batchJobs(tx);
  }

  itemJobs(tx?: Parameters<ImportingJobRepository['itemJobs']>[0]) {
    return this.jobs.itemJobs(tx);
  }

  sourceObjects(tx?: Parameters<ImportingJobRepository['sourceObjects']>[0]) {
    return this.jobs.sourceObjects(tx);
  }

  postProcessJobs(
    tx?: Parameters<ImportingJobRepository['postProcessJobs']>[0],
  ) {
    return this.jobs.postProcessJobs(tx);
  }

  ensurePostProcessJob(
    options: Parameters<ImportingJobRepository['ensurePostProcessJob']>[0],
    tx?: Parameters<ImportingJobRepository['ensurePostProcessJob']>[1],
  ) {
    return this.jobs.ensurePostProcessJob(options, tx);
  }
}
