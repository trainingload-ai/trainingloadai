import { describe, expect, it, jest } from '@jest/globals';
import {
  PersonalWriteService,
  personalRequestHash,
} from '../personal-write.service';
import { corosHealthCandidates } from '../../coros-mcp/coros-health.mapper';
import { verifyCorosWrite } from '../../coros-mcp/coros-result-verification';

const course = {
  name: 'Fixture workout',
  sections: [{ duration: 600, target: { unit: 'bpm', low: 120, high: 135 } }],
};
const definition = {
  name: 'createSingleWorkout',
  inputSchema: {
    type: 'object',
    properties: { course: { type: 'object' } },
    required: ['course'],
    additionalProperties: false,
  },
};
const connection = {
  id: 'c',
  userId: 'owner',
  status: 'ACTIVE',
  externalAthleteId: 'athlete',
  credentialFingerprint: 'v1',
  metadata: {
    region: 'cn',
    settings: { allowWrites: true, timezone: 'Asia/Shanghai' },
  },
};
function harness() {
  const jobs = {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    upsert: jest.fn<any>().mockResolvedValue({
      id: 'op',
      status: 'PREVIEW',
      createdAt: new Date(),
    }),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    personalProviderJob: jobs,
    $executeRaw: jest.fn<any>().mockResolvedValue(1),
    externalProviderConnection: {
      findUnique: jest.fn<any>().mockResolvedValue(connection),
    },
  };
  const db = {
    personalProviderJob: jobs,
    $transaction: async (work: any) => work(tx),
  };
  const connections = {
    require: jest.fn<any>().mockResolvedValue(connection),
    tools: () => [definition],
    credential: jest
      .fn<any>()
      .mockResolvedValue({ connection, token: 'fixture-token' }),
    readCoros: jest
      .fn<any>()
      .mockResolvedValue({ workoutId: 'remote', course }),
  };
  const coros = {
    call: jest.fn<any>().mockResolvedValue({ workoutId: 'remote' }),
  };
  const plans = {
    findLocalWorkout: jest.fn<any>().mockResolvedValue({
      id: 'local',
      revision: 4,
      name: 'Fixture workout',
      text: '600s',
      steps: [],
    }),
    recordVerifiedDelivery: jest.fn<any>().mockResolvedValue({}),
  };
  const service = new PersonalWriteService(
    db as never,
    connections as never,
    coros as never,
    plans as never,
  );
  const job = {
    id: 'op',
    attempts: 1,
    status: 'RUNNING',
    leaseUntil: new Date(Date.now() + 60_000),
    payload: {
      tool: 'createSingleWorkout',
      args: { course },
      credentialVersion: 'v1',
      schemaHash: personalRequestHash(definition),
    },
    result: { response: { workoutId: 'remote' } },
  };
  return { jobs, connections, coros, plans, service, job, tx };
}
describe('COROS consistency boundaries', () => {
  it.each(['DISCONNECTED', 'OTHER_REGION'])(
    'does not commit success if the connection becomes %s before the receipt transaction',
    async (state) => {
      const h = harness();
      h.tx.externalProviderConnection.findUnique.mockResolvedValue(
        state === 'DISCONNECTED'
          ? { ...connection, status: state }
          : {
              ...connection,
              metadata: { ...connection.metadata, region: 'us' },
            },
      );
      await h.service.reconcile(h.job as never, connection as never);
      expect(h.jobs.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      expect(h.plans.recordVerifiedDelivery).not.toHaveBeenCalled();
      expect(h.coros.call).not.toHaveBeenCalled();
    },
  );
  it('does not reconcile an equal vendor ID against another region', async () => {
    const h = harness();
    h.job.payload['accountRef'] = 'cn:athlete';
    await h.service.reconcile(
      h.job as never,
      {
        ...connection,
        credentialFingerprint: 'new',
        metadata: { ...connection.metadata, region: 'us' },
      } as never,
    );
    expect(h.connections.readCoros).not.toHaveBeenCalled();
    expect(h.coros.call).not.toHaveBeenCalled();
  });
  it('rechecks write permission after obtaining the dispatch credential', async () => {
    const h = harness();
    h.connections.credential.mockResolvedValue({
      token: 'fixture-token',
      connection: {
        ...connection,
        metadata: {
          ...connection.metadata,
          settings: { ...connection.metadata.settings, allowWrites: false },
        },
      },
    });
    await expect(
      h.service.run(h.job as never, connection as never),
    ).rejects.toThrow('PROVIDER_CONNECTION_CHANGED');
    expect(h.coros.call).not.toHaveBeenCalled();
  });
  it('can reconcile after reauthorization of the same account without resending', async () => {
    const h = harness();
    h.job.payload['accountId'] = 'athlete';
    h.job.payload['accountRef'] = 'cn:athlete';
    await h.service.reconcile(
      h.job as never,
      { ...connection, credentialFingerprint: 'new-authorization' } as never,
    );
    expect(h.coros.call).not.toHaveBeenCalled();
    expect(h.connections.readCoros).toHaveBeenCalled();
    expect(h.jobs.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });
  it('never reconciles an old delivery against a different COROS account', async () => {
    const h = harness();
    h.job.payload['accountId'] = 'old-athlete';
    h.job.payload['accountRef'] = 'cn:old-athlete';
    await h.service.reconcile(
      h.job as never,
      { ...connection, credentialFingerprint: 'new-authorization' } as never,
    );
    expect(h.coros.call).not.toHaveBeenCalled();
    expect(h.connections.readCoros).not.toHaveBeenCalled();
  });
  it('does not send when its lease was cancelled before dispatch', async () => {
    const h = harness();
    h.jobs.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      h.service.run(h.job as never, connection as never),
    ).rejects.toThrow('PROVIDER_LEASE_LOST');
    expect(h.coros.call).not.toHaveBeenCalled();
  });
  it('requires every requested training field to match read-back', () => {
    expect(() =>
      verifyCorosWrite(
        'createSingleWorkout',
        { course },
        { workoutId: 'remote', course },
      ),
    ).not.toThrow();
    expect(() =>
      verifyCorosWrite(
        'createSingleWorkout',
        { course },
        {
          workoutId: 'remote',
          course: {
            ...course,
            sections: [
              { duration: 600, target: { unit: 'bpm', low: 120, high: 140 } },
            ],
          },
        },
      ),
    ).toThrow('PROVIDER_READBACK_MISMATCH');
    expect(() =>
      verifyCorosWrite(
        'createSingleWorkout',
        { course },
        { workoutId: 'remote' },
      ),
    ).toThrow('PROVIDER_READBACK_MISMATCH');
  });
  it('checks date and identity when reconciling a scheduled library workout', () => {
    expect(() =>
      verifyCorosWrite(
        'scheduleWorkout',
        { date: '20261101', workoutId: 'a' },
        { data: [{ date: '20261101', workoutId: 'a' }] },
      ),
    ).not.toThrow();
    expect(() =>
      verifyCorosWrite(
        'scheduleWorkout',
        { date: '20261101', workoutId: 'a' },
        { data: [{ date: '20261102', workoutId: 'a' }] },
      ),
    ).toThrow('PROVIDER_READBACK_MISMATCH');
  });
  it('reconciles UNKNOWN by reads without sending a second create', async () => {
    const h = harness();
    await h.service.reconcile(h.job as never, connection as never);
    expect(h.coros.call).not.toHaveBeenCalled();
    expect(h.jobs.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });
  it('keeps a mismatched remote result UNKNOWN', async () => {
    const h = harness();
    h.connections.readCoros.mockResolvedValue({
      workoutId: 'remote',
      course: { name: 'Different' },
    });
    await h.service.reconcile(h.job as never, connection as never);
    expect(h.coros.call).not.toHaveBeenCalled();
    expect(h.jobs.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'UNKNOWN',
          errorCode: 'PROVIDER_READBACK_MISMATCH',
        }),
      }),
    );
  });
  it('uses one content key for different request UUIDs', async () => {
    const h = harness();
    for (const requestId of [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
      await h.service.preview('owner', {
        tool: 'createSingleWorkout',
        args: { course },
        requestId,
      });
    const [a, b] = h.jobs.upsert.mock.calls.map((call: any) => call[0]);
    expect(a.where.connectionId_dedupKey).toEqual(
      b.where.connectionId_dedupKey,
    );
    expect(a.create.requestId).not.toBe(b.create.requestId);
  });
  it('persists a local revision mapping only after exact read-back', async () => {
    const h = harness();
    h.job.payload['localWorkout'] = {
      id: 'local',
      revision: 4,
      checksum: personalRequestHash({
        name: 'Fixture workout',
        text: '600s',
        steps: [],
        revision: 4,
      }),
    };
    await h.service.run(h.job as never, connection as never);
    expect(h.plans.recordVerifiedDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        workoutId: 'local',
        revision: 4,
        externalId: 'library:remote',
      }),
      expect.anything(),
    );
  });
  it('rejects a stale local revision before any remote write', async () => {
    const h = harness();
    h.job.payload['localWorkout'] = {
      id: 'local',
      revision: 3,
      checksum: 'snapshot',
    };
    await expect(
      h.service.run(h.job as never, connection as never),
    ).rejects.toThrow('PROVIDER_LOCAL_WORKOUT_CHANGED');
    expect(h.coros.call).not.toHaveBeenCalled();
  });
});

