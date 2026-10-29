export type StrengthSetType = "WARMUP" | "WORK";
export type StrengthLoadUnit = "KG" | "LB";

export type StrengthPrescriptionV1 =
  | {
      kind: "REPS";
      repsMin: number;
      repsMax: number;
      amrap: boolean;
    }
  | {
      kind: "TIME";
      durationSeconds: number;
    };

export type StrengthLoadV1 =
  | { kind: "OPEN" }
  | { kind: "ABSOLUTE"; value: number; unit: StrengthLoadUnit }
  | { kind: "PERCENT_1RM"; value: number }
  | { kind: "BODYWEIGHT" }
  | {
      kind: "BODYWEIGHT_OFFSET";
      value: number;
      direction: "ADDED" | "ASSISTED";
      unit: StrengthLoadUnit;
    };

export type StrengthEffortV1 =
  | { kind: "RPE"; value: number }
  | { kind: "RIR"; value: number };

export type StrengthSetGroupIrV1 = {
  id?: string;
  setType: StrengthSetType;
  setCount: number;
  prescription: StrengthPrescriptionV1;
  load: StrengthLoadV1;
  effort?: StrengthEffortV1;
  restSeconds?: number;
};

export type StrengthExerciseIrV1 = {
  id?: string;
  exerciseCode?: string;
  name: string;
  equipmentCode?: string;
  notes?: string;
  setGroups: StrengthSetGroupIrV1[];
};

export type StrengthWorkoutIrV1 = {
  kind: "STRENGTH";
  version: 1;
  durationSeconds?: number;
  plannedSessionRpe?: number;
  exercises: StrengthExerciseIrV1[];
};
