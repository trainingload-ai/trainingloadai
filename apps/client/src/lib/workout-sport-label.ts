export type WorkoutSportLabelKind =
  | "strength"
  | "stretching"
  | "cycling"
  | "swim"
  | "run"
  | "other";

export function resolveWorkoutSportLabelKind({
  sportType,
  structureKind,
  sportDefinitionCode,
}: {
  sportType?: string | null;
  structureKind?: string | null;
  sportDefinitionCode?: string | null;
}): WorkoutSportLabelKind {
  const normalizedSport = String(sportType ?? "").trim().toUpperCase();
  const normalizedStructure = String(structureKind ?? "").trim().toUpperCase();
  const normalizedDefinition = String(sportDefinitionCode ?? "")
    .trim()
    .toUpperCase();

  if (
    normalizedStructure === "STRENGTH" ||
    normalizedDefinition === "STRENGTH_TRAINING" ||
    normalizedSport === "STRENGTH"
  ) {
    return "strength";
  }
  if (
    normalizedDefinition === "STRETCHING" ||
    normalizedSport === "STRETCHING"
  ) {
    return "stretching";
  }
  if (normalizedSport === "CYCLING" || normalizedSport === "BIKE") {
    return "cycling";
  }
  if (normalizedSport === "SWIM" || normalizedSport === "SWIMMING") {
    return "swim";
  }
  if (normalizedSport === "RUN" || normalizedSport === "RUNNING") {
    return "run";
  }
  return "other";
}
