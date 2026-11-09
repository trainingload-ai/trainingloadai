import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { createHash } from 'crypto';
import { PersonalSyncService } from '../personal-sync.service';

const connection = {
  id: 'c',
  userId: 'owner',
  provider: 'coros',
  externalAthleteId: 'acct',
  credentialFingerprint: 'v1',
  metadata: {
    connectionMode: 'mcp',
    region: 'cn',
    settings: { timezone: 'Asia/Shanghai' },
    tools: [
      {
        name: 'querySportRecords',
        inputSchema: {
          properties: { limit: { type: 'integer', maximum: 80 } },
        },
      },
    ],
  },
};
function harness() {
  const jobs = {
    findMany: jest.fn<any>().mockResolvedValue([]),
    findUnique: jest.fn<any>().mockResolvedValue(null),
    create: jest.fn<any>().mockImplementation(async (args: any) => ({
      id: args.data.requestId,
      ...args.data,
    })),
    update: jest.fn<any>().mockResolvedValue({}),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
  };
  const source = {
    upsert: jest.fn<any>().mockResolvedValue({ id: 'durable-health' }),
  };
  const connections = {
    tools: (row: any) => row.metadata.tools,
    readCoros: jest.fn<any>().mockResolvedValue([]),
    require: jest.fn<any>().mockResolvedValue(connection),
    resolveAccountTimezone: jest.fn<any>().mockResolvedValue('Asia/Shanghai'),
  };
  const health = {
    replaceProviderDailyCandidates: jest
      .fn<any>()
      .mockResolvedValue({ sampleCount: 1 }),
  };
  const lifecycle = {
    deactivateProviderData: jest.fn<any>().mockResolvedValue({}),
  };
  const service = new PersonalSyncService(
    { personalProviderJob: jobs, importSourceObject: source } as never,
    connections as never,
    {} as never,
    {} as never,
    {} as never,
    health as never,
    {} as never,
    lifecycle as never,
    { upsertImportedZoneSetting: jest.fn<any>().mockResolvedValue({}) } as never,
  );
  const parent = {
    id: 'sync',
    kind: 'SYNC',
    leaseUntil: new Date('2026-11-01T05:00:00Z'),
    payload: {
      credentialVersion: 'v1',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      settings: { timezone: 'Asia/Shanghai' },
    },
    result: {
      cursor: '2026-11-01',
      activityDone: false,
      healthDone: true,
      childIds: [],
    },
  };
  return { jobs, source, connections, health, lifecycle, service, parent };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T04:00:00Z'));
});
afterEach(() => jest.useRealTimers());
describe('COROS source reconciliation', () => {
  it('expands a saturated day using the live maximum before declaring completeness', async () => {
    const h = harness();
    const records = Array.from({ length: 21 }, (_, i) => ({
      labelId: String(i),
      sportType: 1,
    }));
    h.connections.readCoros
      .mockResolvedValueOnce(records.slice(0, 20))
      .mockResolvedValueOnce(records);
    await h.service.run(h.parent as never, connection as never);
    expect(
      h.connections.readCoros.mock.calls.map((call: any) => call[2].limit),
    ).toEqual([20, 40]);
    expect(h.jobs.create).toHaveBeenCalledTimes(21);
  });
  it('does not infer deletion from a saturated, incomplete response', async () => {
    const h = harness(),
      limited = {
        ...connection,
        metadata: {
          ...connection.metadata,
          tools: [
            {
              name: 'querySportRecords',
              inputSchema: {
                properties: { limit: { type: 'integer', maximum: 20 } },
              },
            },
          ],
        },
      };
    h.connections.readCoros.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        labelId: String(i),
        sportType: 1,
      })),
    );
    await expect(
      h.service.run(h.parent as never, limited as never),
    ).rejects.toThrow('PROVIDER_WINDOW_INCOMPLETE');
    expect(h.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
  });
  it('requires two complete observations and scopes removal to this account source', async () => {
    const h = harness();
    h.jobs.findMany.mockResolvedValue([
      {
        id: 'old',
        status: 'SUCCEEDED',
        payload: { id: 'activity', day: '2026-11-01' },
        result: { missingSince: '2026-11-01T03:00:00Z' },
      },
    ]);
    await h.service.run(h.parent as never, connection as never);
    expect(h.lifecycle.deactivateProviderData).toHaveBeenCalledWith({
      userId: 'owner',
      provider: 'coros',
      externalIds: ['activity'],
      sourceUids: ['coros:cn:acct:activity'],
    });
  });
  it('keeps a first missing observation reversible without deleting an activity', async () => {
    const h = harness();
    h.jobs.findMany.mockResolvedValue([
      {
        id: 'old',
        status: 'SUCCEEDED',
        payload: { id: 'activity', day: '2026-11-01' },
        result: {},
      },
    ]);
    await h.service.run(h.parent as never, connection as never);
    expect(h.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
    expect(h.jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            missingSince: '2026-11-01T04:00:00.000Z',
          }),
        }),
      }),
    );
  });
  it('invalidates a changed remote detail cache before re-importing the stable source', async () => {
    const h = harness();
    h.connections.readCoros.mockResolvedValue({ distance: 1200 });
    const job = {
      id: 'activity-job',
      kind: 'ACTIVITY',
      leaseUntil: h.parent.leaseUntil,
      payload: { id: 'a', sportType: 1 },
      result: {
        remoteHash: 'old',
        imported: 1,
        batchId: 'old-batch',
        validateRemote: true,
      },
    };
    await h.service.run(job as never, connection as never);
    expect(h.jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'WAITING',
          result: {
            remoteHash: createHash('sha256')
              .update(
                JSON.stringify({ detail: { distance: 1200 }, title: null }),
              )
              .digest('hex'),
            remoteDetail: { distance: 1200 },
            detailChanged: true,
            validateRemote: false,
          },
        }),
      }),
    );
  });
});
describe('durable COROS health facts', () => {
  it('saves the source outside the task and uses the unified authoritative projector', async () => {
    const h = harness();
    h.connections.readCoros.mockResolvedValue({ date: '20261101', steps: 500 });
    const configured = {
      ...connection,
      metadata: {
        ...connection.metadata,
        tools: [{ name: 'queryDailyHealthData' }],
      },
    };
    await h.service.run(
      {
        id: 'health',
        kind: 'HEALTH',
        payload: { day: '2026-11-01', timezone: 'Asia/Shanghai' },
        result: {},
        leaseUntil: h.parent.leaseUntil,
      } as never,
      configured as never,
    );
    expect(h.source.upsert).toHaveBeenCalled();
    expect(h.health.replaceProviderDailyCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'COROS',
        managedMetricTypes: ['STEP_COUNT'],
        candidates: [
          expect.objectContaining({
            sourceObjectId: 'durable-health',
            value: 500,
          }),
        ],
      }),
    );
  });
  it('retains unsupported raw fields while refusing to report projected metrics', async () => {
    const h = harness();
    h.connections.readCoros.mockResolvedValue({
      date: '20261101',
      untypedSleep: 7,
    });
    const configured = {
      ...connection,
      metadata: {
        ...connection.metadata,
        tools: [{ name: 'queryDailyHealthData' }],
      },
    };
    await expect(
      h.service.run(
        {
          id: 'health',
          kind: 'HEALTH',
          payload: { day: '2026-11-01', timezone: 'Asia/Shanghai' },
          result: {},
          leaseUntil: h.parent.leaseUntil,
        } as never,
        configured as never,
      ),
    ).rejects.toThrow('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    expect(h.source.upsert).toHaveBeenCalled();
    expect(h.health.replaceProviderDailyCandidates).not.toHaveBeenCalled();
  });
});

