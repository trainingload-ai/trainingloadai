/**
 * W' Balance Algorithm (Skiba 2012 / Froncioni & Clarke)
 *
 * Implements the W' replenishment/utilisation algorithm.
 * Based on "Modeling the Expenditure and Reconstitution of Work Capacity above Critical Power" (Skiba et al., 2012).
 *
 * Ported from GoldenCheetah's WPrime.cpp
 */
/**
 * Calculate W' Balance using the integral model (Skiba 2012)
 *
 * @param powerSeries - Array of power data points (watts)
 * @param cp - Critical Power (watts)
 * @param wPrime - Anaerobic Work Capacity (joules)
 * @returns Array of W' Balance values (joules)
 */
export function calculateWPrimeBalance(
  powerSeries: number[],
  cp: number,
  wPrime: number,
): number[] {
  if (!powerSeries || powerSeries.length === 0) return [];

  // Calculate Tau (time constant) for recovery
  // Skiba 2012 formula: tau = 546 * exp(-0.01 * (CP - P_avg)) + 316
  // P_avg is the average power below CP
  let totalBelowCP = 0;
  let countBelowCP = 0;

  for (const p of powerSeries) {
    if (p < cp) {
      totalBelowCP += p;
      countBelowCP++;
    }
  }

  let tau: number;
  if (countBelowCP > 0) {
    const avgBelowCP = totalBelowCP / countBelowCP;
    tau = 546 * Math.exp(-0.01 * (cp - avgBelowCP)) + 316;
  } else {
    // Fallback if no recovery intervals (unlikely in long rides but possible in short hard efforts)
    // If always above CP, recovery rate is minimal/theoretical base
    tau = 546 * Math.exp(-0.01 * cp) + 316;
  }

  const result: number[] = new Array(powerSeries.length);
  // Optimization: Pre-calculate decay factor for 1 second
  // W'bal(t) = W' - integral(exp(t-u)/tau * (P(u)-CP))
  // Recursive form: W'bal(t) = W'bal(t-1) * e^(-1/tau) - (P(t)-CP) * (1 - e^(-1/tau)) ??
  // Actually, let's use the simple iterative integral update:
  // integral(t) = (P(t) > CP ? P(t) - CP : 0) + integral(t-1) * e^(-1/tau)
  // W'bal(t) = W' - integral(t)

  const decayFactor = Math.exp(-1.0 / tau);
  let integral = 0;

  for (let i = 0; i < powerSeries.length; i++) {
    const p = powerSeries[i];
    // Only expenditure (P > CP) adds to the integral directly
    // Recovery happens via the decay of the accumulated integral
    const exp = p > cp ? p - cp : 0;

    integral = exp + integral * decayFactor;

    let wb = wPrime - integral;

    // Clamp W' Balance between 0 and W' (cannot have more than W', cannot have less than 0 theoretically although can go negative in model if CP is wrong)
    // However, usually we allow it to go negative to show "debt" or incorrect CP
    // Skiba model doesn't strictly clamp negative values, but physical max is W'
    if (wb > wPrime) wb = wPrime;

    result[i] = wb;
  }

  return result;
}

export type TimedWPrimeBalanceResult = {
  values: Array<number | null>;
  coveredSeconds: number;
  unknownSeconds: number;
  tau: number;
};

/**
 * Timestamp-aware W′ balance. Zero watts is an observation; null power and
 * long gaps make the state unknown because recovery during that period cannot
 * be reconstructed safely.
 */
export function calculateTimedWPrimeBalance(
  samples: Array<{ tMs: number; power: number | null | undefined }>,
  cp: number,
  wPrime: number,
  maxGapSec = 30,
): TimedWPrimeBalanceResult {
  if (
    !samples.length ||
    !Number.isFinite(cp) ||
    cp <= 0 ||
    !Number.isFinite(wPrime) ||
    wPrime <= 0 ||
    !Number.isFinite(maxGapSec) ||
    maxGapSec <= 0
  ) {
    return { values: [], coveredSeconds: 0, unknownSeconds: 0, tau: 0 };
  }
  if (
    samples.some(
      (sample, index) =>
        !Number.isFinite(sample.tMs) ||
        (index > 0 && sample.tMs <= samples[index - 1].tMs),
    )
  ) {
    return {
      values: new Array(samples.length).fill(null),
      coveredSeconds: 0,
      unknownSeconds: 0,
      tau: 0,
    };
  }

  let belowEnergy = 0;
  let belowSeconds = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    const dt = (current.tMs - previous.tMs) / 1000;
    if (
      dt <= maxGapSec &&
      previous.power != null &&
      current.power != null &&
      Number.isFinite(previous.power) &&
      Number.isFinite(current.power)
    ) {
      const averagePower = (previous.power + current.power) / 2;
      if (averagePower < cp) {
        belowEnergy += averagePower * dt;
        belowSeconds += dt;
      }
    }
  }
  const avgBelowCp = belowSeconds > 0 ? belowEnergy / belowSeconds : 0;
  const tau = calculateTau(cp, avgBelowCp);
  const values: Array<number | null> = new Array(samples.length).fill(null);
  const firstPower = samples[0].power;
  let known =
    firstPower != null && Number.isFinite(firstPower) && firstPower >= 0;
  let integral = 0;
  let coveredSeconds = 0;
  let unknownSeconds = 0;
  if (known) values[0] = wPrime;

  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    const dt = (current.tMs - previous.tMs) / 1000;
    const valid =
      known &&
      dt <= maxGapSec &&
      previous.power != null &&
      current.power != null &&
      Number.isFinite(previous.power) &&
      Number.isFinite(current.power) &&
      previous.power >= 0 &&
      current.power >= 0;
    if (!valid) {
      known = false;
      unknownSeconds += dt;
      values[index] = null;
      continue;
    }

    const averagePower = (previous.power + current.power) / 2;
    integral *= Math.exp(-dt / tau);
    integral += Math.max(0, averagePower - cp) * dt;
    values[index] = wPrime - integral;
    coveredSeconds += dt;
  }

  return { values, coveredSeconds, unknownSeconds, tau };
}

/**
 * Calculate dynamic W' Balance Tau
 *
 * @param cp - Critical Power
 * @param avgPowerBelowCP - Average power when below CP
 * @returns Tau value
 */
export function calculateTau(cp: number, avgPowerBelowCP: number): number {
  return 546 * Math.exp(-0.01 * (cp - avgPowerBelowCP)) + 316;
}
