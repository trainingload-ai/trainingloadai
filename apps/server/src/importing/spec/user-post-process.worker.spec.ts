import { describe, expect, it, jest } from '@jest/globals';
import { PMC_INVALIDATE_EVENT } from '@/training-load/events/pmc.events';
import { UserPostProcessWorkerService } from '../user-post-process.worker';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';
import { featureAccessSnapshot } from '@/access/feature-access.types';

function featureAccess(allowed: boolean) {
  return {
    evaluate: jest.fn(async () =>
      featureAccessSnapshot({
        allowed,
        reason: allowed ? 'GRANTED' : 'PLAN_REQUIRED',
      }),
    ),
  };
}

function createImportingJobs(prisma: unknown) {
  return new ImportingJobService(new ImportingJobRepository(prisma as never));
}

function userQueries(prisma: Record<string, unknown>) {
  return {
    users: () => prisma.t_user,
    settings: () => prisma.userSetting,
  };
}

jest.mock('@/api/activity/activity.service', () => ({
  ActivityService: class ActivityService {},
}));

describe('UserPostProcessWorkerService', () => {
  it('claims expired RUNNING jobs with a fresh lease token', async () => {
    const $queryRawUnsafe = jest.fn(async (..._args: unknown[]) => [
      {
        id: 'post-lease',
        user_id: 'user-1',
        batch_job_id: 'batch-1',
        lock_token: 'claimed-token',
      },
    ]);
    const prisma = { $queryRawUnsafe };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      { get: jest.fn(() => 60_000) } as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
      featureAccess(true) as never,
    );

    await expect(
      (
        service as unknown as { claimBatch: (...args: unknown[]) => unknown }
      ).claimBatch(3),
    ).resolves.toEqual([
      {
        id: 'post-lease',
        userId: 'user-1',
        batchJobId: 'batch-1',
        lockToken: 'claimed-token',
      },
    ]);
    const [sql, now, limit, token, leaseExpiresAt] =
      $queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("status='RUNNING'");
    expect(sql).toContain('lease_expires_at IS NULL');
    expect(now).toBeInstanceOf(Date);
    expect(limit).toBe(3);
    expect(typeof token).toBe('string');
    expect(leaseExpiresAt).toBeInstanceOf(Date);
  });

  it('fences final batch publication after the lease moves to another worker', async () => {
    const updateBatch = jest.fn(async () => ({}));
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          userPostProcessJob: {
            updateMany: jest.fn(async () => ({ count: 0 })),
          },
          importBatchJob: { update: updateBatch },
        }),
      ),
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );

    await expect(
      (
        service as unknown as {
          completeClaimedJob: (...args: unknown[]) => unknown;
        }
      ).completeClaimedJob(
        {
          id: 'post-1',
          batchJobId: 'batch-1',
          lockToken: 'old-token',
        },
        'COMPLETED',
      ),
    ).rejects.toThrow('lease lost');
    expect(updateBatch).not.toHaveBeenCalled();
  });

  it('skips user fitness and PMC when the batch has no activity inside the 60-day scope', async () => {
    const refreshUserFitnessProfilePre = jest.fn();
    const refreshUserFitnessProfilePost = jest.fn();
    const emitAsync = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma as never),
      ),
      userPostProcessJob: {
        findUnique: jest.fn(async () => ({
          recomputeFrom: null,
          recomputeTo: null,
          affectedSportTypes: [],
        })),
        update: jest.fn(async () => ({ attempts: 0 })),
      },
      importItemJob: { findMany: jest.fn(async () => []) },
      importBatchJob: {
        findUnique: jest.fn(async () => ({
          status: 'POST_PROCESSING',
          totalCount: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          requestContext: { suppressCompletionNotification: true },
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      { get: jest.fn(() => undefined) } as never,
      {
        refreshUserFitnessProfilePre,
        refreshUserFitnessProfilePost,
      } as never,
      { emitAsync } as never,
      {} as never,
      {} as never,
      { run: jest.fn() } as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await (
      service as unknown as { processJob: (...args: unknown[]) => unknown }
    ).processJob({
      id: 'post-old-only',
      userId: 'user-1',
      batchJobId: 'batch-old-only',
    });

    expect(refreshUserFitnessProfilePre).not.toHaveBeenCalled();
    expect(refreshUserFitnessProfilePost).not.toHaveBeenCalled();
    expect(emitAsync).not.toHaveBeenCalled();
    expect(prisma.userPostProcessJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-old-only' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('refreshes full READY user scope for a recent maintenance job without import items', async () => {
    const recomputeFrom = new Date('2026-08-01T00:00:00.000Z');
    const refreshUserFitnessProfilePre = jest.fn(async () => undefined);
    const refreshUserFitnessProfilePost = jest.fn(async () => undefined);
    const emitAsync = jest.fn(async () => []);
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma as never),
      ),
      userPostProcessJob: {
        findUnique: jest.fn(async () => ({
          recomputeFrom,
          recomputeTo: recomputeFrom,
          affectedSportTypes: ['RUN'],
        })),
        update: jest.fn(async () => ({ attempts: 0 })),
      },
      importItemJob: { findMany: jest.fn(async () => []) },
      importBatchJob: {
        findUnique: jest.fn(async () => ({
          status: 'POST_PROCESSING',
          totalCount: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          requestContext: { suppressCompletionNotification: true },
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      { get: jest.fn(() => undefined) } as never,
      {
        refreshUserFitnessProfilePre,
        refreshUserFitnessProfilePost,
      } as never,
      { emitAsync } as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await (
      service as unknown as { processJob: (...args: unknown[]) => unknown }
    ).processJob({
      id: 'post-maintenance',
      userId: 'user-1',
      batchJobId: 'batch-maintenance',
    });

    expect(refreshUserFitnessProfilePre).toHaveBeenCalledWith(
      'user-1',
      ['RUN'],
      {},
    );
    expect(refreshUserFitnessProfilePost).toHaveBeenCalledWith('user-1', {});
    expect(emitAsync).toHaveBeenCalledWith(
      PMC_INVALIDATE_EVENT,
      expect.objectContaining({ userId: 'user-1', startDate: recomputeFrom }),
    );
  });

  it('moves the batch to a terminal failure state when post-processing is dead', async () => {
    const prisma = {
      userPostProcessJob: {
        findUnique: jest.fn(async () => ({
          recomputeFrom: new Date(),
          recomputeTo: new Date(),
          affectedSportTypes: ['RUN'],
        })),
        update: jest
          .fn<(...args: unknown[]) => Promise<{ attempts: number }>>()
          .mockResolvedValueOnce({ attempts: 1 })
          .mockResolvedValue({ attempts: 1 }),
      },
      importBatchJob: {
        findUnique: jest.fn(async () => ({ successCount: 1 })),
        update: jest.fn(async () => ({})),
      },
      importItemJob: {
        findMany: jest.fn(async () => [{ activityId: 42 }]),
      },
      activity: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {
        get: jest.fn((key: string) =>
          key === 'userPostProcessWorker.maxAttempts' ? 1 : undefined,
        ),
      } as never,
      {
        refreshUserFitnessProfilePre: jest.fn(async () => {
          throw new Error('fitness unavailable');
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await (
      service as unknown as { processJob: (...args: unknown[]) => unknown }
    ).processJob({
      id: 'post-dead',
      userId: 'user-1',
      batchJobId: 'batch-dead',
    });

    expect(prisma.userPostProcessJob.update).toHaveBeenCalledWith({
      where: { id: 'post-dead' },
      data: expect.objectContaining({ status: 'DEAD' }),
    });
    expect(prisma.importBatchJob.update).toHaveBeenCalledWith({
      where: { id: 'batch-dead' },
      data: expect.objectContaining({
        status: 'PARTIAL_FAILED',
        completedAt: expect.any(Date),
      }),
    });
    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [42] },
        processingStatus: { not: 'READY' },
      },
      data: expect.objectContaining({ processingStatus: 'FAILED' }),
    });
  });

  it('logs an AI review enqueue failure and lets post-processing continue', async () => {
    const enqueueActivityAiReviewForImport = jest.fn(async () => {
      throw new Error('Invalid activity date');
    });
    const prisma = {
      userSetting: {
        findUnique: jest.fn(async () => ({ value: 'PLUS' })),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { enqueueActivityAiReviewForImport } as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
      featureAccess(true) as never,
    );
    const warn = jest.fn();
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn,
      error: jest.fn(),
    };

    await expect(
      (
        service as unknown as {
          runBatchAiReviewWhenAllowed: (...args: unknown[]) => unknown;
        }
      ).runBatchAiReviewWhenAllowed({
        batchJobId: 'batch-1',
        postProcessJobId: 'post-process-1',
        userId: 'user-1',
        activityIds: [1367],
      }),
    ).resolves.toBeUndefined();

    expect(enqueueActivityAiReviewForImport).toHaveBeenCalledWith(
      1367,
      'user-1',
      'import-post-process-auto-review',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid activity date'),
    );
  });

  it('does not trust a stale PLUS projection for automatic AI review', async () => {
    const enqueueActivityAiReviewForImport = jest.fn(async () => undefined);
    const prisma = {
      userSetting: {
        findUnique: jest.fn(async () => ({ value: 'PLUS' })),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { enqueueActivityAiReviewForImport } as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
      featureAccess(false) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await (
      service as unknown as {
        runBatchAiReviewWhenAllowed: (...args: unknown[]) => unknown;
      }
    ).runBatchAiReviewWhenAllowed({
      batchJobId: 'batch-1',
      postProcessJobId: 'post-process-1',
      userId: 'user-1',
      activityIds: [1367],
    });

    expect(enqueueActivityAiReviewForImport).not.toHaveBeenCalled();
  });

  it('marks only failed HEAVY activities as partial before retrying post-process', async () => {
    const prisma = {
      importItemJob: {
        findMany: jest.fn(async () => [{ activityId: 42 }]),
      },
      activity: {
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        runHeavyMetricsPipeline: jest.fn(async () => {
          throw new Error('heavy failed');
        }),
      } as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await expect(
      (
        service as unknown as {
          runBatchHeavyMetrics: (...args: unknown[]) => unknown;
        }
      ).runBatchHeavyMetrics({
        batchJobId: 'batch-1',
        postProcessJobId: 'post-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('Heavy metrics failed for 1/1 activities');

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [42] } },
      data: expect.objectContaining({ processingStatus: 'PARTIAL_FAILED' }),
    });
  });

  it('runs HEAVY activity pipelines with a concurrency limit of two', async () => {
    let active = 0;
    let peak = 0;
    const prisma = {
      importItemJob: {
        findMany: jest.fn(async () =>
          [1, 2, 3, 4, 5].map((activityId) => ({ activityId })),
        ),
      },
      activity: {
        update: jest.fn(async () => ({})),
      },
    };
    const runHeavyMetricsPipeline = jest.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return [];
    });
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      {} as never,
      { runHeavyMetricsPipeline } as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await expect(
      (
        service as unknown as {
          runBatchHeavyMetrics: (...args: unknown[]) => unknown;
        }
      ).runBatchHeavyMetrics({
        batchJobId: 'batch-1',
        postProcessJobId: 'post-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual([1, 2, 3, 4, 5]);

    expect(peak).toBe(2);
    expect(runHeavyMetricsPipeline).toHaveBeenCalledTimes(5);
    expect(prisma.activity.update).toHaveBeenCalledTimes(5);
  });

  it('logs applied and skipped HEAVY tasks with a batch summary', async () => {
    const prisma = {
      importItemJob: {
        findMany: jest.fn(async () => [{ activityId: 42 }]),
      },
      activity: {
        update: jest.fn(async () => ({})),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      {} as never,
      {
        runHeavyMetricsPipeline: jest.fn(async () => [
          { key: 'recordsBootstrap', status: 'APPLIED' },
          { key: 'paceBase', status: 'APPLIED' },
          {
            key: 'powerBase',
            status: 'SKIPPED',
            reason: 'no_power_samples',
          },
        ]),
      } as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    const log = jest.fn();
    (service as unknown as { logger: unknown }).logger = {
      log,
      warn: jest.fn(),
      error: jest.fn(),
    };

    await expect(
      (
        service as unknown as {
          runBatchHeavyMetrics: (...args: unknown[]) => unknown;
        }
      ).runBatchHeavyMetrics({
        batchJobId: 'batch-1',
        postProcessJobId: 'post-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual([42]);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('powerBase:no_power_samples'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        '"powerBase":{"applied":0,"ignored":0,"skipped":1,"failed":0,"ignoredReasons":{},"skippedReasons":{"no_power_samples":1}}',
      ),
    );
  });

  it('delegates automatic activity exports to the provider registry', async () => {
    const run = jest.fn(async () => ({
      results: {
        intervalsIcu: { skippedCount: 1 },
        strava: { skippedCount: 1 },
        wahoo: { exportedCount: 1 },
        suunto: { exportedCount: 1 },
      },
      providerLabels: {
        intervalsIcu: 'Intervals.icu',
        strava: 'Strava',
        wahoo: 'Wahoo',
        suunto: 'Suunto',
      },
      failures: [],
    }));
    const prisma = {};
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { run } as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const outcome = await (
      service as unknown as {
        runBatchThirdPartyExports: (...args: unknown[]) => unknown;
      }
    ).runBatchThirdPartyExports({
      batchJobId: 'batch-1',
      postProcessJobId: 'post-process-1',
      userId: 'user-1',
      activityIds: [1367],
    });

    expect(run).toHaveBeenCalledWith({
      userId: 'user-1',
      activityIds: [1367],
    });
    expect(outcome).toEqual({ failedProviders: [], failedCount: 0 });
  });

  it('marks automatic provider export failures for the batch notification', async () => {
    const prisma = {};
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        run: jest.fn(async () => ({
          results: {
            wahoo: {
              exportedCount: 0,
              pendingCount: 0,
              failedCount: 1,
              skippedCount: 0,
              results: [{ activityId: 1367, status: 'FAILED' }],
            },
          },
          providerLabels: { wahoo: 'Wahoo', suunto: 'Suunto' },
          failures: [
            {
              provider: 'suunto',
              displayName: 'Suunto',
              error: 'Suunto unavailable',
            },
          ],
        })),
      } as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await expect(
      (
        service as unknown as {
          runBatchThirdPartyExports: (...args: unknown[]) => unknown;
        }
      ).runBatchThirdPartyExports({
        batchJobId: 'batch-1',
        postProcessJobId: 'post-process-1',
        userId: 'user-1',
        activityIds: [1367],
      }),
    ).resolves.toEqual({
      failedProviders: ['Wahoo', 'Suunto'],
      failedCount: 2,
    });
  });

  it('includes automatic provider export failures in the batch notification', async () => {
    const ensureNotification = jest.fn(async () => ({
      notificationId: 'notification-1',
      created: true,
    }));
    const prisma = {
      importBatchJob: {
        findUnique: jest.fn(async () => ({
          status: 'COMPLETED',
          totalCount: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          requestContext: {},
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const service = new UserPostProcessWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { ensureNotification } as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      createImportingJobs(prisma),
      userQueries(prisma) as never,
    );

    await (
      service as unknown as {
        sendBatchNotification: (...args: unknown[]) => unknown;
      }
    ).sendBatchNotification({
      batchJobId: 'batch-1',
      userId: 'user-1',
      exportOutcome: {
        failedProviders: ['Wahoo', 'Suunto'],
        failedCount: 2,
      },
    });

    expect(ensureNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'IMPORT_BATCH_PARTIAL_FAILED',
        bodyMarkdown: expect.stringContaining(
          'Third-party upload failed for Wahoo, Suunto',
        ),
        data: expect.objectContaining({
          thirdPartyExportFailedProviders: ['Wahoo', 'Suunto'],
          thirdPartyExportFailedCount: 2,
        }),
      }),
    );
  });
});
