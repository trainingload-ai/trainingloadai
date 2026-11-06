import {
  ActivityDatasetSelectorService,
  evaluateActivityDataset,
} from '../activity-dataset-selector.service';
import { describe, expect, it } from '@jest/globals';
import type { CanonicalActivityPayload } from '../canonical-activity.types';

function payload(
  overrides: Partial<CanonicalActivityPayload>,
): CanonicalActivityPayload {
  return {
    source: {
      kind: 'FILE',
      sourceUid: 'source-1',
    },
    identity: {
      sourceUid: 'source-1',
      dedupeKey: 'dedupe-1',
      datasetChecksum: 'a'.repeat(64),
    },
    summary: {
      sportType: 'UNKNOWN',
      elapsedTime: 100,
    },
    laps: [],
    records: [],
    lengths: [],
    ...overrides,
  };
}

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

  it('uses running-specific GPS, speed and heart-rate capabilities', () => {
    const quality = evaluateActivityDataset(
      payload({
        summary: { sportType: 'RUN', elapsedTime: 4 },
        records: Array.from({ length: 4 }, (_, index) => ({
          index,
          positionLat: 1,
          positionLong: 2,
          speed: 3,
          heartRate: 150,
          cadence: 170,
        })),
      }),
    );

    expect(quality).toMatchObject({
      version: 'v2',
      profile: 'RUN',
      gpsCoverage: 1,
      speedCoverage: 1,
      heartRateCoverage: 1,
      cadenceCoverage: 1,
    });
    expect(quality.score).toBe(85);
  });

  it('gives cycling power and cadence more weight than route-only data', () => {
    const power = evaluateActivityDataset(
      payload({
        summary: { sportType: 'CYCLING', elapsedTime: 4 },
        records: Array.from({ length: 4 }, (_, index) => ({
          index,
          power: 220,
          cadence: 90,
          heartRate: 145,
        })),
      }),
    );
    const routeOnly = evaluateActivityDataset(
      payload({
        summary: { sportType: 'CYCLING', elapsedTime: 4 },
        records: Array.from({ length: 4 }, (_, index) => ({
          index,
          positionLat: 1,
          positionLong: 2,
          speed: 8,
        })),
      }),
    );

    expect(power.profile).toBe('CYCLING');
    expect(power.score).toBeGreaterThan(routeOnly.score);
  });

  it('prefers structured swim lengths over an incidental GPS trace', () => {
    const structured = evaluateActivityDataset(
      payload({
        summary: { sportType: 'SWIM', elapsedTime: 600 },
        lengths: Array.from({ length: 20 }, (_, index) => ({
          index,
          totalDistance: 25,
          avgSpeed: 1.2,
        })),
        laps: Array.from({ length: 5 }, (_, index) => ({ index })),
      }),
    );
    const routeOnly = evaluateActivityDataset(
      payload({
        summary: { sportType: 'SWIM', elapsedTime: 20 },
        records: Array.from({ length: 20 }, (_, index) => ({
          index,
          positionLat: 1,
          positionLong: 2,
        })),
      }),
    );

    expect(structured.profile).toBe('SWIM');
    expect(structured.score).toBeGreaterThan(routeOnly.score);
  });

  it('prefers structured strength sets over heart-rate-only records', () => {
    const structured = evaluateActivityDataset(
      payload({
        summary: { sportType: 'UNKNOWN', elapsedTime: 600 },
        strengthSets: Array.from({ length: 10 }, (_, index) => ({
          sequenceIndex: index,
          setType: 'ACTIVE' as const,
          repetitions: 10,
          exercises: [{ category: 'benchPress', name: 'benchPress' }],
        })),
      }),
    );
    const heartRateOnly = evaluateActivityDataset(
      payload({
        summary: { sportType: 'UNKNOWN', elapsedTime: 10 },
        metadata: { trackswapSubSportRaw: 'strengthTraining' },
        records: Array.from({ length: 10 }, (_, index) => ({
          index,
          heartRate: 100,
        })),
      }),
    );

    expect(structured).toMatchObject({
      profile: 'STRENGTH',
      activeStrengthSetCount: 10,
      strengthExerciseCoverage: 1,
      strengthDetailCoverage: 1,
    });
    expect(structured.score).toBeGreaterThan(heartRateOnly.score);
  });
});
