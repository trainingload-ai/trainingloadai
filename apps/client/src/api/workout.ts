import { apiFetch, ApiFetchError } from "@/lib/api";
import type { PlanSportType } from "@/api/plans";
import type {
  WorkoutDefinitionInput,
  WorkoutStructure,
  WorkoutStructureKind,
} from "@shared/workout-structure";
import type { WorkoutSummary } from "@shared/workout-summary";
import {
  expressionSpeedUnitToToken,
  getExpressionSpeedUnitForSport,
  normalizeExpressionSpeedUnit,
} from "@/components/plan/workout-expression-codec";

export const parseWorkoutFile = async (
  file: File,
): Promise<{ block: ParsedPlan; plan: string }> => {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const data = await apiFetch("/workout/parse", {
    method: "POST",
    body: formData,
  });
  return data as { block: ParsedPlan; plan: string };
};

export type WorkoutDefinitionIssue = {
  code: string;
  severity: "ERROR" | "WARNING";
  line?: number;
  column?: number;
  endColumn?: number;
  path?: string;
  message: string;
};

type WorkoutDefinitionErrorData = {
  issues?: WorkoutDefinitionIssue[];
};

export function getWorkoutDefinitionIssueCode(error: unknown) {
  if (
    !(error instanceof ApiFetchError) ||
    (error.errorCode !== "WORKOUT_DEFINITION_INVALID" &&
      error.errorCode !== "WORKOUT_DEFINITIONS_INVALID")
  ) {
    return undefined;
  }
  const data = error.data as WorkoutDefinitionErrorData | undefined;
  return data?.issues?.find((issue) => issue.severity === "ERROR")?.code;
}

export type ResolvedWorkoutDefinition = {
  kind: WorkoutStructureKind;
  version: number;
  text: string;
  structure: WorkoutStructure;
  summary: WorkoutSummary;
  warnings: WorkoutDefinitionIssue[];
};

export async function parseWorkoutDefinition(
  input: WorkoutDefinitionInput,
): Promise<ResolvedWorkoutDefinition> {
  const data = (await apiFetch("/workout/parse-definition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    suppressErrorToast: true,
  })) as { definition?: ResolvedWorkoutDefinition } | undefined;
  if (!data?.definition) throw new Error("Workout definition was not returned");
  return data.definition;
}

export async function parseWorkoutDefinitions(
  inputs: WorkoutDefinitionInput[],
): Promise<ResolvedWorkoutDefinition[]> {
  if (inputs.length > 10) {
    throw new Error("At most 10 workout definitions can be parsed at once");
  }
  const data = (await apiFetch("/workout/parse-definitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ definitions: inputs }),
    suppressErrorToast: true,
  })) as { definitions?: ResolvedWorkoutDefinition[] } | undefined;
  if (!data?.definitions) {
    throw new Error("Workout definitions were not returned");
  }
  return data.definitions;
}

export type WorkoutExportStatus = "LOSSLESS" | "DEGRADED" | "UNSUPPORTED";

export type WorkoutExternalResult = {
  provider: string;
  adapterVersion: string;
  status: WorkoutExportStatus;
  preservedFields: string[];
  droppedFields: string[];
  warnings: Array<{ code: string; message: string; path?: string }>;
  file?: { filename: string; contentType: string; base64: string };
};

export async function exportWorkout(input: {
  provider: string;
  deviceProfile?: string;
  name?: string;
  sport?: string;
  subSport?: string;
  definition: WorkoutDefinitionInput;
}): Promise<WorkoutExternalResult> {
  const result = await apiFetch<WorkoutExternalResult>("/workout/export", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!result) throw new Error("Workout export result was not returned");
  return result;
}

