import { Gender } from '@prisma/client';

/**
 * Calculate Calories based on Heart Rate (Keytel formula)
 * @param heartRate Average Heart Rate (bpm)
 * @param age Age (years)
 * @param weight Weight (kg)
 * @param durationMin Duration (minutes)
 * @param gender Gender
 */
export const calculateCaloriesFromHeartRate = (
  heartRate: number,
  age: number,
  weight: number,
  durationMin: number,
  gender: Gender,
): number => {
  if (!heartRate || !weight || !durationMin) return 0;

  // Default age if missing, use 30 as a safe fallback or handle upstream
  const safeAge = age || 30;

  if (gender === Gender.MALE) {
    // Male: (-55.0969 + 0.6309 x HR + 0.1988 x Weight + 0.2017 x Age) / 4.184 x Time
    return (
      ((-55.0969 + 0.6309 * heartRate + 0.1988 * weight + 0.2017 * safeAge) /
        4.184) *
      durationMin
    );
  } else {
    // Female: (-20.4022 + 0.4472 x HR - 0.1263 x Weight + 0.074 x Age) / 4.184 x Time
    return (
      ((-20.4022 + 0.4472 * heartRate - 0.1263 * weight + 0.074 * safeAge) /
        4.184) *
      durationMin
    );
  }
};

/**
 * Calculate Calories based on Power (Work)
 * @param avgPower Average Power (Watts)
 * @param durationSec Duration (seconds)
 * @param efficiency Gross Mechanical Efficiency (default 0.24 for cycling)
 */
export const calculateCaloriesFromPower = (
  avgPower: number,
  durationSec: number,
  efficiency: number = 0.24, // 21-25% is typical for cycling
): number => {
  if (!avgPower || !durationSec) return 0;

  // Work (Joules) = Power (Watts) * Time (Seconds)
  const workJoules = avgPower * durationSec;

  // 1 kcal = 4184 Joules
  // Energy Expended (kcal) = Work (kcal) / Efficiency
  return workJoules / 4184 / efficiency;
};

/**
 * Calculate Fat Calories based on Total Calories and Intensity
 * Using a simplified model where fat oxidation percentage decreases as intensity increases.
 *
 * Approximation based on generic metabolic data:
 * < 50% HRmax: ~85% Fat
 * 50-60% HRmax: ~70% Fat
 * 60-70% HRmax: ~50% Fat
 * 70-80% HRmax: ~30% Fat
 * 80-90% HRmax: ~15% Fat
 * > 90% HRmax: ~5% Fat
 *
 * @param totalCalories Total Calories burned
 * @param avgHeartRate Average Heart Rate
 * @param maxHeartRate User's Maximum Heart Rate
 */
export const calculateFatCalories = (
  totalCalories: number,
  avgHeartRate: number,
  maxHeartRate: number,
): number => {
  if (!totalCalories || !avgHeartRate || !maxHeartRate) return 0;

  const intensity = avgHeartRate / maxHeartRate;
  let fatPercentage = 0;

  if (intensity < 0.5) {
    fatPercentage = 0.85;
  } else if (intensity < 0.6) {
    // Linear interpolation between 0.85 (at 0.5) and 0.70 (at 0.6)
    fatPercentage = 0.85 - (intensity - 0.5) * (0.15 / 0.1);
  } else if (intensity < 0.7) {
    // Linear interpolation between 0.70 (at 0.6) and 0.50 (at 0.7)
    fatPercentage = 0.7 - (intensity - 0.6) * (0.2 / 0.1);
  } else if (intensity < 0.8) {
    // Linear interpolation between 0.50 (at 0.7) and 0.30 (at 0.8)
    fatPercentage = 0.5 - (intensity - 0.7) * (0.2 / 0.1);
  } else if (intensity < 0.9) {
    // Linear interpolation between 0.30 (at 0.8) and 0.15 (at 0.9)
    fatPercentage = 0.3 - (intensity - 0.8) * (0.15 / 0.1);
  } else {
    // > 0.9
    fatPercentage = 0.05;
  }

  return Math.round(totalCalories * fatPercentage);
};
