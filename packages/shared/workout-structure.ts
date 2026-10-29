import type { EnduranceWorkoutIrV1 } from "./endurance-workout-ir";
import type { StrengthWorkoutIrV1 } from "./strength-workout-ir";

export const WORKOUT_STRUCTURE_KINDS = [
  "ENDURANCE",
  "STRENGTH",
  "FREEFORM",
] as const;

export type WorkoutStructureKind = (typeof WORKOUT_STRUCTURE_KINDS)[number];
export type WorkoutDefinitionVersion = 1;

export type FreeformWorkoutIrV1 = {
  kind: "FREEFORM";
  version: 1;
  text: string;
};

export type WorkoutStructure =
  | EnduranceWorkoutIrV1
  | StrengthWorkoutIrV1
  | FreeformWorkoutIrV1;

export type WorkoutDefinitionInput =
  | {
      kind: WorkoutStructureKind;
      version: WorkoutDefinitionVersion;
      source: "TEXT";
      text: string;
    }
  | {
      kind: WorkoutStructureKind;
      version: WorkoutDefinitionVersion;
      source: "STRUCTURE";
      structure: WorkoutStructure;
    };