export async function importExternalWorkout(input: {
  provider: string;
  sourceText: string;
}) {
  const result = await apiFetch<{
    provider: string;
    adapterVersion: string;
    compatibilityStatus: "LOSSLESS" | "PARTIAL" | "OPAQUE";
    sourceText: string;
    sourceHash: string;
    unsupportedFeatures: string[];
    issues: WorkoutDefinitionIssue[];
    workouts: Array<{
      externalWorkoutKey: string;
      name: string;
      definition: ResolvedWorkoutDefinition;
    }>;
  }>("/workout/import-external", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!result) throw new Error("Workout import result was not returned");
  return result;
}

export type WorkoutZoneBasisSnapshot = {
  zoneType?: "HEART_RATE" | "POWER" | "PACE" | string;
  sportType?: string;
  benchmark?: string;
  benchmarkValue?: number;
  benchmarkUnit?: string;
  benchmarkSource?: "PROFILE" | "FALLBACK" | "CUSTOM" | "UNKNOWN" | string;
  inputs?: Record<string, number | string | null | undefined>;
  targetLow?: number;
  targetHigh?: number;
  targetUnit?: string;
};

// Align with server /workout/parse-text response structure
export type WorkoutStepTarget = {
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
  zoneBasis?: WorkoutZoneBasisSnapshot | Record<string, unknown>;
  unit?: string;
};

