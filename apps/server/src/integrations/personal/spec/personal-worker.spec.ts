import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { PersonalWorkerService } from '../personal-worker.service';
import { PersonalProviderError } from '../personal-errors';
afterEach(() => jest.restoreAllMocks());

describe('personal delivery worker recovery', () => {
  it('defers pending work for only the limited authorization without shortening later waits', async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      DEPLOYMENT_MODE: 'self-host',
      SELF_HOST_MODE: 'core-local',
    });
    const job = {
      id: 'read',
      kind: 'HEALTH',
      connectionId: 'connection',
      attempts: 1,
      payload: { credentialVersion: 'version' },
      leaseUntil: new Date(Date.now() + 600000),
    };
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const query = jest
      .fn<any>()
      .mockResolvedValue([{ id: 'read', reconcile: false }]);
    const worker = new PersonalWorkerService(
      {
        personalProviderJob: { updateMany, findUnique: async () => job },
        externalProviderConnection: {
          findUnique: async () => ({
            id: 'connection',
            provider: 'garmin',
            metadata: { connectionMode: 'personal_api' },
          }),
          updateMany: async () => ({ count: 1 }),
        },
        $queryRaw: query,
      } as never,
      {
        run: async () => {
          throw new PersonalProviderError('PROVIDER_RATE_LIMITED', 120000, 429);
        },
      } as never,
      {} as never,
    );
    await worker.tick();
    const delayed = updateMany.mock.calls
      .map(([args]: any) => args)
      .find((args: any) => args.where.connectionId === 'connection');
    expect(delayed).toMatchObject({
      where: {
        connection: { credentialFingerprint: 'version' },
        status: { in: ['QUEUED', 'WAITING'] },
        nextAttemptAt: { lt: expect.any(Date) },
      },
      data: { nextAttemptAt: expect.any(Date) },
    });
    expect(delayed.where.nextAttemptAt.lt).toEqual(delayed.data.nextAttemptAt);
    expect(String(query.mock.calls[0][0])).toContain(
      "limited.error_code='PROVIDER_RATE_LIMITED'",
    );
  });
  it('dispatches a recovered UNKNOWN operation only to the read-only reconciler', async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      SELF_HOST_MODE: 'core-local',
    });
    const job = {
      id: 'operation',
      kind: 'WRITE',
      connectionId: 'connection',
      payload: {},
      result: {},
      leaseUntil: new Date(Date.now() + 60000),
    };
    const connection = {
      id: 'connection',
      provider: 'coros',
      metadata: { connectionMode: 'mcp' },
    };
    const db = {
      personalProviderJob: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn<any>().mockResolvedValue(job),
      },
      externalProviderConnection: {
        findUnique: jest.fn<any>().mockResolvedValue(connection),
      },
      $queryRaw: jest
        .fn<any>()
        .mockResolvedValue([{ id: 'operation', reconcile: true }]),
    };
    const writes = {
      run: jest.fn<any>(),
      reconcile: jest.fn<any>().mockResolvedValue(undefined),
    };
    const worker = new PersonalWorkerService(
      db as never,
      {} as never,
      writes as never,
    );
    await worker.tick();
    expect(writes.reconcile).toHaveBeenCalledWith(job, connection);
    expect(writes.run).not.toHaveBeenCalled();
  });
  it('never starts a timer, queries jobs, or schedules personal sync in Cloud', async () => {
    const env = { ...process.env, DEPLOYMENT_MODE: 'cloud' };
    delete env.SELF_HOST_MODE;
    jest.replaceProperty(process, 'env', env);
    const query = jest.fn<any>(),
      schedule = jest.fn<any>();
    const interval = jest.spyOn(globalThis, 'setInterval');
    const worker = new PersonalWorkerService(
      { $queryRaw: query } as never,
      { schedule } as never,
      {} as never,
    );
    worker.onModuleInit();
    await worker.run();
    await worker.tick();
    worker.onModuleDestroy();
    expect(interval).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('personal ACTIVITY download retries', () => {
  it('fail-forwards ACTIVITY PROVIDER_REQUEST_FAILED after one retry instead of thrashing', async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      DEPLOYMENT_MODE: 'self-host',
      SELF_HOST_MODE: 'core-local',
    });
    const job = {
      id: 'activity',
      kind: 'ACTIVITY',
      connectionId: 'connection',
      attempts: 2,
      payload: { credentialVersion: 'version', id: 'act-1' },
      result: {},
      leaseUntil: new Date(Date.now() + 600000),
    };
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const query = jest
      .fn<any>()
      .mockResolvedValue([{ id: 'activity', reconcile: false }]);
    const worker = new PersonalWorkerService(
      {
        personalProviderJob: { updateMany, findUnique: async () => job },
        externalProviderConnection: {
          findUnique: async () => ({
            id: 'connection',
            provider: 'garmin',
            metadata: { connectionMode: 'personal_api' },
          }),
          updateMany: async () => ({ count: 1 }),
        },
        $queryRaw: query,
      } as never,
      {
        run: async () => {
          throw new PersonalProviderError('PROVIDER_REQUEST_FAILED');
        },
      } as never,
      {} as never,
    );
    await worker.tick();
    const failed = updateMany.mock.calls
      .map(([args]: any) => args)
      .find((args: any) => args.data?.status === 'FAILED');
    expect(failed).toMatchObject({
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: 'PROVIDER_REQUEST_FAILED',
      }),
    });
  });
});
