import { Injectable } from '@nestjs/common';
import { ImportingJobRepository } from './persistence/importing-job.repository';

/**
 * Import job 表对外门面。Repository 不 export。
 */
@Injectable()
export class ImportingJobService {
  constructor(private readonly jobs: ImportingJobRepository) {}

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
  ) {
    return this.jobs.ensurePostProcessJob(options);
  }
}
