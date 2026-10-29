export const PMC_ALGORITHM_VERSION = '2.0-exponential-time-constant';

/**
 * Convert a time constant in days to the one-day decay factor used by
 * Intervals.icu's fitness/fatigue model.
 */
export function timeConstantDecayFactor(timeConstantDays: number): number {
  if (!Number.isFinite(timeConstantDays) || timeConstantDays <= 0) {
    throw new RangeError('PMC time constant must be a positive finite number');
  }

  return Math.exp(-1 / timeConstantDays);
}

/**
 * Advance one exponentially weighted load value by one day.
 */
export function nextExponentialLoad(
  previousLoad: number,
  dailyLoad: number,
  decayFactor: number,
): number {
  return previousLoad * decayFactor + dailyLoad * (1 - decayFactor);
}

/**
 * Intervals.icu's same-day Form convention: today's Fitness minus today's
 * Fatigue. Some PMC implementations instead use yesterday's values.
 */
export function currentTrainingStressBalance(
  currentFitness: number,
  currentFatigue: number,
): number {
  return currentFitness - currentFatigue;
}
