import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
import { HeartRateZonesTask } from '../metrics/tasks/heart-rate-zones.task';
import type { MetricsContext } from '../metrics/context';

describe('HeartRateZonesTask resolved context boundary', () => {
  it('does not turn the load-only resting-HR default into a zone input', async () => {
    const userService = {
      getComposedUserProfile: jest.fn(),
      getHeartRateZoneSetting: jest.fn(),
    };
    const task = new HeartRateZonesTask({} as never, userService as never);
    const ctx: MetricsContext = {
      inputs: {
        activity: {
          id: 42,
          userId: 'user-1',
          sportType: SportType.RUN,
          startTime: new Date('2026-01-01T00:00:00.000Z'),
        } as MetricsContext['inputs']['activity'],
        userId: 'user-1',
        sportType: SportType.RUN,
        canonicalRecords: [
          {
            time: '2026-01-01T00:00:00.000Z',
            tMs: Date.parse('2026-01-01T00:00:00.000Z'),
            heartRate: 150,
          },
        ],
      },
      cache: {
        resolvedFitnessContext: {} as never,
        loadRestingHeartRateDefault: 60,
        profile: { maxHeartRate: 190, restingHeartRate: undefined },
      },
      outputs: {},
      errors: {},
    };

    const prepared = await task.pre(ctx);
    const result = await task.exec(prepared);

    expect(userService.getComposedUserProfile).not.toHaveBeenCalled();
    expect(userService.getHeartRateZoneSetting).not.toHaveBeenCalled();
    expect(result.outputs.heartRateZones).toBeUndefined();
  });
});
