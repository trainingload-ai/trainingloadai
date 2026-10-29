import { EventEmitter } from 'events';
import { describe, expect, it, jest } from '@jest/globals';
import {
  PublicReviewController,
  readPublicReviewUpstreamTimeoutMs,
} from '../public-review.controller';
import { PublicReviewGenerationError } from '../public-review-result';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

describe('PublicReviewController observability and timeout', () => {
  it('uses a three-minute default and clamps unsafe overrides', () => {
    const previous = process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS;
    delete process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS;
    expect(readPublicReviewUpstreamTimeoutMs()).toBe(180_000);
    process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS = '500';
    expect(readPublicReviewUpstreamTimeoutMs()).toBe(10_000);
    process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS = '999999';
    expect(readPublicReviewUpstreamTimeoutMs()).toBe(300_000);
    if (previous === undefined)
      delete process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS;
    else process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS = previous;
  });

  it('streams a retryable timeout code, settles failure and writes a safe log', async () => {
    jest.useFakeTimers();
    const previous = process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS;
    delete process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS;
    const workflow = {
      prepareReview: jest.fn(async () => ({
        reservationId: 'reservation-1',
        evidence: { language: 'zh', sport: 'RUN' },
        visualization: { sport: 'RUN', verticalExaggeration: 1, warnings: [] },
      })),
      generateReview: jest.fn(
        (_evidence: unknown, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(
                new PublicReviewGenerationError('REQUEST_CANCELLED', 2_500),
              ),
            );
          }),
      ),
      settle: jest.fn(async () => undefined),
    };
    const controller = new PublicReviewController(workflow as never);
    const warning = jest.fn();
    (controller as never as { logger: unknown }).logger = { log: jest.fn(), warn: warning };
    const request = Object.assign(new EventEmitter(), {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const writes: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((value: string) => {
        writes.push(value);
        return true;
      }),
      end: jest.fn(),
    });

    const pending = controller.createReview(
      {} as Express.Multer.File,
      { language: 'zh', consent: 'true' },
      'admission',
      request as never,
      response as never,
    );
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(180_000);
    await pending;

    const events = writes.map((line) => JSON.parse(line));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'UPSTREAM_TIMEOUT',
        retryable: true,
      }),
    );
    expect(workflow.settle).toHaveBeenCalledWith({
      reservationId: 'reservation-1',
      outcome: 'FAILED',
      actualWt: 2_500,
    });
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('错误码=UPSTREAM_TIMEOUT'),
    );

    jest.useRealTimers();
    if (previous === undefined)
      delete process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS;
    else process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS = previous;
  });

  it('cancels the model request when the streaming response is closed', async () => {
    const workflow = {
      prepareReview: jest.fn(async () => ({
        reservationId: 'reservation-close',
        evidence: { language: 'zh', sport: 'RUN' },
        visualization: { sport: 'RUN', verticalExaggeration: 1, warnings: [] },
      })),
      generateReview: jest.fn(
        (_evidence: unknown, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      ),
      settle: jest.fn(async () => undefined),
    };
    const controller = new PublicReviewController(workflow as never);
    (controller as never as { logger: unknown }).logger = { log: jest.fn(), warn: jest.fn() };
    const request = Object.assign(new EventEmitter(), {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(() => true),
      end: jest.fn(),
    });

    const pending = controller.createReview(
      {} as Express.Multer.File,
      { language: 'zh', consent: 'true' },
      'admission',
      request as never,
      response as never,
    );
    await Promise.resolve();
    response.destroyed = true;
    response.emit('close');
    await pending;

    expect(workflow.settle).toHaveBeenCalledWith({
      reservationId: 'reservation-close',
      outcome: 'CANCELLED',
      actualWt: undefined,
    });
  });
});
