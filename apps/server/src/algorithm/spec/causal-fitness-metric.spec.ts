import { describe, expect, it } from '@jest/globals';
import { FitnessTimelineProjector } from '../fitness-timeline';
import {
  isCausalTimelineFitnessMetric,
  selectCausalTimelineFitnessMetrics,
  type CausalFitnessMetricInput,
} from '../causal-fitness-metric';

type FixtureRow = CausalFitnessMetricInput & {
  id: string;
  userId: string;
  type: 'LTHR';
  sport: 'RUN' | 'CYCLING';
  value: number;
};

/**
 * 旧指标的样例：成批 AUTO LTHR 落在日历日 UTC 零点，
 * 另有一条活动结束时刻的 AUTO，以及一条必须保留的 MANUAL。
 */
function legacyMidnightLthrBatch(userId: string): FixtureRow[] {
  const days = [
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
    '2026-07-01',
    '2026-07-15',
    '2026-07-16',
  ];
  const rows: FixtureRow[] = [];
  for (const day of days) {
    for (const sport of ['RUN', 'CYCLING'] as const) {
      rows.push({
        id: `${userId}-${sport}-${day}`,
        userId,
        type: 'LTHR',
        sport,
        source: 'AUTO',
        value: sport === 'RUN' ? 168 : 162,
        recordedAt: new Date(`${day}T00:00:00.000Z`),
        originPayload: null,
      });
    }
  }
  rows.push({
    id: `${userId}-run-activity-end`,
    userId,
    type: 'LTHR',
    sport: 'RUN',
    source: 'AUTO',
    value: 171,
    recordedAt: new Date('2026-07-15T11:05:33.000Z'),
    originPayload: { sourceActivityIds: [8801], method: 'PASSIVE_30M_TAIL20' },
  });
  rows.push({
    id: `${userId}-manual`,
    userId,
    type: 'LTHR',
    sport: 'RUN',
    source: 'MANUAL',
    value: 164,
    recordedAt: new Date('2026-07-16T00:00:00.000Z'),
    originPayload: null,
  });
  return rows;
}

function project(rows: readonly FixtureRow[]) {
  return new FitnessTimelineProjector(
    selectCausalTimelineFitnessMetrics(rows).map((row) => ({
      metric: row.type,
      sport: row.sport,
      value: row.value,
      value2: null,
      effectiveAt: row.recordedAt,
      origin: row.source === 'AUTO' ? ('AUTO' as const) : ('MANUAL' as const),
      evidenceFingerprint: row.id,
      sourceMetricId: row.id,
    })),
  );
}

describe('causal AUTO calendar-day projections', () => {
  it('keeps a real activity-end AUTO out of the midnight snap rule', () => {
    expect(
      isCausalTimelineFitnessMetric({
        source: 'AUTO',
        recordedAt: new Date('2026-07-15T11:05:33.000Z'),
        originPayload: { sourceActivityIds: [8801] },
      }),
    ).toBe(true);
  });

  it('keeps an AUTO whose activity actually ended at UTC midnight', () => {
    expect(
      isCausalTimelineFitnessMetric({
        source: 'AUTO',
        recordedAt: new Date('2026-07-16T00:00:00.000Z'),
        originPayload: { sourceActivityIds: [8802] },
      }),
    ).toBe(true);
    expect(
      isCausalTimelineFitnessMetric({
        source: 'AUTO',
        recordedAt: new Date('2026-07-16T00:00:00.000Z'),
        originPayload: { activityId: 42, method: 'OBSERVED_ACTIVITY_PEAK' },
      }),
    ).toBe(true);
  });

  it('rejects an AUTO calendar-day snap that only cites observation ids', () => {
    expect(
      isCausalTimelineFitnessMetric({
        source: 'AUTO',
        recordedAt: new Date('2026-08-07T00:00:00.000Z'),
        originPayload: {
          method: 'PASSIVE_30M_TAIL20',
          observationIds: ['obs-1', 'obs-2'],
        },
      }),
    ).toBe(false);
  });

  it.each(['legacy-athlete', 'legacy-athlete-two', 'legacy-athlete-three'])(
    'drops user %s midnight AUTO LTHR from the causal set and keeps MANUAL',
    (userId) => {
      const rows = legacyMidnightLthrBatch(userId);
      const causal = selectCausalTimelineFitnessMetrics(rows);

      expect(causal.map((row) => row.id)).toEqual([
        `${userId}-run-activity-end`,
        `${userId}-manual`,
      ]);
      expect(causal.some((row) => row.source === 'MANUAL' && row.value === 164)).toBe(
        true,
      );

      const atActivityStart = new Date('2026-07-16T01:10:00.000Z');
      const resolved = project(rows).resolve({
        metric: 'LTHR',
        sport: 'RUN',
        at: atActivityStart,
      });
      expect(resolved.origin).toBe('MANUAL');
      expect(resolved.value).toBe(164);

      const withoutManual = rows.filter((row) => row.source !== 'MANUAL');
      const fromActivity = project(withoutManual).resolve({
        metric: 'LTHR',
        sport: 'RUN',
        at: atActivityStart,
      });
      expect(fromActivity.origin).toBe('AUTO');
      expect(fromActivity.value).toBe(171);
      expect(fromActivity.effectiveAt).toEqual(new Date('2026-07-15T11:05:33.000Z'));
    },
  );

  it('does not let a midnight AUTO batch become the interval boundary', () => {
    const onlyMidnight = legacyMidnightLthrBatch('legacy-athlete').filter(
      (row) => row.source === 'AUTO' && row.recordedAt.getUTCHours() === 0,
    );
    const resolved = project(onlyMidnight).resolve({
      metric: 'LTHR',
      sport: 'RUN',
      at: new Date('2026-07-16T01:10:00.000Z'),
    });
    expect(resolved.origin).toBe('UNAVAILABLE');
    expect(resolved.value).toBeNull();
  });
});
