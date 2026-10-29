export type SessionRpeLoadInput = {
  rating: number | null | undefined;
  timerTimeSeconds?: number | null;
  elapsedTimeSeconds?: number | null;
};

export type SessionRpeLoad = {
  rating: number;
  durationMinutes: number;
  rawAu: number;
  normalizedLoad: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Convert a 1–10 session-RPE rating into both raw AU and the normalized
 * Trainingload scale where 60 minutes at RPE 10 equals 100.
 */
export function computeSessionRpeLoad(
  input: SessionRpeLoadInput,
): SessionRpeLoad | null {
  const rating = Number(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 10) return null;

  const timer = Number(input.timerTimeSeconds ?? 0);
  const elapsed = Number(input.elapsedTimeSeconds ?? 0);
  const durationSeconds =
    Number.isFinite(timer) && timer > 0
      ? timer
      : Number.isFinite(elapsed) && elapsed > 0
        ? elapsed
        : 0;
  if (durationSeconds <= 0) return null;

  const durationMinutes = durationSeconds / 60;
  const rawAu = durationMinutes * rating;
  return {
    rating,
    durationMinutes: round2(durationMinutes),
    rawAu: round2(rawAu),
    normalizedLoad: round2(rawAu / 6),
  };
}

export function computeNormalizedSessionRpeLoad(
  input: SessionRpeLoadInput,
): number | null {
  return computeSessionRpeLoad(input)?.normalizedLoad ?? null;
}
