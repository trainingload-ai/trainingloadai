import {
  createEmptyRepeat,
  createEmptyStep,
  durationToSeconds,
  isRepeat,
  normalizeZone,
  repeatTimes,
  workoutTotalSeconds,
  type IntensityKind,
  type WorkoutDraft,
  type WorkoutModule,
  type WorkoutSport,
  type WorkoutStep,
  type WorkoutStepType,
} from "./workout-model";

export type IntervalsIcuTargetSpec = {
  start?: number;
  end?: number;
  value?: number;
  units?: string;
};

export type IntervalsIcuWorkoutDocStep = {
  text?: string;
  duration?: number;
  reps?: number;
  steps?: IntervalsIcuWorkoutDocStep[];
  power?: IntervalsIcuTargetSpec;
  hr?: IntervalsIcuTargetSpec;
  pace?: IntervalsIcuTargetSpec;
  cadence?: IntervalsIcuTargetSpec;
};

export type IntervalsIcuWorkoutDoc = {
  steps?: IntervalsIcuWorkoutDocStep[];
  duration?: number;
};

const STEP_LABELS: Record<WorkoutStepType, string> = {
  warmup: "Warm up",
  work: "Work",
  recovery: "Easy",
  rest: "Rest",
  cooldown: "Cool down",
  other: "Other",
};

const FIT_SPORT_BY_WORKOUT: Record<WorkoutSport, string> = {
  running: "running",
  cycling: "cycling",
  swimming: "swimming",
  strength: "generic",
};

/** Coggan-style %FTP midpoints so cycling zones survive intervals.icu import. */
const CYCLING_ZONE_FTP_PERCENT: Record<string, number> = {
  z1: 55,
  z2: 70,
  z3: 85,
  z4: 95,
  z5: 110,
};

export function fitSportForWorkout(sport: WorkoutSport): string {
  return FIT_SPORT_BY_WORKOUT[sport];
}

export function workoutDownloadStem(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned || "Trainingload Workout";
}

function stepSeconds(step: WorkoutStep): number | null {
  const seconds = durationToSeconds(step.durationValue, step.durationUnit);
  return seconds > 0 ? Math.round(seconds) : null;
}

