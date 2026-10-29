import { describe, expect, it, jest } from '@jest/globals';
import { $Enums, Gender } from '@prisma/client';

jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));

import { HeartRateTrimpTask } from '../metrics/tasks/heart-rate-trimp.task';
import type { MetricsContext } from '../metrics/context';
import {
  computeTRIMP100,
  estimateTrimp100LthrFromMaxHr,
} from '@/algorithm/trimp';

function context(): MetricsContext {
  const records = Array.from({ length: 60 }, (_, index) => ({
    time: new Date(Date.UTC(2026, 7, 2, 0, index)).toISOString(),
    tMs: Date.UTC(2026, 7, 2, 0, index),
    heartRate: 150,
  }));
  return {
    inputs: {
      activity: {
        id: 42,
        userId: 'user-1',
        sportType: $Enums.SportType.RUN,
        startTime: new Date('2026-08-02T00:00:00.000Z'),
      } as MetricsContext['inputs']['activity'],
      userId: 'user-1',
      sportType: $Enums.SportType.RUN,
      canonicalRecords: records,
    },
    cache: {
      sampleSec: 60,
      profile: {
        gender: Gender.MALE,
        maxHeartRate: 190,
        restingHeartRate: 50,
        lthr: 170,
      },
      // 绑定任务已经选出分析当天真正生效的 MANUAL/AUTO 指标。
      fitnessMetrics: {
        [$Enums.UserFitnessMetricType.MAX_HR]: { value: 194, value2: null },
        [$Enums.UserFitnessMetricType.RESTING_HR]: { value: 48, value2: null },
        [$Enums.UserFitnessMetricType.LTHR]: { value: 173, value2: null },
      },
      // 历史 MANUAL 查询没有 LTHR，不应再令 TRIMP100 退化为 0。
      hrThreshold: {
        maxHeartRate: 190,
        restingHeartRate: 50,
        lactateThresholdHeartRate: null,
      },
    },
    outputs: {
      heartRateBase: {
        avg: 150,
        max: 150,
        min: 150,
        paHr: undefined,
        pwHr: undefined,
        maxHrDrop: undefined,
      },
    },
    errors: {},
  };
}

describe('HeartRateTrimpTask', () => {
  it('uses the bound effective AUTO/MANUAL LTHR when computing TRIMP100', async () => {
    const persistence = { saveActivityHeartRateTrimpRow: jest.fn() };
    const task = new HeartRateTrimpTask(persistence as never, {} as never);

    const result = await task.exec(context());

    expect(result.outputs.heartRateTrimp?.IntensityFactorHR).toBeCloseTo(
      150 / 173,
      6,
    );
    expect(result.outputs.heartRateTrimp?.HRR).toBe(146);
    expect(result.outputs.heartRateTrimp?.TRIMP100).toBeGreaterThan(0);
  });

  it('estimates a runtime-only LTHR from MAXHR when LTHR is missing', async () => {
    const persistence = { saveActivityHeartRateTrimpRow: jest.fn() };
    const task = new HeartRateTrimpTask(persistence as never, {} as never);
    const ctx = context();
    ctx.cache.profile = {
      ...ctx.cache.profile,
      lthr: undefined,
    };
    ctx.cache.fitnessMetrics = {
      [$Enums.UserFitnessMetricType.MAX_HR]: { value: 194, value2: null },
      [$Enums.UserFitnessMetricType.RESTING_HR]: { value: 48, value2: null },
    };

    const result = await task.exec(ctx);
    const heartRateTrimp = result.outputs.heartRateTrimp;
    const estimatedLthr = estimateTrimp100LthrFromMaxHr(194);

    expect(estimatedLthr).toBe(171);
    expect(heartRateTrimp?.IntensityFactorHR).toBeCloseTo(150 / 171, 6);
    expect(heartRateTrimp?.TRIMP100).toBe(
      computeTRIMP100(
        heartRateTrimp?.TRIMP ?? 0,
        194,
        48,
        estimatedLthr,
        Gender.MALE,
      ),
    );
    expect(heartRateTrimp?.TRIMP100).toBeGreaterThan(0);
  });

  it('estimates MAXHR from age when no configured value is available', async () => {
    const persistence = { saveActivityHeartRateTrimpRow: jest.fn() };
    const task = new HeartRateTrimpTask(persistence as never, {} as never);
    const ctx = context();
    ctx.cache.profile = {
      ...ctx.cache.profile,
      maxHeartRate: undefined,
      lthr: undefined,
      age: 40,
    };
    ctx.cache.fitnessMetrics = {
      [$Enums.UserFitnessMetricType.RESTING_HR]: { value: 48, value2: null },
    };
    ctx.cache.hrThreshold = {
      restingHeartRate: 50,
      maxHeartRate: undefined,
      lactateThresholdHeartRate: null,
    };

    const result = await task.exec(ctx);

    expect(result.outputs.heartRateTrimp?.TRIMP100).toBeGreaterThan(0);
  });

  it('keeps TRIMP100 at zero when MAXHR and age are unavailable', async () => {
    const persistence = { saveActivityHeartRateTrimpRow: jest.fn() };
    const task = new HeartRateTrimpTask(persistence as never, {} as never);
    const ctx = context();
    ctx.cache.profile = {
      ...ctx.cache.profile,
      maxHeartRate: undefined,
      lthr: undefined,
      age: undefined,
    };
    ctx.cache.fitnessMetrics = {
      [$Enums.UserFitnessMetricType.RESTING_HR]: { value: 48, value2: null },
    };
    ctx.cache.hrThreshold = {
      restingHeartRate: 50,
      maxHeartRate: undefined,
      lactateThresholdHeartRate: null,
    };

    const result = await task.exec(ctx);

    expect(result.outputs.heartRateTrimp?.TRIMP100).toBe(0);
  });
});
