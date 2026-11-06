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
      algorithmVersion: 2,
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
    expect(persistence.saveActivityLthrObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        observation: undefined,
      }),
    );
  });

  it('supports five-second HR updates mixed into one-second records', async () => {
    const task = new LthrObservationTask({} as never);
    const ctx = makeContext();
    ctx.inputs.canonicalRecords = ctx.inputs.canonicalRecords!.map(
      (row, index) => ({
        ...row,
        heartRate: index % 5 === 0 ? row.heartRate : undefined,
      }),
    );
    const result = await task.exec(ctx);
    expect(result.outputs.lthrObservation).toMatchObject({
      value: 175,
      sampleSeconds: 5,
      windowStartSec: 1800,
      windowEndSec: 3600,
    });
  });

  it.each([-28_800, 14_400])(
    'rejects a record timeline shifted outside the activity by %s seconds',
    async (shift) => {
      const task = new LthrObservationTask({} as never);
      const ctx = makeContext();
      ctx.inputs.canonicalRecords = ctx.inputs.canonicalRecords!.map((row) => ({
        ...row,
        tMs: row.tMs + shift * 1000,
      }));
      expect((await task.exec(ctx)).outputs.lthrObservation).toBeUndefined();
    },
  );
});