function parseNumeric(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRange(value: string): { low: number; high: number } | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function parsePaceSeconds(value: string): number | null {
  const match = value.match(/(\d+)\s*[:：]\s*(\d{1,2})/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function stepTargets(
  step: WorkoutStep,
  sport: WorkoutSport,
): Pick<
  IntervalsIcuWorkoutDocStep,
  "power" | "hr" | "pace"
> {
  const raw = step.intensityValue.trim();
  switch (step.intensityKind) {
    case "power": {
      if (/%|ftp/i.test(raw)) {
        const range = parseRange(raw);
        if (range) {
          return {
            power: { start: range.low, end: range.high, units: "%ftp" },
          };
        }
        const value = parseNumeric(raw);
        return value != null ? { power: { value, units: "%ftp" } } : {};
      }
      const range = parseRange(raw);
      if (range) {
        return { power: { start: range.low, end: range.high, units: "W" } };
      }
      const watts = parseNumeric(raw);
      return watts != null ? { power: { value: watts, units: "W" } } : {};
    }
    case "hr": {
      const range = parseRange(raw);
      if (range) {
        return { hr: { start: range.low, end: range.high, units: "bpm" } };
      }
      const bpm = parseNumeric(raw);
      return bpm != null ? { hr: { value: bpm, units: "bpm" } } : {};
    }
    case "pace": {
      const seconds = parsePaceSeconds(raw);
      return seconds != null ? { pace: { value: seconds, units: "sec/km" } } : {};
    }
    case "zone": {
      const zone = normalizeZone(raw);
      if (!zone) return {};
      if (sport === "cycling") {
        return {
          power: { value: CYCLING_ZONE_FTP_PERCENT[zone], units: "%ftp" },
        };
      }
      if (sport === "running") {
        return { pace: { value: Number(zone.slice(1)), units: "zone" } };
      }
      return { hr: { value: Number(zone.slice(1)), units: "zone" } };
    }
    default:
      return {};
  }
}

function stepText(step: WorkoutStep): string {
  const note = step.freeText.trim();
  if (note) return note;
  const label = STEP_LABELS[step.stepType];
  if (step.intensityKind === "zone") {
    const zone = normalizeZone(step.intensityValue);
    if (zone) return `${label} ${zone.toUpperCase()}`;
  }
  return label;
}

function stepToIntervalsDoc(
  step: WorkoutStep,
  sport: WorkoutSport,
): IntervalsIcuWorkoutDocStep | null {
  const duration = stepSeconds(step);
  if (duration == null) return null;
  return {
    text: stepText(step),
    duration,
    ...stepTargets(step, sport),
  };
}

export function workoutToIntervalsDoc(draft: WorkoutDraft): IntervalsIcuWorkoutDoc {
  const steps: IntervalsIcuWorkoutDocStep[] = [];
  for (const block of draft.modules) {
    if (isRepeat(block)) {
      const children = block.steps
        .map((step) => stepToIntervalsDoc(step, draft.sport))
        .filter((step): step is IntervalsIcuWorkoutDocStep => step != null);
      if (children.length === 0) continue;
      const times = repeatTimes(block.times);
      if (times == null) continue;
      steps.push({
        text: `${times}x`,
        reps: times,
        steps: children,
      });
      continue;
    }
    const mapped = stepToIntervalsDoc(block, draft.sport);
    if (mapped) steps.push(mapped);
  }
  return {
    steps,
    duration: Math.round(workoutTotalSeconds(draft)),
  };
}

export function formatIntervalsDoc(draft: WorkoutDraft): string {
  return `${JSON.stringify(workoutToIntervalsDoc(draft), null, 2)}\n`;
}

function inferStepType(text: string | undefined): WorkoutStepType {
  const normalized = String(text ?? "").trim().toLowerCase();
  if (normalized.includes("warm")) return "warmup";
  if (normalized.includes("cool")) return "cooldown";
  if (normalized.includes("easy") || normalized.includes("recovery")) {
    return "recovery";
  }
  if (normalized.includes("rest")) return "rest";
  if (normalized.includes("other") || normalized.includes("free")) return "other";
  return "work";
}

function durationFromSeconds(seconds: number): Pick<
  WorkoutStep,
  "durationValue" | "durationUnit"
> {
  if (seconds % 3600 === 0) {
    return { durationValue: seconds / 3600, durationUnit: "h" };
  }
  if (seconds % 60 === 0) {
    return { durationValue: seconds / 60, durationUnit: "min" };
  }
  return { durationValue: seconds, durationUnit: "s" };
}

function intensityFromDocStep(step: IntervalsIcuWorkoutDocStep): {
  intensityKind: IntensityKind;
  intensityValue: string;
} {
  if (step.power) {
    const units = String(step.power.units ?? "").toLowerCase();
    if (units.includes("ftp") || units.includes("%")) {
      const start = step.power.start ?? step.power.value;
      const end = step.power.end ?? step.power.value;
      if (start != null && end != null && start !== end) {
        return { intensityKind: "power", intensityValue: `${start}-${end}%` };
      }
      if (start != null) {
        return { intensityKind: "power", intensityValue: `${start}%` };
      }
    }
    const start = step.power.start ?? step.power.value;
    const end = step.power.end ?? step.power.value;
    if (start != null && end != null && start !== end) {
      return { intensityKind: "power", intensityValue: `${start}-${end}` };
    }
    if (start != null) {
      return { intensityKind: "power", intensityValue: String(start) };
    }
  }
  if (step.hr) {
    const start = step.hr.start ?? step.hr.value;
    const end = step.hr.end ?? step.hr.value;
    if (start != null && end != null && start !== end) {
      return { intensityKind: "hr", intensityValue: `${start}-${end}` };
    }
    if (start != null) {
      return { intensityKind: "hr", intensityValue: String(start) };
    }
  }
  if (step.pace) {
    const units = String(step.pace.units ?? "").toLowerCase();
    if (units.includes("zone") && step.pace.value != null) {
      return { intensityKind: "zone", intensityValue: `z${step.pace.value}` };
    }
    if (step.pace.value != null) {
      const total = Math.round(step.pace.value);
      const minutes = Math.floor(total / 60);
      const seconds = String(total % 60).padStart(2, "0");
      return { intensityKind: "pace", intensityValue: `${minutes}:${seconds}/km` };
    }
  }
  const zone = normalizeZone(step.text ?? "");
  if (zone) return { intensityKind: "zone", intensityValue: zone };
  return { intensityKind: "none", intensityValue: "" };
}

function docStepToWorkoutStep(
  step: IntervalsIcuWorkoutDocStep,
): WorkoutStep | null {
  const duration =
    typeof step.duration === "number" && step.duration > 0
      ? Math.round(step.duration)
      : null;
  if (duration == null) return null;
  const intensity = intensityFromDocStep(step);
  return createEmptyStep(inferStepType(step.text), {
    ...durationFromSeconds(duration),
    ...intensity,
    freeText: step.text?.trim() ?? "",
  });
}

function collectDocSteps(value: unknown): IntervalsIcuWorkoutDocStep[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as IntervalsIcuWorkoutDoc).steps)) {
    return (value as IntervalsIcuWorkoutDoc).steps ?? [];
  }
  return [];
}

export function intervalsDocToWorkout(
  raw: unknown,
  fallback: Pick<WorkoutDraft, "name" | "sport" | "notes">,
): WorkoutDraft {
  const steps = collectDocSteps(raw);
  if (steps.length === 0) {
    throw new Error("intervals_doc_empty");
  }

  const modules = steps.flatMap((step): WorkoutModule[] => {
    const reps =
      typeof step.reps === "number" && step.reps > 0
        ? Math.round(step.reps)
        : null;
    const nested = Array.isArray(step.steps) ? step.steps : [];
    if (reps != null && nested.length > 0) {
      const children = nested
        .map((child) => docStepToWorkoutStep(child))
        .filter((child): child is WorkoutStep => child != null);
      if (children.length === 0) return [];
      return [createEmptyRepeat({ times: reps, steps: children })];
    }
    const mapped = docStepToWorkoutStep(step);
    return mapped ? [mapped] : [];
  });

  if (modules.length === 0) {
    throw new Error("intervals_doc_empty");
  }

  return {
    name: fallback.name,
    sport: fallback.sport,
    notes: fallback.notes,
    modules,
  };
}

export function parseIntervalsDocInput(
  text: string,
  fallback: Pick<WorkoutDraft, "name" | "sport" | "notes">,
): WorkoutDraft {
  const raw = text.trim();
  if (!raw) throw new Error("intervals_doc_empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("intervals_doc_invalid_json");
  }
  return intervalsDocToWorkout(parsed, fallback);
}
