import { describe, expect, it, jest } from '@jest/globals';
import { PaceZoneModel, SportType, ZoneBase, ZoneType } from '@prisma/client';
import { UserService } from '../../user/user.service';
import { generatePaceZonesFromProfile } from '../pace.utils';

function createService(tp: number | undefined = 1000 / 355, saved = false) {
  const profile = { paceZoneModel: PaceZoneModel.DANIELS, vo2max: 16.9, tp };
  const readProfile = jest.fn(async () => profile);
  const updateProfile = jest.fn();
  const findUnique = jest.fn(async () => (saved ? { id: 1 } : null));
  const service = new UserService(
    { userZoneSetting: { findUnique } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest
    .spyOn(service, 'getComposedUserProfile')
    .mockImplementation(readProfile as never);
  jest
    .spyOn(service, 'updateUserProfile')
    .mockImplementation(updateProfile as never);
  return { service, profile, readProfile, updateProfile, findUnique };
}

describe('read-only pace zone model previews', () => {
  it('calculates both models using the same generator as saved automatic settings', async () => {
    const { service, profile, readProfile, updateProfile } = createService();
    const result = await service.getZoneModelPreviews(
      'user-1',
      SportType.RUN,
      ZoneType.PACE,
    );
    expect(readProfile).toHaveBeenCalledTimes(1);
    expect(readProfile).toHaveBeenCalledWith('user-1', SportType.RUN);
    expect(result.hasSavedSetting).toBe(false);
    for (const model of [PaceZoneModel.DANIELS, PaceZoneModel.FRIEL]) {
      expect(result.models[model]).toEqual({
        ...generatePaceZonesFromProfile({ ...profile, paceZoneModel: model }),
        model,
        configurationSource: 'generated',
      });
    }
    expect(result.models.DANIELS.benchmark).toBe(ZoneBase.VO2MAX);
    expect(result.models.FRIEL.benchmark).toBe(ZoneBase.TP);
    expect(result.models.DANIELS.zones).not.toEqual(result.models.FRIEL.zones);
    expect(profile.paceZoneModel).toBe(PaceZoneModel.DANIELS);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('leaves missing-metric models empty instead of substituting a different basis', async () => {
    const { service } = createService(0);
    const result = await service.getZoneModelPreviews(
      'user-1',
      SportType.SWIM,
      ZoneType.PACE,
    );
    expect(result.models.FRIEL).toMatchObject({
      benchmark: ZoneBase.TP,
      zones: [],
    });
    expect(result.models.DANIELS.zones).toHaveLength(5);
  });

  it('previews the selected models while identifying a saved configuration override', async () => {
    const { service } = createService(3, true);
    const result = await service.getZoneModelPreviews(
      'user-1',
      SportType.RUN,
      ZoneType.PACE,
    );
    expect(result.hasSavedSetting).toBe(true);
    expect(result.models.FRIEL.zones).toHaveLength(5);
  });
});
