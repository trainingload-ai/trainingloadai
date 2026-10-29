/**
 * Calculate Grade Adjusted Pace (GAP) speed based on Strava's model.
 *
 * Source: /Users/growingio/Documents/code/buerber/trainingloadai/server/src/algorithm/cpp/DanielsPoints.cpp#L40-114
 *
 * Running speed adjusted, according grade (grade adjusted pace model)
 * points from strava curve https://medium.com/strava-engineering/an-improved-gap-model-8b07ae8886c3
 * similar to research from Minetti 2002, but a little lower factor uphill and much lower downhill
 * grade is gradient in % (100% -> 45°)
 *
 * Data points:
 * { -40, 1.937}, { -34, 1.665}, { -32, 1.590}, { -30, 1.490}, { -28, 1.400},
 * { -26, 1.315}, { -24, 1.240}, { -22, 1.160}, { -20, 1.085}, { -18, 1.020},
 * { -16, 0.965}, { -14, 0.920}, { -12, 0.885}, { -10, 0.875}, {  -9, 0.875},
 * {  -8, 0.875}, {  -7, 0.875}, {  -6, 0.885}, {  -5, 0.900}, {  -4, 0.910},
 * {  -3, 0.935}, {  -2, 0.950}, {  -1, 0.980}, {   0, 1.000}, {   1, 1.020},
 * {   2, 1.050}, {   3, 1.100}, {   4, 1.140}, {   5, 1.190}, {   6, 1.240},
 * {   7, 1.290}, {   8, 1.350}, {   9, 1.410}, {  10, 1.480}, {  12, 1.600},
 * {  14, 1.770}, {  16, 1.930}, {  18, 2.110}, {  20, 2.280}, {  22, 2.470},
 * {  24, 2.645}, {  26, 2.820}, {  28, 2.985}, {  30, 3.160}, {  32, 3.320},
 * {  34, 3.470}, {  40, 3.739}
 *
 * @param speed - Current speed in meters per second (or any unit, as it's a multiplier)
 * @param grade - Gradient in percentage (e.g. 5 for 5%, -10 for -10%)
 * @returns Adjusted speed (GAP speed)
 */
export function computeGapSpeed(speed: number, grade: number = 0.0): number {
  let factor: number;

  if (grade === 0.0) {
    factor = 1;
  } else if (grade > 40) {
    factor = 3.739;
  } else if (grade < -40) {
    factor = 1.937;
  } else {
    // polynom function according points from strava GAP, works between -40% and 40%
    factor =
      -0.00000000340028981678083 * Math.pow(grade, 5) -
      0.000000471345135734814 * Math.pow(grade, 4) +
      0.000000777801576537029 * Math.pow(grade, 3) +
      0.001906977 * Math.pow(grade, 2) +
      0.0299822939 * grade +
      0.9935756154;
  }

  return speed * factor;
}

/**
 * Return grade-adjusted pace in seconds per meter.
 * `gradePercent` is always percentage points: 5 means 5%, never 0.05.
 */
export function computeGapPaceSecondsPerMeter(
  speedMetersPerSecond: number,
  gradePercent: number = 0,
): number | undefined {
  if (
    !Number.isFinite(speedMetersPerSecond) ||
    speedMetersPerSecond <= 0 ||
    !Number.isFinite(gradePercent)
  ) {
    return undefined;
  }
  const gapSpeed = computeGapSpeed(speedMetersPerSecond, gradePercent);
  return gapSpeed > 0 && Number.isFinite(gapSpeed) ? 1 / gapSpeed : undefined;
}
