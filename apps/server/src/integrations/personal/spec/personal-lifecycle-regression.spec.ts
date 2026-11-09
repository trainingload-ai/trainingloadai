import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  PersonalConnectionService,
  defaultPersonalSettings,
} from '../personal-connection.service';
import { PersonalSyncService } from '../personal-sync.service';
import { PersonalWriteService } from '../personal-write.service';
import { personalAccountRef } from '../personal-identity';

const definition = {
  name: 'createSingleWorkout',
  inputSchema: {
    type: 'object',
    properties: { course: { type: 'object' } },
    required: ['course'],
  },
};
const settings = {
  ...defaultPersonalSettings,
  timezone: 'Asia/Shanghai',
  allowWrites: true,
};
/** Stateful persistence double: check lifecycle behavior across several public
 * calls instead of asserting the shape of a single Prisma invocation. */
function fixture() {
  let row: any = {
    id: 'c',
    userId: 'owner',
    provider: 'coros',
    externalAthleteId: 'athlete',
    status: 'ACTIVE',
    credentialFingerprint: 'original-generation',
    credentialCiphertext: 'sealed:{"accessToken":"fixture-token"}',
    credentialLast4: null,
    syncActivities: true,
    syncWellness: false,
    syncScheduledActivities: true,
    updatedAt: new Date(),
    metadata: {
      connectionMode: 'mcp',
      region: 'cn',
      settings,
      tools: [definition],
      fitQuotas: {},
    },
  };
  let jobs: any[] = [];
  const matches = (value: any, where: any): boolean =>
    Object.entries(where).every(([key, wanted]: any) => {
      if (key === 'userId_provider') return true;
      // structuredClone creates Dates outside Jest's VM realm.
      if (typeof wanted?.getTime === 'function')
        return value[key]?.getTime() === wanted.getTime();
      if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
        if (wanted.in) return wanted.in.includes(value[key]);
        if (wanted.equals !== undefined) return value[key] === wanted.equals;
      }
      return wanted instanceof Date
        ? value[key]?.getTime() === wanted.getTime()
        : value[key] === wanted;
    });
  const connections = {
    findUnique: jest
      .fn<any>()
      .mockImplementation(async () => structuredClone(row)),
    findUniqueOrThrow: jest
      .fn<any>()
      .mockImplementation(async () => structuredClone(row)),
    updateMany: jest
      .fn<any>()
      .mockImplementation(async ({ where, data }: any) => {
        if (!matches(row, where)) return { count: 0 };
        row = { ...row, ...structuredClone(data), updatedAt: new Date() };
        return { count: 1 };
      }),
  };
  const tasks = {
    findMany: jest
      .fn<any>()
      .mockImplementation(async () => jobs.map((j) => structuredClone(j))),
    findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => {
      const { connectionId, requestId } = where.connectionId_requestId;
      return (
        jobs.find(
          (j) => j.connectionId === connectionId && j.requestId === requestId,
        ) ?? null
      );
    }),
    upsert: jest
      .fn<any>()
      .mockImplementation(async ({ where, create }: any) => {
        const key = where.connectionId_dedupKey;
        const old = jobs.find(
          (j) =>
            j.connectionId === key.connectionId && j.dedupKey === key.dedupKey,
        );
        if (old) return structuredClone(old);
        const job = {
          id: `job-${jobs.length}`,
          createdAt: new Date(),
          ...structuredClone(create),
        };
        jobs.push(job);
        return structuredClone(job);
      }),
    updateMany: jest
      .fn<any>()
      .mockImplementation(async ({ where, data }: any) => {
        let count = 0;
        for (const job of jobs)
          if (matches(job, where)) {
            Object.assign(job, structuredClone(data));
            count++;
          }
        return { count };
      }),
  };
  const tx = {
    $executeRaw: jest.fn<any>().mockResolvedValue(1),
    externalProviderConnection: connections,
    personalProviderJob: tasks,
  };
  const db = {
    ...tx,
    $transaction: async (fn: any) => {
      const before = structuredClone({ row, jobs });
      try {
        return await fn(tx);
      } catch (error) {
        row = before.row;
        jobs = before.jobs;
        throw error;
      }
    },
  };
  const coros = {
    revoke: jest.fn<any>().mockResolvedValue(true),
    call: jest.fn<any>(),
  };
  const service = new PersonalConnectionService(
    db as never,
    {
      encrypt: (s: string) => `sealed:${s}`,
      decrypt: (s: string) => s.slice(7),
      last4: () => 'fake',
    } as never,
    {} as never,
    {} as never,
    coros as never,
  );
  const reauthorize = (region = 'cn', accountId = 'athlete') =>
    // The verified OAuth callback delegates to this persistence operation.
    (service as any).save(
      'owner',
      'coros',
      accountId,
      region,
      settings,
      { accessToken: 'fixture-token', refreshToken: 'fixture-refresh' },
      [definition],
      true,
      row.credentialFingerprint,
    );
  const sync = new PersonalSyncService(
    db as never,
    service,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    sync,
    coros,
    reauthorize,
    db,
    tasks,
    connections,
    row: () => row,
    jobs: () => jobs,
    setJobs: (values: any[]) => {
      jobs = values;
    },
  };
}
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('personal connection lifecycle regressions', () => {
  it('erases credentials but keeps sent receipts and content keys on disconnect', async () => {
    const f = fixture();
    f.setJobs([
      {
        id: 'sent',
        connectionId: 'c',
        kind: 'WRITE',
        status: 'RUNNING',
        dedupKey: 'sent-content',
        result: { sentAt: 'fixture-time', response: { id: 'remote' } },
      },
      {
        id: 'done',
        connectionId: 'c',
        kind: 'WRITE',
        status: 'SUCCEEDED',
        dedupKey: 'completed-content',
      },
      {
        id: 'queued',
        connectionId: 'c',
        kind: 'WRITE',
        status: 'QUEUED',
        dedupKey: 'not-sent',
      },
      { id: 'read', connectionId: 'c', kind: 'HEALTH', status: 'RUNNING' },
    ]);
    await f.service.disconnect('owner', 'coros');
    expect(f.row()).toMatchObject({
      status: 'DISCONNECTED',
      credentialCiphertext: '',
      syncActivities: false,
      syncScheduledActivities: false,
    });
    expect(f.jobs().find((j) => j.id === 'sent')).toMatchObject({
      status: 'UNKNOWN',
      dedupKey: 'sent-content',
      result: { response: { id: 'remote' } },
    });
    expect(f.jobs().find((j) => j.id === 'done')).toMatchObject({
      status: 'SUCCEEDED',
      dedupKey: 'completed-content',
    });
    expect(f.jobs().find((j) => j.id === 'queued')).toMatchObject({
      status: 'CANCELLED',
      dedupKey: null,
    });
    expect(f.jobs().find((j) => j.id === 'read').status).toBe('CANCELLED');
    expect(f.coros.revoke).toHaveBeenCalledTimes(1);
    const status = await f.service.status('owner', 'coros');
    expect(status.jobs.find((j) => j.id === 'sent')?.reconciling).toBe(false);
  });
  it.each(['SUCCEEDED', 'UNKNOWN'])(
    'deduplicates %s deliveries after disconnect and same-account reauthorization',
    async (status) => {
      const f = fixture();
      const writes = new PersonalWriteService(
        f.db as never,
        f.service,
        f.coros as never,
        {} as never,
      );
      const input = {
        tool: 'createSingleWorkout',
        args: { course: { name: 'Fixture course' } },
        requestId: '00000000-0000-4000-8000-000000000001',
      };
      const first = await writes.preview('owner', input);
      f.jobs()[0].status = status;
      const originalKey = f.jobs()[0].dedupKey;
      await f.service.disconnect('owner', 'coros');
      await f.reauthorize();
      const again = await writes.preview('owner', {
        ...input,
        requestId: '00000000-0000-4000-8000-000000000002',
      });
      expect(again).toMatchObject({ operationId: first.operationId, status });
      expect(f.jobs()).toHaveLength(1);
      expect(f.jobs()[0].dedupKey).toBe(originalKey);
      expect(f.coros.call).not.toHaveBeenCalled();
    },
  );
  it('uses a new authorization generation even when the replacement token is identical', async () => {
    const f = fixture();
    await f.reauthorize();
    const first = f.row().credentialFingerprint;
    await f.reauthorize();
    expect(f.row().credentialFingerprint).not.toBe(first);
  });
  it('keeps quota reservations when switching accounts or reconnecting', async () => {
    const f = fixture();
    await (f.sync as any).reserveCorosFile(f.row());
    const old = structuredClone(f.row().metadata.fitQuotas['cn:athlete']);
    await f.service.disconnect('owner', 'coros');
    await f.reauthorize('us', 'other');
    await (f.sync as any).reserveCorosFile(f.row());
    expect(f.row().metadata.fitQuotas['cn:athlete']).toEqual(old);
    expect(f.row().metadata.fitQuotas['us:other'].reservations).toHaveLength(1);
    await f.reauthorize();
    expect(f.row().metadata.fitQuotas['cn:athlete']).toEqual(old);
  });
  it('cannot reset an exhausted account quota by disconnecting and reauthorizing', async () => {
    const f = fixture();
    f.row().metadata.fitQuotas['cn:athlete'] = {
      reservations: Array(50).fill(Date.now()),
    };
    await f.service.disconnect('owner', 'coros');
    await f.reauthorize();
    await expect(
      (f.sync as any).reserveCorosFile(f.row()),
    ).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
  });
  it('does not reuse a delivery key for an equal vendor ID in a different region', async () => {
    const f = fixture();
    const writes = new PersonalWriteService(
      f.db as never,
      f.service,
      f.coros as never,
      {} as never,
    );
    const args = {
      tool: 'createSingleWorkout',
      args: { course: { name: 'Fixture course' } },
      requestId: '00000000-0000-4000-8000-000000000001',
    };
    const first = await writes.preview('owner', args);
    f.jobs()[0].status = 'SUCCEEDED';
    await f.reauthorize('us');
    const other = await writes.preview('owner', {
      ...args,
      requestId: '00000000-0000-4000-8000-000000000002',
    });
    expect(other.operationId).not.toBe(first.operationId);
    expect(other.status).toBe('PREVIEW');
    expect(f.jobs()[0].dedupKey).not.toBe(f.jobs()[1].dedupKey);
  });
  it('enforces a rolling 24-hour budget across the reset boundary', async () => {
    jest.useFakeTimers();
    const start = new Date('2026-11-01T00:00:00Z');
    jest.setSystemTime(start);
    const f = fixture();
    await (f.sync as any).reserveCorosFile(f.row());
    jest.setSystemTime(new Date(start.getTime() + 23 * 3600000));
    for (let i = 0; i < 49; i++)
      await (f.sync as any).reserveCorosFile(f.row());
    await expect(
      (f.sync as any).reserveCorosFile(f.row()),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryAfterMs: 3600000,
    });
    jest.setSystemTime(new Date(start.getTime() + 24 * 3600000));
    await (f.sync as any).reserveCorosFile(f.row());
    await expect(
      (f.sync as any).reserveCorosFile(f.row()),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryAfterMs: 23 * 3600000,
    });
  });
  it('rolls back connection changes when cancelling jobs fails', async () => {
    const f = fixture();
    f.tasks.updateMany.mockRejectedValueOnce(
      new Error('fixture database failure'),
    );
    await expect(f.service.disconnect('owner', 'coros')).rejects.toThrow(
      'fixture database failure',
    );
    expect(f.row()).toMatchObject({
      status: 'ACTIVE',
      credentialFingerprint: 'original-generation',
    });
    expect(f.row().credentialCiphertext).not.toBe('');
    expect(f.coros.revoke).not.toHaveBeenCalled();
  });
  it('separates equal vendor IDs in different regions', () => {
    const f = fixture(),
      cn = personalAccountRef(f.row());
    expect(
      personalAccountRef({
        ...f.row(),
        metadata: { ...f.row().metadata, region: 'us' },
      }),
    ).not.toBe(cn);
  });
});
