import {
  Decoder,
  Encoder,
  Profile,
  Stream,
  type FileIdMesg,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from "@garmin/fitsdk";
import {
  createEmptyRepeat,
  createEmptyStep,
  formatPaceClock,
  isRepeat,
  paceMeasureFromText,
  paceSecondsForUnit,
  parsePaceClock,
  repeatTimes,
  type WorkoutDraft,
  type WorkoutModule,
  type WorkoutStep,
  type WorkoutStepType,
} from "./workout-model";
import { fitSportForWorkout } from "./workout-export";

const INTENSITY_BY_STEP: Record<WorkoutStepType, WorkoutStepMesg["intensity"]> = {
  warmup: "warmup",
  work: "active",
  recovery: "recovery",
  rest: "rest",
  cooldown: "cooldown",
  other: "other",
};

export type DecodedWorkoutFit = {
  stepMessages: number;
  expandedDurationSec: number;
  distanceMeters: number[];
};

function timeSeconds(step: WorkoutStep): number | null {
  if (step.durationUnit === "m" || step.durationUnit === "km") return null;
  if (step.durationValue == null || !Number.isFinite(step.durationValue) || step.durationValue <= 0) {
    return null;
  }
  if (step.durationUnit === "s") return step.durationValue;
  if (step.durationUnit === "min") return step.durationValue * 60;
  if (step.durationUnit === "h") return step.durationValue * 3600;
  return null;
}

function distanceMeters(step: WorkoutStep): number | null {
  if (step.durationValue == null || !Number.isFinite(step.durationValue) || step.durationValue <= 0) {
    return null;
  }
  if (step.durationUnit === "m") return step.durationValue;
  if (step.durationUnit === "km") return step.durationValue * 1000;
  return null;
}

function parseRange(value: string): { low: number; high: number } | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function paceMetersPerSecond(value: string): number | null {
  const seconds = parsePaceClock(value);
  if (seconds == null) return null;
  const perKm = paceSecondsForUnit(seconds, paceMeasureFromText(value), "sec/km");
  if (perKm == null || perKm <= 0) return null;
  return 1000 / perKm;
}

function applyTarget(step: WorkoutStep, mesg: WorkoutStepMesg) {
  const raw = step.intensityValue.trim();
  if (step.intensityKind === "power" && raw && !/%|ftp/i.test(raw)) {
    const range = parseRange(raw);
    const single = range ? null : raw.match(/(\d+(?:\.\d+)?)/);
    const low = range?.low ?? (single ? Number(single[1]) : null);
    const high = range?.high ?? low;
    if (low != null && high != null && Number.isFinite(low) && Number.isFinite(high)) {
      mesg.targetType = "power";
      mesg.customTargetValueLow = Math.round(low);
      mesg.customTargetValueHigh = Math.round(high);
      return;
    }
  }
  if (step.intensityKind === "hr" && raw) {
    const range = parseRange(raw);
    const single = range ? null : raw.match(/(\d+(?:\.\d+)?)/);
    const low = range?.low ?? (single ? Number(single[1]) : null);
    const high = range?.high ?? low;
    if (low != null && high != null && Number.isFinite(low) && Number.isFinite(high)) {
      mesg.targetType = "heartRate";
      mesg.customTargetValueLow = Math.round(low);
      mesg.customTargetValueHigh = Math.round(high);
      return;
    }
  }
  if (step.intensityKind === "pace" && raw) {
    const speed = paceMetersPerSecond(raw);
    if (speed != null) {
      mesg.targetType = "speed";
      mesg.customTargetValueLow = Math.round(speed * 1000);
      mesg.customTargetValueHigh = Math.round(speed * 1000);
      return;
    }
  }
  mesg.targetType = "open";
}

function stepMesg(step: WorkoutStep, messageIndex: number): WorkoutStepMesg {
  const mesg: WorkoutStepMesg = {
    messageIndex,
    intensity: INTENSITY_BY_STEP[step.stepType],
    wktStepName: step.stepType,
  };
  const meters = distanceMeters(step);
  const seconds = timeSeconds(step);
  // Subfields such as durationTime are expanded on read. The encoder stores the base value.
  if (meters != null) {
    mesg.durationType = "distance";
    mesg.durationValue = Math.round(meters * 100);
  } else if (seconds != null) {
    mesg.durationType = "time";
    mesg.durationValue = Math.round(seconds * 1000);
  } else {
    mesg.durationType = "open";
  }
  applyTarget(step, mesg);
  return mesg;
}

export function encodeWorkoutFit(
  draft: WorkoutDraft,
  now = new Date("2026-01-01T00:00:00.000Z"),
): Uint8Array {
  const steps: WorkoutStepMesg[] = [];
  let messageIndex = 0;
  for (const block of draft.modules) {
    if (isRepeat(block)) {
      const times = repeatTimes(block.times);
      if (times == null || block.steps.length === 0) continue;
      const startIndex = messageIndex;
      for (const step of block.steps) {
        steps.push(stepMesg(step, messageIndex));
        messageIndex += 1;
      }
      steps.push({
        messageIndex,
        durationType: "repeatUntilStepsCmplt",
        durationValue: startIndex,
        targetValue: times,
        targetType: "open",
      });
      messageIndex += 1;
      continue;
    }
    steps.push(stepMesg(block, messageIndex));
    messageIndex += 1;
  }

  const encoder = new Encoder();
  const fileId: FileIdMesg = {
    type: "workout",
    manufacturer: "development",
    product: 1,
    timeCreated: now,
  };
  const workout: WorkoutMesg = {
    sport: fitSportForWorkout(draft.sport) as WorkoutMesg["sport"],
    wktName: draft.name.trim() || "Workout",
    numValidSteps: steps.length,
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
  encoder.onMesg(Profile.MesgNum.WORKOUT, workout);
  for (const step of steps) {
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, step);
  }
  return encoder.close();
}

type FitMessages = {
  workoutStepMesgs?: WorkoutStepMesg[];
};

export function readWorkoutFitMessages(bytes: Uint8Array): FitMessages | null {
  const stream = Stream.fromByteArray(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return null;
  const decoded = decoder.read();
  return decoded.messages as FitMessages;
}

export function summarizeWorkoutFit(bytes: Uint8Array): DecodedWorkoutFit | null {
  const messages = readWorkoutFitMessages(bytes);
  const rows = messages?.workoutStepMesgs;
  if (!rows || rows.length === 0) return null;

  const leaves: { index: number; seconds: number }[] = [];
  const distance: number[] = [];
  let expanded = 0;
  let stepMessages = 0;
  for (const row of rows) {
    if (row.durationType === "repeatUntilStepsCmplt") {
      const start = Number(row.durationStep ?? 0);
      const times = Number(row.repeatSteps ?? 1);
      const once = leaves
        .filter((leaf) => leaf.index >= start)
        .reduce((total, leaf) => total + leaf.seconds, 0);
      if (Number.isFinite(times) && times > 1) expanded += once * (times - 1);
      continue;
    }
    stepMessages += 1;
    const index = Number(row.messageIndex ?? leaves.length);
    const seconds =
      row.durationType === "time" && typeof row.durationTime === "number"
        ? row.durationTime
        : 0;
    leaves.push({ index, seconds });
    expanded += seconds;
    if (row.durationType === "distance" && typeof row.durationDistance === "number") {
      distance.push(row.durationDistance);
    }
  }

  return {
    stepMessages,
    expandedDurationSec: expanded,
    distanceMeters: distance,
  };
}

function stepTypeFromIntensity(intensity: WorkoutStepMesg["intensity"]): WorkoutStepType {
  switch (intensity) {
    case "warmup":
      return "warmup";
    case "cooldown":
      return "cooldown";
    case "recovery":
      return "recovery";
    case "rest":
      return "rest";
    case "other":
      return "other";
    default:
      return "work";
  }
}

function durationFields(row: WorkoutStepMesg): Pick<WorkoutStep, "durationValue" | "durationUnit"> {
  if (row.durationType === "distance" && typeof row.durationDistance === "number") {
    if (row.durationDistance % 1000 === 0 && row.durationDistance >= 1000) {
      return { durationValue: row.durationDistance / 1000, durationUnit: "km" };
    }
    return { durationValue: row.durationDistance, durationUnit: "m" };
  }
  if (row.durationType === "time" && typeof row.durationTime === "number") {
    const seconds = row.durationTime;
    if (seconds % 3600 === 0) return { durationValue: seconds / 3600, durationUnit: "h" };
    if (seconds % 60 === 0) return { durationValue: seconds / 60, durationUnit: "min" };
    return { durationValue: seconds, durationUnit: "s" };
  }
  return { durationValue: null, durationUnit: "min" };
}

function intensityFields(row: WorkoutStepMesg): Pick<WorkoutStep, "intensityKind" | "intensityValue"> {
  if (typeof row.customTargetPowerLow === "number") {
    const high = row.customTargetPowerHigh ?? row.customTargetPowerLow;
    const value =
      high === row.customTargetPowerLow
        ? String(row.customTargetPowerLow)
        : `${row.customTargetPowerLow}-${high}`;
    return { intensityKind: "power", intensityValue: value };
  }
  if (typeof row.customTargetHeartRateLow === "number") {
    const high = row.customTargetHeartRateHigh ?? row.customTargetHeartRateLow;
    const value =
      high === row.customTargetHeartRateLow
        ? String(row.customTargetHeartRateLow)
        : `${row.customTargetHeartRateLow}-${high}`;
    return { intensityKind: "hr", intensityValue: value };
  }
  if (typeof row.customTargetSpeedLow === "number" && row.customTargetSpeedLow > 0) {
    const perKm = 1000 / row.customTargetSpeedLow;
    const clock = formatPaceClock(perKm);
    return { intensityKind: "pace", intensityValue: clock ? `${clock}/km` : "" };
  }
  return { intensityKind: "none", intensityValue: "" };
}

function rowToStep(row: WorkoutStepMesg): WorkoutStep {
  return createEmptyStep(stepTypeFromIntensity(row.intensity), {
    ...durationFields(row),
    ...intensityFields(row),
  });
}

export function workoutFromFit(
  bytes: Uint8Array,
  fallback: Pick<WorkoutDraft, "name" | "sport" | "notes">,
): WorkoutDraft | null {
  const rows = readWorkoutFitMessages(bytes)?.workoutStepMesgs;
  if (!rows || rows.length === 0) return null;
  type Placed =
    | { kind: "step"; index: number; step: WorkoutStep }
    | { kind: "repeat"; times: number; steps: WorkoutStep[] };
  const placed: Placed[] = [];
  rows.forEach((row, position) => {
    if (row.durationType === "repeatUntilStepsCmplt") {
      const times = repeatTimes(Number(row.repeatSteps ?? Number.NaN));
      const start = Number(row.durationStep ?? 0);
      const children: WorkoutStep[] = [];
      for (let index = placed.length - 1; index >= 0; index -= 1) {
        const item = placed[index];
        if (item.kind !== "step" || item.index < start) break;
        children.unshift(item.step);
        placed.splice(index, 1);
      }
      if (times != null && children.length > 0) {
        placed.push({ kind: "repeat", times, steps: children });
      }
      return;
    }
    placed.push({
      kind: "step",
      index: Number(row.messageIndex ?? position),
      step: rowToStep(row),
    });
  });
  const modules: WorkoutModule[] = placed.map((item) =>
    item.kind === "step"
      ? item.step
      : createEmptyRepeat({ times: item.times, steps: item.steps }),
  );
  if (modules.length === 0) return null;
  return {
    name: fallback.name,
    sport: fallback.sport,
    notes: fallback.notes,
    modules,
  };
}
