import { describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function uniqueConflict(target: unknown) {
  return {
    code: 'P2002',
    meta: { target },
  };
}

async function createRepository(postProcessJobs: {
  findUnique: jest.Mock<AsyncFn>;
  upsert: jest.Mock<AsyncFn>;
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ImportingJobRepository,
      {
        provide: PrismaService,
        useValue: { userPostProcessJob: postProcessJobs },
      },
    ],
  }).compile();
  return moduleRef.get(ImportingJobRepository);
}

describe('ImportingJobRepository.ensurePostProcessJob', () => {
  it('returns the single winning row to concurrent callers', async () => {
    const winningJob = {
      id: 'post-process-1',
      batchJobId: 'batch-1',
      status: 'PENDING',
    };
    let attempts = 0;
    let releaseBoth!: () => void;
    let markWinnerCommitted!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    const winnerCommitted = new Promise<void>((resolve) => {
      markWinnerCommitted = resolve;
    });
    const postProcessJobs = {
      findUnique: jest.fn<AsyncFn>(async () => winningJob),
      upsert: jest.fn<AsyncFn>(async () => {
        const attempt = ++attempts;
        if (attempts === 2) releaseBoth();
        await bothStarted;
        if (attempt === 1) {
          markWinnerCommitted();
          return winningJob;
        }
        await winnerCommitted;
        throw uniqueConflict(['batch_job_id']);
      }),
    };
    const repository = await createRepository(postProcessJobs);
    const options = {
      batchJobId: 'batch-1',
      create: {
        userId: 'user-1',
        batchJobId: 'batch-1',
        status: 'PENDING' as const,
      },
    };

    const jobs = await Promise.all([
      repository.ensurePostProcessJob(options),
      repository.ensurePostProcessJob(options),
    ]);

    expect(jobs).toEqual([winningJob, winningJob]);
    expect(postProcessJobs.upsert).toHaveBeenCalledTimes(2);
    expect(postProcessJobs.findUnique).toHaveBeenCalledTimes(1);
    expect(new Set(jobs.map((job) => job.id))).toEqual(
      new Set(['post-process-1']),
    );
  });

  it('does not swallow a unique conflict on another field', async () => {
    const conflict = uniqueConflict(['another_unique_field']);
    const postProcessJobs = {
      findUnique: jest.fn<AsyncFn>(),
      upsert: jest.fn<AsyncFn>(async () => {
        throw conflict;
      }),
    };
    const repository = await createRepository(postProcessJobs);

    await expect(
      repository.ensurePostProcessJob({
        batchJobId: 'batch-1',
        create: {
          userId: 'user-1',
          batchJobId: 'batch-1',
          status: 'PENDING',
        },
      }),
    ).rejects.toBe(conflict);
    expect(postProcessJobs.findUnique).not.toHaveBeenCalled();
  });

  it('rethrows the original conflict when the winning row cannot be read', async () => {
    const conflict = uniqueConflict('t_user_post_process_job_batch_job_id_key');
    const postProcessJobs = {
      findUnique: jest.fn<AsyncFn>(async () => null),
      upsert: jest.fn<AsyncFn>(async () => {
        throw conflict;
      }),
    };
    const repository = await createRepository(postProcessJobs);

    await expect(
      repository.ensurePostProcessJob({
        batchJobId: 'batch-1',
        create: {
          userId: 'user-1',
          batchJobId: 'batch-1',
          status: 'PENDING',
        },
      }),
    ).rejects.toBe(conflict);
  });
});
