import { describe, expect, it, jest } from '@jest/globals';
import { DefaultVdotSource } from '@prisma/client';
import { USER_VO2_MAX_SETTINGS_CHANGED_EVENT } from '../events/user-fitness.events';
import { UserService } from '../user.service';

function createService(args?: {
  activityVo2Max?: {
    vo2maxVdotByHr: number | null;
    vo2maxVdotByRace: number | null;
  };
}) {
  const profileUpsert = jest.fn(async () => ({}));
  const profileUpdate = jest.fn(async () => ({}));
  const emitAsync = jest.fn(async () => []);
  const service = new UserService(
    {
      activity: {
        findFirst: jest.fn(async () =>
          args?.activityVo2Max ? { vo2max: args.activityVo2Max } : null,
        ),
      },
    } as never,
    { t: jest.fn((key: string) => key) } as never,
    {} as never,
    {} as never,
    { emitAsync } as never,
    {
      profiles: () => ({
        upsert: profileUpsert,
        update: profileUpdate,
      }),
    } as never,
  );
  jest.spyOn(service, 'getComposedUserProfile').mockResolvedValue({} as never);
  return { service, profileUpsert, profileUpdate, emitAsync };
}

describe('UserService effective VO2 max settings', () => {
  it('normalizes the legacy HR preference and triggers a canonical refresh', async () => {
    const { service, profileUpsert, emitAsync } = createService();

    await service.updateUserProfile('user-1', {
      defaultVdotSource: 'HEARTRATE',
      vo2maxCorrectionFactor: 0.9,
    });

    expect(profileUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: {
        defaultVdotSource: DefaultVdotSource.FACTOR,
        vo2maxCorrectionFactor: 0.9,
      },
      create: {
        userId: 'user-1',
        defaultVdotSource: DefaultVdotSource.FACTOR,
        vo2maxCorrectionFactor: 0.9,
      },
    });
    expect(emitAsync).toHaveBeenCalledWith(
      USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('calibrates only from complete HR and race evidence and refreshes the canonical value', async () => {
    const { service, profileUpdate, emitAsync } = createService({
      activityVo2Max: {
        vo2maxVdotByHr: 50,
        vo2maxVdotByRace: 45,
      },
    });

    await expect(
      service.calibrateVo2maxFromActivity('user-1', 'activity-1'),
    ).resolves.toBe(0.9);
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { vo2maxCorrectionFactor: 0.9 },
    });
    expect(emitAsync).toHaveBeenCalledWith(
      USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });
});
