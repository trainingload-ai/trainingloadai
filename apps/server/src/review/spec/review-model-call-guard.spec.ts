import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';

import {
  ReviewModelCallGuard,
  ReviewModelCallTimeoutError,
  ReviewModelDeferredError,
  nextReviewRunAt,
  reviewModelCallTimeoutMs,
  reviewUsageFailureReason,
} from '../review-model-call-guard';

function guardAt(iso: string) {
  const guard = new ReviewModelCallGuard();
  let now = new Date(iso);
  guard.clock = () => now;
  (guard as unknown as { logger: Record<string, unknown> }).logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    guard,
    setNow: (value: string) => {
      now = new Date(value);
    },
  };
}

const fail = () => Promise.reject(new Error('upstream 503'));

describe('ReviewModelCallGuard', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rethrows isolated failures so callers keep their fallback', async () => {
    const { guard } = guardAt('2026-10-08T05:10:00.000Z');

    await expect(guard.run('digest', fail)).rejects.toThrow('upstream 503');
    await expect(guard.run('digest', fail)).rejects.toThrow('upstream 503');
    expect(guard.pausedUntilAt()).toBeNull();
  });

  it('stops the run on the 3rd consecutive failure and pauses until the next hour', async () => {
    const { guard } = guardAt('2026-10-08T05:10:00.000Z');
    await expect(guard.run('a', fail)).rejects.toThrow('upstream 503');
    await expect(guard.run('b', fail)).rejects.toThrow('upstream 503');

    const third = guard.run('c', fail);
    await expect(third).rejects.toBeInstanceOf(ReviewModelDeferredError);
    await expect(third).rejects.toMatchObject({
      resumeAt: new Date('2026-10-08T06:00:00.000Z'),
    });

    const call = jest.fn(async () => 'never');
    await expect(guard.run('d', call)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('resets the streak after a healthy call', async () => {
    const { guard } = guardAt('2026-10-08T05:10:00.000Z');
    await expect(guard.run('a', fail)).rejects.toThrow();
    await expect(guard.run('b', fail)).rejects.toThrow();
    await expect(
      guard.run('ok', async () => ({ usage: { reported: true } }), {
        failureReason: reviewUsageFailureReason,
      }),
    ).resolves.toEqual({ usage: { reported: true } });
    await expect(guard.run('c', fail)).rejects.toThrow('upstream 503');
    expect(guard.pausedUntilAt()).toBeNull();
  });

  it('counts a response without usage as a failure but still returns it below the limit', async () => {
    const { guard } = guardAt('2026-10-08T05:10:00.000Z');
    const noUsage = async () => ({ usage: { reported: false }, value: 1 });

    await expect(
      guard.run('a', noUsage, { failureReason: reviewUsageFailureReason }),
    ).resolves.toEqual({ usage: { reported: false }, value: 1 });
    await expect(
      guard.run('b', noUsage, { failureReason: reviewUsageFailureReason }),
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      guard.run('c', noUsage, { failureReason: reviewUsageFailureReason }),
    ).rejects.toMatchObject({ reason: 'usage_missing' });
  });

  it('does not count application errors such as missing AI consent', async () => {
    const { guard } = guardAt('2026-10-08T05:10:00.000Z');
    const consent = () =>
      Promise.reject(new BadRequestException('AI_DATA_CONSENT_REQUIRED'));
    for (let i = 0; i < 5; i += 1) {
      await expect(guard.run('consent', consent)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(guard.pausedUntilAt()).toBeNull();
  });

  it('only counts consecutive failures within the same hourly run', async () => {
    const { guard, setNow } = guardAt('2026-10-08T05:58:00.000Z');
    await expect(guard.run('a', fail)).rejects.toThrow('upstream 503');
    await expect(guard.run('b', fail)).rejects.toThrow('upstream 503');
    setNow('2026-10-08T06:01:00.000Z');
    await expect(guard.run('c', fail)).rejects.toThrow('upstream 503');
    expect(guard.pausedUntilAt()).toBeNull();
  });

  it('resumes once the next hourly run starts', async () => {
    const { guard, setNow } = guardAt('2026-10-08T05:10:00.000Z');
    for (const label of ['a', 'b']) {
      await expect(guard.run(label, fail)).rejects.toThrow();
    }
    await expect(guard.run('c', fail)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    setNow('2026-10-08T05:59:59.999Z');
    expect(guard.pausedUntilAt()).toEqual(new Date('2026-10-08T06:00:00.000Z'));
    setNow('2026-10-08T06:00:00.000Z');
    expect(guard.pausedUntilAt()).toBeNull();
    await expect(guard.run('ok', async () => 'fine')).resolves.toBe('fine');
  });

  it('aborts a hung call at the hard timeout and counts it as a failure', async () => {
    jest.useFakeTimers();
    const { guard } = guardAt('2026-10-08T05:10:00.000Z');
    let received: AbortSignal | undefined;
    const pending = guard.run(
      'hung',
      (signal) =>
        new Promise<never>(() => {
          received = signal;
        }),
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(
      ReviewModelCallTimeoutError,
    );

    await jest.advanceTimersByTimeAsync(reviewModelCallTimeoutMs());

    await assertion;
    expect(received?.aborted).toBe(true);
  });
});

describe('review model call helpers', () => {
  it('parses and clamps REVIEW_MODEL_CALL_TIMEOUT_MS', () => {
    expect(reviewModelCallTimeoutMs({})).toBe(120_000);
    expect(reviewModelCallTimeoutMs({ REVIEW_MODEL_CALL_TIMEOUT_MS: 'x' })).toBe(
      120_000,
    );
    expect(reviewModelCallTimeoutMs({ REVIEW_MODEL_CALL_TIMEOUT_MS: '1' })).toBe(
      10_000,
    );
    expect(
      reviewModelCallTimeoutMs({ REVIEW_MODEL_CALL_TIMEOUT_MS: '45000' }),
    ).toBe(45_000);
    expect(
      reviewModelCallTimeoutMs({ REVIEW_MODEL_CALL_TIMEOUT_MS: '99999999' }),
    ).toBe(600_000);
  });

  it('resolves the next hourly run at the top of the next UTC hour', () => {
    expect(nextReviewRunAt(new Date('2026-10-08T05:00:00.000Z'))).toEqual(
      new Date('2026-10-08T06:00:00.000Z'),
    );
    expect(nextReviewRunAt(new Date('2026-10-08T23:59:59.000Z'))).toEqual(
      new Date('2026-10-09T00:00:00.000Z'),
    );
  });
});
