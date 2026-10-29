"use client";

import type {
  ParsedPlan,
  RepeatBlock,
  WorkRestBlock,
  WorkRestStep,
  WorkoutStepDurationMeta,
  WorkoutStepSwimMeta,
  WorkoutStepTarget,
  WorkoutZoneBasisSnapshot,
} from "@/api/workout";
import { SportType } from "@/api/activities";
import {
  averageExpressionSpeedAsKmh,
  convertDisplaySpeedToExpression,
  convertExpressionSpeedToDisplay,
  getDisplaySpeedUnitForSport,
  normalizeExpressionSpeedUnit,
  type WorkoutExpressionSportType,
} from "@/components/plan/workout-expression-codec";
import {
  buildZoneBasisSnapshot,
  resolveHrZonePercentToBpmRange,
  resolvePowerZonePercentToWattsRange,
  type ZoneResolutionContext,
} from "@/components/plan/zone-target-resolution";

export type { ZoneResolutionContext } from "@/components/plan/zone-target-resolution";

export type WorkoutModuleStepType =
  | "WARMUP"
  | "WORK"
  | "RECOVERY"
  | "REST"
  | "COOLDOWN"
  | "OTHER";

export type WorkoutTargetKind =
  | "NONE"
  | "SPEED"
  | "CADENCE"
  | "HEART_RATE_ZONE"
  | "HEART_RATE_CUSTOM"
  | "POWER_ZONE"
  | "POWER_CUSTOM";

export type WorkoutTargetRelation =
  | "EQUAL"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "RANGE";

export type WorkoutDurationKind =
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

export type SwimStrokeKind =
  | "FREESTYLE"
  | "BREASTSTROKE"
  | "BACKSTROKE"
  | "BUTTERFLY"
  | "DRILL"
  | "MEDLEY";

export type SwimTrainingType = "KICK" | "PULL" | "DRILL";

export type SwimEquipmentType =
  | "FINS"
  | "KICKBOARD"
  | "PADDLES"
  | "PULL_BUOY"
  | "SNORKEL";

export type WorkoutTargetDraft = {
  kind: WorkoutTargetKind;
  value: string;
  valueHigh?: string;
  relation?: WorkoutTargetRelation;
  zoneIndex?: string;
  zoneLabel?: string;
  zoneSystem?: string;
  zoneSource?: string;
  zoneBasis?: WorkoutZoneBasisSnapshot | Record<string, unknown>;
  unit?: string;
};

export type WorkoutStepModule = {
  id: string;
  kind: "STEP";
  stepType: WorkoutModuleStepType;
  duration: number;
  durationKind: WorkoutDurationKind;
  primaryTarget: WorkoutTargetDraft;
  secondaryTarget: WorkoutTargetDraft;
  swimStroke?: SwimStrokeKind;
  swimTrainingType?: SwimTrainingType;
  swimEquipment?: SwimEquipmentType;
};

export type WorkoutRepeatModule = {
  id: string;
  kind: "REPEAT";
  count: number;
  until?: RepeatBlock["until"];
  steps: WorkoutStepModule[];
};

export type WorkoutStructureModule = WorkoutStepModule | WorkoutRepeatModule;

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createEmptyTarget = (): WorkoutTargetDraft => ({
  kind: "NONE",
  value: "",
  relation: "EQUAL",
});

export const createTargetDraft = (
  kind: WorkoutTargetKind = "NONE",
): WorkoutTargetDraft => ({
  kind,
  value: "",
  valueHigh: "",
  relation:
    kind === "HEART_RATE_ZONE" || kind === "POWER_ZONE" ? "RANGE" : "EQUAL",
  zoneIndex: "",
  zoneLabel: "",
  zoneSystem: "",
  zoneSource: "",
  unit: undefined,
});

const toFiniteNumber = (value: string | number | null | undefined) => {
  if (value == null || value === "") return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
};

