import { describe, expect, it, jest } from '@jest/globals';
import { $Enums } from '@prisma/client';

jest.mock('@/api/user/user.service', () => ({ UserService: class {} }));

import { CalculatedPowerSummaryTask } from '../metrics/tasks/calculated-power-summary.task';
import type { MetricsContext } from '../metrics/context';

function context(
  sportType: $Enums.SportType,
  calculatedPower: Array<number | undefined>,
): MetricsContext {
  return {
    inputs: {
      activity: {
        id: 42,
        userId: 'user-1',
        sportType,
      } as MetricsContext['inputs']['activity'],
      userId: 'user-1',
      sportType,
      canonicalRecords: calculatedPower.map((value, index) => ({
        time: new Date(index * 1000).toISOString(),
        tMs: index * 1000,
        calculatedPower: value,
      })),
    },
    cache: {},
    outputs: {},
    errors: {},
  };
}

describe('CalculatedPowerSummaryTask', () => {
  it('persists source identity, model version and grade-aware parameters', async () => {
    const prisma = {
      activityCalculatedPower: {
        upsert: jest.fn(async () => ({ id: 'calculated-power-1' })),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const userService = {
      getComposedUserProfile: jest.fn(async () => ({
        weight: 70,
        height: 175,
      })),
    };
    const task = new CalculatedPowerSummaryTask(
      prisma as never,
      userService as never,
    );

    const result = await task.exec(
      context($Enums.SportType.RUN, [200, 220, undefined, 0]),
    );
    await task.post(result);

    expect(result.outputs.calculatedPowerSummary).toMatchObject({
      model: 'SKIBA_GOVSS',
      modelVersion: 2,
      avgPower: 140,
      maxPower: 220,
      sampleCount: 3,
      parameters: {
        weightKg: 70,
        height: 175,
        gradeMode: 'record',
        gradeCoverage: 0,
      },
    });
    expect(prisma.activityCalculatedPower.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          activity: { connect: { id: 42 } },
          model: 'SKIBA_GOVSS',
          modelVersion: 2,
        }),
      }),
    );
  });

  it('removes a stale summary when the activity has no estimated series', async () => {
    const prisma = {
      activityCalculatedPower: {
        upsert: jest.fn(),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const task = new CalculatedPowerSummaryTask(prisma as never, {} as never);

    const result = await task.exec(context($Enums.SportType.RUN, []));
    await task.post(result);

    expect(prisma.activityCalculatedPower.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
    });
    expect(prisma.activityCalculatedPower.upsert).not.toHaveBeenCalled();
  });
});
