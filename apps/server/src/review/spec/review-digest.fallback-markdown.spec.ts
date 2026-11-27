import { describe, expect, it, jest } from '@jest/globals';
import { ReviewDigestService } from '../review-digest.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  ReviewModelCallGuard,
  ReviewModelDeferredError,
} from '../review-model-call-guard';

jest.mock('@/api/ai/core/coach-upstream.adapter', () => ({
  coachReviewRequestOptions: jest.requireActual<
    typeof import('@/api/ai/core/coach-upstream.adapter')
  >('@/api/ai/core/coach-upstream.adapter').coachReviewRequestOptions,
  getCoachBaseUrlForLog: jest.fn(() => ''),
  getCoachModel: jest.fn(() => 'model'),
  getCoachUpstreamProvider: jest.fn(() => 'openrouter'),
}));

function createAiService(args?: {
  usageFailure?: Error;
  guard?: ReviewModelCallGuard;
  create?: ReturnType<typeof jest.fn>;
}) {
  const recordUsageEvent = args?.usageFailure
    ? jest.fn(async () => Promise.reject(args.usageFailure))
    : jest.fn(async () => undefined);
  const create =
    args?.create ??
    jest.fn(async (request: { validateResult: (raw: unknown) => unknown }) => ({
      result: request.validateResult({
        headline: 'Key workouts stayed consistent',
        activityRefs: [],
      }),
      usage: {
        inputTokens: 900,
        outputTokens: 100,
        cachedInputTokens: 300,
        reported: true,
      },
      provider: 'openrouter',
      model: 'model',
    }));
  const service = new ReviewDigestService(
    {} as never,
    { t: jest.fn((key: string) => key) } as never,
    {} as never,
    {} as never,
    args?.guard ?? new ReviewModelCallGuard(),
    { batchGetActualLoad: jest.fn(async () => new Map()) } as never,
    undefined,
    { isGranted: jest.fn(async () => true) } as never,
    { runBackgroundCoachTask: create } as never,
  );
  return { service, recordUsageEvent, create };
}

const totals = {
  totalSessions: 2,
  totalDurationSec: 3600,
  totalDistanceM: 10000,
  totalTss: 48,
  totalLoad: 80,
};

describe('ReviewDigestService AI usage accounting', () => {
  const request = {
    userId: 'user-1',
    type: 'WEEKLY' as const,
    lang: 'en',
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-08T00:00:00.000Z'),
    timezone: 'UTC',
    totals: {
      ...totals,
      bySport: {
        RUN: { sessions: 2, durationSec: 3600, distanceM: 10000, tss: 48 },
        CYCLING: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
        SWIM: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
        UNKNOWN: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
      },
    },
    highlights: [],
  };

  it('records automatic digest generation as platform-paid usage', async () => {
    const { service, recordUsageEvent, create } = createAiService();

    await expect(service.generateAiAnalysis(request)).resolves.toEqual(
      expect.objectContaining({
        analysis: {
          headline: 'Key workouts stayed consistent',
          activityRefs: [],
        },
        model: 'model',
      }),
    );
    expect(recordUsageEvent).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ funding: 'PLATFORM' }),
    );
  });

  it('keeps rule-based digest generation available after a late consent rejection', async () => {
    const { service } = createAiService({
      create: jest.fn(async () => {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.AI_DATA_CONSENT_REQUIRED,
          message: 'AI_DATA_CONSENT_REQUIRED',
        });
      }),
    });
    await expect(service.generateAiAnalysis(request)).resolves.toBeNull();
  });

  it('keeps a valid digest when internal usage persistence is unavailable', async () => {
    const { service } = createAiService({
      usageFailure: new Error('database unavailable'),
    });

    await expect(service.generateAiAnalysis(request)).resolves.toEqual(
      expect.objectContaining({
        analysis: {
          headline: 'Key workouts stayed consistent',
          activityRefs: [],
        },
      }),
    );
  });

  it('bounds the Agent task with a per-attempt timeout and an abort signal', async () => {
    const { service, create } = createAiService();

    await service.generateAiAnalysis(request);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'REVIEW_DIGEST_WEEKLY',
        activeSkillName: 'period-review',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('falls back to the rule-based digest for an isolated model failure', async () => {
    const { service } = createAiService({
      create: jest.fn(async () => {
        throw new Error('upstream 503');
      }),
    });

    await expect(service.generateAiAnalysis(request)).resolves.toBeNull();
  });

  it('falls back when the Agent submits the old unstructured result', async () => {
    const { service } = createAiService({
      create: jest.fn(
        async (request: { validateResult: (raw: unknown) => unknown }) => ({
          result: request.validateResult({ markdown: '# Training review' }),
        }),
      ),
    });

    await expect(service.generateAiAnalysis(request)).resolves.toBeNull();
  });

  it('defers instead of falling back once the review run is stopped', async () => {
    const guard = new ReviewModelCallGuard();
    const create = jest.fn(async () => {
      throw new Error('upstream 503');
    });
    const { service } = createAiService({ guard, create });
    (guard as unknown as { logger: Record<string, unknown> }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await expect(service.generateAiAnalysis(request)).resolves.toBeNull();
    await expect(service.generateAiAnalysis(request)).resolves.toBeNull();
    await expect(service.generateAiAnalysis(request)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    await expect(service.generateAiAnalysis(request)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    expect(create).toHaveBeenCalledTimes(3);
  });
});
