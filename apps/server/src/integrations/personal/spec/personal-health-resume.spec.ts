import { PersonalSyncService } from '../personal-sync.service';
import { PersonalProviderError } from '../personal-errors';

describe('Garmin Personal health checkpoints', () => {
  it.each([0, 2, 5])(
    'resumes resource %s after a rate limit, preserving completed reads',
    async (limitedAt) => {
      const connection: any = {
        id: 'connection',
        userId: 'user',
        provider: 'garmin',
        status: 'ACTIVE',
        externalAthleteId: 'remote',
        credentialFingerprint: 'version',
        syncWellness: true,
        metadata: {
          connectionMode: 'personal_api',
          region: 'global',
          settings: { timezone: 'UTC', wellness: true },
        },
      };
      const job: any = {
        id: 'job',
        connectionId: 'connection',
        kind: 'HEALTH',
        status: 'RUNNING',
        leaseUntil: new Date(Date.now() + 600000),
        payload: {
          credentialVersion: 'version',
          day: '2026-11-01',
          timezone: 'UTC',
        },
        result: {},
      };
      let limited = false,
        stored: any;
      const get = jest.fn(async () => {
        if (!limited && get.mock.calls.length === limitedAt + 1) {
          limited = true;
          throw new PersonalProviderError('PROVIDER_RATE_LIMITED', 60000, 429);
        }
        return null;
      });
      const findFirst = jest.fn(async () => stored);
      const sources = {
        findFirst,
        upsert: jest.fn(
          async ({ create }: any) => (stored = { id: 'source', ...create }),
        ),
      };
      const jobs = {
        updateMany: jest.fn(async ({ data }: any) => {
          Object.assign(job, data);
          return { count: 1 };
        }),
      };
      const service = new PersonalSyncService(
        { importSourceObject: sources, personalProviderJob: jobs } as any,
        {
          require: async () => connection,
          resolveAccountTimezone: async () => 'UTC',
          authorized: async (_id: any, fn: any) => fn(connection, 'token'),
        } as any,
        { get } as any,
        {} as any,
        {} as any,
        { replaceProviderDailyCandidates: async () => ({}) } as any,
        {} as any,
        {} as any,
        {} as any,
      );
      await expect(service.run(job, connection)).rejects.toMatchObject({
        code: 'PROVIDER_RATE_LIMITED',
      });
      expect(job.result).toMatchObject({
        healthCheckpointVersion: 1,
        credentialVersion: 'version',
        sourceObjectId: 'source',
      });
      expect(job.result).not.toHaveProperty('snapshot');
      await service.run(job, connection);
      expect(job.status).toBe('SUCCEEDED');
      expect(get).toHaveBeenCalledTimes(7);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'source',
            userId: 'user',
            externalId: '2026-11-01',
            sourceKind: 'GARMIN_PERSONAL_API',
          }),
        }),
      );
    },
  );
});
