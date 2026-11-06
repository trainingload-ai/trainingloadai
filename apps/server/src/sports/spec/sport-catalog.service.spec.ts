import { describe, expect, it, jest } from '@jest/globals';
import { SportCatalogService } from '../sport-catalog.service';
import { SportCatalogRepository } from '../persistence/sport-catalog.repository';

describe('SportCatalogService', () => {
  it('recognizes legacy camelCase FIT sub_sport names against the existing catalog', async () => {
    const findMappingFirst = jest
      .fn<() => Promise<any>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        externalCode: 'TRAINING',
        externalSubCode: 'STRENGTH_TRAINING',
        sport: { code: 'STRENGTH_TRAINING', family: 'UNKNOWN' },
      });
    const service = new SportCatalogService({ findMappingFirst } as never);
    await expect(
      service.fromProvider({
        provider: 'upload',
        externalCode: 'training',
        externalSubCode: 'strengthTraining',
      }),
    ).resolves.toMatchObject({ sport: { code: 'STRENGTH_TRAINING' } });
    expect(findMappingFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalSubCode: {
            in: expect.arrayContaining(['STRENGTH_TRAINING']),
          },
        }),
      }),
    );
  });
  function createService() {
    const sports = [
      {
        code: 'ROAD_RUNNING',
        family: 'RUN',
        active: true,
        isDefaultForFamily: true,
      },
      {
        code: 'TRAIL_RUNNING',
        family: 'RUN',
        active: true,
        isDefaultForFamily: false,
      },
      {
        code: 'OTHER',
        family: 'UNKNOWN',
        active: true,
        isDefaultForFamily: true,
      },
    ];
    const mappings = [
      {
        provider: 'suunto',
        externalCode: '1',
        externalSubCode: '',
        direction: 'BOTH',
        sportCode: 'ROAD_RUNNING',
        active: true,
      },
      {
        provider: 'suunto',
        externalCode: '22',
        externalSubCode: '',
        direction: 'BOTH',
        sportCode: 'TRAIL_RUNNING',
        active: true,
      },
    ];
    const prisma = {
      sportDefinition: {
        findUnique: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) =>
            sports.find((sport) => sport.code === where.code) ?? null,
        ),
        findFirst: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) =>
            sports.find(
              (sport) =>
                sport.family === where.family && sport.isDefaultForFamily,
            ) ?? null,
        ),
        findMany: jest.fn(async () => sports),
      },
      providerSportMapping: {
        findFirst: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            const mapping = mappings.find(
              (item) =>
                item.provider === where.provider &&
                (where.sportCode
                  ? item.sportCode === where.sportCode
                  : item.externalCode === where.externalCode),
            );
            if (!mapping) return null;
            return {
              ...mapping,
              sport: sports.find((sport) => sport.code === mapping.sportCode),
            };
          },
        ),
      },
    };
    return new SportCatalogService(new SportCatalogRepository(prisma as never));
  }

  it('normalizes exact definition codes and falls back by family', async () => {
    const service = createService();
    await expect(
      service.resolve('trail-running', 'RUN'),
    ).resolves.toMatchObject({
      code: 'TRAIL_RUNNING',
    });
    await expect(service.resolve('missing', 'RUN')).resolves.toMatchObject({
      code: 'ROAD_RUNNING',
    });
  });

  it('maps exact Suunto modes and falls back to the family default', async () => {
    const service = createService();
    await expect(
      service.toProvider({ provider: 'suunto', sportCode: 'TRAIL_RUNNING' }),
    ).resolves.toMatchObject({ externalCode: '22', exact: true });
    await expect(
      service.toProvider({
        provider: 'suunto',
        sportCode: 'missing',
        family: 'RUN',
      }),
    ).resolves.toMatchObject({ externalCode: '1' });
  });

  it('can reject an unmapped exact subtype instead of falling back', async () => {
    const service = createService();
    await expect(
      service.toProvider({
        provider: 'coros',
        sportCode: 'TRAIL_RUNNING',
        family: 'RUN',
        allowFamilyFallback: false,
      }),
    ).resolves.toBeNull();
  });
});
