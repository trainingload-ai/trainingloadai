import { estimateMaxHrFromAge } from "./zone-2-heart-rate";

/**
 * Age-based HRmax estimates and the %HRmax zone model.
 *
 * Tanaka and Fox match `estimateMaxHrFromAge` in zone-2-heart-rate.ts.
 * Zone bounds match the heart-rate zones page MHR model (`buildMhrZones`):
 * each closed zone ends one bpm before the next zone starts, and Z5 is
 * capped at the rounded HRmax. PR #60 owns extracting that shared zones
 * module; keep this copy aligned until that lands.
 *
 * Tanaka SEE: Tanaka, Monahan & Seals, J Am Coll Cardiol. 2001;37(1):153-156
 * (PMID 11153730). Later reviews summarize that paper's standard error of
 * the estimate as about 10 bpm. The ±10 band is only for the Tanaka equation.
 */

export const MAX_HR_FORMULA_KEYS = [
  "tanaka",
  "gulati",
  "hunt",
  "arena",
  "fox",
] as const;

export type MaxHrFormulaKey = (typeof MAX_HR_FORMULA_KEYS)[number];
export type MaxHrSex = "unspecified" | "male" | "female";
export type MaxHrFormulaChoice = "default" | MaxHrFormulaKey;

export const TANAKA_SEE_BPM = 10;

/** Shared with heart-rate zone prefill (`maxHr` ≤ 250). */
export const MEASURED_MAX_HR_LIMIT = 250;

const MHR_ZONE_STEPS = [
  { key: "z1", minPct: 50, nextPct: 60 },
  { key: "z2", minPct: 60, nextPct: 70 },
  { key: "z3", minPct: 70, nextPct: 80 },
  { key: "z4", minPct: 80, nextPct: 90 },
  { key: "z5", minPct: 90, nextPct: null },
] as const;

export type MaxHrZoneKey = (typeof MHR_ZONE_STEPS)[number]["key"];

export type MaxHrZone = {
  key: MaxHrZoneKey;
  minPct: number;
  maxPct: number;
  percentLabel: string;
  bpmMin: number;
  bpmMax: number;
};

const PARAM_LIMIT = 32;

export function roundBpm(value: number) {
  return Math.round(value);
}

export function isMaxHrFormulaKey(value: string): value is MaxHrFormulaKey {
  return (MAX_HR_FORMULA_KEYS as readonly string[]).includes(value);
}

function positiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

/** Raw formula output. Null for non-finite, non-positive age, or a non-positive result. */
export function estimateMaxHr(
  formula: MaxHrFormulaKey,
  age: number,
): number | null {
  if (!positiveFinite(age)) return null;
  const estimate = maxHrFormula(formula, age);
  if (!positiveFinite(estimate)) return null;
  return estimate;
}

function maxHrFormula(formula: MaxHrFormulaKey, age: number) {
  switch (formula) {
    case "tanaka":
      return estimateMaxHrFromAge(age, "tanaka") ?? Number.NaN;
    case "fox":
      return estimateMaxHrFromAge(age, "fox") ?? Number.NaN;
    case "gulati":
      return 206 - 0.88 * age;
    case "hunt":
      return 211 - 0.64 * age;
    case "arena":
      return 209.3 - 0.72 * age;
  }
}

export function recommendedMaxHrFormula(
  age: number,
  sex: MaxHrSex,
): MaxHrFormulaKey {
  if (sex === "female") return "gulati";
  if (age >= 60) return "hunt";
  return "tanaka";
}

export function parseMaxHrAge(value: string) {
  const raw = value.trim();
  if (!raw || raw.length > PARAM_LIMIT) return null;
  const age = Number(raw);
  if (!positiveFinite(age)) return null;
  return age;
}

export function parseMeasuredMaxHr(value: string) {
  const raw = value.trim();
  if (!raw || raw.length > PARAM_LIMIT) return null;
  const bpm = Number(raw);
  if (!positiveFinite(bpm) || bpm > MEASURED_MAX_HR_LIMIT) return null;
  return bpm;
}

/**
 * %HRmax zones for one already-chosen ceiling.
 * The anchor is rounded once; percentages are applied to that integer.
 */
