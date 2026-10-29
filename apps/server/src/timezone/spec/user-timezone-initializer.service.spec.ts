import { describe, expect, it, jest } from '@jest/globals';

import { UserTimezoneInitializerService } from '../user-timezone-initializer.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';

function createService(options?: {
  activityTimezone?: string | null;
  existingTimezone?: string | null;
}) {
  const create = jest.fn(async () => ({}));
  const transactionMetricFind = jest.fn(async () =>
    options?.existingTimezone ? { value: options.existingTimezone } : null,
  );
  const prisma = {
    activity: {
      findFirst: jest.fn(async () =>
        options?.activityTimezone
          ? { id: 42, timezone: options.activityTimezone }
          : null,
      ),
    },
    userBodyMetric: {
      findFirst: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        userBodyMetric: {
          findFirst: transactionMetricFind,
          create,
        },
      }),
    ),
  };

  return {
    create,
    prisma,
    service: new UserTimezoneInitializerService(
      prisma as never,
      {
        bodyMetrics: (tx?: { userBodyMetric?: unknown }) =>
          tx?.userBodyMetric ?? prisma.userBodyMetric,
      } as never,
      new ActivityReadService(prisma as never),
    ),
  };
}

describe('UserTimezoneInitializerService', () => {
  it('prefers a coordinate activity timezone over the client timezone', async () => {
    const { create, service } = createService({
      activityTimezone: 'Asia/Shanghai',
    });

    const result = await service.initializeFromAvailableSignals(
      'user-1',
      'Asia/Tokyo',
    );

    expect(result).toEqual({
      timezone: 'Asia/Shanghai',
      initialized: true,
      source: 'ACTIVITY_COORDINATES',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ value: 'Asia/Shanghai' }),
      }),
    );
  });

  it('uses a valid client timezone when no coordinate activity exists', async () => {
    const { service } = createService();

    await expect(
      service.initializeFromAvailableSignals('user-1', 'Europe/Paris'),
    ).resolves.toEqual({
      timezone: 'Europe/Paris',
      initialized: true,
      source: 'CLIENT',
    });
  });

  it('never overwrites an existing account timezone', async () => {
    const { create, service } = createService({
      activityTimezone: 'Asia/Shanghai',
      existingTimezone: 'Europe/London',
    });

    await expect(
      service.initializeFromAvailableSignals('user-1', 'Asia/Tokyo'),
    ).resolves.toEqual({
      timezone: 'Europe/London',
      initialized: false,
      source: 'EXISTING',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps the profile empty when every signal is invalid', async () => {
    const { service } = createService();

    await expect(
      service.initializeFromAvailableSignals('user-1', 'not-a-timezone'),
    ).resolves.toEqual({
      timezone: null,
      initialized: false,
      source: 'NONE',
    });
  });
});
