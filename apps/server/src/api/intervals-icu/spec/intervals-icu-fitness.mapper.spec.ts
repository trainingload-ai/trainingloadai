import { describe, expect, it } from '@jest/globals';
import { mapIntervalsIcuFitnessRecordsToMetricWrites } from '../intervals-icu-fitness.mapper';

describe('mapIntervalsIcuFitnessRecordsToMetricWrites', () => {
  it('maps only vo2max and ignores sportInfo estimates', () => {
    const writes = mapIntervalsIcuFitnessRecordsToMetricWrites({
      externalAthleteId: 'i49291',
      records: [
        {
          id: '2026-07-05',
          vo2max: 52,
          sportInfo: [
            {
              type: 'Ride',
              eftp: 250,
              pMax: 900,
              wPrime: 18000,
            },
          ],
        },
      ],
    });

    expect(writes).toEqual([
      expect.objectContaining({
        type: 'VO2_MAX',
        value: 52,
        sport: 'UNKNOWN',
      }),
    ]);
  });
});
