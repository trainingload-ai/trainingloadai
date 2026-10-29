import { computeCriticalSpeed } from './cs';
import { calculateTimeDecay } from './time-decay';
import { getVdotFromRace } from './vo2max';
import type {
  FitnessCandidate,
  FitnessAssessmentResult,
  FitnessReason,
  FitnessSport,
} from '@shared/fitness-assessment';

export type FitnessPreviewEvidence = {
  performances: Array<{
    activityHashId: string;
    distanceM: number;
    speedMps: number;
  }>;
  heartRatePeaks: Array<{
    activityHashId: string;
    seconds: number;
    value: number;
  }>;
  vo2: Array<{
    activityHashId: string;
    date: string;
    value: number;
    source: string;
  }>;
  daily: Array<{ date: string; value: number; provider: string }>;
};
export type PreviewRecipe =
  | 'DISTANCE_TIME'
  | 'PACE_5K'
  | 'PERFORMANCE_VDOT'
  | 'ACTIVITY_VO2'
  | 'OBSERVED_HR'
  | 'DAILY_RESTING_HR';
type ComputedValue = Pick<FitnessCandidate, 'metric' | 'value' | 'unit'>;
export type FitnessPreviewOutput = {
  candidates: ComputedValue[];
  observations: FitnessAssessmentResult['observations'];
  checks: FitnessAssessmentResult['evidence']['checks'];
  limitations: string[];
  reason?: FitnessReason;
  observationOnly?: boolean;
  activityHashIds: string[];
  dailyRecordCount?: number;
};
const finite = (v: number) => Number.isFinite(v) && v > 0;
const round = (v: number) => Math.round(v * 100) / 100;
const base = (): FitnessPreviewOutput => ({
  candidates: [],
  observations: [],
  checks: [],
  limitations: ['USER_ADOPTED_ESTIMATE'],
  activityHashIds: [],
});
const handlers: Record<
  PreviewRecipe,
  (
    e: FitnessPreviewEvidence,
    sport: FitnessSport,
    reference: string,
  ) => FitnessPreviewOutput