const inferTargetRelation = (
  value: string | number | null | undefined,
  valueHigh: string | number | null | undefined,
): WorkoutTargetRelation => {
  const low = toFiniteNumber(value);
  const high = toFiniteNumber(valueHigh);

  if (low != null && high != null) {
    return low === high ? "EQUAL" : "RANGE";
  }

  if (high != null) return "LESS_THAN";
  if (low != null) return "GREATER_THAN";
  return "EQUAL";
};

const getTargetRelationValues = (target: WorkoutTargetDraft) => {
  const low = toFiniteNumber(target.value);
  const high = toFiniteNumber(target.valueHigh);
  const relation =
    target.relation && target.kind !== "NONE"
      ? target.relation
      : inferTargetRelation(target.value, target.valueHigh);

  if (relation === "LESS_THAN") {
    return {
      value: undefined,
      valueHigh: high ?? low,
    };
  }

  if (relation === "GREATER_THAN") {
    return {
      value: low ?? high,
      valueHigh: undefined,
    };
  }

  if (relation === "RANGE") {
    return {
      value: low,
      valueHigh: high,
    };
  }

  const equalValue = low ?? high;
  return {
    value: equalValue,
    valueHigh: equalValue,
  };
};

const getTargetMinimumValue = (target: WorkoutTargetDraft) => {
  if (target.kind === "HEART_RATE_CUSTOM") return 1;
  if (
    target.kind === "HEART_RATE_ZONE" &&
    `${target.unit ?? ""}`.toLowerCase() === "bpm"
  ) {
    return 1;
  }
  return 0;
};

const getTargetRelation = (target: WorkoutTargetDraft) =>
  target.relation && target.kind !== "NONE"
    ? target.relation
    : inferTargetRelation(target.value, target.valueHigh);

