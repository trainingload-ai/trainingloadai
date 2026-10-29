import {
  DURATION_UNITS,
  INTENSITY_KINDS,
  STEP_TYPES,
  WORKOUT_SPORTS,
  createEmptyStep,
  createEmptyWorkout,
  createExampleWorkout,
  hasMeaningfulWorkout,
  isRepeat,
  repeatTimes,
  workoutToDsl,
  type DurationUnit,
  type IntensityKind,
  type WorkoutDraft,
  type WorkoutExampleId,
  type WorkoutModule,
  type WorkoutSport,
  type WorkoutStep,
  type WorkoutStepType,
} from "./workout-model";

export const MAX_SHARE_NAME = 80;
export const MAX_SHARE_TEXT = 64;
export const MAX_SHARE_NOTES = 120;
export const MAX_SHARE_WORKFLOW = 1500;

export type WorkoutShareInputs = {
  draft: WorkoutDraft;
  example: WorkoutExampleId | null;
};

type CompactStep = [
  WorkoutStepType,
  number | null,
  DurationUnit,
  IntensityKind,
  string,
  string,
];

type CompactModule =
  | { k: "s"; s: CompactStep }
  | { k: "r"; t: number; s: CompactStep[] };

type CompactWorkout = {
  name: string;
  sport: WorkoutSport;
  notes: string;
  modules: CompactModule[];
};

function isEnum<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function compactStep(step: WorkoutStep): CompactStep | null {
  if (step.intensityValue.length > MAX_SHARE_TEXT) return null;
  if (step.freeText.length > MAX_SHARE_TEXT) return null;
  if (
    step.durationValue != null &&
    (!Number.isFinite(step.durationValue) || step.durationValue > 1e7)
  ) {
    return null;
  }
  return [
    step.stepType,
    step.durationValue != null && Number.isFinite(step.durationValue)
      ? step.durationValue
      : null,
    step.durationUnit,
    step.intensityKind,
    step.intensityValue,
    step.freeText,
  ];
}

export function serializeWorkoutWorkflow(draft: WorkoutDraft): string | null {
  if (draft.name.length > MAX_SHARE_NAME || draft.notes.length > MAX_SHARE_NOTES) {
    return null;
  }
  const modules: CompactModule[] = [];
  for (const block of draft.modules) {
    if (isRepeat(block)) {
      const times = repeatTimes(block.times);
      if (times == null) return null;
      const steps: CompactStep[] = [];
      for (const step of block.steps) {
        const compact = compactStep(step);
        if (!compact) return null;
        steps.push(compact);
      }
      modules.push({ k: "r", t: times, s: steps });
      continue;
    }
    const compact = compactStep(block);
    if (!compact) return null;
    modules.push({ k: "s", s: compact });
  }
  const payload: CompactWorkout = {
    name: draft.name,
    sport: draft.sport,
    notes: draft.notes,
    modules,
  };
  const encoded = JSON.stringify(payload);
  return encoded.length <= MAX_SHARE_WORKFLOW ? encoded : null;
}

function readStep(value: unknown): WorkoutStep | null {
  if (!Array.isArray(value) || value.length < 6) return null;
  const [stepType, durationValue, durationUnit, intensityKind, intensityValue, freeText] =
    value;
  if (!isEnum(STEP_TYPES, stepType)) return null;
  if (!isEnum(DURATION_UNITS, durationUnit)) return null;
  if (!isEnum(INTENSITY_KINDS, intensityKind)) return null;
  if (typeof intensityValue !== "string" || intensityValue.length > MAX_SHARE_TEXT) {
    return null;
  }
  if (typeof freeText !== "string" || freeText.length > MAX_SHARE_TEXT) return null;
  const duration =
    durationValue == null
      ? null
      : typeof durationValue === "number" &&
          Number.isFinite(durationValue) &&
          durationValue > 0 &&
          durationValue <= 1e7
        ? durationValue
        : null;
  if (durationValue != null && duration == null) return null;
  return createEmptyStep(stepType, {
    durationValue: duration,
    durationUnit,
    intensityKind,
    intensityValue,
    freeText,
  });
}

