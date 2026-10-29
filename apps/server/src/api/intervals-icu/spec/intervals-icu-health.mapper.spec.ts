import { describe, expect, it } from '@jest/globals';
import {
  intervalsIcuWellnessPatchMetricTypes,
  mapIntervalsIcuWellnessToHealthCandidates,
} from '../intervals-icu-health.mapper';

describe('intervals-icu-health.mapper', () => {
  it('maps Intervals.icu wellness fields into provider-neutral candidates', () => {
    const candidates = mapIntervalsIcuWellnessToHealthCandidates({
      externalAthleteId: 'athlete-1',
      connectionId: 'connection-1',
      record: {
        id: '2026-07-03',
        weight: 70.5,
        restingHR: 48,
        hrvSDNN: 56,
        sleepSecs: 28800,
        sleepScore: 82,
        avgSleepingHR: 55,
        steps: 12345,
        vo2max: 52,
        fatigue: 3,
      },
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'INTERVALS_ICU',
          connectionId: 'connection-1',
          metricType: 'BODY_MASS_KG',
          externalId:
            'intervals-icu:wellness:athlete-1:2026-07-03:BODY_MASS_KG',
          localDate: new Date('2026-07-03T00:00:00.000Z'),
          value: 70.5,
          unit: 'kg',
          sourcePriority: 60,
        }),
        expect.objectContaining({
          metricType: 'RESTING_HEART_RATE_BPM',
          value: 48,
          unit: 'bpm',
        }),
        expect.objectContaining({
          metricType: 'HRV_SDNN_MS',
          value: 56,
          unit: 'ms',
        }),
        expect.objectContaining({
          metricType: 'SLEEP_ASLEEP_SECONDS',
          value: 28800,
          unit: 's',
        }),
        expect.objectContaining({
          metricType: 'SLEEP_AVG_HEART_RATE_BPM',
          value: 55,
          unit: 'bpm',
        }),
        expect.objectContaining({
          metricType: 'STEP_COUNT',
          value: 12345,
          unit: 'count',
        }),
        expect.objectContaining({
          metricType: 'VO2_MAX',
          value: 52,
          unit: 'ml/kg/min',
        }),
      ]),
    );
    expect(candidates.map((candidate) => candidate.metricType)).not.toContain(
      'fatigue',
    );
  });

  it('maps webhook hrv field to HRV_SDNN_MS when hrvSDNN is absent', () => {
    const candidates = mapIntervalsIcuWellnessToHealthCandidates({
      externalAthleteId: 'i49291',
      connectionId: 'connection-1',
      record: {
        id: '2026-07-05',
        hrv: 35,
      },
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        metricType: 'HRV_SDNN_MS',
        value: 35,
        unit: 'ms',
      }),
    ]);
  });

  it('distinguishes absent webhook fields from explicit null deletion patches', () => {
    expect(
      intervalsIcuWellnessPatchMetricTypes({
        id: '2026-07-05',
        weight: null,
        steps: 0,
      }),
    ).toEqual(['BODY_MASS_KG', 'STEP_COUNT']);
    expect(intervalsIcuWellnessPatchMetricTypes({ id: '2026-07-05' })).toEqual(
      [],
    );
  });
});
