import { describe, expect, it, jest } from '@jest/globals';
import { ReviewWorkerService } from '../review.worker';
import {
  ReviewModelCallGuard,
  ReviewModelDeferredError,
} from '@/review/review-model-call-guard';
import { featureAccessSnapshot } from '@/access/feature-access.types';

type ReviewWorkerInternals = {
  logger: {
    log: ReturnType<typeof jest.fn>;
    warn: ReturnType<typeof jest.fn>;
    error: ReturnType<typeof jest.fn>;
  };
  processJob(job: {
    id: string;
    userId: string;
    type: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<unknown>;
  drain(): Promise<void>;
};

function createWorker(args: {
  daily?: { runForDailyJob: ReturnType<typeof jest.fn> };
  period?: { runForJob: ReturnType<typeof jest.fn> };
  digest?: {
    ensureDigestForJob: ReturnType<typeof jest.fn>;
    finalizeDigestContent: ReturnType<typeof jest.fn>;
    findUniqueAiSummary?: ReturnType<typeof jest.fn>;
  };
  reviewJobUpdate?: ReturnType<typeof jest.fn>;
  reviewModeValue?: string | null;
  membershipActive?: boolean;
  ai?: { replaceReviewDigestSession: ReturnType<typeof jest.fn> };
  guard?: ReviewModelCallGuard;
}) {
  const reviewJobUpdate =
    args.reviewJobUpdate ?? jest.fn(async () => ({ attempts: 0 }));
  const ensureNotification = jest.fn(async () => undefined);
  const finalizeDigestContent =
    args.digest?.finalizeDigestContent ?? jest.fn(async () => undefined);
  const ensureDigestForJob =
    args.digest?.ensureDigestForJob ??
    jest.fn(async () => ({ digestId: 'digest-1' }));
  const featureAccessEvaluate = jest.fn(async () => {
    const allowed = args.membershipActive ?? true;
    return featureAccessSnapshot({
      allowed,
      reason: allowed ? 'GRANTED' : 'PLAN_REQUIRED',
    });
  });
  const prisma = {
    $queryRawUnsafe: jest.fn(async () => []),
    reviewDigest: { findUnique: jest.fn(async () => null) },
    reviewJob: { update: reviewJobUpdate },
    userSetting: {
      findUnique: jest.fn(async () =>
        args.reviewModeValue == null ? null : { value: args.reviewModeValue },
      ),
    },
  };
  const service = new ReviewWorkerService(
    prisma as never,
    {
      ensureDigestForJob,
      finalizeDigestContent,
      findUniqueAiSummary:
        args.digest?.findUniqueAiSummary ?? jest.fn(async () => null),
    } as never,
    (args.daily ?? {
      runForDailyJob: jest.fn(async () => undefined),
    }) as never,
    (args.period ?? {
      runForJob: jest.fn(async () => undefined),
    }) as never,
    { get: jest.fn(() => undefined) } as never,
    { ensureNotification } as never,
    { t: jest.fn(() => 'ready') } as never,
    {
      getPreferredLocale: jest.fn(async () => 'zh'),
      getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai'),
    } as never,
    args.ai as never,
    { settings: () => prisma.userSetting } as never,
    { evaluate: featureAccessEvaluate } as never,
    args.guard ?? new ReviewModelCallGuard(),
  );
  const warn = jest.fn();
  (service as unknown as ReviewWorkerInternals).logger = {
    log: jest.fn(),
    warn,
    error: jest.fn(),
  };
  return {
    service,
    prisma,
    featureAccessEvaluate,
    warn,
    reviewJobUpdate,
    ensureNotification,
    ensureDigestForJob,
    finalizeDigestContent,
  };
}

describe('ReviewWorkerService daily runtime isolation', () => {
  it('propagates the athlete timezone into digest generation', async () => {
    const { service, ensureDigestForJob, finalizeDigestContent } = createWorker(
      {},
    );

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-timezone',
      userId: 'user-1',
      type: 'DAILY',
      periodStart: new Date('2026-08-22T16:00:00.000Z'),
      periodEnd: new Date('2026-08-23T16:00:00.000Z'),
    });

    expect(ensureDigestForJob).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'Asia/Shanghai' }),
    );
    expect(finalizeDigestContent).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'Asia/Shanghai' }),
    );
  });

  it('still completes the digest when daily runtime throws', async () => {
    const { service, warn, reviewJobUpdate } = createWorker({
      daily: {
        runForDailyJob: jest.fn(async () => {
          throw new Error('runtime boom');
        }),
      },
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-1',
      userId: 'user-1',
      type: 'DAILY',
      periodStart: new Date('2026-08-16T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('失败但不阻断 digest'),
    );
    expect(reviewJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: { status: 'DONE', lastError: null },
      }),
    );
  });

  it('does not run daily runtime for weekly jobs', async () => {
    const runForDailyJob = jest.fn(async () => undefined);
    const runForJob = jest.fn(async () => undefined);
    const { service } = createWorker({
      daily: { runForDailyJob },
      period: { runForJob },
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-2',
      userId: 'user-1',
      type: 'WEEKLY',
      periodStart: new Date('2026-08-10T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(runForDailyJob).not.toHaveBeenCalled();
    expect(runForJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WEEKLY',
        digestId: 'digest-1',
      }),
    );
  });

  it('still completes the digest when weekly runtime throws', async () => {
    const { service, warn, reviewJobUpdate } = createWorker({
      period: {
        runForJob: jest.fn(async () => {
          throw new Error('week boom');
        }),
      },
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-w',
      userId: 'user-1',
      type: 'WEEKLY',
      periodStart: new Date('2026-08-10T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('失败但不阻断 digest'),
    );
    expect(reviewJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'DONE', lastError: null },
      }),
    );
  });

  it('runs daily runtime only after digest content is finalized', async () => {
    const order: string[] = [];
    const { service } = createWorker({
      digest: {
        ensureDigestForJob: jest.fn(async () => ({ digestId: 'digest-3' })),
        finalizeDigestContent: jest.fn(async () => {
          order.push('finalize');
        }),
      },
      daily: {
        runForDailyJob: jest.fn(async () => {
          order.push('runtime');
        }),
      },
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-3',
      userId: 'user-1',
      type: 'DAILY',
      periodStart: new Date('2026-08-16T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(order).toEqual(['finalize', 'runtime']);
  });

  it('still runs daily runtime when digest notification is turned off', async () => {
    const runForDailyJob = jest.fn(async () => undefined);
    const {
      service,
      ensureNotification,
      finalizeDigestContent,
      reviewJobUpdate,
    } = createWorker({
      daily: { runForDailyJob },
      reviewModeValue: JSON.stringify({ dailyReview: false }),
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-4',
      userId: 'user-1',
      type: 'DAILY',
      periodStart: new Date('2026-08-16T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(ensureNotification).not.toHaveBeenCalled();
    expect(finalizeDigestContent).not.toHaveBeenCalled();
    expect(runForDailyJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        digestId: 'digest-1',
      }),
    );
    expect(reviewJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'DONE', lastError: null },
      }),
    );
  });

  it('finishes without review side effects when authoritative membership has expired', async () => {
    const runForDailyJob = jest.fn(async () => undefined);
    const runForJob = jest.fn(async () => undefined);
    const replaceReviewDigestSession = jest.fn(async () => undefined);
    const {
      service,
      reviewJobUpdate,
      ensureNotification,
      ensureDigestForJob,
      finalizeDigestContent,
    } = createWorker({
      daily: { runForDailyJob },
      period: { runForJob },
      membershipActive: false,
      ai: { replaceReviewDigestSession },
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-5',
      userId: 'user-1',
      type: 'DAILY',
      periodStart: new Date('2026-08-16T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(ensureDigestForJob).not.toHaveBeenCalled();
    expect(ensureNotification).not.toHaveBeenCalled();
    expect(finalizeDigestContent).not.toHaveBeenCalled();
    expect(runForDailyJob).not.toHaveBeenCalled();
    expect(runForJob).not.toHaveBeenCalled();
    expect(replaceReviewDigestSession).not.toHaveBeenCalled();
    expect(reviewJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'DONE', lastError: null },
      }),
    );
  });

  it('writes the digest session through the AI facade', async () => {
    const replaceReviewDigestSession = jest.fn(async () => undefined);
    const { service } = createWorker({
      digest: {
        ensureDigestForJob: jest.fn(async () => ({ digestId: 'digest-9' })),
        finalizeDigestContent: jest.fn(async () => undefined),
        findUniqueAiSummary: jest.fn(async () => ({
          title: '周复盘',
          aiSummaryMarkdown: '# week',
        })),
      },
      ai: { replaceReviewDigestSession },
    });

    await (service as unknown as ReviewWorkerInternals).processJob({
      id: 'job-session',
      userId: 'user-1',
      type: 'WEEKLY',
      periodStart: new Date('2026-08-10T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
    });

    expect(replaceReviewDigestSession).toHaveBeenCalledWith({
      userId: 'user-1',
      digestId: 'digest-9',
      type: 'WEEKLY',
      lang: 'zh',
      title: '周复盘',
      markdown: '# week',
    });
  });
});

