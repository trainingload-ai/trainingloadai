import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
import type { MetricsContext } from '../metrics/context';
import { ActivityPeakMetricWriterService } from '../metrics/shared/peak-metric-writer.service';
import { MaxMeanPowerTask } from '../metrics/tasks/max-mean-power.task';

function records(count: number, power?: number, calculatedPower?: number) {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(index * 1000).toISOString(),
    tMs: index * 1000,
    ...(power == null ? {} : { power }),
    ...(calculatedPower == null ? {} : { calculatedPower }),
  }));
}

function context(
  evidence: MetricsContext['inputs']['measuredPowerEvidence'],
  samples: ReturnType<typeof records>,
): MetricsContext {
  return {
    inputs: {
      activity: {
        id: 42,
        sportType: SportType.CYCLING,
        startTime: new Date('2026-01-01T00:00:00.000Z'),
      } as MetricsContext['inputs']['activity'],
      userId: 'user-1',
      sportType: SportType.CYCLING,
      measuredPowerEvidence: evidence,
      canonicalRecords: samples,
    },
    cache: {},
    outputs: {},
    errors: {},
  };
}

describe('MaxMeanPowerTask', () => {
  const prisma = {
    activityPeakMetric: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const task = new MaxMeanPowerTask(
    new ActivityPeakMetricWriterService(prisma as never),
  );

  it('writes measured power peaks and ignores calculatedPower', async () => {
    prisma.activityPeakMetric.deleteMany.mockClear();
    prisma.activityPeakMetric.createMany.mockClear();
    const result = await task.exec(context('RELIABLE', records(12, 220, 9999)));

    expect(result.outputs.maxMeanPower?.['5s']).toBe(220);
    const listed =
      (
        result.cache as {
          'list:power:TIME'?: Array<{ value: number }>;
        }
      )['list:power:TIME'] ?? [];
    expect(listed.some((point) => point.value === 9999)).toBe(false);
    expect(listed.some((point) => point.value === 220)).toBe(true);

    await task.post(result);
    const written = prisma.activityPeakMetric.createMany.mock.calls[0]?.[0] as {
      data: Array<{ type: string; value: number }>;
    };
    expect(written.data.every((row) => row.type === 'power')).toBe(true);
    expect(written.data.every((row) => row.value === 220)).toBe(true);
  });

  it('does not create power peaks from calculatedPower alone', async () => {
    prisma.activityPeakMetric.deleteMany.mockClear();
    prisma.activityPeakMetric.createMany.mockClear();
    const result = await task.exec(
      context('RELIABLE', records(12, undefined, 4000)),
    );

    const peaks = Object.values(result.outputs.maxMeanPower ?? {}).filter(
      (value) => typeof value === 'number' && value > 0,
    );
    expect(peaks).toEqual([]);
    await task.post(result);
    expect(prisma.activityPeakMetric.deleteMany).toHaveBeenCalled();
    expect(prisma.activityPeakMetric.createMany).not.toHaveBeenCalled();
  });

  it.each(['UNKNOWN', 'INSUFFICIENT'] as const)(
    'drops stored power peaks when evidence is %s',
    async (evidence) => {
      prisma.activityPeakMetric.deleteMany.mockClear();
      prisma.activityPeakMetric.createMany.mockClear();
      const result = await task.exec(context(evidence, records(12, 220, 4000)));

      expect(result.outputs.maxMeanPower).toBeUndefined();
      await task.post(result);
      expect(prisma.activityPeakMetric.deleteMany).toHaveBeenCalledWith({
        where: { activityId: 42, type: 'power', scaleType: 'TIME' },
      });
      expect(prisma.activityPeakMetric.createMany).not.toHaveBeenCalled();
    },
  );
});
