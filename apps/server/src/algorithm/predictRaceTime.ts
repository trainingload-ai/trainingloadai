import { dropDeadFormula } from './vo2max';

/**
 * Inverse of Oxygen Cost Formula
 * Calculates speed (m/min) possible with a given VO2
 * Solves: 0.000104*v^2 + 0.182258*v - (4.6 + VO2) = 0
 * Source: http://www.simpsonassociatesinc.com/runningmath1.htm
 * @param vo2 VO2max or Oxygen Cost
 * @returns Speed in meters per minute
 */
export const inverseOfOxygenCostFormula = (o2cost: number): number => {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + o2cost);
  const delta = b * b - 4 * a * c;
  if (delta < 0) return 0;
  return (-b + Math.sqrt(delta)) / (2 * a);
};

/**
 * Predict race time (in seconds) for a given VDOT and distance (meters)
 * Uses Daniels formula via Runalyze's approach (iterative solver)
 */
export const predictRaceTime = (
  vdot: number,
  distanceMeters: number,
): number | null => {
  if (!vdot || !distanceMeters || vdot <= 0 || distanceMeters <= 0) return null;

  // Binary search for time T (minutes) such that Distance(T) = distanceMeters
  // Distance(T) = speedFromVo2(vdot * getPercentOfVo2Max(T)) * T
  // Bounds: 10 seconds (0.16 min) to 48 hours (2880 min)
  let low = 0.1;
  let high = 2880;
  let guess = 30;

  for (let i = 0; i < 30; i++) {
    guess = (low + high) / 2;
    const intensity = dropDeadFormula(guess);
    const speed = inverseOfOxygenCostFormula(vdot * intensity); // m/min
    const dist = speed * guess; // meters

    if (Math.abs(dist - distanceMeters) < 5) {
      return guess * 60; // seconds
    }
    if (dist > distanceMeters) {
      high = guess;
    } else {
      low = guess;
    }
  }

  return guess * 60;
};