const isValidTargetNumber = (value: number | undefined, minimumValue: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimumValue;

const hasZoneReference = (target: WorkoutTargetDraft) =>
  target.zoneIndex !== undefined && target.zoneIndex !== "";

const validateTargetDraft = (target: WorkoutTargetDraft) => {
  if (target.kind === "NONE") return true;
  if (hasZoneReference(target)) return true;

  const relation = getTargetRelation(target);
  const relationValues = getTargetRelationValues(target);
  const minimumValue = getTargetMinimumValue(target);
  const low = relationValues.value;
  const high = relationValues.valueHigh;

  if (relation === "LESS_THAN") {
    return isValidTargetNumber(high, minimumValue);
  }

  if (relation === "GREATER_THAN") {
    return isValidTargetNumber(low, minimumValue);
  }

  if (relation === "RANGE") {
    return (
      typeof low === "number" &&
      typeof high === "number" &&
      isValidTargetNumber(low, minimumValue) &&
      isValidTargetNumber(high, minimumValue) &&
      low <= high
    );
  }

  return isValidTargetNumber(low ?? high, minimumValue);
};

export const createStepModule = (
  stepType: WorkoutModuleStepType = "WORK",
): WorkoutStepModule => ({
  id: createId(),
  kind: "STEP",
  stepType,
  duration: 60,
  durationKind: "TIME",
  primaryTarget: createEmptyTarget(),
  secondaryTarget: createEmptyTarget(),
});

export const createRepeatModule = (): WorkoutRepeatModule => ({
  id: createId(),
  kind: "REPEAT",
  count: 2,
  steps: [createStepModule("WORK"), createStepModule("REST")],
});

const mapTargetMetaToDraft = (
  target: WorkoutStepTarget | null | undefined,
  sportType: WorkoutExpressionSportType,
): WorkoutTargetDraft | null => {
  // 后端 blocks 里的 speed 始终用表达式单位（跑步 sec/km、游泳 sec/100m），编辑器按运动类型转成展示单位。
  if (!target || target.kind === "NONE") return null;

  if (target.kind === "SPEED") {
    const displayUnit = getDisplaySpeedUnitForSport(sportType);
    const low =
      typeof target.value === "number" && Number.isFinite(target.value)
        ? convertExpressionSpeedToDisplay(target.value, sportType, displayUnit)
        : undefined;
    const high =
      typeof target.valueHigh === "number" && Number.isFinite(target.valueHigh)
        ? convertExpressionSpeedToDisplay(
            target.valueHigh,
            sportType,
            displayUnit,
          )
        : undefined;

    return {
      kind: target.kind,
      value: typeof low === "number" ? String(low) : "",
      valueHigh: typeof high === "number" ? String(high) : "",
      relation: inferTargetRelation(low, high),
      zoneIndex:
        typeof target.zoneIndex === "number" &&
        Number.isFinite(target.zoneIndex)
          ? String(target.zoneIndex)
          : "",
      zoneLabel: target.zoneLabel || "",
      zoneSystem: target.zoneSystem || "",
      zoneSource: target.zoneSource || "",
      zoneBasis: target.zoneBasis,
      unit: displayUnit,
    };
  }

  return {
    kind: target.kind,
    value:
      typeof target.value === "number" && Number.isFinite(target.value)
        ? String(target.value)
        : "",
    valueHigh:
      typeof target.valueHigh === "number" && Number.isFinite(target.valueHigh)
        ? String(target.valueHigh)
        : "",
    relation: inferTargetRelation(target.value, target.valueHigh),
    zoneIndex:
      typeof target.zoneIndex === "number" && Number.isFinite(target.zoneIndex)
        ? String(target.zoneIndex)
        : "",
    zoneLabel: target.zoneLabel || "",
    zoneSystem: target.zoneSystem || "",
    zoneSource: target.zoneSource || "",
    zoneBasis: target.zoneBasis,
    unit: target.unit,
  };
};

const mapDurationMetaToDraft = (
  step: WorkRestStep,
): Pick<WorkoutStepModule, "duration" | "durationKind"> => {
  if (!step.durationMeta) {
    return { duration: step.duration, durationKind: "TIME" };
  }

  const duration =
    step.durationMeta.kind === "DISTANCE" &&
    step.durationMeta.unit === "METERS" &&
    typeof step.durationMeta.value === "number"
      ? step.durationMeta.value / 1000
      : typeof step.durationMeta.value === "number" &&
          Number.isFinite(step.durationMeta.value)
        ? step.durationMeta.value
        : step.duration;

  return {
    duration,
    durationKind: step.durationMeta.kind,
  };
};

const mapSwimMetaToDraft = (
  meta: WorkoutStepSwimMeta | null | undefined,
): Pick<
  WorkoutStepModule,
  "swimStroke" | "swimTrainingType" | "swimEquipment"
> => ({
  swimStroke: meta?.stroke,
  swimTrainingType: meta?.trainingType,
  swimEquipment: meta?.equipment,
});

const extractTargets = (
  step: WorkRestStep,
  sportType: WorkoutExpressionSportType,
): WorkoutTargetDraft[] => {
  // 优先使用结构化 targetMeta；兼容旧数据时再从 paceKmh/cadence/hr/power 字段反推 target。
  const targets: WorkoutTargetDraft[] = [];

  const primaryFromMeta = mapTargetMetaToDraft(
    step.primaryTargetMeta,
    sportType,
  );
  if (primaryFromMeta) {
    targets.push(primaryFromMeta);
  }

  if (
    !primaryFromMeta &&
    typeof step.paceKmh === "number" &&
    step.paceKmh > 0
  ) {
    const speedUnit = getDisplaySpeedUnitForSport(sportType);
    const speedValue = convertExpressionSpeedToDisplay(
      normalizeExpressionSpeedUnit(undefined, sportType) === "sec/100m"
        ? 360 / step.paceKmh
        : 3600 / step.paceKmh,
      sportType,
      speedUnit,
    );
    targets.push({
      kind: "SPEED",
      value: typeof speedValue === "number" ? String(speedValue) : "",
      valueHigh: typeof speedValue === "number" ? String(speedValue) : "",
      relation: "EQUAL",
      unit: speedUnit,
    });
  }
  if (!primaryFromMeta && typeof step.cadence === "number") {
    targets.push({
      kind: "CADENCE",
      value: String(step.cadence),
      valueHigh: String(step.cadence),
      relation: "EQUAL",
    });
  }
  if (!primaryFromMeta && typeof step.heartRateBpm === "number") {
    targets.push({
      kind: "HEART_RATE_CUSTOM",
      value: String(step.heartRateBpm),
      valueHigh: String(step.heartRateBpm),
      relation: "EQUAL",
      unit: "bpm",
    });
  }
  if (!primaryFromMeta && typeof step.power === "number") {
    const percentValue = String(Math.round(step.power * 100));
    targets.push({
      kind: "POWER_ZONE",
      value: percentValue,
      valueHigh: percentValue,
      relation: "EQUAL",
      unit: "%",
    });
  }
  if (!primaryFromMeta && typeof step.powerWatts === "number") {
    targets.push({
      kind: "POWER_CUSTOM",
      value: String(step.powerWatts),
      valueHigh: String(step.powerWatts),
      relation: "EQUAL",
      unit: "W",
    });
  }

  return targets.slice(0, 1);
};

const inferStepType = (
  blockType: WorkRestBlock["type"],
  step: WorkRestStep,
): WorkoutModuleStepType => {
  if (step.stepKind) return step.stepKind;
  return blockType === "rest" ? "REST" : "WORK";
};

const reportTargetAssignmentIssue = (strict: boolean, message: string) => {
  if (strict) {
    throw new Error(message);
  }
};

const assignTarget = (
  step: WorkRestStep,
  target: WorkoutTargetDraft,
  sportType: WorkoutExpressionSportType,
  zoneResolution: ZoneResolutionContext | null | undefined,
  strict = false,
) => {
  // 区间目标保留 zone provenance；当前 low/high 仅作为展示、估算和平台导出的兜底值。
  if (target.kind === "NONE") return;

  const relationValues = getTargetRelationValues(target);
  let numericValue =
    typeof relationValues.value === "number" ? relationValues.value : NaN;
  let numericHighValue = relationValues.valueHigh;

  if (target.kind === "SPEED") {
    const displayUnit =
      (target.unit as "sec/km" | "sec/100m" | "km/h" | undefined) ||
      getDisplaySpeedUnitForSport(sportType);
    const convertedLow = convertDisplaySpeedToExpression(
      numericValue,
      sportType,
      displayUnit,
    );
    const convertedHigh =
      typeof numericHighValue === "number"
        ? convertDisplaySpeedToExpression(
            numericHighValue,
            sportType,
            displayUnit,
          )
        : undefined;

    numericValue =
      typeof convertedLow === "number" && Number.isFinite(convertedLow)
        ? convertedLow
        : NaN;
    numericHighValue =
      typeof convertedHigh === "number" && Number.isFinite(convertedHigh)
        ? convertedHigh
        : undefined;
  }

  const finiteValues = [numericValue, numericHighValue].filter(
    (value): value is number => Number.isFinite(value as number),
  );
  if (finiteValues.some((value) => value < 0)) {
    reportTargetAssignmentIssue(
      strict,
      "Workout target values must be valid and non-negative.",
    );
    return;
  }
  const zoneReferenced = hasZoneReference(target);
  const zoneType =
    target.kind === "HEART_RATE_ZONE"
      ? "HEART_RATE"
      : target.kind === "POWER_ZONE"
        ? "POWER"
        : target.kind === "SPEED" && zoneReferenced
          ? "PACE"
          : null;

  const representativeValue =
    target.kind === "SPEED"
      ? averageExpressionSpeedAsKmh(
          Number.isFinite(numericValue) ? numericValue : undefined,
          numericHighValue,
          normalizeExpressionSpeedUnit(target.unit, sportType),
        )
      : finiteValues.length > 0
        ? finiteValues.reduce((sum, value) => sum + value, 0) /
          finiteValues.length
        : undefined;

  const meta: WorkoutStepTarget = {
    kind: target.kind,
    value: Number.isFinite(numericValue) ? numericValue : undefined,
    valueHigh: numericHighValue,
    zoneIndex:
      target.zoneIndex !== undefined &&
      target.zoneIndex !== "" &&
      Number.isFinite(Number(target.zoneIndex))
        ? Number(target.zoneIndex)
        : undefined,
    zoneLabel: target.zoneLabel || undefined,
    zoneSystem: target.zoneSystem || undefined,
    zoneSource: target.zoneSource || undefined,
    zoneBasis: target.zoneBasis,
    unit:
      target.kind === "SPEED"
        ? normalizeExpressionSpeedUnit(target.unit, sportType)
        : target.unit,
  };
  if (zoneType) {
    const benchmark =
      target.zoneSystem ||
      (zoneType === "HEART_RATE"
        ? zoneResolution?.hrBenchmark
        : zoneType === "POWER"
          ? zoneResolution?.powerBenchmark
          : zoneResolution?.paceBenchmark);
    meta.zoneBasis = buildZoneBasisSnapshot({
      zoneType,
      sportType: zoneResolution?.sportType ?? sportType ?? SportType.UNKNOWN,
      benchmark,
      profile: zoneResolution?.profile,
      targetLow: Number.isFinite(numericValue) ? numericValue : undefined,
      targetHigh: numericHighValue,
      targetUnit: meta.unit,
    });
  }

  if (
    typeof representativeValue !== "number" ||
    !Number.isFinite(representativeValue)
  ) {
    if (zoneReferenced && zoneType) {
      step.primaryTargetMeta = meta;
    } else {
      reportTargetAssignmentIssue(
        strict,
        "Workout target could not be converted. Please check target type, source, zone, and value.",
      );
    }
    return;
  }

  switch (target.kind) {
    case "SPEED": {
      if (representativeValue > 0) {
        step.paceKmh = representativeValue;
      }
      break;
    }
    case "CADENCE":
      step.cadence = representativeValue;
      break;
    case "HEART_RATE_ZONE": {
      const u = `${target.unit ?? ""}`.toLowerCase();
      if (u === "bpm") {
        meta.unit = "bpm";
        step.heartRateBpm = representativeValue;
      } else if (u === "%") {
        const resolved = resolveHrZonePercentToBpmRange(
          numericValue,
          numericHighValue,
          zoneResolution,
        );
        if (!resolved) {
          if (zoneReferenced && zoneType) {
            step.primaryTargetMeta = meta;
          } else {
            reportTargetAssignmentIssue(
              strict,
              "Heart rate zone target could not be resolved. Please check your heart rate zones and profile values.",
            );
          }
          return;
        }
        step.heartRateBpm =
          (resolved.low + (resolved.high ?? resolved.low)) / 2;
      } else if (!zoneReferenced) {
        reportTargetAssignmentIssue(
          strict,
          "Heart rate zone target is missing a zone reference.",
        );
        return;
      }
      break;
    }
    case "HEART_RATE_CUSTOM":
      meta.unit = "bpm";
      step.heartRateBpm = representativeValue;
      break;
    case "POWER_ZONE": {
      const u = `${target.unit ?? ""}`.toLowerCase();
      if (u === "w") {
        meta.unit = "W";
        step.powerWatts = representativeValue;
      } else if (u === "%") {
        const resolved = resolvePowerZonePercentToWattsRange(
          numericValue,
          numericHighValue,
          zoneResolution,
        );
        if (!resolved) {
          if (zoneReferenced && zoneType) {
            step.primaryTargetMeta = meta;
          } else {
            reportTargetAssignmentIssue(
              strict,
              "Power zone target could not be resolved. Please check your power zones and profile values.",
            );
          }
          return;
        }
        step.powerWatts = (resolved.low + (resolved.high ?? resolved.low)) / 2;
      } else if (!zoneReferenced) {
        reportTargetAssignmentIssue(
          strict,
          "Power zone target is missing a zone reference.",
        );
        return;
      }
      break;
    }
    case "POWER_CUSTOM":
      meta.unit = "W";
      step.powerWatts = representativeValue;
      break;
  }

  step.primaryTargetMeta = meta;
};

export const structureModulesFromBlocks = (
  blocks: ParsedPlan | null | undefined,
  sportType: WorkoutExpressionSportType = "RUN",
): WorkoutStructureModule[] => {
  // PlanBlock -> 编辑器模块：repeat 保留为一组模块，普通 block 展开成逐个可拖拽 step。
  if (!blocks?.length) return [];

  return blocks.flatMap<WorkoutStructureModule>((block) => {
    if (block.type === "repeat") {
      return {
        id: createId(),
        kind: "REPEAT" as const,
        count: block.count,
        until: block.until,
        steps: block.children.flatMap((child) =>
          child.steps.map((step) => {
            const targets = extractTargets(step, sportType);
            return {
              id: createId(),
              kind: "STEP" as const,
              stepType: inferStepType(child.type, step),
              ...mapDurationMetaToDraft(step),
              primaryTarget: targets[0] ?? createEmptyTarget(),
              secondaryTarget: targets[1] ?? createEmptyTarget(),
              ...mapSwimMetaToDraft(step.swimMeta),
            };
          }),
        ),
      };
    }

    return block.steps.map<WorkoutStepModule>((step) => {
      const targets = extractTargets(step, sportType);
      return {
        id: createId(),
        kind: "STEP" as const,
        stepType: inferStepType(block.type, step),
        ...mapDurationMetaToDraft(step),
        primaryTarget: targets[0] ?? createEmptyTarget(),
        secondaryTarget: targets[1] ?? createEmptyTarget(),
        ...mapSwimMetaToDraft(step.swimMeta),
      };
    });
  });
};

const stepModuleToBlockType = (
  stepType: WorkoutModuleStepType,
): WorkRestBlock["type"] => {
  return stepType === "REST" || stepType === "RECOVERY" ? "rest" : "work";
};

const isThresholdDurationKind = (kind: WorkoutDurationKind) =>
  kind === "HR_GREATER_THAN" ||
  kind === "HR_LESS_THAN" ||
  kind === "POWER_GREATER_THAN" ||
  kind === "POWER_LESS_THAN" ||
  kind === "CADENCE_GREATER_THAN" ||
  kind === "CADENCE_LESS_THAN";

const getDurationMinimumValue = (kind: WorkoutDurationKind) =>
  kind === "POWER_GREATER_THAN" ||
  kind === "POWER_LESS_THAN" ||
  kind === "CADENCE_GREATER_THAN" ||
  kind === "CADENCE_LESS_THAN"
    ? 0
    : 1;

const normalizeDurationValue = (value: number, kind: WorkoutDurationKind) => {
  const minimumValue = getDurationMinimumValue(kind);
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(minimumValue, numericValue)
    : minimumValue;
};

const isValidDurationValue = (value: number, kind: WorkoutDurationKind) => {
  if (kind === "OPEN") return true;
  const minimumValue = getDurationMinimumValue(kind);
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= minimumValue;
};

const validateWorkoutStepModule = (module: WorkoutStepModule) =>
  isValidDurationValue(module.duration, module.durationKind) &&
  validateTargetDraft(module.primaryTarget) &&
  validateTargetDraft(module.secondaryTarget);

export const validateWorkoutStructure = (modules: WorkoutStructureModule[]) => {
  if (modules.length === 0) return false;

  return modules.every((structureModule) => {
    if (structureModule.kind === "REPEAT") {
      return (
        Number.isFinite(structureModule.count) &&
        structureModule.count >= 1 &&
        structureModule.steps.length > 0 &&
        structureModule.steps.every(validateWorkoutStepModule)
      );
    }

    return validateWorkoutStepModule(structureModule);
  });
};

export const structureModulesToBlocks = (
  modules: WorkoutStructureModule[],
  sportType: WorkoutExpressionSportType = "RUN",
  zoneResolution?: ZoneResolutionContext | null,
  options?: { strict?: boolean },
): ParsedPlan => {
  // 编辑器模块 -> PlanBlock：相邻同类型 step 会合并，减少生成的 DSL 行数。
  const blocks: ParsedPlan = [];
  const strict = Boolean(options?.strict);

  for (const structureModule of modules) {
    if (structureModule.kind === "REPEAT") {
      const children: WorkRestBlock[] = [];
      for (const stepModule of structureModule.steps) {
        const childType = stepModuleToBlockType(stepModule.stepType);
        const nextStep = stepToWorkRestStepForSport(
          stepModule,
          sportType,
          zoneResolution,
          strict,
        );
        const last = children.at(-1);
        if (last && last.type === childType) {
          last.steps.push(nextStep);
        } else {
          children.push({
            type: childType,
            steps: [nextStep],
          });
        }
      }
      blocks.push({
        type: "repeat",
        count: Math.max(1, Math.floor(structureModule.count || 1)),
        until: structureModule.until,
        children,
      } satisfies RepeatBlock);
      continue;
    }

    const blockType = stepModuleToBlockType(structureModule.stepType);
    const nextStep = stepToWorkRestStepForSport(
      structureModule,
      sportType,
      zoneResolution,
      strict,
    );
    const last = blocks.at(-1);
    if (last && last.type !== "repeat" && last.type === blockType) {
      last.steps.push(nextStep);
    } else {
      blocks.push({
        type: blockType,
        steps: [nextStep],
      } satisfies WorkRestBlock);
    }
  }

  return blocks;
};

const stepToWorkRestStepForSport = (
  module: WorkoutStepModule,
  sportType: WorkoutExpressionSportType,
  zoneResolution?: ZoneResolutionContext | null,
  strict = false,
) => {
  // 非时间型 duration 仍给一个占位 duration，真实语义放在 durationMeta 里。
  const normalizedDurationValue = normalizeDurationValue(
    module.duration,
    module.durationKind,
  );
  const durationMeta: WorkoutStepDurationMeta =
    module.durationKind === "OPEN"
      ? { kind: "OPEN" }
      : {
          kind: module.durationKind,
          value: normalizedDurationValue,
          unit:
            module.durationKind === "TIME"
              ? "SECONDS"
              : module.durationKind === "DISTANCE"
                ? "KILOMETERS"
                : module.durationKind === "CALORIES"
                  ? "KJ"
                  : module.durationKind === "HR_GREATER_THAN" ||
                      module.durationKind === "HR_LESS_THAN"
                    ? "BPM"
                    : module.durationKind === "CADENCE_GREATER_THAN" ||
                        module.durationKind === "CADENCE_LESS_THAN"
                      ? "RPM"
                      : "WATTS",
        };

  const step: WorkRestStep = {
    duration:
      module.durationKind === "TIME"
        ? Math.max(1, Math.floor(normalizedDurationValue || 1))
        : 60,
    stepKind: module.stepType,
    durationMeta,
    swimMeta:
      module.swimStroke || module.swimTrainingType || module.swimEquipment
        ? {
            stroke: module.swimStroke,
            trainingType: module.swimTrainingType,
            equipment: module.swimEquipment,
          }
        : null,
  };

  if (!isThresholdDurationKind(module.durationKind)) {
    assignTarget(step, module.primaryTarget, sportType, zoneResolution, strict);
  }
  return step;
};

export const getTargetOptionsForSport = (
  sportType: WorkoutExpressionSportType,
): WorkoutTargetKind[] => {
  if (String(sportType) === SportType.SWIM) {
    return ["NONE", "SPEED"];
  }

  return [
    "NONE",
    "SPEED",
    "CADENCE",
    "HEART_RATE_ZONE",
    "HEART_RATE_CUSTOM",
    "POWER_ZONE",
    "POWER_CUSTOM",
  ];
};
