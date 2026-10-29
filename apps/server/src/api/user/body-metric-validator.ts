export const MANUAL_WEIGHT_KG_MIN = 20;
export const MANUAL_WEIGHT_KG_MAX = 400;

export type BodyWeightValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Shared guard for manual body-weight writes from settings and AI Coach.
 * The range intentionally matches the existing profile editor so every entry
 * point accepts and rejects the same values.
 */
export function validateManualWeightKg(
  weightKg: number,
): BodyWeightValidationResult {
  if (!Number.isFinite(weightKg)) {
    return { valid: false, reason: 'value_not_finite' };
  }
  if (weightKg < MANUAL_WEIGHT_KG_MIN || weightKg > MANUAL_WEIGHT_KG_MAX) {
    return {
      valid: false,
      reason: `outside_intrinsic_range:${MANUAL_WEIGHT_KG_MIN}-${MANUAL_WEIGHT_KG_MAX}`,
    };
  }
  return { valid: true };
}
