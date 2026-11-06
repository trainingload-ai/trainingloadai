import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));
import { Vo2MaxTask } from '../metrics/tasks/vo2max.task';
import type { MetricsContext } from '../metrics/context';

describe('VO2Max calculation input stability', () => {
  it('uses this run averages instead of the previous persisted activity summary', async () => {
    const engine = {
      calculateRunActivityVo2Max: jest.fn(() => ({ vo2maxVdotByHr: 40 })),
    };
    const task = new Vo2MaxTask(
      {} as never,
      {} as never,
      engine as never,
      {} as never,
    );
    await task.exec({
      inputs: {
        sportType: SportType.RUN,
        activity: {
          id: 42,
          sportType: SportType.RUN,
          avgSpeed: 2.5,
          avgHeartRate: 140,
          elapsedTime: 3600,
          distance: 10_000,
        } as never,
      },
      cache: { hrThreshold: { maxHeartRate: 190 } },
      outputs: {
        paceBase: { avgSpeed: 2.7 } as never,
        heartRateBase: { avg: 143.24 } as never,
      },
      errors: {},
    } as MetricsContext);
    expect(engine.calculateRunActivityVo2Max).toHaveBeenCalledWith(
      10_000,
      3600,
      2.7,
      143.24,
      [],
      expect.objectContaining({ MHR: 190 }),
    );
  });
});
