import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));
import { TrainingEffectTask } from '../metrics/tasks/training-effect.task';
import type { MetricsContext } from '../metrics/context';

function context(heartRate?: number): MetricsContext {
  return {
    inputs: {
      userId: 'user-1',
      sportType: SportType.RUN,
      activity: { id: 42, sportType: SportType.RUN } as never,
      canonicalRecords: Array.from({ length: 61 }, (_, index) => ({
        time: new Date(index * 1000).toISOString(),
        tMs: index * 1000,
        heartRate,
      })),
    },
    cache: {
      hrThreshold: { maxHeartRate: 190 },
      loadRestingHeartRateDefault: 60,
    },
    outputs: {},
    errors: {},
  };
}

describe('TrainingEffectTask missing inputs', () => {
  it('leaves no result when a file has no heart-rate samples', async () => {
    const persistence = { saveActivityTrainingEffect: jest.fn() };
    const task = new TrainingEffectTask(
      {} as never,
      persistence as never,
      {} as never,
    );
    const result = await task.exec(context());
    await task.post(result);
    expect(result.outputs.trainingEffect).toBeUndefined();
    expect(persistence.saveActivityTrainingEffect).not.toHaveBeenCalled();
  });

  it('computes HR-only activities without requiring speed or distance', async () => {
    const task = new TrainingEffectTask({} as never, {} as never, {} as never);
    const result = await task.exec(context(150));
    expect(result.outputs.trainingEffect?.epoc).toBeGreaterThan(0);
    expect(result.outputs.trainingEffect?.curve).toHaveLength(61);
  });

  it('preserves a calculated zero for genuinely low intensity', async () => {
    const task = new TrainingEffectTask({} as never, {} as never, {} as never);
    expect((await task.exec(context(65))).outputs.trainingEffect?.epoc).toBe(0);
  });
});
