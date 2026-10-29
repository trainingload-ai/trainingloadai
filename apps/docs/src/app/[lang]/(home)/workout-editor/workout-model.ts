export const WORKOUT_SPORTS = [
  "running",
  "cycling",
  "swimming",
  "strength",
] as const;

export type WorkoutSport = (typeof WORKOUT_SPORTS)[number];

export const STEP_TYPES = [
  "warmup",
  "work",
  "recovery",
  "rest",
  "cooldown",
  "other",
] as const;

export type WorkoutStepType = (typeof STEP_TYPES)[number];

export const DURATION_UNITS = ["s", "min", "h", "m", "km"] as const;

export type DurationUnit = (typeof DURATION_UNITS)[number];

export const INTENSITY_KINDS = [
  "none",
  "zone",
  "power",
  "pace",
  "hr",
  "rpe",
  "text",
] as const;

export type IntensityKind = (typeof INTENSITY_KINDS)[number];

export type WorkoutStep = {
  id: string;
  kind: "step";
  stepType: WorkoutStepType;
  durationValue: number | null;
  durationUnit: DurationUnit;
  intensityKind: IntensityKind;
  intensityValue: string;
  freeText: string;
};

export type WorkoutRepeat = {
  id: string;
  kind: "repeat";
  times: number;
  steps: WorkoutStep[];
};

export type WorkoutModule = WorkoutStep | WorkoutRepeat;

export type WorkoutDraft = {
  name: string;
  sport: WorkoutSport;
  notes: string;
  modules: WorkoutModule[];
};

export type PreviewSegment = {
  id: string;
  label: string;
  seconds: number;
  stepType: WorkoutStepType;
  intensity: string;
  heightPercent: number;
  repeatTimes?: number;
};

let nextLocalId = 0;

export function createWorkoutId(prefix = "step"): string {
  nextLocalId += 1;
  return `${prefix}-${nextLocalId}`;
}

export function createEmptyStep(
  stepType: WorkoutStepType = "work",
  overrides: Partial<WorkoutStep> = {},
): WorkoutStep {
  return {
    id: overrides.id ?? createWorkoutId("step"),
    kind: "step",
    stepType,
    durationValue:
      Object.hasOwn(overrides, "durationValue")
        ? (overrides.durationValue ?? null)
        : 5,
    durationUnit: overrides.durationUnit ?? "min",
    intensityKind: overrides.intensityKind ?? "none",
    intensityValue: overrides.intensityValue ?? "",
    freeText: overrides.freeText ?? "",
  };
}

export function createEmptyRepeat(overrides: Partial<WorkoutRepeat> = {}): WorkoutRepeat {
  return {
    id: overrides.id ?? createWorkoutId("repeat"),
    kind: "repeat",
    times: overrides.times ?? 4,
    steps: overrides.steps ?? [
      createEmptyStep("work", {
        durationValue: 3,
        intensityKind: "zone",
        intensityValue: "z4",
      }),
      createEmptyStep("recovery", { durationValue: 2 }),
    ],
  };
}

export function createEmptyWorkout(): WorkoutDraft {
  return {
    name: "",
    sport: "running",
    notes: "",
    modules: [],
  };
}

/** Sample session. Shown only after the user asks for an example. */
export function createDefaultWorkout(): WorkoutDraft {
  return {
    name: "Aerobic intervals",
    sport: "running",
    notes: "",
    modules: [
      createEmptyStep("warmup", {
        id: "wu",
        durationValue: 10,
      }),
      createEmptyRepeat({
        id: "rep-1",
        times: 5,
        steps: [
          createEmptyStep("work", {
            id: "rep-1-work",
            durationValue: 3,
            intensityKind: "zone",
            intensityValue: "z4",
          }),
          createEmptyStep("recovery", {
            id: "rep-1-rec",
            durationValue: 2,
          }),
        ],
      }),
      createEmptyStep("cooldown", {
        id: "cd",
        durationValue: 10,
      }),
    ],
  };
}

