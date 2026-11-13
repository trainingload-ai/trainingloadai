import { describe, expect, it } from '@jest/globals';
import {
  dateKeyFromWellness,
  intervalsIcuWellnessPatchMetricTypes,
  mapIntervalsIcuWellnessRecordsToDailyPatches,
  mapIntervalsIcuWellnessToHealthCandidates,
} from '../intervals-icu-health.mapper';
import { assertHealthMetricCandidate } from '@/health-data/health-metric-contract';
import type { IntervalsIcuWellness } from '@/integrations/intervals-icu/intervals-icu.client';

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

  it('maps hrv to rMSSD without inventing an SDNN measurement', () => {
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
        metricType: 'HRV_RMSSD_MS',
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

  it('keeps rMSSD and SDNN separate when both are supplied', () => {
    const candidates = mapIntervalsIcuWellnessToHealthCandidates({
      externalAthleteId: 'athlete-1',
      record: { id: '2026-11-12', hrv: 35, hrvSDNN: 56 },
    });
    expect(candidates).toEqual([
      expect.objectContaining({
        metricType: 'HRV_RMSSD_MS',
        value: 35,
        unit: 'ms',
      }),
      expect.objectContaining({
        metricType: 'HRV_SDNN_MS',
        value: 56,
        unit: 'ms',
      }),
    ]);
    expect(
      new Set(candidates.map((candidate) => candidate.externalId)).size,
    ).toBe(2);
  });

  it('scopes deletion to explicit null fields and preserves a real zero', () => {
    const patches = mapIntervalsIcuWellnessRecordsToDailyPatches({
      records: [{ id: '2026-11-12', hrv: null, steps: 0 }],
    });
    expect(patches).toEqual([
      {
        localDate: new Date('2026-11-12T00:00:00Z'),
        managedMetricTypes: ['HRV_RMSSD_MS', 'STEP_COUNT'],
        candidates: [
          expect.objectContaining({ metricType: 'STEP_COUNT', value: 0 }),
        ],
      },
    ]);
  });

  it('keeps an empty candidate list for an explicit null-only deletion', () => {
    expect(
      mapIntervalsIcuWellnessRecordsToDailyPatches({
        records: [{ id: '2026-11-12', weight: null }],
      }),
    ).toEqual([
      {
        localDate: new Date('2026-11-12T00:00:00Z'),
        managedMetricTypes: ['BODY_MASS_KG'],
        candidates: [],
      },
    ]);
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-1-02',
    'not-a-date',
  ])('rejects an invalid calendar date without normalizing it: %s', (id) => {
    expect(dateKeyFromWellness({ id })).toBeNull();
    expect(
      mapIntervalsIcuWellnessRecordsToDailyPatches({
        records: [{ id, weight: 70 }],
      }),
    ).toEqual([]);
  });

  it('accepts a real leap day', () => {
    expect(dateKeyFromWellness({ id: '2028-02-29' })).toBe('2028-02-29');
  });

  it('keeps the date key, real local-day range and source update time distinct', () => {
    const [candidate] = mapIntervalsIcuWellnessToHealthCandidates({
      externalAthleteId: 'athlete-1',
      timezone: 'Asia/Shanghai',
      record: {
        id: '2026-11-12',
        updated: '2026-11-13T07:52:28.571+08:00',
        weight: 70,
        tempWeight: true,
        comments: 'unrelated private notes',
      } as IntervalsIcuWellness,
    });
    expect(candidate).toMatchObject({
      localDate: new Date('2026-11-12T00:00:00Z'),
      timezone: 'Asia/Shanghai',
      startTime: new Date('2026-11-11T16:00:00Z'),
      endTime: new Date('2026-11-12T16:00:00Z'),
      sourceUpdatedAt: new Date('2026-11-12T23:52:28.571Z'),
      sourceNamespace: 'intervals_icu:athlete-1',
      rawPayload: {
        id: '2026-11-12',
        updated: '2026-11-13T07:52:28.571+08:00',
        weight: 70,
        tempWeight: true,
      },
    });
    expect(candidate.rawPayload).not.toHaveProperty('comments');
  });

  it.each([
    ['2026-03-08', 23],
    ['2026-11-01', 25],
  ])('uses the actual DST day length for %s', (id, hours) => {
    const [candidate] = mapIntervalsIcuWellnessToHealthCandidates({
      timezone: 'America/New_York',
      record: { id, steps: 100 },
    });
    expect(candidate.localDate).toEqual(new Date(`${id}T00:00:00Z`));
    expect(candidate.endTime.valueOf() - candidate.startTime.valueOf()).toBe(
      Number(hours) * 3600_000,
    );
  });

  it.each([undefined, 'Invalid/Timezone'])(
    'uses a deterministic UTC fallback for %s',
    (timezone) => {
      const [candidate] = mapIntervalsIcuWellnessToHealthCandidates({
        timezone,
        record: { id: '2026-11-12', weight: 70 },
      });
      expect(candidate).toMatchObject({
        timezone: 'UTC',
        startTime: new Date('2026-11-12T00:00:00Z'),
        endTime: new Date('2026-11-13T00:00:00Z'),
      });
    },
  );

  it.each([undefined, null, 'invalid', '2026-11-12T10:00:00'])(
    'does not invent an absolute source update time from %s',
    (updated) => {
      const [candidate] = mapIntervalsIcuWellnessToHealthCandidates({
        record: { id: '2026-11-12', updated, weight: 70 },
      });
      expect(candidate.sourceUpdatedAt).toBeNull();
    },
  );

  it.each([NaN, Infinity, false, '', '70'])(
    'rejects a non-contract numeric value without converting it to zero: %s',
    (weight) => {
      expect(() =>
        mapIntervalsIcuWellnessRecordsToDailyPatches({
          records: [{ id: '2026-11-12', weight } as IntervalsIcuWellness],
        }),
      ).toThrow('Invalid Intervals.icu wellness numeric value');
    },
  );

  it('emits only explicitly supplied metrics that satisfy the health candidate contract', () => {
    const [patch] = mapIntervalsIcuWellnessRecordsToDailyPatches({
      timezone: 'Asia/Shanghai',
      records: [
        {
          id: '2026-11-12',
          weight: 70,
          restingHR: 55,
          hrv: 35,
          hrvSDNN: 56,
          sleepSecs: 28_800,
          sleepScore: 80,
          avgSleepingHR: 50,
          steps: 1_000,
          vo2max: 52,
        },
      ],
    });
    expect(patch.candidates).toHaveLength(9);
    expect(patch.candidates.map((candidate) => candidate.metricType)).toEqual(
      patch.managedMetricTypes,
    );
    for (const candidate of patch.candidates) {
      expect(() => assertHealthMetricCandidate(candidate)).not.toThrow();
    }
    expect(
      mapIntervalsIcuWellnessToHealthCandidates({
        record: { id: '2026-11-12', weight: 70 },
      }).map((candidate) => candidate.metricType),
    ).toEqual(['BODY_MASS_KG']);
  });
});
