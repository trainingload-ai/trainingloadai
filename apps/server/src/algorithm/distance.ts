export const ELEVATION_CORRECTION_POS = 3.5;
export const ELEVATION_CORRECTION_NEG = 1.1;

/**
 * Calculate "Effective Distance" based on elevation gain/loss
 * This compensates for the extra effort required for uphill running
 */
export function calculateEffectiveDistance(
  distance: number,
  elevationUp: number,
  elevationDown: number,
  posFactor: number = ELEVATION_CORRECTION_POS,
  negFactor: number = ELEVATION_CORRECTION_NEG,
): number {
  if (elevationUp <= 0 && elevationDown <= 0) return distance;

  const corrected =
    distance + elevationUp * posFactor + elevationDown * negFactor;
  // Safety floor: prevent negative distance or extremely short distance in pathological cases
  return Math.max(corrected, distance * 0.5);
}