export type WorkoutStepDurationMeta = {
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

export type WorkoutStepSwimMeta = {
  stroke?:
    | "FREESTYLE"
    | "BREASTSTROKE"
    | "BACKSTROKE"
    | "BUTTERFLY"
    | "DRILL"
    | "MEDLEY";
  trainingType?: "KICK" | "PULL" | "DRILL";
  equipment?: "FINS" | "KICKBOARD" | "PADDLES" | "PULL_BUOY" | "SNORKEL";
};

export type WorkRestStep = {
  duration: number;
  power?: number; // Ratio 0..1 (% or unitless)
  powerWatts?: number; // Power in Watts (W)
  cadence?: number; // Cadence rpm
  heartRatePercent?: number; // Heart rate percentage
  heartRateBpm?: number; // Heart rate bpm
  paceKmh?: number; // Speed km/h
  gradeDeg?: number; // Grade °
  stepKind?: "WARMUP" | "WORK" | "RECOVERY" | "REST" | "COOLDOWN" | "OTHER";
  durationMeta?: WorkoutStepDurationMeta | null;
  swimMeta?: WorkoutStepSwimMeta | null;
  primaryTargetMeta?: WorkoutStepTarget | null;
  secondaryTarget?: WorkoutStepTarget | null;
};

export type WorkRestBlock = {
  type: "work" | "rest";
  steps: WorkRestStep[];
};

export type RepeatBlock = {
  type: "repeat";
  count: number;
  until?: {
    kind: Exclude<WorkoutStepDurationMeta["kind"], "OPEN">;
    value: number;
    unit: "SECONDS" | "METERS" | "CALORIES" | "BPM" | "WATTS" | "RPM";
  };
  children: WorkRestBlock[];
};

export type ParsedPlan = Array<WorkRestBlock | RepeatBlock>;

type StringifyParsedPlanOptions = {
  sportType?: PlanSportType | null;
};

export const stringifyParsedPlan = (
  blocks: ParsedPlan,
  options?: StringifyParsedPlanOptions,
): string => {
  const lines: string[] = [];
  const indentUnit = "  ";

  const formatDurationSeconds = (seconds: number): string => {
    if (seconds % 3600 === 0 && seconds >= 3600) {
      return `${seconds / 3600}h`;
    }
    if (seconds % 60 === 0 && seconds >= 60) {
      return `${Math.floor(seconds / 60)}m`;
    }
    return `${seconds}s`;
  };

  const stripNum = (n: number): string => Number(n).toString();

  const formatZoneToken = (target: WorkoutStepTarget): string | null => {
    if (
      typeof target.zoneIndex !== "number" ||
      !Number.isFinite(target.zoneIndex) ||
      target.zoneIndex <= 0
    ) {
      return null;
    }
    return `z${stripNum(target.zoneIndex)}`;
  };

  const formatDuration = (step: WorkRestStep): string => {
    const meta = step.durationMeta;
    if (meta?.kind === "DISTANCE" && typeof meta.value === "number") {
      if (meta.unit === "METERS") {
        return meta.value >= 1000 && meta.value % 1000 === 0
          ? `${stripNum(meta.value / 1000)}km`
          : `${stripNum(meta.value)}m`;
      }
      return `${stripNum(meta.value)}km`;
    }
    if (meta?.kind === "OPEN") return "open";
    if (meta?.kind === "CALORIES" && typeof meta.value === "number") {
      return `${stripNum(meta.value)}kj`;
    }
    if (meta?.kind === "HR_LESS_THAN" && typeof meta.value === "number") {
      return `hr<${stripNum(meta.value)}bpm`;
    }
    if (meta?.kind === "HR_GREATER_THAN" && typeof meta.value === "number") {
      return `hr>${stripNum(meta.value)}bpm`;
    }
    if (meta?.kind === "POWER_LESS_THAN" && typeof meta.value === "number") {
      return `power<${stripNum(meta.value)}W`;
    }
    if (meta?.kind === "POWER_GREATER_THAN" && typeof meta.value === "number") {
      return `power>${stripNum(meta.value)}W`;
    }
    if (meta?.kind === "CADENCE_LESS_THAN" && typeof meta.value === "number") {
      return `cadence<${stripNum(meta.value)}rpm`;
    }
    if (
      meta?.kind === "CADENCE_GREATER_THAN" &&
      typeof meta.value === "number"
    ) {
      return `cadence>${stripNum(meta.value)}rpm`;
    }
    return formatDurationSeconds(
      meta?.kind === "TIME" && typeof meta.value === "number"
        ? meta.value
        : step.duration,
    );
  };

  const formatStepType = (
    blockType: WorkRestBlock["type"],
    step: WorkRestStep,
  ) => {
    switch (step.stepKind) {
      case "WARMUP":
        return "warmup";
      case "RECOVERY":
        return "recovery";
      case "REST":
        return "rest";
      case "COOLDOWN":
        return "cooldown";
      case "OTHER":
        return "other";
      case "WORK":
        return "work";
      default:
        return blockType === "rest" ? "rest" : "work";
    }
  };

  const formatTargetRange = (
    value: number | undefined,
    valueHigh: number | undefined,
    unit: string | undefined,
  ) => {
    const normalizedUnit =
      unit === "sec/km" || unit === "s/km"
        ? "sec/km"
        : unit === "sec/100m" || unit === "s/100m"
          ? "sec/100m"
          : unit;
    const unitToken =
      normalizedUnit === "sec/km" || normalizedUnit === "sec/100m"
        ? expressionSpeedUnitToToken(normalizedUnit)
        : normalizedUnit || "";

    if (
      Number.isFinite(value as number) &&
      Number.isFinite(valueHigh as number) &&
      valueHigh !== value
    ) {
      return `${stripNum(value as number)}-${stripNum(valueHigh as number)}${unitToken}`;
    }

    if (
      Number.isFinite(value as number) &&
      Number.isFinite(valueHigh as number) &&
      valueHigh === value
    ) {
      return `${stripNum(value as number)}${unitToken}`;
    }

    if (Number.isFinite(value as number)) {
      return `>${stripNum(value as number)}${unitToken}`;
    }

    if (Number.isFinite(valueHigh as number)) {
      return `<${stripNum(valueHigh as number)}${unitToken}`;
    }

    return null;
  };

  const formatStepTargets = (step: WorkRestStep): string[] => {
    const tokens: string[] = [];

    const targetMetas = [step.primaryTargetMeta].filter(
      (target): target is NonNullable<typeof target> =>
        Boolean(target) && target?.kind !== "NONE",
    );

    if (targetMetas.length > 0) {
      for (const target of targetMetas) {
        if (target.kind === "SPEED") {
          const zoneToken = formatZoneToken(target);
          if (zoneToken) {
            tokens.push("pace", zoneToken);
            continue;
          }

          const formatted = formatTargetRange(
            target.value,
            target.valueHigh,
            normalizeExpressionSpeedUnit(target.unit, options?.sportType),
          );
          if (formatted) tokens.push("pace", formatted);
          continue;
        }

        if (target.kind === "CADENCE") {
          const formatted = formatTargetRange(
            target.value,
            target.valueHigh,
            "rpm",
          );
          if (formatted) tokens.push("cadence", formatted);
          continue;
        }

        if (
          target.kind === "HEART_RATE_ZONE" ||
          target.kind === "HEART_RATE_CUSTOM"
        ) {
          if (target.kind === "HEART_RATE_ZONE") {
            const zoneToken = formatZoneToken(target);
            if (zoneToken) {
              tokens.push("hr", zoneToken);
              continue;
            }
          }

          const formatted = formatTargetRange(
            target.value,
            target.valueHigh,
            "bpm",
          );
          if (formatted) tokens.push("hr", formatted);
          continue;
        }

        if (target.kind === "POWER_ZONE" || target.kind === "POWER_CUSTOM") {
          if (target.kind === "POWER_ZONE") {
            const zoneToken = formatZoneToken(target);
            if (zoneToken) {
              tokens.push("power", zoneToken);
              continue;
            }
          }

          const formatted = formatTargetRange(
            target.value,
            target.valueHigh,
            target.unit === "W" ? "W" : "%",
          );
          if (formatted) tokens.push("power", formatted);
          continue;
        }
      }
    } else {
      if (step.powerWatts != null) {
        tokens.push("power", `${stripNum(step.powerWatts)}W`);
      } else if (step.power != null) {
        const isRatio = step.power >= 0 && step.power <= 3;
        const percentVal = Math.round(step.power * 100);
        tokens.push(
          "power",
          isRatio ? `${percentVal}%` : `${stripNum(step.power)}`,
        );
      }

      if (step.cadence != null) {
        tokens.push("cadence", `${stripNum(step.cadence)}rpm`);
      }

      if (step.heartRateBpm != null) {
        tokens.push("hr", `${stripNum(step.heartRateBpm)}bpm`);
      }

      if (step.paceKmh != null) {
        const speedUnit = getExpressionSpeedUnitForSport(options?.sportType);
        const paceValue =
          speedUnit === "sec/100m" ? 360 / step.paceKmh : 3600 / step.paceKmh;
        tokens.push(
          "pace",
          `${stripNum(Math.round(paceValue))}${expressionSpeedUnitToToken(speedUnit)}`,
        );
      }
    }

    if (step.gradeDeg != null) {
      tokens.push("grade", `${stripNum(step.gradeDeg)}°`);
    }

    return tokens;
  };

  const emitBlock = (
    block: WorkRestBlock | RepeatBlock,
    indentLevel: number,
  ) => {
    const indent = indentUnit.repeat(indentLevel);
    if (block.type === "repeat") {
      const selector = block.until
        ? `until ${formatDuration({
            duration: block.until.kind === "TIME" ? block.until.value : 0,
            durationMeta: {
              ...block.until,
              unit: block.until.unit === "CALORIES" ? "KJ" : block.until.unit,
            },
          })}`
        : `${block.count}`;
      lines.push(`${indent}repeat ${selector} {`);
      block.children.forEach((child) => emitBlock(child, indentLevel + 1));
      lines.push(`${indent}}`);
      return;
    }

    block.steps.forEach((step) => {
      const dur = formatDuration(step);
      const targetTokens = formatStepTargets(step);
      lines.push(
        `${indent}${formatStepType(block.type, step)} ${dur}${
          targetTokens.length ? ` ${targetTokens.join(" ")}` : ""
        }`,
      );
    });
  };

  blocks.forEach((block) => emitBlock(block, 0));
  return lines.join("\n");
};

export const parseWorkoutText = async (text: string): Promise<ParsedPlan> => {
  const data = await apiFetch("/workout/parse-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return data as ParsedPlan;
};
