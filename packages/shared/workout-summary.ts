export type WorkoutLoadConfidence = "HIGH" | "MEDIUM" | "LOW";
export type WorkoutLoadBucket = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type EnduranceWorkoutSummary = {
  kind: "ENDURANCE";
  durationSeconds: number | null;
  stepCount: number;
  hardSession: boolean | null;
};

export type StrengthWorkoutSummary = {
  kind: "STRENGTH";
  durationSeconds: number | null;
  durationSource: "EXPLICIT" | "DERIVED" | "UNKNOWN";
  plannedSessionRpe: number | null;
  exerciseCount: number;
  warmupSetCount: number;
  workingSetCount: number;
  totalRepsMin: number | null;
  totalRepsMax: number | null;
  timedSetSeconds: number;
  volumeLoadKg: number | null;
  volumeLoadLb: number | null;
  loadConfidence: WorkoutLoadConfidence;
  hardSession: boolean | null;
  lowerBodyLoad: WorkoutLoadBucket;
  upperBodyLoad: WorkoutLoadBucket;
};

export type FreeformWorkoutSummary = {
  kind: "FREEFORM";
  durationSeconds: number | null;
  hardSession: null;
};

export type WorkoutSummary =
  | EnduranceWorkoutSummary
  | StrengthWorkoutSummary
  | FreeformWorkoutSummary;
