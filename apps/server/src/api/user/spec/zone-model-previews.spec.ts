import { describe, expect, it, jest } from '@jest/globals';
import { SportType, ZoneType } from '@prisma/client';
import { UserService } from '../user.service';

function setup(profile: Record<string, unknown>, saved = false) {
  const findUnique = jest.fn(async () => (saved ? { id: 1 } : null));
  const service = new UserService(
    { userZoneSetting: { findUnique } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const read = jest
    .spyOn(service, 'getComposedUserProfile')
    .mockResolvedValue(profile as never);
  const write = jest.spyOn(service, 'updateUserProfile');
  return { service, read, write, findUnique };
}

describe('heart rate and power model previews', () => {
  it('compares HRR and LTHR using the requested sport without saving', async () => {
    const { service, read, write } = setup({
      maxHeartRate: 200,
      restingHeartRate: 60,
      lthr: 180,
    });
    const { models } = await service.getZoneModelPreviews(
      'athlete',
      SportType.RUN,
      ZoneType.HEART_RATE,
    );
    expect(read).toHaveBeenCalledWith('athlete', SportType.RUN);
    expect(read).toHaveBeenCalledTimes(1);
    expect(models.MHR.benchmark).toBe('MHR');
    expect(models.MHR.zones).toHaveLength(5);
    expect(models.MHR.zones[0]).toEqual({ name: 'Z1', min: 100, max: 120 });
    expect(models.KARVONEN.benchmark).toBe('HRR');
    expect(models.KARVONEN.zones).toHaveLength(5);
    expect(models.KARVONEN.zones[0]).toEqual({
      name: 'Z1',
      min: 130,
      max: 144,
    });
    expect(models.FRIEL.benchmark).toBe('LTHR');
    expect(models.FRIEL.zones).toHaveLength(7);
    expect(models.FRIEL.zones[0]).toEqual({
      name: 'Z1 Recovery',
      min: 0,
      max: 153,
    });
    expect(models.FRIEL.zones[4].name).toBe('Z5a SuperThreshold');
    const cycling = await service.getZoneModelPreviews(
      'athlete',
      SportType.CYCLING,
      ZoneType.HEART_RATE,
    );
    expect(cycling.models.FRIEL.zones[0].max).toBe(146);
    expect(write).not.toHaveBeenCalled();
  });

  it('reports the actual fallback and estimated heart rate basis', async () => {
    const { service } = setup({ maxHeartRate: 200 });
    const { models } = await service.getZoneModelPreviews(
      'athlete',
      SportType.RUN,
      ZoneType.HEART_RATE,
    );
    expect(models.KARVONEN.benchmark).toBe('MHR');
    expect(models.FRIEL).toMatchObject({
      benchmark: 'LTHR',
      benchmarkSource: 'ESTIMATED_MAX_HR',
    });
    expect(models.FRIEL.zones[0].max).toBe(150);
  });

  it('previews all power models in watts, including zero and open upper bounds', async () => {
    const { service, write, findUnique } = setup({ ftp: 250, cp: 300 }, true);
    const result = await service.getZoneModelPreviews(
      'athlete',
      SportType.CYCLING,
      ZoneType.POWER,
    );
    expect(result.hasSavedSetting).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId_sportType_zoneType: {
          userId: 'athlete',
          sportType: SportType.CYCLING,
          zoneType: ZoneType.POWER,
        },
      },
      select: { id: true },
    });
    expect(result.models.FRIEL.zones).toHaveLength(7);
    expect(result.models.VANCE.zones).toHaveLength(7);
    expect(result.models.STRYD.zones).toHaveLength(5);
    expect(result.models.FRIEL.zones[0]).toMatchObject({ min: 0, max: 140 });
    expect(result.models.VANCE.zones[0].max).toBe(203);
    expect(result.models.STRYD.zones[4]).toMatchObject({
      min: 290,
      max: undefined,
    });
    for (const model of Object.values(result.models))
      expect(model.benchmark).toBe('FTP');
    expect(write).not.toHaveBeenCalled();
  });

  it('reports CP when FTP is absent and supports default profiles', async () => {
    const { service, read } = setup({ cp: 300 });
    const { models } = await service.getZoneModelPreviews(
      'athlete',
      SportType.UNKNOWN,
      ZoneType.POWER,
    );
    expect(read).toHaveBeenCalledWith('athlete', SportType.UNKNOWN);
    expect(models.FRIEL.benchmark).toBe('CP');
    expect(models.FRIEL.zones[0].max).toBe(168);
  });

  it.each([ZoneType.HEART_RATE, ZoneType.POWER])(
    'returns empty %s models when required metrics are missing',
    async (type) => {
      const { service } = setup({});
      const { models } = await service.getZoneModelPreviews(
        'athlete',
        SportType.RUN,
        type,
      );
      for (const model of Object.values(models))
        expect(model.zones).toEqual([]);
    },
  );
});
