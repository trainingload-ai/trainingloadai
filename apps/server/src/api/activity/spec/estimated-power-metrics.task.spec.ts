import { describe, expect, it, jest } from '@jest/globals';
import { PeakType, ScaleType, SportType } from '@prisma/client';
import type { MetricsContext, PeakMetricListKey } from '../metrics/context';
import { EstimatedPowerMetricsTask } from '../metrics/tasks/estimated-power-metrics.task';

const LIST_KEY =
  `list:${PeakType.power}:${ScaleType.TIME}` as PeakMetricListKey;

const measuredCurve = [
  { duration: 30, value: 800 },
  { duration: 45, value: 720 },
  { duration: 60, value: 650 },
  { duration: 120, value: 560 },
  { duration: 180, value: 500 },
  { duration: 600, value: 430 },
  { duration: 900, value: 360 },
  { duration: 1200, value: 330 },
  { duration: 3600, value: 280 },
  { duration: 7200, value: 250 },
];

function context(
  evidence: MetricsContext['inputs']['measuredPowerEvidence'],
): MetricsContext {
  return {
    inputs: {
      activity: {
        id: 42,
        sportType: SportType.CYCLING,
      } as MetricsContext['inputs']['activity'],
      userId: 'user-1',
      sportType: SportType.CYCLING,
      measuredPowerEvidence: evidence,
    },
    cache: {
      peakMetricLists: {
        [LIST_KEY]: measuredCurve,
      },
    },
    outputs: {},
    errors: {},
  };
}

describe('EstimatedPowerMetricsTask', () => {
  const prisma = {
    activity: {
      update: jest.fn(async () => ({})),
    },
  };
  const task = new EstimatedPowerMetricsTask({} as never, prisma as never);

  it('projects activity CP from a reliable measured-power curve', async () => {
    prisma.activity.update.mockClear();
    const result = await task.exec(context('RELIABLE'));

    expect(result.outputs.estimatedPowerMetrics?.ecp).toEqual(
      expect.any(Number),
    );
    expect(result.outputs.estimatedPowerMetrics?.ecp).toBeLessThanOrEqual(1000);
    await task.post(result);
    expect(prisma.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({
          ecp: result.outputs.estimatedPowerMetrics?.ecp,
        }),
      }),
    );
  });

  it.each(['UNKNOWN', 'INSUFFICIENT'] as const)(
    'does not project CP when measured power is %s',
    async (evidence) => {
      prisma.activity.update.mockClear();
      const result = await task.exec(context(evidence));

      expect(result.outputs.estimatedPowerMetrics).toBeUndefined();
      await task.post(result);
      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { ecp: null, eftp: null, ewPrime: null, epmax: null },
      });
    },
  );
});
