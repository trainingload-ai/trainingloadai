import type {
  EndurancePlanBlock,
  EnduranceWorkoutIrV1,
} from "./endurance-workout-ir";
import type { StrengthWorkoutIrV1 } from "./strength-workout-ir";
import type {
  FreeformWorkoutIrV1,
  WorkoutDefinitionInput,
  WorkoutStructure,
  WorkoutStructureKind,
} from "./workout-structure";

export const PLAN_SHARE_SCHEMA_VERSION = 1 as const;
export const PLAN_SHARE_PAYLOAD_VERSION = "plan-share-v1" as const;
export const PLAN_SHARE_MAX_PAYLOAD_BYTES = 512 * 1024;

export const PLAN_SHARE_SPORT_TYPES = [
  "RUN",
  "CYCLING",
  "SWIM",
  "STRETCHING",
  "UNKNOWN",
] as const;

export type PlanShareSportType = (typeof PLAN_SHARE_SPORT_TYPES)[number];
export type PlanShareOrigin = "USER_SHARE" | "OFFICIAL";
export type PlanShareVisibility = "UNLISTED" | "CATALOG";

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "userId",
  "planId",
  "scheduledDate",
  "startDate",
  "endDate",
  "activatedAt",
  "pausedAt",
  "completedAt",
  "skippedAt",
  "cancelledAt",
  "createdAt",
  "updatedAt",
  "status",
  "movedFromWorkoutId",
  "movedBy",
  "estimatedLoad",
  "estimatedLoadSource",
  "estimatedLoadInputs",
  "estimatedLoadComputedAt",
  "links",
  "externalMappings",
  "dayOffset",
  "currentWeekIndex",
  "currentDayIndex",
]);

const WORKOUT_FORBIDDEN_KEYS = new Set([...FORBIDDEN_PAYLOAD_KEYS, "id"]);

export class PlanSharePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanSharePayloadError";
  }
}

export type PlanShareWorkoutV1 = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex: number;
  sportType: PlanShareSportType;
  sportDefinitionCode?: string | null;
  name?: string | null;
  notes?: string | null;
  text: string;
  structureKind: WorkoutStructureKind;
  dslVersion: 1;
  definition?: WorkoutDefinitionInput;
};

export type PlanSharePayloadV1 = {
  schemaVersion: 1;
  payloadVersion: typeof PLAN_SHARE_PAYLOAD_VERSION;
  exportedAt: string;
  title: string;
  description: string | null;
  goal: string | null;
  periodWeeks: number;
  locale: string;
  workouts: PlanShareWorkoutV1[];
};

export type PlanSharePreviewWorkoutV1 = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex: number;
  sportType: PlanShareSportType;
  name: string | null;
  notes: string | null;
  structureKind: WorkoutStructureKind;
  structure?: WorkoutStructure;
  durationSeconds?: number | null;
  previewLoad?: number | null;
};

export type PlanSharePreviewV1 = {
  title: string;
  description: string | null;
  goal: string | null;
  periodWeeks: number;
  locale: string;
  sportTypes: PlanShareSportType[];
  workoutCount: number;
  trainingDaysPerWeek: number;
  workouts: PlanSharePreviewWorkoutV1[];
};

export type PlanShareSourceWorkout = {
  id?: string;
  weekIndex?: number;
  dayIndex?: number;
  dayOffset?: number;
  sessionIndex?: number;
  sportType?: string;
  sportDefinitionCode?: string | null;
  name?: string | null;
  notes?: string | null;
  text?: string | null;
  structureKind?: string | null;
  dslVersion?: number | null;
  structure?: unknown;
  definition?: WorkoutDefinitionInput;
  blocks?: unknown;
};

export type PlanShareSourcePlan = {
  title?: string | null;
  description?: string | null;
  goal?: string | null;
  periodWeeks?: number;
  workouts?: PlanShareSourceWorkout[] | null;
};

export type PlanShareCreatePlanDto = {
  title: string;
  description?: string;
  goal?: string;
  sourceType: "IMPORTED";
  generationMetadata?: Record<string, unknown>;
  periodWeeks: number;
  workouts: Array<{
    weekIndex: number;
    dayIndex: number;
    sessionIndex: number;
    sportType: PlanShareSportType;
    sportDefinitionCode?: string | null;
    name?: string | null;
    notes?: string | null;
    text: string;
    definition?: WorkoutDefinitionInput;
  }>;
};