describe('COROS health projection', () => {
  const args = {
    day: '2026-11-01',
    timezone: 'Asia/Shanghai',
    accountId: 'a',
    connectionId: 'c',
    sourceObjectId: 'source',
  };
  it('projects dated, unit-explicit facts with durable source identity', () => {
    const result = corosHealthCandidates({
      ...args,
      snapshot: {
        daily: {
          date: '20261101',
          steps: 1200,
          restingHeartRate: { value: 51, unit: 'bpm' },
          sleepTimeSeconds: 24000,
          rmssdMs: 42,
        },
      },
    });
    expect(result.candidates.map((v) => [v.metricType, v.value])).toEqual(
      expect.arrayContaining([
        ['STEP_COUNT', 1200],
        ['RESTING_HEART_RATE_BPM', 51],
        ['SLEEP_ASLEEP_SECONDS', 24000],
        ['HRV_RMSSD_MS', 42],
      ]),
    );
    expect(
      result.candidates.every(
        (v) =>
          v.sourceObjectId === 'source' &&
          v.startTime.toISOString() === '2026-10-31T16:00:00.000Z',
      ),
    ).toBe(true);
  });
  it('never guesses the date or the unit of a sleep duration', () => {
    expect(() =>
      corosHealthCandidates({ ...args, snapshot: { daily: { steps: 10 } } }),
    ).toThrow('PROVIDER_HEALTH_DATE_MISSING');
    expect(() =>
      corosHealthCandidates({
        ...args,
        snapshot: {
          daily: {
            date: '20261101',
            sleepDuration: { value: 7, unit: 'hours' },
          },
        },
      }),
    ).toThrow('PROVIDER_HEALTH_UNIT_UNSUPPORTED');
  });
  it('keeps missing values absent and excludes other local days and untyped HRV', () => {
    const result = corosHealthCandidates({
      ...args,
      snapshot: {
        daily: {
          days: [
            { date: '20261031', steps: 123 },
            { date: '20261101', steps: null, hrv: 53 },
          ],
        },
      },
    });
    expect(result.candidates).toEqual([]);
    expect(result.managedMetricTypes).toEqual(['STEP_COUNT']);
  });
});
