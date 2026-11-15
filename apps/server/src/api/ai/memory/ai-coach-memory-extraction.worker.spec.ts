import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Logger } from '@nestjs/common';
import { AiCoachMemoryExtractionWorker } from './ai-coach-memory-extraction.worker';
import type {
  MemoryJudgeInput,
  MemoryJudgeResult,
} from './memory-judge.service';
import { validateMemoryOperations } from '@/athlete-memory/application/memory-operation-validator';
import {
  MemoryIsolationError,
  MemoryValidationError,
} from '@/athlete-memory/domain/memory-time';

jest.mock('@/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));
jest.mock(
  '@/athlete-memory/application/apply-memory-operations.service',
  () => ({ ApplyMemoryOperationsService: class {} }),
);
jest.mock('@/athlete-memory/application/athlete-memory-query.service', () => ({
  AthleteMemoryQueryService: class {},
}));
jest.mock(
  '@/athlete-memory/application/athlete-memory-preference.service',
  () => ({ AthleteMemoryPreferenceService: class {} }),
);
jest.mock('@/ai-data-consent/ai-data-consent.service', () => ({
  AiDataConsentService: class {},
}));
jest.mock('@/runtime-capabilities/runtime-capability.service', () => ({
  RuntimeCapabilityService: class {},
}));
jest.mock('./memory-judge.service', () => ({ MemoryJudgeService: class {} }));
jest.mock('../core/coach-history-messages', () => ({
  getStoredCoachLegacyMessage: () => null,
}));

const originalMaxAttempts = process.env.MEMORY_EXTRACTION_MAX_ATTEMPTS;
const createdAt = new Date('2026-10-12T10:00:00Z');
const decision = () => ({
  operations: [
    {
      operation: 'CREATE',
      kind: 'PREFERENCE',
      category: 'training_preference',
      claim: 'Prefers evening training',
      timePrecision: 'UNKNOWN',
      epistemicStatus: 'USER_ASSERTED',
      confidence: 0.9,
      decayProfile: 'STABLE',
    },
  ],
});
const invalid = () => ({
  operations: [{ ...decision().operations[0], claim: '' }],
});
const lookup = () => ({
  operations: [
    { operation: 'NEEDS_LOOKUP', lookup: { query: 'training preference' } },
  ],
});
const judged = (value: unknown): MemoryJudgeResult => ({
  decision: value,
  model: 'fixture-model',
  provider: 'deepseek',
});

function fixture(attempts = 1) {
  const job = {
    id: 'fixture-job',
    userId: 'fixture-user',
    sessionId: 'fixture-session',
    sourceMessageId: 'fixture-message',
    policyVersion: 'athlete-memory-v1',
    attempts,
  };
  const update = jest
    .fn<(...args: unknown[]) => Promise<{ count: number }>>()
    .mockResolvedValue({ count: 1 });
  const prisma = {
    aiCoachMessage: {
      findFirst: jest
        .fn()
        .mockImplementation(async () => ({
          id: job.sourceMessageId,
          userId: job.userId,
          sessionId: job.sessionId,
          role: 'USER',
          content: 'I prefer evening training.',
          sequence: 1,
          createdAt,
        })),
      findMany: jest.fn().mockImplementation(async () => []),
    },
    aiCoachMemoryExtractionJob: { updateMany: update },
  };
  const apply = jest
    .fn<
      (...args: unknown[]) => Promise<{ applied: number; idempotent: boolean }>
    >()
    .mockResolvedValue({ applied: 1, idempotent: false });
  const validate = jest.fn(validateMemoryOperations);
  const judge = jest
    .fn<(input: MemoryJudgeInput) => Promise<MemoryJudgeResult>>()
    .mockResolvedValue(judged(decision()));
  const consent = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const preference = jest
    .fn<() => Promise<{ enabled: boolean }>>()
    .mockResolvedValue({ enabled: true });
  const candidates = jest.fn().mockImplementation(async () => ({ items: [] }));
  const worker = new AiCoachMemoryExtractionWorker(
    prisma as never,
    { getPreferredTimezone: async () => 'UTC' } as never,
    { validateDecision: validate, applyOperations: apply } as never,
    { findJudgeCandidates: candidates } as never,
    { get: preference } as never,
    { judge } as never,
    { isGranted: consent } as never,
  );
  return {
    job,
    update,
    apply,
    validate,
    judge,
    consent,
    preference,
    candidates,
    process: () => worker['process'](job as never),
  };
}

describe('Memory extraction validation repair', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    process.env.MEMORY_EXTRACTION_MAX_ATTEMPTS = '5';
  });
  afterAll(() => {
    jest.restoreAllMocks();
    if (originalMaxAttempts === undefined)
      delete process.env.MEMORY_EXTRACTION_MAX_ATTEMPTS;
    else process.env.MEMORY_EXTRACTION_MAX_ATTEMPTS = originalMaxAttempts;
  });

  it('repairs an invalid decision once with safe field feedback before applying', async () => {
    const f = fixture();
    f.judge.mockResolvedValueOnce(judged(invalid()));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.judge.mock.calls[1][0].validationFeedback).toEqual({
      field: 'operations[0].claim',
      reason: 'empty',
      actualLength: 0,
      maxLength: 320,
    });
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.apply.mock.calls[0][0]).toMatchObject({
      decision: { operations: [{ reasonCode: 'MODEL_CREATE' }] },
    });
  });

  it('persists normalized audit metadata and discards model explanations', async () => {
    const f = fixture();
    const raw = decision();
    Object.assign(raw.operations[0], {
      reasonCode: 'model explanation must not be persisted',
      privateReasoning: 'untrusted extra output',
    });
    f.judge.mockResolvedValueOnce(judged(raw));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.apply.mock.calls[0][0])).not.toContain(
      'model explanation',
    );
    expect(JSON.stringify(f.apply.mock.calls[0][0])).not.toContain(
      'privateReasoning',
    );
    expect(f.apply.mock.calls[0][0]).toMatchObject({
      decision: { operations: [{ reasonCode: 'MODEL_CREATE' }] },
    });
  });

  it('fails after the second invalid decision without logging its value', async () => {
    const f = fixture();
    const raw = decision();
    raw.operations[0].claim = 'private-fixture-'.repeat(40);
    f.judge.mockResolvedValue(judged(raw));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.stringContaining('too_long'),
        }),
      }),
    );
    expect(
      JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls),
    ).not.toContain('private-fixture-');
    expect(
      JSON.stringify(f.judge.mock.calls[1][0].validationFeedback),
    ).not.toContain('private-fixture-');
  });

  it('keeps the fifth failed attempt DEAD with no scheduled retry', async () => {
    const f = fixture(5);
    f.judge.mockResolvedValue(judged(invalid()));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD', nextRetryAt: null }),
      }),
    );
  });

  it('uses the second call for lookup without adding a repair call', async () => {
    const f = fixture();
    f.judge
      .mockResolvedValueOnce(judged(lookup()))
      .mockResolvedValueOnce(judged(invalid()));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.judge.mock.calls[1][0]).toMatchObject({ lookupCandidates: [] });
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('applies a valid lookup result within the two-call budget', async () => {
    const f = fixture();
    f.judge.mockResolvedValueOnce(judged(lookup()));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.apply).toHaveBeenCalledTimes(1);
  });

  it('does not add lookup after spending the second call on repair', async () => {
    const f = fixture();
    f.judge
      .mockResolvedValueOnce(judged(invalid()))
      .mockResolvedValueOnce(judged(lookup()));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.candidates).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining('budget_exhausted'),
        }),
      }),
    );
  });

  it('rejects a repeated lookup instead of starting an agent loop', async () => {
    const f = fixture();
    f.judge.mockResolvedValue(judged(lookup()));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('repairs a structured-output parsing error using the same budget', async () => {
    const f = fixture();
    f.judge.mockRejectedValueOnce(
      new MemoryValidationError('untrusted parser details', {
        field: 'decision',
        reason: 'invalid_value',
      }),
    );
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.judge.mock.calls[1][0].validationFeedback).toEqual({
      field: 'decision',
      reason: 'invalid_value',
    });
    expect(JSON.stringify(f.judge.mock.calls[1][0])).not.toContain(
      'untrusted parser details',
    );
    expect(f.apply).toHaveBeenCalledTimes(1);
  });

  it('does not repair isolation errors or apply them', async () => {
    const f = fixture();
    f.validate.mockImplementation(() => {
      throw new MemoryIsolationError('Source ownership mismatch');
    });
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD' }),
      }),
    );
  });

  it('leaves network errors on the existing outer backoff path', async () => {
    const f = fixture();
    f.judge.mockRejectedValueOnce(new Error('upstream timeout'));
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('skips Judge calls when consent is already revoked', async () => {
    const f = fixture();
    f.consent.mockResolvedValue(false);
    await f.process();
    expect(f.judge).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionJson: {
            operations: [
              { operation: 'IGNORE', reasonCode: 'CONSENT_REVOKED' },
            ],
          },
        }),
      }),
    );
  });

  it.each(['consent', 'preference'] as const)(
    'stops before repair when %s is revoked',
    async (gate) => {
      const f = fixture();
      f.judge.mockResolvedValueOnce(judged(invalid()));
      if (gate === 'consent')
        f.consent.mockResolvedValueOnce(true).mockResolvedValue(false);
      else
        f.preference
          .mockResolvedValueOnce({ enabled: true })
          .mockResolvedValue({ enabled: false });
      await f.process();
      expect(f.judge).toHaveBeenCalledTimes(1);
      expect(f.apply).not.toHaveBeenCalled();
    },
  );

  it('rechecks consent after the correction before writing', async () => {
    const f = fixture();
    f.judge.mockResolvedValueOnce(judged(invalid()));
    f.consent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(2);
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('does not call Judge again after losing the lease before correction', async () => {
    const f = fixture();
    f.judge.mockResolvedValueOnce(judged(invalid()));
    f.update.mockResolvedValueOnce({ count: 0 });
    await f.process();
    expect(f.judge).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('never partially applies a decision containing one invalid operation', async () => {
    const f = fixture();
    f.judge.mockResolvedValue(
      judged({
        operations: [decision().operations[0], invalid().operations[0]],
      }),
    );
    await f.process();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.judge.mock.calls[1][0].validationFeedback.field).toBe(
      'operations[1].claim',
    );
  });
});
