import { describe, expect, it, jest } from '@jest/globals';
import { ThirdPartyActivityExportService } from '../third-party-activity-export.service';

describe('ThirdPartyActivityExportService mapping direction', () => {
  it('uses active sources and mappings instead of stale legacy provider fields', async () => {
    type FindManyArgs = {
      where: {
        AND: Array<Record<string, unknown>>;
      };
    };
    const prisma = {
      activity: {
        findMany: jest.fn(
          async (_args: FindManyArgs): Promise<unknown[]> => [],
        ),
      },
    };
    const service = new ThirdPartyActivityExportService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await service.findExportCandidates({
      userId: 'user-1',
      activityIds: [1],
      provider: 'garmin',
      sourceKind: 'GARMIN',
    });

    const where = prisma.activity.findMany.mock.calls[0]?.[0]?.where;
    const businessWhere = where.AND[0];
    expect(businessWhere).not.toHaveProperty('OR');
    expect(businessWhere).toMatchObject({
      activitySources: { none: { isActive: true } },
      thirdPartyMappings: { none: { isActive: true } },
    });
    expect(where.AND[1]).toEqual({ state: 1 });
  });

  it('upgrades an inbound mapping to BIDIRECTIONAL after export', async () => {
    const tx = {
      thirdPartyActivity: {
        upsert: jest.fn(async () => ({
          id: 11,
          userId: 'user-1',
          provider: 'garmin',
          externalId: 'activity-1',
        })),
      },
      activityThirdPartyMapping: {
        findFirst: jest.fn(async () => ({
          id: 22,
          activityId: 1,
          syncDirection: 'IMPORT',
        })),
        update: jest.fn(async () => ({})),
        create: jest.fn(async () => ({})),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ThirdPartyActivityExportService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await service.recordExportMapping({
      activity: {
        id: 1,
        userId: 'user-1',
        hashId: 'hash-1',
        sportType: 'RUN',
      } as never,
      provider: 'garmin',
      externalId: 'activity-1',
      response: { id: 'activity-1' },
      exportFile: { fileName: 'activity.fit', source: 'generated_fit' },
      exportedBy: 'test',
    });

    expect(tx.thirdPartyActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ state: 1 }),
      }),
    );

    expect(tx.activityThirdPartyMapping.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: expect.objectContaining({
        isActive: true,
        syncDirection: 'BIDIRECTIONAL',
      }),
    });
    expect(tx.activityThirdPartyMapping.create).not.toHaveBeenCalled();
  });
});