/** Pool set used by the swim example. Distance stays in meters on export. */
export function createPoolExample(): WorkoutDraft {
  return {
    name: "Pool 100s",
    sport: "swimming",
    notes: "",
    modules: [
      createEmptyStep("warmup", {
        id: "pool-wu",
        durationValue: 200,
        durationUnit: "m",
      }),
      createEmptyRepeat({
        id: "pool-rep",
        times: 8,
        steps: [
          createEmptyStep("work", {
            id: "pool-work",
            durationValue: 100,
            durationUnit: "m",
          }),
          createEmptyStep("rest", {
            id: "pool-rest",
            durationValue: 20,
            durationUnit: "s",
          }),
        ],
      }),
      createEmptyStep("cooldown", {
        id: "pool-cd",
        durationValue: 200,
        durationUnit: "m",
      }),
    ],
  };
}

export type WorkoutExampleId = "intervals" | "pool";

export function createExampleWorkout(example: WorkoutExampleId): WorkoutDraft {
  return example === "pool" ? createPoolExample() : createDefaultWorkout();
}

export function isRepeat(block: WorkoutModule): block is WorkoutRepeat {
  return block.kind === "repeat";
}

/**
 * Timeline width for distance steps only. 6:00/km gives the bar a width.
 * It is not a pace prescription, and FIT export stores the distance instead.
 */
export const PREVIEW_SECONDS_PER_METER = 0.36;

const TIME_UNIT_SECONDS = { s: 1, min: 60, h: 3600 } as const;
const DISTANCE_UNIT_METERS = { m: 1, km: 1000 } as const;

export function parseDurationNumber(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function durationToSeconds(
  value: number | null,
  unit: DurationUnit,
): number {
  const parsed = parseDurationNumber(value);
  if (parsed == null || parsed <= 0) return 0;
  switch (unit) {
    case "s":
      return parsed;
    case "min":
      return parsed * 60;
    case "h":
      return parsed * 3600;
    case "m":
      return parsed * PREVIEW_SECONDS_PER_METER;
    case "km":
      return parsed * 1000 * PREVIEW_SECONDS_PER_METER;
    default:
      return 0;
  }
}

/** Convert within time, or within distance. Crossing families is a different quantity. */
export function convertDurationQuantity(
  value: number | null,
  from: DurationUnit,
  to: DurationUnit,
): number | null {
  const parsed = parseDurationNumber(value);
  if (parsed == null) return null;
  if (from === to) return parsed;
  if (from in TIME_UNIT_SECONDS && to in TIME_UNIT_SECONDS) {
    return (
      (parsed * TIME_UNIT_SECONDS[from as keyof typeof TIME_UNIT_SECONDS]) /
      TIME_UNIT_SECONDS[to as keyof typeof TIME_UNIT_SECONDS]
    );
  }
  if (from in DISTANCE_UNIT_METERS && to in DISTANCE_UNIT_METERS) {
    return (
      (parsed * DISTANCE_UNIT_METERS[from as keyof typeof DISTANCE_UNIT_METERS]) /
      DISTANCE_UNIT_METERS[to as keyof typeof DISTANCE_UNIT_METERS]
    );
  }
  return null;
}

export function roundOnce(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value);
}

const PACE_UNIT_METERS = {
  "sec/km": 1000,
  "sec/mi": 1609.344,
  "sec/100m": 100,
  "sec/100yd": 91.44,
} as const;

export type PaceMeasure = keyof typeof PACE_UNIT_METERS;

export function paceSecondsForUnit(
  seconds: number,
  from: PaceMeasure,
  to: PaceMeasure,
): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return (seconds / PACE_UNIT_METERS[from]) * PACE_UNIT_METERS[to];
}

