import type {
  StrengthLoadV1,
  StrengthSetType,
  StrengthWorkoutIrV1,
} from "./strength-workout-ir";
import type { StrengthWorkoutSummary } from "./workout-summary";

export type StrengthActualSetSource = "APP" | "FIT" | "EXTERNAL" | "MANUAL";

export type ActivityStrengthSetV1 = {
  id?: string;
  plannedSetGroupId?: string;
  setIndex: number;
  setType: StrengthSetType;
  completedReps?: number;
  completedDurationSeconds?: number;
  load: StrengthLoadV1;
  actualRpe?: number;
  actualRir?: number;
  completedAt?: string | null;
  source: StrengthActualSetSource;
};

export type ActivityStrengthExerciseV1 = {
  id?: string;
  exerciseCode?: string;
  name: string;
  equipmentCode?: string;
  notes?: string;
  sets: ActivityStrengthSetV1[];
};

export type ActivityStrengthActualSummary = {
  kind: "STRENGTH_ACTUAL";
  exerciseCount: number;
  setCount: number;
  completedSetCount: number;
  workingSetCount: number;
  completedReps: number;
  timedSetSeconds: number;
  volumeLoadKg: number;
  volumeLoadLb: number;
};

export type ActivityStrengthResponse = {
  activityId: number;
  activityHashId: string;
  exercises: ActivityStrengthExerciseV1[];
  summary: ActivityStrengthActualSummary;
  planned: {
    workoutId: string;
    structure: StrengthWorkoutIrV1;
    summary: StrengthWorkoutSummary;
  } | null;
};
