import { describe, expect, it, jest } from '@jest/globals';
import { $Enums } from '@prisma/client';
import { SwimScoreTask } from '../metrics/tasks/swim-score.task';
import type { MetricsContext } from '../metrics/context';

function makeContext(args?: {
  sport?: $Enums.SportType;
  speedCoverage?: number;
}): MetricsContext {
  const count = 120;
  const covered = Math.round(count * (args?.speedCoverage ?? 1));
  const start = Date.parse('2026-09-01T00:00:00.000Z');
  return {
    inputs: {
      activity: {
        id: 42,
        sportType: args?.sport ?? $Enums.SportType.SWIM,
        timerTime: count,
      } as MetricsContext['inputs']['activity'],
      userId: 'user-1',
      sportType: args?.sport ?? $Enums.SportType.SWIM,
      canonicalRecords: Array.from({ length: count }, (_, index) => ({
        time: new Date(start + index * 1000).toISOString(),
        tMs: start + index * 1000,
        distance: index * 1.4,
        speed: index < covered ? 1.4 : undefined,
      })),
    },
    cache: {
      sampleSec: 1,
      profile: { weight: 70, cs: 1.3 } as never,
      fitnessMetrics: {
        [$Enums.UserFitnessMetricType.CS]: { value: 1.3, value2: null },
      },
    },
    outputs: {},
    errors: {},
  };
}

describe('SwimScoreTask', () => {
  it('computes and persists a versioned SwimScore from speed and CS', async () => {
    const persistence = { saveActivitySwimScore: jest.fn(async () => undefined) };
    const task = new SwimScoreTask(persistence as never);

    const result = await task.exec(makeContext());
    expect(result.outputs.swimScore).toMatchObject({
      algorithmVersion: 2,
      thresholdSpeedMps: 1.3,
      coveredSeconds: 120,
      coverageRatio: 1,
    });
    expect(result.outputs.swimScore?.swimScore).toBeGreaterThan(0);

    await task.post(result);
    expect(persistence.saveActivitySwimScore).toHaveBeenCalledWith(
      42,
      $Enums.SportType.SWIM,
      result.outputs.swimScore,
    );
  });

  it('does not produce a score when speed coverage is below 80%', async () => {
    const task = new SwimScoreTask({} as never);
    const result = await task.exec(makeContext({ speedCoverage: 0.79 }));
    expect(result.outputs.swimScore).toBeUndefined();
  });

  it('ignores non-swim activities', async () => {
    const task = new SwimScoreTask({} as never);
    const result = await task.exec(makeContext({ sport: $Enums.SportType.RUN }));
    expect(result.outputs.swimScore).toBeUndefined();
  });
});
