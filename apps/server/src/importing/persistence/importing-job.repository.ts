import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';

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

@Injectable()
export class ImportingJobRepository {
  constructor(private readonly prisma: PrismaService) {}

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
  async ensurePostProcessJob(options: {
    batchJobId: string;
    create: Prisma.UserPostProcessJobUncheckedCreateInput;
  }) {
    const jobs = this.postProcessJobs();
    try {
      return await jobs.upsert({
        where: { batchJobId: options.batchJobId },
        update: {},
        create: options.create,
      });
    } catch (error) {
      if (!isBatchJobIdUniqueConflict(error)) throw error;

      const concurrentJob = await jobs.findUnique({
        where: { batchJobId: options.batchJobId },
      });
      if (!concurrentJob) throw error;
      return concurrentJob;
    }
  }
}
