import { describe, expect, it, jest } from '@jest/globals';
import { PaceZoneModel, SportType, ZoneBase } from '@prisma/client';
import type { UserZoneSetting } from '@/utils/zones';
import { UserService } from '../user.service';

function createService(
  saved: UserZoneSetting | null,
  profile = {
    paceZoneModel: PaceZoneModel.DANIELS,
    vo2max: 16.9,
    tp: 4,
    cs: 5,
  },
) {
  const service = new UserService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      zoneSettings: () => ({ findUnique: jest.fn(async () => saved) }),
    } as never,
  );
  jest
    .spyOn(service, 'getComposedUserProfile')
    .mockResolvedValue(profile as never);
  return service;
}

const zones = [{ name: 'Configured zone', order: 1, min: 80, max: 100 }];

describe('UserService pace zone calculation benchmark', () => {
  it('generates Daniels from VDOT despite an available TP', async () => {
    const result = await createService(null).getPaceZoneSettingResolved(
      'user-1',
      SportType.RUN,
    );
    expect(result).toMatchObject({
      benchmark: ZoneBase.VO2MAX,
      model: PaceZoneModel.DANIELS,
      configurationSource: 'generated',
    });
    expect(result.zones[2].min * 1000).toBeCloseTo(582.839, 2);
  });

  it.each([
    [ZoneBase.TP, 0.25, 0.3125],
    [ZoneBase.CS, 0.2, 0.25],
    [ZoneBase.VO2MAX, 0.536212, 0.670265],
  ])(
    'uses the saved %s benchmark regardless of the automatic model',
    async (benchmark, min, max) => {
      const result = await createService({
        benchmark,
        zones,
      }).getPaceZoneSettingResolved('user-1', SportType.RUN);
      expect(result).toMatchObject({
        benchmark,
        configurationSource: 'saved',
        model: null,
      });
      expect(result.zones).toHaveLength(1);
      expect(result.zones[0].min).toBeCloseTo(min as number, 6);
      expect(result.zones[0].max).toBeCloseTo(max as number, 6);
    },
  );

  it.each([
    [ZoneBase.TP, { tp: undefined }],
    [ZoneBase.CS, { cs: undefined }],
    [ZoneBase.VO2MAX, { vo2max: undefined }],
    [ZoneBase.VO2MAX, { vo2max: -1 }],
  ])(
    'does not replace missing or invalid saved %s with another benchmark',
    async (benchmark, missing) => {
      const service = createService(
        { benchmark, zones },
        {
          paceZoneModel: PaceZoneModel.DANIELS,
          vo2max: 16.9,
          tp: 4,
          cs: 5,
          ...missing,
        },
      );
      await expect(
        service.getPaceZoneSettingResolved('user-1', SportType.RUN),
      ).resolves.toEqual({
        benchmark,
        configurationSource: 'saved',
        model: null,
        zones: [],
      });
    },
  );

  it('preserves absolute custom zones', async () => {
    const customZones = [{ name: 'Custom', min: 0.3, max: 0.4 }];
    const result = await createService({
      benchmark: ZoneBase.CUSTOM,
      zones: customZones,
    }).getPaceZoneSettingResolved('user-1', SportType.RUN);
    expect(result.zones).toEqual(customZones);
    expect(result.benchmark).toBe(ZoneBase.CUSTOM);
  });
});