describe('serial FIT downloads', () => {
  it('parks discovered ACTIVITY children and releases only one claimable slot', async () => {
    const h = harness();
    const created: any[] = [];
    h.jobs.create.mockImplementation(async (args: any) => {
      const row = {
        id: args.data.requestId,
        status: args.data.status,
        result: args.data.result,
        createdAt: new Date(`2026-11-01T04:00:0${created.length}Z`),
        ...args.data,
      };
      created.push(row);
      return row;
    });
    h.jobs.findMany.mockImplementation(async (args: any) => {
      const ids: string[] | undefined = args?.where?.id?.in;
      if (!ids) return [];
      return created
        .filter((row) => ids.includes(row.id))
        .map((row) => ({
          id: row.id,
          status: row.status,
          result: row.result,
          createdAt: row.createdAt,
          errorCode: null,
          kind: 'ACTIVITY',
        }));
    });
    h.jobs.updateMany.mockImplementation(async (args: any) => {
      const row = created.find((item) => item.id === args.where?.id);
      if (row) {
        Object.assign(row, args.data);
        if (args.data?.result) row.result = args.data.result;
        return { count: 1 };
      }
      // Parent SYNC checkpoint / other lease updates.
      return { count: 1 };
    });
    h.connections.readCoros.mockResolvedValue([
      { labelId: 'a', sportType: 1 },
      { labelId: 'b', sportType: 1 },
      { labelId: 'c', sportType: 1 },
    ]);
    await h.service.run(h.parent as never, connection as never);
    expect(h.jobs.create).toHaveBeenCalledTimes(3);
    for (const call of h.jobs.create.mock.calls) {
      expect(call[0].data).toMatchObject({
        status: 'WAITING',
        result: { serialHeld: true },
      });
    }
    expect(h.jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          result: expect.objectContaining({ serialHeld: false }),
        }),
      }),
    );
    const released = h.jobs.updateMany.mock.calls.filter(
      ([args]: any) => args.data?.status === 'QUEUED',
    );
    expect(released).toHaveLength(1);
  });
});
