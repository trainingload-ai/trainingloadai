import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { getUniqueDates, processDatesWithRetry } from '../date.util';

describe('date util', () => {
  it('returns one sorted date per calendar day, keeping the latest input for duplicates', () => {
    const dates = [
      new Date('2026-06-30T01:00:00.000Z'),
      new Date('2026-06-29T01:00:00.000Z'),
      new Date('2026-06-29T12:00:00.000Z'),
    ];

    expect(getUniqueDates(dates).map((date) => date.toISOString())).toEqual([
      '2026-06-29T12:00:00.000Z',
      '2026-06-30T01:00:00.000Z',
    ]);
  });

  it('processes dates with retry and progress callbacks', async () => {
    jest.useFakeTimers();
    const attempts = new Map<string, number>();
    const progress: unknown[] = [];

    const promise = processDatesWithRetry(
      [new Date('2026-06-29T00:00:00.000Z')],
      async (date) => {
        const key = date.toISOString();
        const next = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, next);
        if (next === 1) {
          throw new Error('temporary');
        }
      },
      {
        maxRetries: 1,
        onProgress: (info) => progress.push(info),
      },
    );

    await jest.advanceTimersByTimeAsync(200);
    await promise;
    jest.useRealTimers();

    expect(attempts.get('2026-06-29T00:00:00.000Z')).toBe(2);
    expect(progress).toEqual([
      expect.objectContaining({
        completed: 1,
        total: 1,
        success: true,
        attempt: 2,
      }),
    ]);
  });

  it('reports failure after max retries are exhausted', async () => {
    jest.useFakeTimers();
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const progress: unknown[] = [];
    const error = new Error('still down');

    const promise = processDatesWithRetry(
      [new Date('2026-06-29T00:00:00.000Z')],
      async () => {
        throw error;
      },
      {
        maxRetries: 1,
        onProgress: (info) => progress.push(info),
      },
    );

    try {
      await jest.advanceTimersByTimeAsync(200);
      await promise;

      expect(progress).toEqual([
        expect.objectContaining({
          completed: 1,
          total: 1,
          success: false,
          attempt: 2,
          error,
        }),
      ]);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('still down'),
      );
    } finally {
      jest.useRealTimers();
      loggerSpy.mockRestore();
    }
  });

  it('respects the configured concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;

    await processDatesWithRetry(
      [
        new Date('2026-06-29T00:00:00.000Z'),
        new Date('2026-06-30T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      ],
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
      },
      { concurrency: 2 },
    );

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
