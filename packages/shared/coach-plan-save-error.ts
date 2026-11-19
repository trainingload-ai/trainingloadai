import { errorHttpStatus } from "./runtime-reliability";

export type CoachPlanSaveErrorKind =
  | "tooLarge"
  | "validation"
  | "network"
  | "service"
  | "rateLimit"
  | "authentication"
  | "noWorkouts"
  | "unknown";

/** Classify transport failures without exposing raw provider or server messages. */
export function coachPlanSaveErrorKind(error: unknown): CoachPlanSaveErrorKind {
  const status = errorHttpStatus(error);
  if (status === 413) return "tooLarge";
  if (status === 401) return "authentication";
  if (status === 429) return "rateLimit";
  if (status === 408 || status === 504) return "network";
  if (status != null && status >= 500) return "service";
  if (status === 400 || status === 422) return "validation";
  if (!error || typeof error !== "object") return "unknown";
  const value = error as {
    status?: unknown;
    errorCode?: unknown;
    name?: unknown;
    message?: unknown;
  };
  if (value.message === "NO_WORKOUTS") return "noWorkouts";
  if (value.status === 0 || value.errorCode === "NETWORK_ERROR")
    return "network";
  if (
    value.name === "TypeError" &&
    /fetch|network|load failed/i.test(String(value.message))
  )
    return "network";
  return "unknown";
}
