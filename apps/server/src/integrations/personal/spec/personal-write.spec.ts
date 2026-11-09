import { describe, expect, it, jest } from '@jest/globals';
import {
  PersonalWriteService,
  personalRequestHash,
} from '../personal-write.service';

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
  externalAthleteId: 'athlete',
  credentialFingerprint: 'credential-version',
  metadata: { region: 'us', settings: { allowWrites: true, timezone: 'UTC' } },
};
function harness() {
  const jobs = {
    findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'operation',
      status: 'PREVIEW',
      createdAt: new Date(),
    }),
    updateMany: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ count: 1 }),
  };
  const connections = {
    require: jest.fn<() => Promise<unknown>>().mockResolvedValue(connection),
    tools: () => [definition],
    credential: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ token: 'fixture-token' }),
    readCoros: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ workoutId: 'remote' }),
  };
  const coros = {
    call: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ workoutId: 'remote' }),
  };
  const prisma = {
    personalProviderJob: jobs,
    externalProviderConnection: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    $transaction: async (fn: any) =>
      fn({
        externalProviderConnection: {
          findUnique: jest.fn<any>().mockResolvedValue(null),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        },
        personalProviderJob: jobs,
      }),
  };
  const service = new PersonalWriteService(
    prisma as never,
    { model: (tx?: any) => (tx ?? prisma).externalProviderConnection } as never,
    connections as never,
    coros as never,
    {} as never,
  );
  return { jobs, connections, coros, service };
}
describe('confirmed COROS delivery', () => {
  it('persists a preview without issuing a remote write', async () => {
    const { service, coros, jobs } = harness();
    const result = await service.preview('owner', {
      tool: 'createSingleWorkout',
      args: { course: { name: 'Local workout' } },
      requestId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.status).toBe('PREVIEW');
    expect(coros.call).not.toHaveBeenCalled();
    expect(jobs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'PREVIEW' }),
      }),
    );
  });
  it('requires explicit confirmation and binds the exact preview hash', async () => {
    const { service, jobs } = harness();
    await expect(
      service.confirm('owner', 'operation', {
        confirmed: false,
        hash: 'a'.repeat(64),
      }),
    ).rejects.toThrow('PROVIDER_CONFIRMATION_REQUIRED');
    expect(jobs.updateMany).not.toHaveBeenCalled();
  });
  it('never automatically retries a timed out write', async () => {
    const { service, jobs, coros } = harness();
    coros.call.mockRejectedValue(new Error('timeout after remote acceptance'));
    await service.run(
      {
        id: 'operation',
        leaseUntil: new Date(),
        payload: {
          tool: 'createSingleWorkout',
          args: { course: {} },
          credentialVersion: connection.credentialFingerprint,
          schemaHash: personalRequestHash(definition),
        },
      } as never,
      connection as never,
    );
    expect(coros.call).toHaveBeenCalledTimes(1);
    expect(jobs.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'UNKNOWN',
          errorCode: 'PROVIDER_RESULT_UNKNOWN',
        }),
      }),
    );
  });
  it('requires read-back evidence before reporting success', async () => {
    const { service, jobs, connections } = harness();
    connections.readCoros.mockRejectedValue(new Error('read-back unavailable'));
    await service.run(
      {
        id: 'operation',
        leaseUntil: new Date(),
        payload: {
          tool: 'createSingleWorkout',
          args: { course: {} },
          credentialVersion: connection.credentialFingerprint,
          schemaHash: personalRequestHash(definition),
        },
      } as never,
      connection as never,
    );
    expect(jobs.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'UNKNOWN' }),
      }),
    );
  });
});
