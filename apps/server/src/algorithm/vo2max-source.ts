export const VO2MAX_SOURCE_PREFERENCES = ['FACTOR', 'STANDARD'] as const;

export type Vo2MaxSourcePreference = (typeof VO2MAX_SOURCE_PREFERENCES)[number];

export type Vo2MaxResolvedSource = 'FACTOR' | 'RACE';

export type ActivityVo2MaxValues = {
  vo2maxVdotByHr?: number | null;
  vo2maxVdotByFactor?: number | null;
  vo2maxVdotByRace?: number | null;
};

const SOURCE_ORDER: Record<
  Vo2MaxSourcePreference,
  readonly Vo2MaxResolvedSource[]
> = {
  FACTOR: ['FACTOR', 'RACE'],
  STANDARD: ['RACE', 'FACTOR'],
};

function finitePositive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function normalizeVo2MaxSourcePreference(
  value: string | null | undefined,
): Vo2MaxSourcePreference {
  // HEARTRATE is a legacy persisted value. Raw HR estimates are no longer a
  // valid final VO2 max source, so legacy/unknown values use the corrected path.
  return value === 'STANDARD' ? 'STANDARD' : 'FACTOR';
}

/**
 * Resolve the one VO2 max value product features are allowed to consume.
 *
 * Internally estimated HR values are always corrected by the athlete's current
 * factor before use. The stored corrected value is only a compatibility
 * fallback for callers that cannot load the current profile yet. Race VDOT can
 * remain the preferred independent performance source.
 */
export function resolveEffectiveActivityVo2Max(
  values: ActivityVo2MaxValues | null | undefined,
  preference: string | null | undefined = 'FACTOR',
  correctionFactor?: number | null,
): { value: number; source: Vo2MaxResolvedSource } | undefined {
  if (!values) return undefined;

  const heartRateValue = finitePositive(values.vo2maxVdotByHr);
  const currentFactor =
    typeof correctionFactor === 'number' &&
    Number.isFinite(correctionFactor) &&
    correctionFactor > 0
      ? correctionFactor
      : undefined;
  const currentCorrectedValue =
    heartRateValue !== undefined && currentFactor !== undefined
      ? heartRateValue * currentFactor
      : undefined;

  const candidates: Record<Vo2MaxResolvedSource, number | undefined> = {
    FACTOR:
      finitePositive(currentCorrectedValue) ??
      finitePositive(values.vo2maxVdotByFactor) ??
      // A missing factor means the default 1.0 factor, not permission to expose
      // a separate uncorrected product value.
      heartRateValue,
    RACE: finitePositive(values.vo2maxVdotByRace),
  };

  for (const source of SOURCE_ORDER[
    normalizeVo2MaxSourcePreference(preference)
  ]) {
    const value = candidates[source];
    if (value !== undefined) return { value, source };
  }

  return undefined;
}
