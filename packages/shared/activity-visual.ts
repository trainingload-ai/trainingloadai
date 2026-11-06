export type ActivitySportVisual =
  | "run"
  | "cycling"
  | "swim"
  | "walking"
  | "hiking"
  | "strength"
  | "stretching"
  | "hiit"
  | "yoga"
  | "rowing"
  | "elliptical"
  | "other"
  | "unknown";

export function getActivitySportVisual(
  sportType: string | null | undefined,
  sportDefinitionCode?: string | null,
): ActivitySportVisual {
  switch (
    String(sportDefinitionCode ?? "")
      .trim()
      .toUpperCase()
  ) {
    case "WALKING":
      return "walking";
    case "HIKING":
      return "hiking";
    case "STRENGTH_TRAINING":
      return "strength";
    case "STRETCHING":
      return "stretching";
    case "HIIT":
      return "hiit";
    case "YOGA":
      return "yoga";
    case "ROWING":
      return "rowing";
    case "ELLIPTICAL":
      return "elliptical";
    case "CROSSFIT":
    case "PADEL":
    case "ALPINE_SKIING":
    case "SNOWBOARDING":
    case "MIXED_MARTIAL_ARTS":
    case "SOCCER":
    case "BASKETBALL":
    case "FISHING":
      return "other";
    default:
      if (sportType === "RUN") return "run";
      if (sportType === "CYCLING") return "cycling";
      if (sportType === "SWIM") return "swim";
      return "unknown";
  }
}
