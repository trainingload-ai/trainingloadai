export interface PowerDurationPoint {
  duration: number;
  power: number;
}

/**
 * Interpolates power duration points into a second-by-second MMP array.
 * eCP model expects a sentinel at index 0 and reads index t as t seconds.
 * Uses linear interpolation between points.
 *
 * @param points Sorted array of duration-power points
 * @returns Array of power values where index t corresponds to duration t seconds
 */
export function interpolateMmpData(points: PowerDurationPoint[]): number[] {
  if (!points || points.length === 0) {
    return [];
  }

  const normalized = [...points]
    .filter(
      (point) =>
        Number.isInteger(point.duration) &&
        point.duration > 0 &&
        Number.isFinite(point.power) &&
        point.power > 0,
    )
    .sort((a, b) => a.duration - b.duration);
  if (normalized.length === 0) return [];

  const maxDuration = normalized[normalized.length - 1].duration;
  const mmpData: number[] = new Array(maxDuration + 1).fill(0);

  // Linear Interpolation
  // Fill from 0 to first point (assume constant power of first point)
  // Note: points are expected to be sorted by duration
  for (let t = 1; t <= normalized[0].duration; t++) {
    mmpData[t] = normalized[0].power;
  }

  for (let i = 0; i < normalized.length - 1; i++) {
    const p1 = normalized[i];
    const p2 = normalized[i + 1];
    const durationDiff = p2.duration - p1.duration;
    const powerDiff = p2.power - p1.power;

    // Avoid division by zero if two points have same duration (should be filtered out before, but safe to check)
    if (durationDiff <= 0) continue;

    for (let t = p1.duration + 1; t <= p2.duration; t++) {
      const ratio = (t - p1.duration) / durationDiff;
      mmpData[t] = p1.power + powerDiff * ratio;
    }
  }

  return mmpData;
}
