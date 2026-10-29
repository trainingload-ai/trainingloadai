import { describe, expect, it, jest } from '@jest/globals';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';

describe('ImportingJobService', () => {
  it('uses the transaction client when one is passed', async () => {
    const txFindMany = jest.fn(async () => [{ id: 'tx-batch' }]);
    const prismaFindMany = jest.fn(async () => [{ id: 'prisma-batch' }]);
    const prisma = {
      importBatchJob: { findMany: prismaFindMany },
      importItemJob: { findMany: prismaFindMany },
      importSourceObject: { findMany: prismaFindMany },
      userPostProcessJob: { findMany: prismaFindMany },
    };
    const jobs = new ImportingJobService(
      new ImportingJobRepository(prisma as never),
    );

    await jobs
      .batchJobs({ importBatchJob: { findMany: txFindMany } } as never)
      .findMany();
    expect(txFindMany).toHaveBeenCalled();

    await jobs.batchJobs().findMany();
    expect(prismaFindMany).toHaveBeenCalled();
  });
});
