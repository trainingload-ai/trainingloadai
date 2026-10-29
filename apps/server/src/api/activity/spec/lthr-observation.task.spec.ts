import { describe, expect, it, jest } from '@jest/globals';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../metrics/context';
import { LthrObservationTask } from '../metrics/tasks/lthr-observation.task';

const startTime = new Date('2026-09-27T06:00:00.000Z');

function makeContext(
  sportType: $Enums.SportType = $Enums.SportType.RUN,
): MetricsContext {
  return {
    inputs: {
      userId: 'user-1',
      sportType,
      activity: {
        id: 42,
        userId: 'user-1',
        sportType,
        startTime,
        elapsedTime: 3600,
        timerTime: 3600,
        sampleSec: 1,
      } as MetricsContext['inputs']['activity'],
      canonicalRecords: Array.from({ length: 3601 }, (_, seconds) => ({
        time: new Date(startTime.getTime() + seconds * 1000).toISOString(),
        tMs: startTime.getTime() + seconds * 1000,
        heartRate: seconds < 1800 ? 150 : seconds < 2400 ? 165 : 175,
      })),
    },
    cache: { sampleSec: 1 },
    outputs: {},
    errors: {},
  };
}

describe('LthrObservationTask', () => {
  it('persists one strict activity observation with audit evidence', async () => {
    const persistence = {
      saveActivityLthrObservation: jest.fn(async () => undefined),
    };
    const task = new LthrObservationTask(persistence as never);

    const result = await task.exec(makeContext());

    expect(result.outputs.lthrObservation).toMatchObject({
      value: 175,
      windowStartSec: 1800,
      measureStartSec: 2400,
      protocol: 'OBSERVED',
      qualityTier: 'SINGLE_HIGH_QUALITY',
      fullCoverageRatio: 1,
      tailCoverageRatio: 1,
      algorithmVersion: 1,
    });

    await task.post(result);
    expect(persistence.saveActivityLthrObservation).toHaveBeenCalledWith({
      activity: result.inputs.activity,
      userId: 'user-1',
      observation: result.outputs.lthrObservation,
    });
  });

  it('ignores unsupported sports', async () => {
    const persistence = {
      saveActivityLthrObservation: jest.fn(async () => undefined),
    };
    const task = new LthrObservationTask(persistence as never);

    const result = await task.exec(makeContext($Enums.SportType.SWIM));
    await task.post(result);

    expect(result.outputs.lthrObservation).toBeUndefined();
    expect(persistence.saveActivityLthrObservation).not.toHaveBeenCalled();
  });
});
