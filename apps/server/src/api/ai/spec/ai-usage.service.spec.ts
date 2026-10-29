import { AiUsageStatus } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';

import { AiUsageService, parseOpenAIUsage } from '../ai-usage.service';

function createService() {
  const recorder = {
    record: jest.fn(async (args: unknown) => args),
    recordMany: jest.fn(async (args: unknown[]) => args),
    recordInTransaction: jest.fn(async (_tx: unknown, args: unknown) => args),
  };
  return {
    recorder,
    service: new AiUsageService(recorder as never),
  };
}

describe('AiUsageService', () => {
  it('normalizes DeepSeek cache hit and miss usage', () => {
    expect(
      parseOpenAIUsage({
        prompt_cache_hit_tokens: 30_000,
        prompt_cache_miss_tokens: 500,
        completion_tokens: 100,
      }),
    ).toEqual(
      expect.objectContaining({
        inputTokens: 30_500,
        cachedInputTokens: 30_000,
        outputTokens: 100,
        reported: true,
      }),
    );
  });

  it('treats an empty or unrecognized usage object as unreported', () => {
    expect(parseOpenAIUsage({})).toEqual(
      expect.objectContaining({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reported: false,
      }),
    );
  });

  it('computes provider-neutral weighted token metrics', () => {
    const { service } = createService();
    expect(
      service.computeUsageMetrics({
        inputTokens: 31_000,
        cachedInputTokens: 30_000,
        outputTokens: 500,
      }),
    ).toEqual({
      inputTokens: 31_000,
      outputTokens: 500,
      cachedInputTokens: 30_000,
      uncachedInputTokens: 1_000,
      weightedTokens: 3_500,
      equivalentTokens: 3_500,
    });
  });

  it('records only neutral operation and usage fields', async () => {
    const { service, recorder } = createService();
    await service.recordUsageEvent({
      userId: 'user-1',
      operationId: 'operation-1',
      callKey: 'operation-1:model:0',
      kind: 'COACH_CHAT',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      purpose: 'REASONING',
      usage: {
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 100,
      },
      status: AiUsageStatus.SUCCESS,
    });

    expect(recorder.record).toHaveBeenCalledWith({
      userId: 'user-1',
      operationId: 'operation-1',
      callKey: 'operation-1:model:0',
      providerRequestId: undefined,
      kind: 'COACH_CHAT',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      purpose: 'REASONING',
      usage: {
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 100,
      },
      status: AiUsageStatus.SUCCESS,
      sid: undefined,
      entityId: undefined,
      now: undefined,
    });
  });
});