describe('ReviewWorkerService model failure deferral', () => {
  const job = {
    id: 'job-defer',
    userId: 'user-1',
    type: 'DAILY',
    periodStart: new Date('2026-08-16T16:00:00.000Z'),
    periodEnd: new Date('2026-08-17T16:00:00.000Z'),
  };
  const resumeAt = new Date('2026-08-17T22:00:00.000Z');

  function pausedGuard() {
    const guard = new ReviewModelCallGuard();
    guard.clock = () => new Date('2026-08-17T21:30:00.000Z');
    (guard as unknown as { pausedUntil: Date }).pausedUntil = resumeAt;
    return guard;
  }

  function expectDeferred(reviewJobUpdate: ReturnType<typeof jest.fn>) {
    expect(reviewJobUpdate).toHaveBeenCalledTimes(1);
    expect(reviewJobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-defer' },
      data: {
        status: 'PENDING',
        availableAt: resumeAt,
        lastError: expect.stringContaining('deferred'),
      },
    });
    const calls = JSON.stringify(reviewJobUpdate.mock.calls);
    expect(calls).not.toContain('DONE');
    expect(calls).not.toContain('attempts');
  }

  it('defers the job to the next hourly run when daily runtime stops the run', async () => {
    const { service, reviewJobUpdate, warn } = createWorker({
      daily: {
        runForDailyJob: jest.fn(async () => {
          throw new ReviewModelDeferredError(resumeAt, 'timeout');
        }),
      },
    });

    await (service as unknown as ReviewWorkerInternals).processJob(job);

    expectDeferred(reviewJobUpdate);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('任务顺延'));
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('失败但不阻断 digest'),
    );
  });

  it('defers instead of finishing with a rule-based digest when the digest call stops the run', async () => {
    const runForDailyJob = jest.fn(async () => undefined);
    const { service, reviewJobUpdate } = createWorker({
      daily: { runForDailyJob },
      reviewModeValue: JSON.stringify({ dailyReview: true }),
      digest: {
        ensureDigestForJob: jest.fn(async () => ({ digestId: 'digest-1' })),
        finalizeDigestContent: jest.fn(async () => {
          throw new ReviewModelDeferredError(resumeAt, 'usage_missing');
        }),
      },
    });

    await (service as unknown as ReviewWorkerInternals).processJob(job);

    expect(runForDailyJob).not.toHaveBeenCalled();
    expectDeferred(reviewJobUpdate);
  });

  it('defers remaining jobs without side effects while the run is paused', async () => {
    const runForDailyJob = jest.fn(async () => undefined);
    const {
      service,
      reviewJobUpdate,
      featureAccessEvaluate,
      ensureDigestForJob,
    } = createWorker({ daily: { runForDailyJob }, guard: pausedGuard() });

    await (service as unknown as ReviewWorkerInternals).processJob(job);

    expect(featureAccessEvaluate).not.toHaveBeenCalled();
    expect(ensureDigestForJob).not.toHaveBeenCalled();
    expect(runForDailyJob).not.toHaveBeenCalled();
    expectDeferred(reviewJobUpdate);
  });

  it('stops claiming new jobs while the run is paused', async () => {
    const { service, prisma } = createWorker({ guard: pausedGuard() });

    await (service as unknown as ReviewWorkerInternals).drain();

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('keeps ordinary failures on the exponential retry path', async () => {
    const reviewJobUpdate = jest.fn(async () => ({ attempts: 1 }));
    const { service } = createWorker({
      reviewJobUpdate,
      reviewModeValue: JSON.stringify({ dailyReview: true }),
      digest: {
        ensureDigestForJob: jest.fn(async () => ({ digestId: 'digest-1' })),
        finalizeDigestContent: jest.fn(async () => {
          throw new Error('db down');
        }),
      },
    });

    await (service as unknown as ReviewWorkerInternals).processJob(job);

    expect(reviewJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: { increment: 1 },
        }),
      }),
    );
  });
});
