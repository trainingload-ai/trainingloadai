import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import { SensorDataService } from '@/sensor/sensor-data.service';
import type { MetricsContext } from '../metrics/context';
import { RecordsBootstrapTask } from '../metrics/tasks/records-bootstrap.task';

describe('RecordsBootstrapTask transaction failure', () => {
  it('propagates the first database error so the whole commit can retry', async () => {
    const conflict = Object.assign(new Error('serialization failure'), {
      code: 'P2010',
      meta: { code: '40001' },
    });
    const execute = jest
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(1);
    const task = new RecordsBootstrapTask(
      {} as SensorDataService,
      {} as PrismaService,
    );
    const context = {
      inputs: { activity: { id: 42 }, userId: 'user-1' },
      cache: { sampleSec: 1 },
      outputs: {},
      errors: {},
      persistenceTx: {
        $executeRaw: execute,
      } as unknown as Prisma.TransactionClient,
    } as MetricsContext;

    const result = await withSerializableRetry(() => task.post(context), {
      wait: async () => {},
    });

    expect(result).toBe(context);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('also rolls back non-retryable statement failures instead of continuing an aborted transaction', async () => {
    const failure = Object.assign(new Error('constraint violation'), {
      code: 'P2003',
    });
    const execute = jest.fn<() => Promise<number>>().mockRejectedValue(failure);
    const task = new RecordsBootstrapTask(
      {} as SensorDataService,
      {} as PrismaService,
    );
    const context = {
      inputs: { activity: { id: 42 }, userId: 'user-1' },
      cache: { sampleSec: 1 },
      outputs: {},
      errors: {},
      persistenceTx: {
        $executeRaw: execute,
      } as unknown as Prisma.TransactionClient,
    } as MetricsContext;

    await expect(
      withSerializableRetry(() => task.post(context), {
        wait: async () => {},
      }),
    ).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
