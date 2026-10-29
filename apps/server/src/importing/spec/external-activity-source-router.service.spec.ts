import { describe, expect, it, jest } from '@jest/globals';
import { ExternalActivitySourceRouter } from '../external-activity-source-router.service';

describe('ExternalActivitySourceRouter', () => {
  function setup(resolvedActivityId: number | null = null) {
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({ resolvedActivityId })),
        update: jest.fn(async (args: unknown) => args),
      },
    };
    return {
      prisma,
      router: new ExternalActivitySourceRouter(prisma as never, {
        sourceObjects: (client?: typeof prisma) =>
          client?.importSourceObject ?? prisma.importSourceObject,
      } as never),
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
