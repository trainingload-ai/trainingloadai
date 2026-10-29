export type EnduranceZoneBasisSnapshot = Record<string, unknown>;

export type WorkoutIntensityIntentFamily =
  | "RECOVERY"
  | "EASY"
  | "ENDURANCE"
  | "STEADY"
  | "TEMPO"
  | "THRESHOLD"
  | "VO2MAX"
  | "ANAEROBIC"
  | "SPRINT"
  | "RACE_PACE"
  | "TECHNIQUE"
  | "OTHER";

export type WorkoutIntensityIntent = {
  family: WorkoutIntensityIntentFamily;
  purpose?: string;
  source?: "PLAN_BUILDER" | "AI_COACH" | "TEMPLATE" | "USER";
  auxiliaryRpe?: { low: number; high?: number } | null;
};

export type PrescriptionResolutionMode =
  | "LEGACY_SNAPSHOT"
  | "DYNAMIC_ZONE"
  | "FIXED_VALUE"
  | "EFFORT_ONLY";

export type EnduranceWorkoutStepTarget = {
  kind:
    | "NONE"
    | "SPEED"
    | "CADENCE"
    | "HEART_RATE_ZONE"
    | "HEART_RATE_CUSTOM"
    | "POWER_ZONE"
    | "POWER_CUSTOM";
  value?: number;
  valueHigh?: number;
  zoneIndex?: number;
  zoneLabel?: string;
  zoneSystem?: string;
  zoneSource?: string;
  zoneBasis?: EnduranceZoneBasisSnapshot | null;
  intensityIntent?: WorkoutIntensityIntent | null;
  resolutionMode?: PrescriptionResolutionMode;
  zoneSystemKey?: string;
  zoneFingerprint?: string;
  unit?: string;
};

export type EnduranceWorkoutStepDuration = {
  kind:
    | "TIME"
    | "DISTANCE"
    | "OPEN"
    | "CALORIES"
    | "HR_LESS_THAN"
    | "HR_GREATER_THAN"
    | "POWER_LESS_THAN"
    | "POWER_GREATER_THAN"
    | "CADENCE_LESS_THAN"
    | "CADENCE_GREATER_THAN";
  value?: number;
  unit?: "SECONDS" | "KILOMETERS" | "METERS" | "KJ" | "BPM" | "WATTS" | "RPM";
};

export type EnduranceWorkRestStep = {
  duration: number;
  power?: number;
  powerWatts?: number;
  cadence?: number;
  heartRatePercent?: number;
  heartRateBpm?: number;
  paceKmh?: number;
  gradeDeg?: number;
  stepKind?: "WARMUP" | "WORK" | "RECOVERY" | "REST" | "COOLDOWN" | "OTHER";
  durationMeta?: EnduranceWorkoutStepDuration | null;
  swimMeta?: {
    stroke?:
      | "FREESTYLE"
      | "BREASTSTROKE"
      | "BACKSTROKE"
      | "BUTTERFLY"
      | "DRILL"
      | "MEDLEY";
    trainingType?: "KICK" | "PULL" | "DRILL";
    equipment?: "FINS" | "KICKBOARD" | "PADDLES" | "PULL_BUOY" | "SNORKEL";
  } | null;
  primaryTargetMeta?: EnduranceWorkoutStepTarget | null;
  secondaryTarget?: EnduranceWorkoutStepTarget | null;
};

export type EnduranceWorkRestBlock = {
  type: "work" | "rest";
  steps: EnduranceWorkRestStep[];
};

export type EnduranceRepeatBlock = {
  type: "repeat";
  count: number;
  until?: {
    kind: Exclude<EnduranceWorkoutStepDuration["kind"], "OPEN">;
    value: number;
    unit: "SECONDS" | "METERS" | "CALORIES" | "BPM" | "WATTS" | "RPM";
  };
  children: EnduranceWorkRestBlock[];
};

export type EndurancePlanBlock = EnduranceWorkRestBlock | EnduranceRepeatBlock;

export type EnduranceWorkoutIrV1 = {
  kind: "ENDURANCE";
  version: 1;
  blocks: EndurancePlanBlock[];
};
