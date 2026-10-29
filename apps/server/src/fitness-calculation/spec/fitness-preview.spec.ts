import { describe, it, expect } from '@jest/globals';
import { UserFitnessMetricType } from '@prisma/client';
import { FITNESS_METRICS, FITNESS_SPORTS } from '@shared/fitness-assessment';
import { fitnessMethods } from '../fitness-methods';
import { fitnessEvidenceTool } from '@/api/ai/core/tools/fitnessAssessment.tools';
import {
  calculateFitnessPreview,
  type FitnessPreviewEvidence,
} from '@/algorithm/fitness-preview';
import { resolveCoachActiveSkill } from '@/api/ai/core/coach-skill-resolution';
const empty = (): FitnessPreviewEvidence => ({
  performances: [],
  heartRatePeaks: [],
  vo2: [],
  daily: [],
});
const reference = '2026-09-25T08:00:00Z';
describe('fitness capability completeness and common preview recipes', () => {
  it('covers every persisted fitness metric in the catalog and tool schema', () => {
    expect([...FITNESS_METRICS].sort()).toEqual(
      Object.values(UserFitnessMetricType).sort(),
    );
    for (const metric of FITNESS_METRICS)
      expect(fitnessMethods(metric).length).toBeGreaterThan(0);
    const properties = (fitnessEvidenceTool.parameters as any).properties;
    expect(properties.metric.enum).toEqual([...FITNESS_METRICS]);
    expect(properties.sport.enum).toEqual([...FITNESS_SPORTS]);
    expect(fitnessMethods('CSS', 'SWIM')[0].metrics).toContain('CS');
    expect(fitnessMethods('VO₂max')[0].metrics).toContain('VO2_MAX');
    expect(fitnessMethods('VDOT')).toEqual(fitnessMethods('VO2_MAX'));
    expect(fitnessMethods('VDOT')).toHaveLength(2);
  });
  it('makes unsupported AET explicit without advertising calculation/adoption', () => {
    for (const metric of ['AET_HR', 'AET_PACE'])
      expect(fitnessMethods(metric)[0]).toMatchObject({
        availability: 'UNSUPPORTED',
        applicationAvailable: false,
      });
  });
  it.each([
    '计算我的 CS',
    '帮我算一下静息心率',
    '根据今天的跑步预估最大摄氧量',
    '算一下有氧阈值',
    '重新计算游泳 CSS',
    'estimate my Pmax',
    'calculate my VDOT',
    '重新计算 TP，顺便解释',
  ])('keeps the explicit metric explainer entry point stable: %s', (prompt) => {
    expect(
      resolveCoachActiveSkill({ prompt, intent: 'metric-explainer' })?.name,
    ).toBe('metric-explainer');
  });
  it('fits CS from independent activities, keeps D-prime, and rejects single-activity pseudo-evidence', () => {
    const e = empty();
    e.performances = [225, 475, 725].map((t, i) => ({
      activityHashId: String(i),
      distanceM: 4 * t + 100,
      speedMps: (4 * t + 100) / t,
    }));
    const r = calculateFitnessPreview('DISTANCE_TIME', e, 'RUN', reference);
    expect(r.candidates).toEqual([{ metric: 'CS', value: 4, unit: 'm/s' }]);
    expect(r.observations[0].value).toBe(100);
    e.performances.forEach((p) => (p.activityHashId = 'one'));
    expect(
      calculateFitnessPreview('DISTANCE_TIME', e, 'RUN', reference).reason,
    ).toBe('MISSING_SIGNAL');
  });
  it('exposes TP as s/km, and VDOT under the canonical VO2_MAX metric', () => {
    const e = empty();
    e.performances = [
      { activityHashId: '5k', distanceM: 5000, speedMps: 5000 / 1200 },
    ];
    expect(
      calculateFitnessPreview('PACE_5K', e, 'RUN', reference).candidates[0],
    ).toEqual({ metric: 'TP', value: 260, unit: 's/km' });
    const v = calculateFitnessPreview('PERFORMANCE_VDOT', e, 'RUN', reference);
    expect(v.candidates[0].value).toBeCloseTo(49.81, 1);
    expect(v.candidates[0]).toMatchObject({
      metric: 'VO2_MAX',
      unit: 'ml/kg/min',
    });
    expect(v.limitations).toContain('VDOT_NOT_LAB_VO2MAX');
  });
  it('recomputes VO2 with a fixed cutoff and excludes future/stale/invalid data', () => {
    const e = empty();
    e.vo2 = [
      { activityHashId: 'now', date: reference, value: 50, source: 'FACTOR' },
      {
        activityHashId: 'older',
        date: new Date(Date.parse(reference) - 40 * 86400000).toISOString(),
        value: 40,
        source: 'RACE',
      },
      {
        activityHashId: 'future',
        date: '2026-09-26',
        value: 90,
        source: 'FACTOR',
      },
      {
        activityHashId: 'stale',
        date: '2025-01-01',
        value: 80,
        source: 'FACTOR',
      },
    ];
    const r = calculateFitnessPreview('ACTIVITY_VO2', e, 'RUN', reference);
    expect(r.candidates[0].value).toBeCloseTo(
      (50 + 40 / Math.E) / (1 + 1 / Math.E),
      2,
    );
    expect(r.activityHashIds).toEqual(['now', 'older']);
  });
  it('reports maximum observed HR without generating an adoptable MaxHR candidate', () => {
    const e = empty();
    e.heartRatePeaks = [
      { activityHashId: 'one', seconds: 1, value: 190 },
      { activityHashId: 'bad', seconds: 1, value: 300 },
    ];
    const r = calculateFitnessPreview('OBSERVED_HR', e, 'RUN', reference);
    expect(r.observationOnly).toBe(true);
    expect(r.candidates).toEqual([]);
    expect(r.observations[0].value).toBe(190);
  });
  it('calculates a daily resting-HR median, not an exercise minimum', () => {
    const e = empty();
    e.daily = [48, 52, 80].map((value, i) => ({
      date: `2026-09-${20 + i}`,
      value,
      provider: 'APPLE_HEALTH',
    }));
    const r = calculateFitnessPreview(
      'DAILY_RESTING_HR',
      e,
      'UNKNOWN',
      reference,
    );
    expect(r.candidates[0]).toEqual({
      metric: 'RESTING_HR',
      value: 52,
      unit: 'bpm',
    });
    expect(r.dailyRecordCount).toBe(3);
  });
});
