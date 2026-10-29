import { ActivityDatasetSelectorService } from '../activity-dataset-selector.service';
import { describe, expect, it } from '@jest/globals';

describe('ActivityDatasetSelectorService', () => {
  const selector = new ActivityDatasetSelectorService();

  it('does not switch primary for the same dataset checksum', () => {
    expect(
      selector.shouldPromote({
        incoming: { score: 100 } as never,
        current: { score: 10 } as never,
        sameChecksum: true,
      }),
    ).toBe(false);
  });

  it('switches only when incoming quality clears the hysteresis margin', () => {
    expect(
      selector.shouldPromote({
        incoming: { score: 80 } as never,
        current: { score: 71 } as never,
        sameChecksum: false,
      }),
    ).toBe(false);
    expect(
      selector.shouldPromote({
        incoming: { score: 81 } as never,
        current: { score: 71 } as never,
        sameChecksum: false,
      }),
    ).toBe(true);
  });

  it('allows a useful incoming dataset to replace an unscored legacy primary', () => {
    expect(
      selector.shouldPromote({
        incoming: { score: 9 } as never,
        current: null,
        sameChecksum: false,
      }),
    ).toBe(false);
    expect(
      selector.shouldPromote({
        incoming: { score: 10 } as never,
        current: null,
        sameChecksum: false,
      }),
    ).toBe(true);
  });

  it('estimates a conservative, explainable quality floor for legacy data', () => {
    const quality = selector.evaluateLegacyActivity(
      {
        elapsedTime: 100,
        timerTime: 100,
        startLat: 1,
        startLng: 2,
        avgHeartRate: 150,
        maxHeartRate: 180,
        minHeartRate: 90,
        avgPower: null,
        maxPower: null,
        minPower: null,
        avgCadence: 80,
        maxCadence: 100,
        numLaps: 2,
        numLengths: 0,
      },
      [{ type: 'record', pointCount: 100 }],
    );

    expect(quality).toMatchObject({
      version: 'v1',
      recordCount: 100,
      recordDensity: 1,
      gpsCoverage: 0.25,
      heartRateCoverage: 0.5,
      powerCoverage: 0,
      cadenceCoverage: 0.5,
      lapCount: 2,
    });
    expect(quality.score).toBeGreaterThan(0);
  });
});
