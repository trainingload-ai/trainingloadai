import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import {
  isPrismaSerializableConflict,
  MAX_SERIALIZABLE_ATTEMPTS,
  serializableRetryDelayMs,
  withSerializableRetry,
} from '../prisma-transaction-errors';

function serializationFailure() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
    {
      code: 'P2034',
      clientVersion: 'test',
    },
  );
}

function rawQuerySerializationFailure() {
  return new Prisma.PrismaClientKnownRequestError(
    'Raw query failed. Code: `40001`',
    {
      code: 'P2010',
      clientVersion: 'test',
      meta: { code: '40001' },
    },
  );
}

describe('isPrismaSerializableConflict', () => {
  it('accepts Prisma P2034 and PostgreSQL 40001 shapes', () => {
    expect(isPrismaSerializableConflict(serializationFailure())).toBe(true);
    expect(isPrismaSerializableConflict({ code: '40001' })).toBe(true);
    expect(isPrismaSerializableConflict(rawQuerySerializationFailure())).toBe(
      true,
    );
  });

  it('rejects unrelated Prisma and generic errors', () => {
    expect(isPrismaSerializableConflict({ code: 'P2002' })).toBe(false);
    expect(
      isPrismaSerializableConflict({ code: 'P2010', meta: { code: 'P2010' } }),
    ).toBe(false);
    expect(isPrismaSerializableConflict(new Error('upsert failed'))).toBe(
      false,
    );
    expect(isPrismaSerializableConflict(null)).toBe(false);
  });
});

describe('serializableRetryDelayMs', () => {
  it('stays within a small backoff window', () => {
    for (const attempt of [1, 2, 3]) {
      const delay = serializableRetryDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(20);
      expect(delay).toBeLessThan(100);
    }
  });
});

describe('withSerializableRetry', () => {
  it('retries a P2034 conflict and returns the later success', async () => {
    const wait = jest.fn(async () => undefined);
    const work = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(serializationFailure())
      .mockResolvedValueOnce('ok');

    await expect(withSerializableRetry(work, { wait })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(1);
  });

  it('retries a raw-query 40001 wrapped as P2010', async () => {
    const wait = jest.fn(async () => undefined);
    const work = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rawQuerySerializationFailure())
      .mockResolvedValueOnce('ok');

    await expect(withSerializableRetry(work, { wait })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-conflict errors', async () => {
    const wait = jest.fn(async () => undefined);
    const error = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const work = jest.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withSerializableRetry(work, { wait })).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('rethrows the original Prisma conflict after the attempt budget', async () => {
    const wait = jest.fn(async () => undefined);
    const error = serializationFailure();
    const work = jest.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withSerializableRetry(work, { wait })).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(MAX_SERIALIZABLE_ATTEMPTS);
    expect(wait).toHaveBeenCalledTimes(MAX_SERIALIZABLE_ATTEMPTS - 1);
  });
});