export function parseWorkoutWorkflow(raw: string): WorkoutDraft | null {
  if (raw.length === 0 || raw.length > MAX_SHARE_WORKFLOW) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<CompactWorkout>;
  if (!isEnum(WORKOUT_SPORTS, record.sport)) return null;
  if (typeof record.name !== "string" || record.name.length > MAX_SHARE_NAME) return null;
  if (typeof record.notes !== "string" || record.notes.length > MAX_SHARE_NOTES) {
    return null;
  }
  if (!Array.isArray(record.modules) || record.modules.length === 0) return null;
  const modules: WorkoutModule[] = [];
  for (const block of record.modules) {
    if (!block || typeof block !== "object") return null;
    if (block.k === "s") {
      const step = readStep(block.s);
      if (!step) return null;
      modules.push(step);
      continue;
    }
    if (block.k === "r") {
      const times = typeof block.t === "number" ? repeatTimes(block.t) : null;
      if (times == null || !Array.isArray(block.s) || block.s.length === 0) return null;
      const steps: WorkoutStep[] = [];
      for (const child of block.s) {
        const step = readStep(child);
        if (!step) return null;
        steps.push(step);
      }
      modules.push({
        id: steps[0] ? `repeat-${steps[0].id}` : "repeat",
        kind: "repeat",
        times,
        steps,
      });
      continue;
    }
    return null;
  }
  return {
    name: record.name,
    sport: record.sport,
    notes: record.notes,
    modules,
  };
}

function sameExample(draft: WorkoutDraft, example: WorkoutExampleId): boolean {
  const sample = createExampleWorkout(example);
  return (
    draft.sport === sample.sport &&
    draft.name === sample.name &&
    draft.notes === sample.notes &&
    workoutToDsl(draft) === workoutToDsl(sample)
  );
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

export function readWorkoutShare(
  params: Record<string, string | string[] | undefined>,
): WorkoutShareInputs {
  const exampleRaw = readParam(params, "example");
  const example =
    exampleRaw === "intervals" || exampleRaw === "1"
      ? "intervals"
      : exampleRaw === "pool"
        ? "pool"
        : null;
  const workflow = readParam(params, "w");
  if (workflow) {
    const draft = parseWorkoutWorkflow(workflow);
    if (draft && hasMeaningfulWorkout(draft)) return { draft, example: null };
    return { draft: createEmptyWorkout(), example: null };
  }
  if (example) return { draft: createExampleWorkout(example), example };
  return { draft: createEmptyWorkout(), example: null };
}

export function workoutShareTooLong(
  draft: WorkoutDraft,
  example: WorkoutExampleId | null,
): boolean {
  if (!hasMeaningfulWorkout(draft)) return false;
  if (example && sameExample(draft, example)) return false;
  return serializeWorkoutWorkflow(draft) == null;
}

export function nextWorkoutShareUrl(
  currentHref: string,
  draft: WorkoutDraft,
  example: WorkoutExampleId | null,
): { href: string; tooLong: boolean } {
  const url = new URL(currentHref);
  const hash = url.hash;
  url.searchParams.delete("w");
  url.searchParams.delete("example");
  url.searchParams.delete("sport");
  url.searchParams.delete("name");
  let tooLong = false;
  if (hasMeaningfulWorkout(draft)) {
    if (example && sameExample(draft, example)) {
      url.searchParams.set("example", example);
    } else {
      const workflow = serializeWorkoutWorkflow(draft);
      if (workflow) url.searchParams.set("w", workflow);
      else tooLong = true;
    }
  }
  url.hash = hash;
  return { href: url.toString(), tooLong };
}

export function shareResultUrl(currentHref: string): string {
  const url = new URL(currentHref);
  url.hash = "result";
  return url.toString();
}