export function formatPaceClock(totalSeconds: number): string | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const rounded = roundOnce(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = Math.abs(rounded % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function parsePaceClock(value: string): number | null {
  const match = value.trim().match(/(\d+)\s*[:：]\s*(\d{1,2}(?:\.\d+)?)/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
    return null;
  }
  return minutes * 60 + seconds;
}

const PACE_SUFFIX: Record<string, PaceMeasure> = {
  "/km": "sec/km",
  "/mi": "sec/mi",
  "/100m": "sec/100m",
  "/100yd": "sec/100yd",
};

export function paceMeasureFromText(value: string): PaceMeasure {
  const suffix = Object.keys(PACE_SUFFIX)
    .sort((a, b) => b.length - a.length)
    .find((item) => value.trim().toLowerCase().endsWith(item));
  return suffix ? PACE_SUFFIX[suffix] : "sec/km";
}

export function convertPaceText(
  value: string,
  to: PaceMeasure,
): string | null {
  const seconds = parsePaceClock(value);
  if (seconds == null) return null;
  const from = paceMeasureFromText(value);
  const converted = paceSecondsForUnit(seconds, from, to);
  if (converted == null) return null;
  const clock = formatPaceClock(converted);
  if (!clock) return null;
  const suffix = Object.entries(PACE_SUFFIX).find(([, measure]) => measure === to)?.[0];
  return `${clock}${suffix ?? "/km"}`;
}

export function ftpPercentFromWatts(
  watts: number,
  ftp: number,
): number | null {
  if (!Number.isFinite(watts) || watts < 0) return null;
  if (!Number.isFinite(ftp) || ftp <= 0) return null;
  return (watts / ftp) * 100;
}

export function wattsFromFtpPercent(
  percent: number,
  ftp: number,
): number | null {
  if (!Number.isFinite(percent) || percent < 0) return null;
  if (!Number.isFinite(ftp) || ftp <= 0) return null;
  return (percent / 100) * ftp;
}

function formatPowerNumber(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return String(roundOnce(value));
}

export function convertPowerText(
  value: string,
  to: "W" | "%",
  ftp: number,
): string | null {
  const trimmed = value.trim();
  const range = trimmed.match(
    /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)(?:\s*(%|w))?\s*$/i,
  );
  const single = trimmed.match(/(\d+(?:\.\d+)?)(?:\s*(%|w))?\s*$/i);
  const fromPercent = /%|ftp/i.test(trimmed);
  const convertOne = (raw: number): string | null => {
    if (fromPercent && to === "W") {
      const watts = wattsFromFtpPercent(raw, ftp);
      return watts == null ? null : formatPowerNumber(watts);
    }
    if (!fromPercent && to === "%") {
      const percent = ftpPercentFromWatts(raw, ftp);
      return percent == null ? null : formatPowerNumber(percent);
    }
    return formatPowerNumber(raw);
  };
  if (range) {
    const low = convertOne(Number(range[1]));
    const high = convertOne(Number(range[2]));
    if (low == null || high == null) return null;
    return to === "%" ? `${low}-${high}%` : `${low}-${high}`;
  }
  if (!single) return null;
  const converted = convertOne(Number(single[1]));
  if (converted == null) return null;
  return to === "%" ? `${converted}%` : converted;
}

/** Fixed repeat count. Invalid, zero, and negative counts cannot be expanded. */
export function repeatTimes(times: number): number | null {
  if (!Number.isFinite(times)) return null;
  const rounded = Math.round(times);
  return rounded >= 1 ? rounded : null;
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatDurationToken(
  value: number | null,
  unit: DurationUnit,
): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const compact =
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  if (unit === "min") return `${compact}m`;
  return `${compact}${unit}`;
}

function zoneChannel(sport: WorkoutSport): "pace" | "power" | "hr" {
  if (sport === "cycling") return "power";
  if (sport === "running") return "pace";
  return "hr";
}

export function normalizeZone(value: string): string | null {
  const match = value.trim().toLowerCase().match(/^z\s*([1-5])$/);
  return match ? `z${match[1]}` : null;
}

const STEP_INTENSITY_BASE: Record<WorkoutStepType, number> = {
  warmup: 32,
  work: 78,
  recovery: 42,
  rest: 18,
  cooldown: 28,
  other: 50,
};

export function stepIntensityPercent(step: WorkoutStep): number {
  const zone = normalizeZone(step.intensityValue);
  if (step.intensityKind === "zone" && zone) {
    return Math.min(100, 18 + Number(zone.slice(1)) * 16);
  }
  return STEP_INTENSITY_BASE[step.stepType];
}

function formatIntensityToken(
  step: WorkoutStep,
  sport: WorkoutSport,
): string | null {
  const raw = step.intensityValue.trim();
  switch (step.intensityKind) {
    case "none":
    case "rpe":
      return null;
    case "zone": {
      const zone = normalizeZone(raw);
      return zone ? `${zoneChannel(sport)} ${zone}` : null;
    }
    case "power": {
      const watts = raw.replace(/[^\d.]/g, "");
      return watts ? `power ${watts}W` : null;
    }
    case "pace": {
      const pace = raw.replace(/^pace\s+/i, "").trim();
      return pace ? `pace ${pace}` : null;
    }
    case "hr": {
      const bpm = raw.replace(/[^\d.-]/g, "");
      return bpm ? `hr ${bpm}bpm` : null;
    }
    case "text":
      return raw || null;
    default:
      return null;
  }
}

function formatStepDsl(step: WorkoutStep, sport: WorkoutSport): string {
  if (step.freeText.trim() && !formatDurationToken(step.durationValue, step.durationUnit)) {
    return step.freeText.trim();
  }

  const duration = formatDurationToken(step.durationValue, step.durationUnit);
  const intensity = formatIntensityToken(step, sport);
  return [step.stepType, duration, intensity].filter(Boolean).join(" ");
}

export function workoutToDsl(draft: WorkoutDraft): string {
  const lines: string[] = [];
  for (const block of draft.modules) {
    if (isRepeat(block)) {
      const times = repeatTimes(block.times);
      if (times == null) continue;
      const inner = block.steps
        .map((step) => `  ${formatStepDsl(step, draft.sport)}`)
        .join("\n");
      lines.push(`repeat ${times} {\n${inner}\n}`);
      continue;
    }
    lines.push(formatStepDsl(block, draft.sport));
  }
  return lines.join("\n").trim();
}

function intensityLabel(step: WorkoutStep): string {
  if (step.intensityKind === "none") return step.freeText.trim();
  if (step.intensityKind === "rpe") {
    return step.intensityValue.trim()
      ? `RPE ${step.intensityValue.trim()}`
      : "";
  }
  return step.intensityValue.trim() || step.freeText.trim();
}

export function workoutPreviewSegments(draft: WorkoutDraft): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  for (const block of draft.modules) {
    if (isRepeat(block)) {
      const times = repeatTimes(block.times);
      if (times == null) continue;
      for (const step of block.steps) {
        segments.push({
          id: step.id,
          label: step.freeText.trim() || step.stepType,
          seconds: durationToSeconds(step.durationValue, step.durationUnit) * times,
          stepType: step.stepType,
          intensity: intensityLabel(step),
          heightPercent: stepIntensityPercent(step),
          repeatTimes: times,
        });
      }
      continue;
    }
    segments.push({
      id: block.id,
      label: block.freeText.trim() || block.stepType,
      seconds: durationToSeconds(block.durationValue, block.durationUnit),
      stepType: block.stepType,
      intensity: intensityLabel(block),
      heightPercent: stepIntensityPercent(block),
    });
  }
  return segments;
}