> = {
  DISTANCE_TIME(e, sport) {
    const r = base(),
      best = new Map<number, FitnessPreviewEvidence['performances'][number]>();
    for (const p of e.performances) {
      const time = p.distanceM / p.speedMps;
      if (
        !finite(p.speedMps) ||
        !finite(p.distanceM) ||
        (sport === 'RUN' && (time < 120 || time > 900))
      )
        continue;
      if (
        !best.has(p.distanceM) ||
        best.get(p.distanceM)!.speedMps < p.speedMps
      )
        best.set(p.distanceM, p);
    }
    const points = [...best.values()];
    const independent = new Set(points.map((p) => p.activityHashId)).size;
    r.checks.push({
      code: 'INDEPENDENT_ACTIVITIES',
      passed: independent >= 3,
      observed: independent,
      required: 3,
    });
    if (points.length < 3 || independent < 3)
      return { ...r, reason: 'MISSING_SIGNAL' };
    const fit = computeCriticalSpeed(
      points.map((p) => ({
        distance_m: p.distanceM,
        time_s: p.distanceM / p.speedMps,
      })),
    );
    const valid =
      fit.cs !== null &&
      finite(fit.cs) &&
      fit.dPrimeM !== null &&
      finite(fit.dPrimeM) &&
      fit.r2 !== null &&
      fit.r2 >= 0.95 &&
      (sport !== 'RUN' || fit.cs >= 1.8);
    r.checks.push({
      code: 'FIT_R_SQUARED',
      passed: valid,
      observed: fit.r2 ?? 0,
      required: 0.95,
    });
    if (!valid) return { ...r, reason: 'QUALITY_REJECTED' };
    r.candidates = [{ metric: 'CS', value: round(fit.cs!), unit: 'm/s' }];
    r.observations = [
      { metric: 'dPrime', value: round(fit.dPrimeM!), unit: 'm' },
    ];
    r.activityHashIds = [...new Set(points.map((p) => p.activityHashId))];
    r.limitations.push(
      'RECORDED_PERFORMANCE_NOT_MAXIMAL_CAPACITY',
      'DERIVED_ACTIVITY_PEAKS',
    );
    if (sport === 'CYCLING') r.limitations.push('CYCLING_SPEED_ENVIRONMENT');
    return r;
  },
  PACE_5K(e) {
    const r = base();
    const best = e.performances
      .filter(
        (p) => p.distanceM === 5000 && finite(p.speedMps) && p.speedMps <= 12,
      )
      .sort((a, b) => b.speedMps - a.speedMps)[0];
    if (!best || 1000 / best.speedMps > 3600)
      return { ...r, reason: 'MISSING_SIGNAL' };
    r.candidates = [
      { metric: 'TP', value: round(1000 / best.speedMps + 20), unit: 's/km' },
    ];
    r.activityHashIds = [best.activityHashId];
    r.limitations.push('TP_EMPIRICAL_OFFSET', 'DERIVED_ACTIVITY_PEAKS');
    return r;
  },
  PERFORMANCE_VDOT(e) {
    const r = base();
    const best = e.performances
      .filter(
        (p) =>
          p.distanceM >= 1500 &&
          p.distanceM <= 42195 &&
          finite(p.speedMps) &&
          p.speedMps <= 12 &&
          p.distanceM / p.speedMps >= 180,
      )
      .map((p) => ({
        ...p,
        vdot: getVdotFromRace(p.distanceM, p.distanceM / p.speedMps),
      }))
      .filter((p) => finite(p.vdot) && p.vdot <= 100)
      .sort((a, b) => b.vdot - a.vdot)[0];
    if (!best) return { ...r, reason: 'MISSING_SIGNAL' };
    r.candidates = [
      { metric: 'VO2_MAX', value: round(best.vdot), unit: 'ml/kg/min' },
    ];
    r.activityHashIds = [best.activityHashId];
    r.limitations.push('VDOT_NOT_LAB_VO2MAX', 'DERIVED_ACTIVITY_PEAKS');
    return r;
  },
  ACTIVITY_VO2(e, _sport, reference) {
    const r = base(),
      ref = Date.parse(reference);
    const points = e.vo2.filter(
      (p) =>
        finite(p.value) &&
        p.value <= 100 &&
        Date.parse(p.date) <= ref &&
        Date.parse(p.date) >= ref - 120 * 86400000,
    );
    const value = calculateTimeDecay(points, {
      decayDays: 40,
      truncationMultiple: 3,
      referenceDate: ref,
    });
    if (value === null || !finite(value))
      return { ...r, reason: 'MISSING_SIGNAL' };
    r.candidates = [
      { metric: 'VO2_MAX', value: round(value), unit: 'ml/kg/min' },
    ];
    r.activityHashIds = points.map((p) => p.activityHashId);
    r.limitations.push(
      'DERIVED_ACTIVITY_ESTIMATES',
      'FIELD_ESTIMATE_NOT_LAB_MEASUREMENT',
    );
    return r;
  },
  OBSERVED_HR(e) {
    const r = base(),
      valid = e.heartRatePeaks.filter(
        (p) =>
          Number.isFinite(p.value) &&
          p.value >= 80 &&
          p.value <= 240 &&
          finite(p.seconds),
      );
    const instant = valid.filter((p) => p.seconds === 1),
      pool = instant.length ? instant : valid;
    const best = pool.sort((a, b) => b.value - a.value)[0];
    if (!best) return { ...r, reason: 'MISSING_SIGNAL' };
    r.observationOnly = true;
    r.observations = [
      { metric: 'observedMaxHr', value: round(best.value), unit: 'bpm' },
    ];
    r.activityHashIds = [best.activityHashId];
    r.limitations.push('OBSERVED_HR_NOT_MAXIMUM', 'DERIVED_ACTIVITY_PEAKS');
    if (!instant.length) r.limitations.push('HR_WINDOW_AVERAGE');
    return r;
  },
  DAILY_RESTING_HR(e) {
    const r = base(),
      daily = e.daily
        .filter(
          (p) => Number.isFinite(p.value) && p.value >= 25 && p.value <= 120,
        )
        .sort((a, b) => a.value - b.value);
    r.dailyRecordCount = daily.length;
    if (!daily.length) return { ...r, reason: 'MISSING_SIGNAL' };
    const i = Math.floor(daily.length / 2),
      value =
        daily.length % 2
          ? daily[i].value
          : (daily[i - 1].value + daily[i].value) / 2;
    r.candidates = [{ metric: 'RESTING_HR', value: round(value), unit: 'bpm' }];
    r.limitations.push('DAILY_HEALTH_MEDIAN');
    return r;
  },
};
export function calculateFitnessPreview(
  recipe: PreviewRecipe,
  evidence: FitnessPreviewEvidence,
  sport: FitnessSport,
  reference: string,
) {
  return handlers[recipe](evidence, sport, reference);
}
