export type WorkoutMatchingReason =
  | "AMBIGUOUS"
  | "INSUFFICIENT_EVIDENCE"
  | "COMPLEX_CANDIDATES";

export type WorkoutMatchingReview = {
  id: string;
  activityHashId: string;
  activityTitle: string | null;
  date: string;
  reason: WorkoutMatchingReason;
  candidates: Array<{
    workoutId: string;
    planId: string | null;
    planTitle?: string | null;
    name: string | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
  }>;
};
