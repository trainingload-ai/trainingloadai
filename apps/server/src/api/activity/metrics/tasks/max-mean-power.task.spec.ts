import { describe, expect, it } from '@jest/globals';
import { ActivityPeakMetricWriterService } from '../shared/peak-metric-writer.service';
import { MaxMeanPowerTask } from './max-mean-power.task';
import type { MetricsContext } from '../context';

describe('MaxMeanPowerTask', () => {
  it('does not store an isolated multi-kW sample as the one-second peak', async () => {
    const task = new MaxMeanPowerTask(
      new ActivityPeakMetricWriterService({} as never),
    );
    const records = Array.from({ length: 90 }, (_, second) => ({
      time: new Date(second * 1000).toISOString(),
      tMs: second * 1000,
      power: second === 12 ? 5200 : second >= 40 && second < 45 ? 2300 : 210,
    }));
    const result = await task.exec({
      inputs: {
        activity: { id: 1 },
        canonicalRecords: records,
        measuredPowerEvidence: 'RELIABLE',
      },
      cache: {},
      outputs: {},
      errors: {},
    } as MetricsContext);

    expect(result.outputs.maxMeanPower?.['1s']).toBe(2300);
    expect(result.outputs.maxMeanPower?.['5s']).toBeGreaterThan(2000);
    expect(result.outputs.maxMeanPower?.['1s']).toBeLessThan(3000);
  });
});