export function calculateMhrZones(maxHr: number): MaxHrZone[] | null {
  if (!positiveFinite(maxHr)) return null;
  const anchor = roundBpm(maxHr);
  if (!positiveFinite(anchor)) return null;

  return MHR_ZONE_STEPS.map((step) => {
    const bpmMin = roundBpm((step.minPct / 100) * anchor);
    const bpmMax =
      step.nextPct == null
        ? anchor
        : roundBpm((step.nextPct / 100) * anchor) - 1;
    const min = Math.max(0, bpmMin);
    const max = Math.max(min, bpmMax);
    const maxPct = step.nextPct ?? 100;
    return {
      key: step.key,
      minPct: step.minPct,
      maxPct,
      percentLabel:
        step.nextPct == null
          ? `${step.minPct}%–100%`
          : `${step.minPct}%–${step.nextPct}%`,
      bpmMin: min,
      bpmMax: max,
    };
  });
}

/** Population SEE around the rounded Tanaka estimate. Not used for other formulas. */
export function tanakaSeeBand(age: number) {
  const estimate = estimateMaxHr("tanaka", age);
  if (estimate == null) return null;
  const bpm = roundBpm(estimate);
  return { min: bpm - TANAKA_SEE_BPM, max: bpm + TANAKA_SEE_BPM, bpm };
}

export type HeartRateSample = {
  seconds: number;
  heartRate?: number;
};

/**
 * Highest heart rate sustained for at least 1 second.
 *
 * This is an observed peak from the file, not a physiological maximum.
 * A window average is not an instantaneous peak.
 *
 * Samples that are not finite, are ≤ 0, or are above 250 bpm are ignored.
 * A gap longer than 10 seconds does not connect samples.
 *
 * Isolated spike: consecutive samples more than 20 bpm apart start a new
 * run. A run counts only when the first and last sample are at least 1
 * second apart, so a single-sample jump does not become the peak.
 */
export const OBSERVED_PEAK_MIN_SECONDS = 1;
export const OBSERVED_SPIKE_JUMP_BPM = 20;
export const OBSERVED_MAX_GAP_SECONDS = 10;

export function observeMaxHeartRate(records: HeartRateSample[]) {
  const samples = records
    .flatMap((record) => {
      const heartRate = record.heartRate;
      if (
        heartRate == null ||
        !Number.isFinite(heartRate) ||
        heartRate <= 0 ||
        heartRate > MEASURED_MAX_HR_LIMIT ||
        !Number.isFinite(record.seconds)
      ) {
        return [];
      }
      return [{ seconds: record.seconds, heartRate }];
    })
    .sort((a, b) => a.seconds - b.seconds)
    .filter(
      (sample, index, all) => index === 0 || sample.seconds > all[index - 1].seconds,
    );
  if (samples.length < 2) return null;

  let best: number | null = null;
  let runStart = 0;
  const closeRun = (endIndex: number) => {
    const duration = samples[endIndex].seconds - samples[runStart].seconds;
    if (duration < OBSERVED_PEAK_MIN_SECONDS) return;
    let peak = samples[runStart].heartRate;
    for (let index = runStart + 1; index <= endIndex; index += 1) {
      if (samples[index].heartRate > peak) peak = samples[index].heartRate;
    }
    if (best == null || peak > best) best = peak;
  };

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const gap = current.seconds - previous.seconds;
    const jump = Math.abs(current.heartRate - previous.heartRate);
    if (
      gap <= 0 ||
      gap > OBSERVED_MAX_GAP_SECONDS ||
      jump > OBSERVED_SPIKE_JUMP_BPM
    ) {
      closeRun(index - 1);
      runStart = index;
    }
  }
  closeRun(samples.length - 1);
  return best == null ? null : roundBpm(best);
}

export type ObservedPeakComparison = "higher" | "lower" | "equal";

/** Higher means the current reference may be low. Lower is not a fitness drop. */
export function compareObservedPeak(
  observed: number,
  reference: number,
): ObservedPeakComparison {
  if (observed > reference) return "higher";
  if (observed < reference) return "lower";
  return "equal";
}
