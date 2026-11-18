import { describe, expect, it, jest } from '@jest/globals';
import { ExternalActivitySourceRouter } from '../external-activity-source-router.service';
import { ImportSourceDataUnavailableError } from '../import-item-provider.port';

describe('ExternalActivitySourceRouter', () => {
  it.each([null, 42])(
    'preserves unavailable sources and existing activity ownership (%s)',
    async (activityId) => {
      const update = jest.fn(async () => ({}));
      const tx = {
        importSourceObject: {
          findFirst: jest.fn(async () => ({
            provider: 'upload',
            metadata: { retained: true },
            resolvedActivityId: null,
            activitySources: activityId ? [{ activityId }] : [],
          })),
          update,
        },
      };
      const router = new ExternalActivitySourceRouter(
        {} as never,
        {
          sourceObjects: (client: typeof tx) => client.importSourceObject,
        } as never,
      );
      await router.keepUnavailableSource(
        {
          userId: 'owner',
          sourceObjectId: 'source',
          error: new ImportSourceDataUnavailableError(
            'SAMPLES_ABSENT',
            'records',
            false,
          ),
        },
        tx as never,
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: 'source' },
        data: expect.objectContaining({
          resolutionStatus: activityId ? 'RESOLVED' : 'BLOCKED',
          resolutionReason: activityId ? null : 'UPSTREAM_DATA_UNAVAILABLE',
          ...(activityId
            ? { resolvedActivityId: activityId }
            : { originProvider: 'upload' }),
          metadata: expect.objectContaining({
            retained: true,
            dataAvailability: expect.objectContaining({
              code: 'SAMPLES_ABSENT',
            }),
          }),
        }),
      });
    },
  );
  function setup(resolvedActivityId: number | null = null) {
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({ resolvedActivityId })),
        update: jest.fn(async (args: unknown) => args),
      },
    };
    return {
      prisma,
      router: new ExternalActivitySourceRouter(
        prisma as never,
        {
          sourceObjects: (client?: typeof prisma) =>
            client?.importSourceObject ?? prisma.importSourceObject,
        } as never,
      ),
    };
  }

  it('uses the discovery provider when no deployment fallback claims it', async () => {
    const { prisma, router } = setup();
    await expect(
      router.routeIntervalsDiscovery({
        userId: 'user-1',
        sourceObjectId: 'source-1',
        activity: { id: 'remote-1' },
        reason: 'scheduled',
      }),
    ).resolves.toEqual({ kind: 'IMPORT_VIA_DISCOVERY_PROVIDER' });
    expect(prisma.importSourceObject.update).toHaveBeenLastCalledWith({
      where: { id: 'source-1' },
      data: expect.objectContaining({
        originProvider: null,
        resolutionStatus: 'IMPORTABLE',
      }),
    });
  });

  it('keeps an unavailable discovery blocked without inventing a provider', async () => {
    const { prisma, router } = setup();
    await expect(
      router.routeIntervalsDiscovery({
        userId: 'user-1',
        sourceObjectId: 'source-1',
        activity: { id: 'remote-1' },
        reason: 'fallback',
        confirmedOriginUnavailable: true,
      }),
    ).resolves.toEqual({
      kind: 'KEEP_BLOCKED_SOURCE',
      reason: 'ORIGIN_CONNECTION_REQUIRED',
    });
    expect(prisma.importSourceObject.update).toHaveBeenLastCalledWith({
      where: { id: 'source-1' },
      data: expect.objectContaining({
        originProvider: null,
        suggestedProvider: null,
        resolutionStatus: 'BLOCKED',
      }),
    });
  });

  it('does not enqueue a second import after the source is resolved', async () => {
    const { router } = setup(42);
    await expect(
      router.routeIntervalsDiscovery({
        userId: 'user-1',
        sourceObjectId: 'source-1',
        activity: { id: 'remote-1' },
        reason: 'scheduled',
      }),
    ).resolves.toEqual({ kind: 'ALREADY_RESOLVED', activityId: 42 });
  });
});