export function workoutTotalSeconds(draft: WorkoutDraft): number {
  return workoutPreviewSegments(draft).reduce(
    (total, segment) => total + segment.seconds,
    0,
  );
}

export function workoutSummary(draft: WorkoutDraft): string {
  const header = [
    draft.name.trim() || "Untitled workout",
    `Sport: ${draft.sport}`,
    `Estimated duration: ${formatClock(workoutTotalSeconds(draft))}`,
  ];
  const body = draft.modules.flatMap((block) => {
    if (isRepeat(block)) {
      return [
        `repeat ${block.times}x`,
        ...block.steps.map(
          (step) =>
            `  - ${formatStepDsl(step, draft.sport)}${step.intensityKind === "rpe" && step.intensityValue.trim() ? ` (RPE ${step.intensityValue.trim()})` : ""}`,
        ),
      ];
    }
    const extra =
      block.intensityKind === "rpe" && block.intensityValue.trim()
        ? ` (RPE ${block.intensityValue.trim()})`
        : "";
    return [`- ${formatStepDsl(block, draft.sport)}${extra}`];
  });
  const notes = draft.notes.trim() ? [`Notes: ${draft.notes.trim()}`] : [];
  return [...header, "", ...body, ...notes].join("\n").trim();
}

export function workoutHasDistance(draft: WorkoutDraft): boolean {
  const visit = (step: WorkoutStep) =>
    step.durationUnit === "m" || step.durationUnit === "km";
  return draft.modules.some((block) =>
    isRepeat(block) ? block.steps.some(visit) : visit(block),
  );
}

export function hasMeaningfulWorkout(draft: WorkoutDraft): boolean {
  return draft.modules.some((block) => {
    if (isRepeat(block)) {
      return block.steps.some(
        (step) =>
          durationToSeconds(step.durationValue, step.durationUnit) > 0 ||
          step.freeText.trim().length > 0,
      );
    }
    return (
      durationToSeconds(block.durationValue, block.durationUnit) > 0 ||
      block.freeText.trim().length > 0
    );
  });
}
