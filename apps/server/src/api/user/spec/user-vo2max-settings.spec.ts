import { describe, expect, it, jest } from '@jest/globals';
import { DefaultVdotSource } from '@prisma/client';
import { USER_VO2_MAX_SETTINGS_CHANGED_EVENT } from '../events/user-fitness.events';
import { PMC_INVALIDATE_EVENT } from '@/training-load/events/pmc.events';
import { UserService } from '../user.service';

function createService(args?: {
  activityVo2Max?: {
    vo2maxVdotByHr: number | null;
    vo2maxVdotByRace: number | null;
  };
  profile?: { loadSources?: string | null } | null;
}) {
  const profileUpsert = jest.fn(async () => ({}));
  const profileUpdate = jest.fn(async () => ({}));
  const emitAsync = jest.fn(async () => []);
  const prisma = {
    activity: {
      findFirst: jest.fn(async () =>
        args?.activityVo2Max ? { vo2max: args.activityVo2Max } : null,
      ),
    },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  const service = new UserService(
    prisma as never,
    { t: jest.fn((key: string) => key) } as never,
    {} as never,
    {} as never,
    { emitAsync } as never,
    {
      profiles: () => ({
        findUnique: jest.fn(async () => args?.profile ?? null),
        upsert: profileUpsert,
        update: profileUpdate,
      }),
    } as never,
    { recordCurrentVersion: jest.fn(async () => ({})) } as never,
  );
  jest.spyOn(service, 'getComposedUserProfile').mockResolvedValue({} as never);
  return { service, profileUpsert, profileUpdate, emitAsync };
}

describe('UserService effective VO2 max settings', () => {
  it('normalizes the legacy HR preference without rewriting historical activities', async () => {
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
    expect(emitAsync).not.toHaveBeenCalledWith(
      USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
      expect.anything(),
    );
  });

  it('calibrates only from complete HR and race evidence for future activities', async () => {
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
    expect(emitAsync).not.toHaveBeenCalledWith(
      USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
      expect.anything(),
    );
  });

  it('does not rebuild historical PMC when the load-source order changes', async () => {
    const { service, emitAsync } = createService({
      profile: { loadSources: 'POWER,HEART_RATE,PACE,SESSIONRPE' },
    });

    await service.updateUserProfile('user-1', {
      loadSources: ['HEART_RATE', 'POWER'],
    });

    expect(emitAsync).not.toHaveBeenCalledWith(
      PMC_INVALIDATE_EVENT,
      expect.anything(),
    );
  });
});