function isSportType(value: unknown): value is PlanShareSportType {
  return (
    typeof value === "string" &&
    (PLAN_SHARE_SPORT_TYPES as readonly string[]).includes(value)
  );
}

function isStructureKind(value: unknown): value is WorkoutStructureKind {
  return value === "ENDURANCE" || value === "STRENGTH" || value === "FREEFORM";
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function toWeekDay(workout: PlanShareSourceWorkout): {
  weekIndex: number;
  dayIndex: number;
} {
  if (
    Number.isInteger(workout.weekIndex) &&
    Number(workout.weekIndex) >= 1 &&
    Number.isInteger(workout.dayIndex) &&
    Number(workout.dayIndex) >= 1
  ) {
    return {
      weekIndex: Number(workout.weekIndex),
      dayIndex: Number(workout.dayIndex),
    };
  }
  const dayOffset = Number(workout.dayOffset ?? 0);
  const safeOffset = Number.isFinite(dayOffset) && dayOffset >= 0 ? dayOffset : 0;
  return {
    weekIndex: Math.floor(safeOffset / 7) + 1,
    dayIndex: (safeOffset % 7) + 1,
  };
}

function coerceEnduranceBlocks(value: unknown): EndurancePlanBlock[] | null {
  if (Array.isArray(value) && value.length > 0) {
    return value as EndurancePlanBlock[];
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as EndurancePlanBlock[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

function asStrengthStructure(
  workout: PlanShareSourceWorkout,
): StrengthWorkoutIrV1 | null {
  const structure = workout.structure;
  if (
    structure &&
    typeof structure === "object" &&
    (structure as { kind?: unknown }).kind === "STRENGTH"
  ) {
    return structure as StrengthWorkoutIrV1;
  }
  return null;
}

function asEnduranceStructure(
  workout: PlanShareSourceWorkout,
): EnduranceWorkoutIrV1 | null {
  const structure = workout.structure;
  if (
    structure &&
    typeof structure === "object" &&
    (structure as { kind?: unknown }).kind === "ENDURANCE"
  ) {
    const blocks = coerceEnduranceBlocks(
      (structure as EnduranceWorkoutIrV1).blocks,
    );
    if (blocks) {
      return {
        kind: "ENDURANCE",
        version: 1,
        blocks,
      };
    }
  }
  const blocks = coerceEnduranceBlocks(workout.blocks);
  if (blocks) {
    return {
      kind: "ENDURANCE",
      version: 1,
      blocks,
    };
  }
  return null;
}

function asFreeformStructure(
  workout: PlanShareSourceWorkout,
  text: string,
): FreeformWorkoutIrV1 | null {
  const structure = workout.structure;
  if (
    structure &&
    typeof structure === "object" &&
    (structure as { kind?: unknown }).kind === "FREEFORM"
  ) {
    const body =
      asTrimmedString((structure as FreeformWorkoutIrV1).text) || text;
    if (body) {
      return { kind: "FREEFORM", version: 1, text: body };
    }
  }
  return null;
}

export function isRenderablePreviewStructure(
  structure: WorkoutStructure | null | undefined,
): structure is WorkoutStructure {
  if (!structure) return false;
  if (structure.kind === "ENDURANCE") {
    return Array.isArray(structure.blocks) && structure.blocks.length > 0;
  }
  if (structure.kind === "STRENGTH") {
    return Array.isArray(structure.exercises) && structure.exercises.length > 0;
  }
  return (
    structure.kind === "FREEFORM" && asTrimmedString(structure.text).length > 0
  );
}

const PREVIEW_DEFAULT_IF = 0.65;
const PREVIEW_ZONE_IF: Record<number, number> = {
  1: 0.5,
  2: 0.65,
  3: 0.8,
  4: 0.9,
  5: 1.05,
  6: 1.15,
};
const PREVIEW_STEP_KIND_IF: Record<string, number> = {
  WARMUP: 0.55,
  COOLDOWN: 0.55,
  RECOVERY: 0.45,
  REST: 0.45,
  WORK: 0.7,
  INTERVAL: 0.95,
  OTHER: PREVIEW_DEFAULT_IF,
};

function roundPreviewLoad(value: number) {
  return Math.round(value * 10) / 10;
}

function loadFromDuration(durationSeconds: number, ifValue = PREVIEW_DEFAULT_IF) {
  if (durationSeconds <= 0) return 0;
  return ifValue * ifValue * (durationSeconds / 3600) * 100;
}

function enduranceStepDurationSeconds(step: Record<string, unknown>) {
  const duration = Number(step.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const meta = step.durationMeta as { kind?: string } | null | undefined;
  if (meta?.kind && meta.kind !== "TIME") return 0;
  return duration;
}

function enduranceStepIf(step: Record<string, unknown>) {
  const target = step.primaryTargetMeta as { zoneIndex?: number } | null | undefined;
  const zone = Number(target?.zoneIndex ?? 0);
  if (zone >= 1 && PREVIEW_ZONE_IF[zone]) return PREVIEW_ZONE_IF[zone];
  const kind = String(step.stepKind ?? "").toUpperCase();
  return PREVIEW_STEP_KIND_IF[kind] ?? PREVIEW_DEFAULT_IF;
}

function endurancePreviewMetrics(blocks: unknown[]) {
  const visit = (items: unknown[]): { duration: number; load: number } => {
    const total = { duration: 0, load: 0 };
    for (const block of items) {
      const row = block as {
        type?: string;
        count?: number;
        children?: unknown[];
        steps?: unknown[];
      };
      if (row?.type === "repeat") {
        const child = visit(Array.isArray(row.children) ? row.children : []);
        const count = Math.max(0, Number(row.count ?? 0));
        total.duration += child.duration * count;
        total.load += child.load * count;
        continue;
      }
      for (const step of Array.isArray(row?.steps) ? row.steps : []) {
        const duration = enduranceStepDurationSeconds(
          (step ?? {}) as Record<string, unknown>,
        );
        total.duration += duration;
        total.load += loadFromDuration(
          duration,
          enduranceStepIf((step ?? {}) as Record<string, unknown>),
        );
      }
    }
    return total;
  };
  return visit(blocks);
}

export function previewMetricsFromStructure(
  structure?: WorkoutStructure,
): { durationSeconds: number | null; previewLoad: number | null } {
  if (!structure) return { durationSeconds: null, previewLoad: null };
  if (structure.kind === "ENDURANCE") {
    const value = endurancePreviewMetrics(
      Array.isArray(structure.blocks) ? structure.blocks : [],
    );
    return {
      durationSeconds: value.duration > 0 ? Math.round(value.duration) : null,
      previewLoad: value.load > 0 ? roundPreviewLoad(value.load) : null,
    };
  }
  if (structure.kind === "STRENGTH") {
    const duration = Number(structure.durationSeconds ?? 0);
    const rpe = Number(structure.plannedSessionRpe ?? 6);
    const ifValue =
      Number.isFinite(rpe) && rpe > 0
        ? Math.min(1.2, Math.max(0.3, rpe / 10))
        : PREVIEW_DEFAULT_IF;
    return {
      durationSeconds: duration > 0 ? Math.round(duration) : null,
      previewLoad:
        duration > 0 ? roundPreviewLoad(loadFromDuration(duration, ifValue)) : null,
    };
  }
  return { durationSeconds: null, previewLoad: null };
}

export function withPreviewMetrics(
  workout: PlanSharePreviewWorkoutV1,
  structure = workout.structure,
): PlanSharePreviewWorkoutV1 {
  const resolved = structure ?? workout.structure;
  const metrics = previewMetricsFromStructure(resolved);
  return {
    ...workout,
    ...(resolved ? { structure: resolved } : {}),
    durationSeconds: metrics.durationSeconds,
    previewLoad: metrics.previewLoad,
  };
}

function previewStructureFromWorkout(
  workout: PlanShareWorkoutV1,
): WorkoutStructure | undefined {
  if (workout.definition?.source !== "STRUCTURE") return undefined;
  const structure = workout.definition.structure;
  return isRenderablePreviewStructure(structure) ? structure : undefined;
}

function mapWorkout(workout: PlanShareSourceWorkout): PlanShareWorkoutV1 {
  const { weekIndex, dayIndex } = toWeekDay(workout);
  const sportType = isSportType(workout.sportType)
    ? workout.sportType
    : "UNKNOWN";
  const structureKind: WorkoutStructureKind = isStructureKind(
    workout.structureKind,
  )
    ? workout.structureKind
    : "ENDURANCE";
  const text = asTrimmedString(workout.text);
  const mapped: PlanShareWorkoutV1 = {
    weekIndex,
    dayIndex,
    sessionIndex:
      Number.isInteger(workout.sessionIndex) && Number(workout.sessionIndex) >= 1
        ? Number(workout.sessionIndex)
        : 1,
    sportType,
    sportDefinitionCode: asNullableString(workout.sportDefinitionCode),
    name: asNullableString(workout.name),
    notes: asNullableString(workout.notes),
    text,
    structureKind,
    dslVersion: 1,
  };

  const strength = asStrengthStructure(workout);
  if (structureKind === "STRENGTH" && strength) {
    mapped.definition = {
      kind: "STRENGTH",
      version: 1,
      source: "STRUCTURE",
      structure: strength,
    };
    return mapped;
  }

  const endurance = asEnduranceStructure(workout);
  if (structureKind === "ENDURANCE" && endurance) {
    mapped.definition = {
      kind: "ENDURANCE",
      version: 1,
      source: "STRUCTURE",
      structure: endurance,
    };
    return mapped;
  }

  const freeform = asFreeformStructure(workout, text);
  if (structureKind === "FREEFORM" && freeform) {
    mapped.definition = {
      kind: "FREEFORM",
      version: 1,
      source: "STRUCTURE",
      structure: freeform,
    };
    return mapped;
  }

  mapped.definition = {
    kind: structureKind,
    version: 1,
    source: "TEXT",
    text,
  };
  return mapped;
}

function collectSportTypes(workouts: PlanShareWorkoutV1[]): PlanShareSportType[] {
  const seen = new Set<PlanShareSportType>();
  for (const workout of workouts) {
    seen.add(workout.sportType);
  }
  return PLAN_SHARE_SPORT_TYPES.filter((sport) => seen.has(sport));
}

function trainingDaysPerWeek(workouts: PlanShareWorkoutV1[]): number {
  const days = new Set(workouts.map((workout) => workout.dayIndex));
  return days.size;
}

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlanSharePayloadError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNoForbiddenKeys(
  value: unknown,
  forbidden: Set<string>,
  label: string,
) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoForbiddenKeys(item, forbidden, `${label}[${index}]`);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) {
      throw new PlanSharePayloadError(`${label} must not include ${key}`);
    }
    assertNoForbiddenKeys(
      (value as Record<string, unknown>)[key],
      forbidden,
      `${label}.${key}`,
    );
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const sorted: Record<string, unknown> = {};
  for (const [key, nested] of entries) {
    sorted[key] = sortKeysDeep(nested);
  }
  return sorted;
}

export function canonicalPayloadJson(payload: PlanSharePayloadV1): string {
  const { exportedAt: _exportedAt, ...rest } = payload;
  return JSON.stringify(sortKeysDeep(rest));
}

function utf8Bytes(value: string): number {
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(value, "utf8");
  }
  return new TextEncoder().encode(value).length;
}

export function payloadBytes(payload: PlanSharePayloadV1): number {
  return utf8Bytes(JSON.stringify(payload));
}

export function fromPlan(
  plan: PlanShareSourcePlan,
  options?: { locale?: string; now?: Date },
): PlanSharePayloadV1 {
  const title = asTrimmedString(plan.title);
  if (!title) {
    throw new PlanSharePayloadError("Plan title cannot be empty");
  }
  const workouts = Array.isArray(plan.workouts)
    ? plan.workouts.map(mapWorkout)
    : [];
  if (workouts.length === 0) {
    throw new PlanSharePayloadError("At least one workout is required");
  }

  const payload: PlanSharePayloadV1 = {
    schemaVersion: PLAN_SHARE_SCHEMA_VERSION,
    payloadVersion: PLAN_SHARE_PAYLOAD_VERSION,
    exportedAt: (options?.now ?? new Date()).toISOString(),
    title,
    description: asNullableString(plan.description),
    goal: asNullableString(plan.goal),
    periodWeeks:
      Number.isInteger(plan.periodWeeks) && Number(plan.periodWeeks) >= 1
        ? Number(plan.periodWeeks)
        : 1,
    locale: asTrimmedString(options?.locale) || "en",
    workouts,
  };
  assertSafe(payload);
  return payload;
}

export function assertSafe(value: unknown): asserts value is PlanSharePayloadV1 {
  const payload = assertPlainObject(value, "payload");
  if (payload.schemaVersion !== PLAN_SHARE_SCHEMA_VERSION) {
    throw new PlanSharePayloadError("Unsupported plan share schema");
  }
  if (payload.payloadVersion !== PLAN_SHARE_PAYLOAD_VERSION) {
    throw new PlanSharePayloadError("Unsupported plan share payload version");
  }
  if (typeof payload.title !== "string" || !payload.title.trim()) {
    throw new PlanSharePayloadError("Plan title cannot be empty");
  }
  if (
    !Number.isInteger(payload.periodWeeks) ||
    Number(payload.periodWeeks) < 1
  ) {
    throw new PlanSharePayloadError("periodWeeks must be a positive integer");
  }
  if (!Array.isArray(payload.workouts) || payload.workouts.length === 0) {
    throw new PlanSharePayloadError("At least one workout is required");
  }

  assertNoForbiddenKeys(payload, FORBIDDEN_PAYLOAD_KEYS, "payload");

  for (const [index, workout] of payload.workouts.entries()) {
    const row = assertPlainObject(workout, `workouts[${index}]`);
    for (const key of Object.keys(row)) {
      if (WORKOUT_FORBIDDEN_KEYS.has(key)) {
        throw new PlanSharePayloadError(
          `workouts[${index}] must not include ${key}`,
        );
      }
    }
    if (
      !Number.isInteger(row.weekIndex) ||
      Number(row.weekIndex) < 1 ||
      !Number.isInteger(row.dayIndex) ||
      Number(row.dayIndex) < 1 ||
      !Number.isInteger(row.sessionIndex) ||
      Number(row.sessionIndex) < 1
    ) {
      throw new PlanSharePayloadError(
        `workouts[${index}] position is invalid`,
      );
    }
    if (!isSportType(row.sportType)) {
      throw new PlanSharePayloadError(`workouts[${index}] sportType is invalid`);
    }
    if (!isStructureKind(row.structureKind)) {
      throw new PlanSharePayloadError(
        `workouts[${index}] structureKind is invalid`,
      );
    }
    const text = asTrimmedString(row.text);
    if (!text && !row.definition) {
      throw new PlanSharePayloadError(
        `workouts[${index}] definition cannot be empty`,
      );
    }
    assertNoForbiddenKeys(row.definition, FORBIDDEN_PAYLOAD_KEYS, `workouts[${index}].definition`);
  }

  const size = utf8Bytes(JSON.stringify(payload));
  if (size > PLAN_SHARE_MAX_PAYLOAD_BYTES) {
    throw new PlanSharePayloadError("Plan share payload is too large");
  }
}

export function toPreview(payload: PlanSharePayloadV1): PlanSharePreviewV1 {
  assertSafe(payload);
  return {
    title: payload.title,
    description: payload.description,
    goal: payload.goal,
    periodWeeks: payload.periodWeeks,
    locale: payload.locale,
    sportTypes: collectSportTypes(payload.workouts),
    workoutCount: payload.workouts.length,
    trainingDaysPerWeek: trainingDaysPerWeek(payload.workouts),
    workouts: payload.workouts.map((workout) => {
      const structure = previewStructureFromWorkout(workout);
      return withPreviewMetrics(
        {
          weekIndex: workout.weekIndex,
          dayIndex: workout.dayIndex,
          sessionIndex: workout.sessionIndex,
          sportType: workout.sportType,
          name: workout.name ?? null,
          notes: workout.notes ?? null,
          structureKind: workout.structureKind,
        },
        structure,
      );
    }),
  };
}

export function toCreatePlanDto(
  payload: PlanSharePayloadV1,
  options?: {
    title?: string;
    metadata?: Record<string, unknown>;
  },
): PlanShareCreatePlanDto {
  assertSafe(payload);
  const title = asTrimmedString(options?.title) || payload.title;
  return {
    title,
    description: payload.description ?? undefined,
    goal: payload.goal ?? undefined,
    sourceType: "IMPORTED",
    generationMetadata: options?.metadata,
    periodWeeks: payload.periodWeeks,
    workouts: payload.workouts.map((workout) => ({
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      sessionIndex: workout.sessionIndex,
      sportType: workout.sportType,
      sportDefinitionCode: workout.sportDefinitionCode,
      name: workout.name,
      notes: workout.notes,
      text: workout.text,
      definition: workout.definition,
    })),
  };
}

export function nextImportedTitle(
  baseTitle: string,
  existingTitles: readonly string[],
): string {
  const base = asTrimmedString(baseTitle);
  const used = new Set(existingTitles.map((title) => title.trim()));
  if (!used.has(base)) return base;
  const firstCopy = `${base}（副本）`;
  if (!used.has(firstCopy)) return firstCopy;
  let index = 2;
  while (used.has(`${base}（副本 ${index}）`)) {
    index += 1;
  }
  return `${base}（副本 ${index}）`;
}
