export type SwimLengthForSwolf = {
  duration?: number | null;
  totalStrokes?: number | null;
};

/** Pool-swimming SWOLF for one valid length: elapsed seconds + stroke count. */
export function computeLengthSwolf(
  length: SwimLengthForSwolf,
): number | undefined {
  const duration = length.duration;
  const strokes = length.totalStrokes;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    typeof strokes !== "number" ||
    !Number.isFinite(strokes) ||
    strokes < 0
  ) {
    return undefined;
  }
  return duration + strokes;
}

export function computeAverageSwolf(
  lengths: SwimLengthForSwolf[],
): number | undefined {
  const values = lengths
    .map(computeLengthSwolf)
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
