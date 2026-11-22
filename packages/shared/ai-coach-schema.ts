import {
  isCalendarDate,
  parseScheduleConstraints,
  scheduleConstraintsSchema,
  type ScheduleConstraints,
} from "./plan-calendar";
import {
  parseFitnessUserAction,
  fitnessUserActionSchemas,
  type FitnessUserAction,
} from "./fitness-assessment";
import {
  parsePlanQualityContract,
  planQualityContractSchema,
  type PlanQualityContract,
} from "./plan-quality";
import {
  HEALTH_HRV_TYPES,
  type HealthBaseline,
  type HealthHrvType,
  type HealthOverviewCard,
  type HealthSleepValueKind,
} from "./health-overview";

export type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export const ASK_USER_QUESTION_TYPE = "ask_user_question" as const;
export const COACH_PLAN_DRAFT_TYPE = "coach_plan_draft" as const;

export const COACH_ACTIVITY_SECTIONS = ["overview", "map", "heartrate", "pace", "power", "timeline"] as const;
export type CoachActivitySection = (typeof COACH_ACTIVITY_SECTIONS)[number];

export function isCoachActivitySection(value: unknown): value is CoachActivitySection {
  return COACH_ACTIVITY_SECTIONS.some((section) => section === value);
}

export type CoachActivityView = {
  kind: "activity_detail";
  hashId: string;
  section: CoachActivitySection;
  focus?: CoachActivityFocus;
};

export type CoachActivityFocus = { lap: number } | { lastMeters: number };

export function readCoachActivityFocus(value: unknown): CoachActivityFocus | undefined {
  if (!value || typeof value !== "object") return;
  const { lap, lastMeters } = value as Record<string, unknown>;
  if (typeof lap === "number" && Number.isSafeInteger(lap) && lap > 0 && lastMeters === undefined) return { lap };
  if (typeof lastMeters === "number" && Number.isFinite(lastMeters) && lastMeters > 0 && lap === undefined) return { lastMeters };
}

export function readCoachActivityView(value: unknown): CoachActivityView | null {
  if (!value || typeof value !== "object") return null;
  const { kind, hashId, section, focus } = value as Record<string, unknown>;
  const range = readCoachActivityFocus(focus);
  return kind === "activity_detail" &&
    typeof hashId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(hashId) &&
    isCoachActivitySection(section)
    ? { kind, hashId, section, ...(range ? { focus: range } : {}) }
    : null;
}

export type CoachEntityView =
  | { kind: "plan_detail"; planId: string; title: string }
  | { kind: "athlete_overview" };

export function readCoachEntityView(value: unknown): CoachEntityView | null {
  if (!value || typeof value !== "object") return null;
  const { kind, planId, title } = value as Record<string, unknown>;
  if (kind === "athlete_overview") return { kind };
  return kind === "plan_detail" && typeof planId === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(planId) && typeof title === "string" && title.trim()
    ? { kind, planId, title }
    : null;
}

export const COACH_HEALTH_METRICS = ["hrv", "sleep", "restingHeartRate", "sleepHeartRate"] as const;
export type CoachHealthMetric = (typeof COACH_HEALTH_METRICS)[number];
export const COACH_HEALTH_MODES = ["LATEST", "AVERAGE", "TREND", "BASELINE"] as const;

export type CoachHealthScope = {
  metric: CoachHealthMetric;
  from: string;
  to: string;
  mode: (typeof COACH_HEALTH_MODES)[number];
  provider?: string | null;
  hrvType?: HealthHrvType;
  sleepValueKind?: HealthSleepValueKind;
  compareFrom?: string;
  compareTo?: string;
};

export type CoachHealthVisualization = {
  kind: "coach_health_visualization";
  schemaVersion: 1;
  scope: CoachHealthScope;
  observedAt: string;
  fingerprint: string;
  value: number | null;
  date: string | null;
  knownDays: number;
  recent?: { date: string; value: number; scope: CoachHealthScope };
  baseline?: HealthBaseline | null;
  hrvSources?: Array<{ id: string; provider: string | null; hrvType: HealthHrvType }>;
  chart?: HealthOverviewCard;
  comparison?: {
    value: number | null;
    knownDays: number;
    points?: HealthOverviewCard["points"];
  };
};

function isCoachHealthScope(scope: CoachHealthScope | undefined): boolean {
  return !!scope && COACH_HEALTH_METRICS.includes(scope.metric) &&
    COACH_HEALTH_MODES.includes(scope.mode) &&
    isCalendarDate(scope.from) && isCalendarDate(scope.to) && scope.from <= scope.to &&
    (scope.provider == null || typeof scope.provider === "string") &&
    (scope.hrvType === undefined || HEALTH_HRV_TYPES.includes(scope.hrvType)) &&
    (scope.sleepValueKind === undefined || ["timeAsleep", "timeInBed"].includes(scope.sleepValueKind)) &&
    (scope.compareFrom === undefined && scope.compareTo === undefined ||
      isCalendarDate(scope.compareFrom) && isCalendarDate(scope.compareTo) && scope.compareFrom <= scope.compareTo);
}

const isHealthPointList = (points: HealthOverviewCard["points"]) =>
  Array.isArray(points) && points.every((point) => point && isCalendarDate(point.date) &&
    (point.value === undefined || Number.isFinite(point.value)));

export function isCoachHealthVisualization(value: unknown): value is CoachHealthVisualization {
  if (!value || typeof value !== "object") return false;
  const data = value as CoachHealthVisualization;
  return data.kind === "coach_health_visualization" && data.schemaVersion === 1 &&
    typeof data.fingerprint === "string" && typeof data.observedAt === "string" &&
    isCoachHealthScope(data.scope) &&
    (data.date === null || isCalendarDate(data.date)) &&
    (data.value === null || Number.isFinite(data.value)) &&
    Number.isInteger(data.knownDays) && data.knownDays >= 0 &&
    (data.recent === undefined || !!data.recent && isCalendarDate(data.recent.date) &&
      Number.isFinite(data.recent.value) && isCoachHealthScope(data.recent.scope) &&
      data.recent.scope.from === data.recent.date && data.recent.scope.to === data.recent.date) &&
    (data.chart === undefined || !!data.chart && ["sleep", "line", "range", "bar"].includes(data.chart.chartKind) &&
      isCalendarDate(data.chart.latestDate) && Number.isFinite(data.chart.latestValue) &&
      typeof data.chart.latestUnit === "string" && isHealthPointList(data.chart.points)) &&
    (data.hrvSources === undefined || Array.isArray(data.hrvSources) && data.hrvSources.every((source) =>
      source && typeof source.id === "string" && (source.provider === null || typeof source.provider === "string") &&
      HEALTH_HRV_TYPES.includes(source.hrvType))) &&
    (data.comparison === undefined || !!data.comparison &&
      (data.comparison.value === null || Number.isFinite(data.comparison.value)) &&
      Number.isInteger(data.comparison.knownDays) && data.comparison.knownDays >= 0 &&
      (data.comparison.points === undefined || isHealthPointList(data.comparison.points)));
}

export type CoachPlanCalendar = {
  planId: string;
  title: string;
  initialDate: string;
};

export function readCoachPlanCalendar(value: unknown): CoachPlanCalendar | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { planId, title, initialDate } = value as Record<string, unknown>;
  if (
    typeof planId !== "string" || !planId.trim() ||
    typeof title !== "string" || !title.trim() ||
    !isCalendarDate(initialDate)
  ) return null;
  return { planId, title, initialDate };
}

export const PLAN_WORKOUT_ADJUSTMENT_DRAFT_TYPE =
  "plan_workout_adjustment_draft" as const;
export const COACH_QUESTION_REPLY_KIND = "coach_question_reply" as const;
export const COACH_QUESTION_SKIP_KIND = "coach_question_skip" as const;
export const COACH_PLAN_DRAFT_SAVED_KIND = "coach_plan_draft_saved" as const;
export const PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND =
  "plan_workout_adjustment_applied" as const;

export type AskUserQuestionMetadata = {
  source?: string;
  skill?: string;
  /** 服务端绑定；模型生成的 tool input 不得自行提供。 */
  assessmentCaseId?: string;
  /** 服务端绑定；模型生成的 tool input 不得自行提供。 */
  assessmentQuestionId?: string;
};

export type AskUserQuestionOption = {
  value: string;
  label: string;
  description: string;
  preview?: string;
};

export type AskUserQuestionItem = {
  id: string;
  header: string;
  question: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
};

export type AskUserQuestionData = {
  questions: AskUserQuestionItem[];
  metadata?: AskUserQuestionMetadata;
};

export type CoachPlanDraftWorkout = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  text: string;
  notes?: string;
  name?: string;
  sportType?: string;
  sportDefinitionCode?: string;
  structureKind?: WorkoutStructureKind;
  dslVersion?: number;
  structure?: WorkoutStructure;
  summary?: WorkoutSummary;
  /** 结构化步骤（如手动创建）；fence 解析不包含；仅供客户端日历缩略图等 */
  blocks?: unknown;
};

export type CoachPlanDraftData = {
  scheduleConstraints?: ScheduleConstraints;
  qualityContract?: PlanQualityContract;
  title: string;
  description?: string;
  periodWeeks: number;
  planningMode?: "ROLLING";
  goal?: string;
  workouts: CoachPlanDraftWorkout[];
};

export type PlanWorkoutAdjustmentWorkout = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  name?: string;
  sportType: string;
  text: string;
  notes?: string;
  scheduledDate?: string;
};

export type PlanWorkoutAdjustmentChange = {
  field: string;
  before: string;
  after: string;
  reason?: string;
};

export type PlanWorkoutAdjustmentDraftData = {
  planId: string;
  workoutId: string;
  title: string;
  reason: string;
  before: PlanWorkoutAdjustmentWorkout;
  after: PlanWorkoutAdjustmentWorkout;
  changes: PlanWorkoutAdjustmentChange[];
  decisionId?: string;
};

export type CoachQuestionReplyToolResultPayload = {
  kind: typeof COACH_QUESTION_REPLY_KIND;
  repliesToAssistantMessageId: string;
  questionToolUseId?: string;
  answers: Record<string, string | string[]>;
  notes: Record<string, string>;
  /** Questions the athlete explicitly chose not to answer. */
  skippedQuestionIds?: string[];
};

export type CoachQuestionSkipToolResultPayload = {
  kind: typeof COACH_QUESTION_SKIP_KIND;
  repliesToAssistantMessageId: string;
  questionToolUseId?: string;
};

export type CoachPlanDraftSavedToolResultPayload = {
  kind: typeof COACH_PLAN_DRAFT_SAVED_KIND;
  repliesToAssistantMessageId: string;
  planId?: string;
};

export type PlanWorkoutAdjustmentAppliedToolResultPayload = {
  kind: typeof PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND;
  repliesToAssistantMessageId: string;
  planId: string;
  workoutId: string;
};

export type CoachQuestionReplyLikeToolResultPayload =
  | CoachQuestionReplyToolResultPayload
  | CoachQuestionSkipToolResultPayload;

export type CoachDecisionConfirmationPayload = {
  kind: "coach_decision_confirmation";
  repliesToAssistantMessageId: string;
  decisionId: string;
};

export type CoachUserToolResultPayload =
  | CoachDecisionConfirmationPayload
  | FitnessUserAction
  | CoachQuestionReplyToolResultPayload
  | CoachQuestionSkipToolResultPayload
  | CoachPlanDraftSavedToolResultPayload
  | PlanWorkoutAdjustmentAppliedToolResultPayload;

type ParseOk<T> = { ok: true; data: T; error?: undefined };
type ParseErr = { ok: false; data?: undefined; error: string };
type ParseResult<T> = ParseOk<T> | ParseErr;

function ok<T>(data: T): ParseOk<T> {
  return { ok: true, data };
}

function err(error: string): ParseErr {
  return { ok: false, error };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readTrimmedId(value: unknown, field: string): ParseResult<string> {
  return readNonEmptyString(value, field);
}

function readNonEmptyString(
  value: unknown,
  field: string,
): ParseResult<string> {
  if (typeof value !== "string") return err(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return err(`${field} is required`);
  return ok(trimmed);
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readStringStringArrayRecord(
  value: unknown,
  field: string,
): ParseResult<Record<string, string | string[]>> {
  const obj = asRecord(value);
  if (!obj) return err(`${field} must be an object`);

  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of Object.entries(obj)) {
    if (typeof raw === "string") {
      out[key] = raw;
      continue;
    }
    if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
      out[key] = raw;
      continue;
    }
    return err(`${field}.${key} must be a string or string[]`);
  }
  return ok(out);
}

function readStringRecord(
  value: unknown,
  field: string,
): ParseResult<Record<string, string>> {
  const obj = asRecord(value);
  if (!obj) return err(`${field} must be an object`);

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(obj)) {
    if (typeof raw !== "string") return err(`${field}.${key} must be a string`);
    out[key] = raw;
  }
  return ok(out);
}

function readBoolean(value: unknown, field: string): ParseResult<boolean> {
  if (typeof value !== "boolean") return err(`${field} must be a boolean`);
  return ok(value);
}

function readPositiveInt(
  value: unknown,
  field: string,
  opts?: { min?: number; max?: number },
): ParseResult<number> {
  const raw =
    typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : value;
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    !Number.isInteger(raw)
  ) {
    return err(`${field} must be an integer`);
  }
  if (opts?.min !== undefined && raw < opts.min) {
    return err(`${field} must be >= ${opts.min}`);
  }
  if (opts?.max !== undefined && raw > opts.max) {
    return err(`${field} must be <= ${opts.max}`);
  }
  return ok(raw);
}

export function parseAskUserQuestionData(
  raw: unknown,
): ParseResult<AskUserQuestionData> {
  const obj = asRecord(raw);
  if (!obj) return err("input must be an object");

  const questionsRaw = obj.questions;
  if (!Array.isArray(questionsRaw)) return err("questions must be an array");
  if (questionsRaw.length < 1 || questionsRaw.length > 4) {
    return err("questions must contain 1-4 items");
  }

  const seenQuestionIds = new Set<string>();
  const questions: AskUserQuestionItem[] = [];
  for (let i = 0; i < questionsRaw.length; i++) {
    const qObj = asRecord(questionsRaw[i]);
    if (!qObj) return err(`questions[${i}] must be an object`);

    const id = readNonEmptyString(qObj.id, `questions[${i}].id`);
    if (!id.ok) return err(id.error);
    if (seenQuestionIds.has(id.data)) {
      return err(`questions[${i}].id must be unique`);
    }
    seenQuestionIds.add(id.data);

    const header = readNonEmptyString(qObj.header, `questions[${i}].header`);
    if (!header.ok) return err(header.error);

    const question = readNonEmptyString(
      qObj.question,
      `questions[${i}].question`,
    );
    if (!question.ok) return err(question.error);

    const optionsRaw = qObj.options;
    if (!Array.isArray(optionsRaw)) {
      return err(`questions[${i}].options must be an array`);
    }
    if (optionsRaw.length < 2 || optionsRaw.length > 4) {
      return err(`questions[${i}].options must contain 2-4 items`);
    }

    const seenOptionValues = new Set<string>();
    const options: AskUserQuestionOption[] = [];
    for (let j = 0; j < optionsRaw.length; j++) {
      const optionObj = asRecord(optionsRaw[j]);
      if (!optionObj)
        return err(`questions[${i}].options[${j}] must be an object`);

      const value = readNonEmptyString(
        optionObj.value,
        `questions[${i}].options[${j}].value`,
      );
      if (!value.ok) return err(value.error);
      if (seenOptionValues.has(value.data)) {
        return err(`questions[${i}].options[${j}].value must be unique`);
      }
      seenOptionValues.add(value.data);

      const label = readNonEmptyString(
        optionObj.label,
        `questions[${i}].options[${j}].label`,
      );
      if (!label.ok) return err(label.error);

      const description = readNonEmptyString(
        optionObj.description,
        `questions[${i}].options[${j}].description`,
      );
      if (!description.ok) return err(description.error);

      options.push({
        value: value.data,
        label: label.data,
        description: description.data,
        ...(readOptionalTrimmedString(optionObj.preview)
          ? { preview: readOptionalTrimmedString(optionObj.preview) }
          : {}),
      });
    }

    let multiSelect: boolean | undefined;
    if (qObj.multiSelect !== undefined) {
      const parsedMultiSelect = readBoolean(
        qObj.multiSelect,
        `questions[${i}].multiSelect`,
      );
      if (!parsedMultiSelect.ok) return err(parsedMultiSelect.error);
      multiSelect = parsedMultiSelect.data;
    }

    questions.push({
      id: id.data,
      header: header.data,
      question: question.data,
      options,
      ...(multiSelect !== undefined ? { multiSelect } : {}),
    });
  }

  let metadata: AskUserQuestionMetadata | undefined;
  if (obj.metadata !== undefined) {
    const metadataObj = asRecord(obj.metadata);
    if (!metadataObj) return err("metadata must be an object");
    metadata = {
      ...(readOptionalTrimmedString(metadataObj.source)
        ? { source: readOptionalTrimmedString(metadataObj.source) }
        : {}),
      ...(readOptionalTrimmedString(metadataObj.skill)
        ? { skill: readOptionalTrimmedString(metadataObj.skill) }
        : {}),
      ...(readOptionalTrimmedString(metadataObj.assessmentCaseId)
        ? {
            assessmentCaseId: readOptionalTrimmedString(
              metadataObj.assessmentCaseId,
            ),
          }
        : {}),
      ...(readOptionalTrimmedString(metadataObj.assessmentQuestionId)
        ? {
            assessmentQuestionId: readOptionalTrimmedString(
              metadataObj.assessmentQuestionId,
            ),
          }
        : {}),
    };
    if (
      !metadata.source &&
      !metadata.skill &&
      !metadata.assessmentCaseId &&
      !metadata.assessmentQuestionId
    )
      metadata = undefined;
  }

  return ok({
    questions,
    ...(metadata ? { metadata } : {}),
  });
}

export function safeParseAskUserQuestionData(
  raw: unknown,
): AskUserQuestionData | null {
  const parsed = parseAskUserQuestionData(raw);
  return parsed.ok ? parsed.data : null;
}

export function safeParseAskUserQuestionPayload(
  raw: unknown,
): AskUserQuestionData | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const tag = obj.kind ?? obj.type;
  if (tag !== ASK_USER_QUESTION_TYPE) return null;
  return safeParseAskUserQuestionData(obj);
}

export function parseCoachPlanDraftData(
  raw: unknown,
): ParseResult<CoachPlanDraftData> {
  const obj = asRecord(raw);
  if (!obj) return err("input must be an object");
  let scheduleConstraints: ScheduleConstraints | undefined;
  try {
    scheduleConstraints = parseScheduleConstraints(obj.scheduleConstraints);
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Invalid scheduleConstraints",
    );
  }
  let qualityContract: PlanQualityContract | undefined;
  try {
    qualityContract = parsePlanQualityContract(obj.qualityContract);
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Invalid qualityContract",
    );
  }

  const title = readNonEmptyString(obj.title, "title");
  if (!title.ok) return err(title.error);

  const periodWeeks = readPositiveInt(obj.periodWeeks, "periodWeeks", {
    min: 1,
  });
  if (!periodWeeks.ok) return err(periodWeeks.error);
  const rolling = obj.planningMode === "ROLLING";
  if (rolling && periodWeeks.data !== 1) return err("Continuous draft must preview one week");
  const goal = readOptionalTrimmedString(obj.goal);

  const workoutsRaw = obj.workouts;
  if (!Array.isArray(workoutsRaw)) return err("workouts must be an array");
  if (workoutsRaw.length < 1) {
    return err("workouts must contain at least one item");
  }

  const workouts: CoachPlanDraftWorkout[] = [];
  for (let i = 0; i < workoutsRaw.length; i++) {
    const workoutObj = asRecord(workoutsRaw[i]);
    if (!workoutObj) return err(`workouts[${i}] must be an object`);

    const weekIndex = readPositiveInt(
      workoutObj.weekIndex,
      `workouts[${i}].weekIndex`,
      {
        min: 1,
      },
    );
    if (!weekIndex.ok) return err(weekIndex.error);

    const dayIndex = readPositiveInt(
      workoutObj.dayIndex,
      `workouts[${i}].dayIndex`,
      {
        min: 1,
        max: 7,
      },
    );
    if (!dayIndex.ok) return err(dayIndex.error);

    const text = readNonEmptyString(workoutObj.text, `workouts[${i}].text`);
    if (!text.ok) return err(text.error);

    const rawStructureKind = String(
      workoutObj.structureKind ?? "ENDURANCE",
    ).toUpperCase();
    if (!["ENDURANCE", "STRENGTH", "FREEFORM"].includes(rawStructureKind)) {
      return err(`workouts[${i}].structureKind is invalid`);
    }
    const structureKind = rawStructureKind as WorkoutStructureKind;

    let dslVersion = 1;
    if (workoutObj.dslVersion !== undefined) {
      const parsedVersion = readPositiveInt(
        workoutObj.dslVersion,
        `workouts[${i}].dslVersion`,
        { min: 1, max: 1 },
      );
      if (!parsedVersion.ok) return err(parsedVersion.error);
      dslVersion = parsedVersion.data;
    }

    let sessionIndex: number | undefined;
    if (workoutObj.sessionIndex !== undefined) {
      const parsedSessionIndex = readPositiveInt(
        workoutObj.sessionIndex,
        `workouts[${i}].sessionIndex`,
        { min: 1 },
      );
      if (!parsedSessionIndex.ok) return err(parsedSessionIndex.error);
      sessionIndex = parsedSessionIndex.data;
    }

    workouts.push({
      weekIndex: weekIndex.data,
      dayIndex: dayIndex.data,
      ...(sessionIndex !== undefined ? { sessionIndex } : {}),
      text: text.data,
      structureKind,
      dslVersion,
      ...(readOptionalTrimmedString(workoutObj.notes)
        ? { notes: readOptionalTrimmedString(workoutObj.notes) }
        : {}),
      ...(readOptionalTrimmedString(workoutObj.name)
        ? { name: readOptionalTrimmedString(workoutObj.name) }
        : {}),
      ...(readOptionalTrimmedString(workoutObj.sportType)
        ? { sportType: readOptionalTrimmedString(workoutObj.sportType) }
        : {}),
      ...(readOptionalTrimmedString(workoutObj.sportDefinitionCode)
        ? {
            sportDefinitionCode: readOptionalTrimmedString(
              workoutObj.sportDefinitionCode,
            ),
          }
        : {}),
      ...(asRecord(workoutObj.structure)
        ? { structure: workoutObj.structure as WorkoutStructure }
        : {}),
      ...(asRecord(workoutObj.summary)
        ? { summary: workoutObj.summary as WorkoutSummary }
        : {}),
      ...(workoutObj.blocks !== undefined ? { blocks: workoutObj.blocks } : {}),
    });
  }

  return ok({
    title: title.data,
    ...(qualityContract ? { qualityContract } : {}),
    ...(scheduleConstraints ? { scheduleConstraints } : {}),
    ...(readOptionalTrimmedString(obj.description)
      ? { description: readOptionalTrimmedString(obj.description) }
      : {}),
    periodWeeks: periodWeeks.data,
    ...(rolling ? { planningMode: "ROLLING" as const } : {}),
    ...(goal ? { goal } : {}),
    workouts,
  });
}

export function safeParseCoachPlanDraftData(
  raw: unknown,
): CoachPlanDraftData | null {
  const parsed = parseCoachPlanDraftData(raw);
  return parsed.ok ? parsed.data : null;
}

export function safeParseCoachPlanDraftFencePayload(
  raw: unknown,
): CoachPlanDraftData | null {
  const obj = asRecord(raw);
  if (!obj || obj.type !== COACH_PLAN_DRAFT_TYPE) return null;
  return safeParseCoachPlanDraftData(obj);
}

export function safeParseCoachPlanDraftToolUseInput(
  raw: unknown,
): CoachPlanDraftData | null {
  return safeParseCoachPlanDraftData(raw);
}

function readAdjustmentWorkout(
  raw: unknown,
  field: string,
): ParseResult<PlanWorkoutAdjustmentWorkout> {
  const obj = asRecord(raw);
  if (!obj) return err(`${field} must be an object`);

  const sportType = readNonEmptyString(obj.sportType, `${field}.sportType`);
  if (!sportType.ok) return err(sportType.error);

  const weekIndex = readPositiveInt(obj.weekIndex, `${field}.weekIndex`, {
    min: 1,
  });
  if (!weekIndex.ok) return err(weekIndex.error);

  const dayIndex = readPositiveInt(obj.dayIndex, `${field}.dayIndex`, {
    min: 1,
    max: 7,
  });
  if (!dayIndex.ok) return err(dayIndex.error);

  const text = readNonEmptyString(obj.text, `${field}.text`);
  if (!text.ok) return err(text.error);

  let sessionIndex: number | undefined;
  if (obj.sessionIndex !== undefined) {
    const parsedSessionIndex = readPositiveInt(
      obj.sessionIndex,
      `${field}.sessionIndex`,
      { min: 1 },
    );
    if (!parsedSessionIndex.ok) return err(parsedSessionIndex.error);
    sessionIndex = parsedSessionIndex.data;
  }

  return ok({
    weekIndex: weekIndex.data,
    dayIndex: dayIndex.data,
    ...(sessionIndex !== undefined ? { sessionIndex } : {}),
    sportType: sportType.data,
    text: text.data,
    ...(readOptionalTrimmedString(obj.name)
      ? { name: readOptionalTrimmedString(obj.name) }
      : {}),
    ...(readOptionalTrimmedString(obj.notes)
      ? { notes: readOptionalTrimmedString(obj.notes) }
      : {}),
    ...(readOptionalTrimmedString(obj.scheduledDate)
      ? { scheduledDate: readOptionalTrimmedString(obj.scheduledDate) }
      : {}),
  });
}

export function parsePlanWorkoutAdjustmentDraftData(
  raw: unknown,
): ParseResult<PlanWorkoutAdjustmentDraftData> {
  const obj = asRecord(raw);
  if (!obj) return err("input must be an object");

  const planId = readNonEmptyString(obj.planId, "planId");
  if (!planId.ok) return err(planId.error);
  const workoutId = readNonEmptyString(obj.workoutId, "workoutId");
  if (!workoutId.ok) return err(workoutId.error);
  const title = readNonEmptyString(obj.title, "title");
  if (!title.ok) return err(title.error);
  const reason = readNonEmptyString(obj.reason, "reason");
  if (!reason.ok) return err(reason.error);

  const before = readAdjustmentWorkout(obj.before, "before");
  if (!before.ok) return err(before.error);
  const after = readAdjustmentWorkout(obj.after, "after");
  if (!after.ok) return err(after.error);

  const changesRaw = obj.changes;
  if (!Array.isArray(changesRaw)) return err("changes must be an array");
  if (changesRaw.length < 1)
    return err("changes must contain at least one item");

  const changes: PlanWorkoutAdjustmentChange[] = [];
  for (let i = 0; i < changesRaw.length; i++) {
    const changeObj = asRecord(changesRaw[i]);
    if (!changeObj) return err(`changes[${i}] must be an object`);
    const fieldName = readNonEmptyString(
      changeObj.field,
      `changes[${i}].field`,
    );
    if (!fieldName.ok) return err(fieldName.error);
    const beforeValue = readNonEmptyString(
      changeObj.before,
      `changes[${i}].before`,
    );
    if (!beforeValue.ok) return err(beforeValue.error);
    const afterValue = readNonEmptyString(
      changeObj.after,
      `changes[${i}].after`,
    );
    if (!afterValue.ok) return err(afterValue.error);
    changes.push({
      field: fieldName.data,
      before: beforeValue.data,
      after: afterValue.data,
      ...(readOptionalTrimmedString(changeObj.reason)
        ? { reason: readOptionalTrimmedString(changeObj.reason) }
        : {}),
    });
  }

  return ok({
    planId: planId.data,
    workoutId: workoutId.data,
    title: title.data,
    reason: reason.data,
    before: before.data,
    after: after.data,
    changes,
    ...(readOptionalTrimmedString(obj.decisionId)
      ? { decisionId: readOptionalTrimmedString(obj.decisionId) }
      : {}),
  });
}

export function safeParsePlanWorkoutAdjustmentDraftData(
  raw: unknown,
): PlanWorkoutAdjustmentDraftData | null {
  const parsed = parsePlanWorkoutAdjustmentDraftData(raw);
  return parsed.ok ? parsed.data : null;
}

export function parseCoachQuestionReplyLikeToolResultPayload(
  raw: unknown,
): ParseResult<CoachQuestionReplyLikeToolResultPayload> {
  const obj = asRecord(raw);
  if (!obj) return err("input must be an object");

  const toolReference =
    obj.questionToolUseId === undefined
      ? undefined
      : readTrimmedId(obj.questionToolUseId, "questionToolUseId");
  if (toolReference && !toolReference.ok) return err(toolReference.error);
  const questionReference = toolReference?.ok
    ? { questionToolUseId: toolReference.data }
    : {};

  const kind = obj.kind;
  if (kind === COACH_QUESTION_SKIP_KIND) {
    const repliesToAssistantMessageId = readTrimmedId(
      obj.repliesToAssistantMessageId,
      "repliesToAssistantMessageId",
    );
    if (!repliesToAssistantMessageId.ok) {
      return err(repliesToAssistantMessageId.error);
    }
    return ok({
      kind: COACH_QUESTION_SKIP_KIND,
      repliesToAssistantMessageId: repliesToAssistantMessageId.data,
      ...questionReference,
    });
  }

  if (kind === COACH_QUESTION_REPLY_KIND) {
    const repliesToAssistantMessageId = readTrimmedId(
      obj.repliesToAssistantMessageId,
      "repliesToAssistantMessageId",
    );
    if (!repliesToAssistantMessageId.ok) {
      return err(repliesToAssistantMessageId.error);
    }

    const answers = readStringStringArrayRecord(obj.answers, "answers");
    if (!answers.ok) return err(answers.error);

    const notes = readStringRecord(obj.notes, "notes");
    if (!notes.ok) return err(notes.error);

    const skippedQuestionIds = (() => {
      if (obj.skippedQuestionIds === undefined) return ok<string[]>([]);
      if (!Array.isArray(obj.skippedQuestionIds)) {
        return err("skippedQuestionIds must be an array");
      }
      const ids: string[] = [];
      for (const value of obj.skippedQuestionIds) {
        const id = readTrimmedId(value, "skippedQuestionIds item");
        if (!id.ok) return err(id.error);
        if (!ids.includes(id.data)) ids.push(id.data);
      }
      return ok(ids);
    })();
    if (!skippedQuestionIds.ok) return err(skippedQuestionIds.error);

    return ok({
      kind: COACH_QUESTION_REPLY_KIND,
      repliesToAssistantMessageId: repliesToAssistantMessageId.data,
      ...questionReference,
      answers: answers.data,
      notes: notes.data,
      ...(skippedQuestionIds.data.length
        ? { skippedQuestionIds: skippedQuestionIds.data }
        : {}),
    });
  }

  return err("kind must be coach_question_reply or coach_question_skip");
}

export function safeParseCoachQuestionReplyLikeToolResultPayload(
  raw: unknown,
): CoachQuestionReplyLikeToolResultPayload | null {
  const parsed = parseCoachQuestionReplyLikeToolResultPayload(raw);
  return parsed.ok ? parsed.data : null;
}

export function parseCoachPlanDraftSavedToolResultPayload(
  raw: unknown,
): ParseResult<CoachPlanDraftSavedToolResultPayload> {
  const obj = asRecord(raw);
  if (!obj) return err("input must be an object");
  if (obj.kind !== COACH_PLAN_DRAFT_SAVED_KIND) {
    return err("kind must be coach_plan_draft_saved");
  }
  const repliesToAssistantMessageId = readTrimmedId(
    obj.repliesToAssistantMessageId,
    "repliesToAssistantMessageId",
  );
  if (!repliesToAssistantMessageId.ok) {
    return err(repliesToAssistantMessageId.error);
  }
  return ok({
    kind: COACH_PLAN_DRAFT_SAVED_KIND,
    repliesToAssistantMessageId: repliesToAssistantMessageId.data,
    ...(readOptionalTrimmedString(obj.planId)
      ? { planId: readOptionalTrimmedString(obj.planId) }
      : {}),
  });
}

export function safeParseCoachPlanDraftSavedToolResultPayload(
  raw: unknown,
): CoachPlanDraftSavedToolResultPayload | null {
  const parsed = parseCoachPlanDraftSavedToolResultPayload(raw);
  return parsed.ok ? parsed.data : null;
}

export function parsePlanWorkoutAdjustmentAppliedToolResultPayload(
  raw: unknown,
): ParseResult<PlanWorkoutAdjustmentAppliedToolResultPayload> {
  const obj = asRecord(raw);
  if (!obj) return err("input must be an object");
  if (obj.kind !== PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND) {
    return err("kind must be plan_workout_adjustment_applied");
  }
  const repliesToAssistantMessageId = readTrimmedId(
    obj.repliesToAssistantMessageId,
    "repliesToAssistantMessageId",
  );
  if (!repliesToAssistantMessageId.ok) {
    return err(repliesToAssistantMessageId.error);
  }
  const planId = readTrimmedId(obj.planId, "planId");
  if (!planId.ok) return err(planId.error);
  const workoutId = readTrimmedId(obj.workoutId, "workoutId");
  if (!workoutId.ok) return err(workoutId.error);
  return ok({
    kind: PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND,
    repliesToAssistantMessageId: repliesToAssistantMessageId.data,
    planId: planId.data,
    workoutId: workoutId.data,
  });
}

export function safeParsePlanWorkoutAdjustmentAppliedToolResultPayload(
  raw: unknown,
): PlanWorkoutAdjustmentAppliedToolResultPayload | null {
  const parsed = parsePlanWorkoutAdjustmentAppliedToolResultPayload(raw);
  return parsed.ok ? parsed.data : null;
}

export function safeParseCoachDecisionConfirmationPayload(
  raw: unknown,
): CoachDecisionConfirmationPayload | null {
  const obj = asRecord(raw);
  if (obj?.kind !== "coach_decision_confirmation") return null;
  const decisionId = readNonEmptyString(obj.decisionId, "decisionId");
  const reply = readNonEmptyString(
    obj.repliesToAssistantMessageId,
    "repliesToAssistantMessageId",
  );
  return decisionId.ok && reply.ok
    ? {
        kind: "coach_decision_confirmation",
        decisionId: decisionId.data,
        repliesToAssistantMessageId: reply.data,
      }
    : null;
}

export function safeParseCoachUserToolResultPayload(
  raw: unknown,
): CoachUserToolResultPayload | null {
  return (
    safeParseCoachDecisionConfirmationPayload(raw) ??
    parseFitnessUserAction(raw) ??
    safeParseCoachQuestionReplyLikeToolResultPayload(raw) ??
    safeParseCoachPlanDraftSavedToolResultPayload(raw) ??
    safeParsePlanWorkoutAdjustmentAppliedToolResultPayload(raw)
  );
}

export const askUserQuestionToolParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      description:
        "Questions to ask the user. Use 1-4 questions. Each question must have a stable id, a short header, and 2-4 options.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "header", "question", "options"],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            pattern: "\\S",
            description:
              "Stable question id used to map the answer, for example weekly_days or long_day.",
          },
          header: {
            type: "string",
            minLength: 1,
            pattern: "\\S",
            description:
              "Very short chip label shown above the question, ideally 2-12 characters.",
          },
          question: {
            type: "string",
            minLength: 1,
            pattern: "\\S",
            description:
              "The full question to ask the user. Keep it concise and specific.",
          },
          multiSelect: {
            type: "boolean",
            description:
              "Allow selecting multiple options when choices are not mutually exclusive.",
          },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            description:
              "Available answer choices. Use 2-4 options. Put the recommended option first and include the trade-off in description.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["value", "label", "description"],
              properties: {
                value: {
                  type: "string",
                  minLength: 1,
                  pattern: "\\S",
                  description:
                    "Stable, unique option identifier, e.g. restart_training. Required in addition to the visible label.",
                },
                label: { type: "string", minLength: 1, pattern: "\\S" },
                description: { type: "string", minLength: 1, pattern: "\\S" },
                preview: {
                  type: "string",
                  description:
                    "Optional preview content for future rich UI use.",
                },
              },
            },
          },
        },
      },
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        source: {
          type: "string",
          description:
            "Optional identifier for analytics or debugging, for example plan-builder.",
        },
        skill: {
          type: "string",
          description: "Optional active skill name, for example plan-builder.",
        },
      },
    },
  },
} satisfies JsonSchemaObject;

export const coachPlanDraftToolParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "periodWeeks", "workouts"],
  properties: {
    qualityContract: planQualityContractSchema,
    scheduleConstraints: scheduleConstraintsSchema,
    title: { type: "string", minLength: 1 },
    description: {
      type: "string",
      description:
        "Human-readable plan explanation. Prefer 2-5 concise sentences covering goal, current training context or baseline assumptions, weekly structure, intended adaptations/effects, and key safety/personalization caveats. Do not put workout DSL/parser instructions here.",
    },
    periodWeeks: { type: "integer", minimum: 1 },
    workouts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["weekIndex", "dayIndex", "structureKind", "text"],
        properties: {
          weekIndex: { type: "integer", minimum: 1 },
          dayIndex: { type: "integer", minimum: 1, maximum: 7 },
          sessionIndex: { type: "integer", minimum: 1 },
          structureKind: {
            type: "string",
            enum: ["ENDURANCE", "STRENGTH", "FREEFORM"],
            description:
              "Workout DSL family. Use ENDURANCE for step DSL and STRENGTH for exercise/set DSL.",
          },
          dslVersion: { type: "integer", enum: [1] },
          text: {
            type: "string",
            minLength: 1,
            description:
              "Trainingload.ai workout DSL only (parseable). Example: `work 30m` or a multiline repeat block. Prefer multiline repeats over inline comma repeats. Not free-form prose.",
          },
          notes: {
            type: "string",
            description:
              "Athlete-readable natural-language explanation of the complete workout, in the user's language. In roughly 1-3 practical sentences, restate the ordered warm-up, main work, repeats, recovery/rest, cool-down, durations/distances, and intensity/effort cues. For strength include exercises, sets, reps/time, load or RPE/RIR, and rest. It must make sense without reading the DSL text; do not paste DSL or provide only an intent cue.",
          },
          sportType: { type: "string" },
          sportDefinitionCode: {
            type: "string",
            description:
              "Use STRENGTH_TRAINING for strength workouts and the exact sport catalog code when known.",
          },
          name: { type: "string" },
        },
      },
    },
  },
} satisfies JsonSchemaObject;

export const planWorkoutAdjustmentDraftToolParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "planId",
    "workoutId",
    "title",
    "reason",
    "before",
    "after",
    "changes",
  ],
  properties: {
    planId: { type: "string", minLength: 1 },
    workoutId: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 },
    before: {
      type: "object",
      additionalProperties: false,
      required: ["weekIndex", "dayIndex", "sportType", "text"],
      properties: {
        weekIndex: { type: "integer", minimum: 1 },
        dayIndex: { type: "integer", minimum: 1, maximum: 7 },
        sessionIndex: { type: "integer", minimum: 1 },
        name: { type: "string" },
        sportType: { type: "string" },
        text: { type: "string", minLength: 1 },
        notes: { type: "string" },
        scheduledDate: { type: "string" },
      },
    },
    after: {
      type: "object",
      additionalProperties: false,
      required: ["weekIndex", "dayIndex", "sportType", "text"],
      properties: {
        weekIndex: { type: "integer", minimum: 1 },
        dayIndex: { type: "integer", minimum: 1, maximum: 7 },
        sessionIndex: { type: "integer", minimum: 1 },
        name: { type: "string" },
        sportType: { type: "string" },
        text: {
          type: "string",
          minLength: 1,
          description: "Trainingload.ai workout DSL only.",
        },
        notes: { type: "string" },
        scheduledDate: { type: "string" },
      },
    },
    changes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "before", "after"],
        properties: {
          field: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} satisfies JsonSchemaObject;

export function buildCoachPlanDraftFenceJsonSchema(): Record<string, unknown> {
  const { type, properties, ...rest } = coachPlanDraftToolParametersSchema;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://starshards.local/schemas/coach-plan-draft.schema.json",
    title: "CoachPlanDraft",
    description:
      "AI coach fenced JSON for a training plan draft. Aligns with POST /plans/create body (CreatePlanDto). Each workout `text` must be valid workout DSL.",
    type,
    ...rest,
    required: ["type", "title", "periodWeeks", "workouts"],
    properties: {
      type: {
        const: COACH_PLAN_DRAFT_TYPE,
        description: "Discriminator for fenced block parsing",
      },
      ...(properties ?? {}),
    },
  };
}

export function buildAskUserQuestionJsonSchema(): Record<string, unknown> {
  const { type, properties, ...rest } = askUserQuestionToolParametersSchema;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://starshards.local/schemas/ask-user-question.schema.json",
    title: "AskUserQuestion",
    description:
      "AI coach structured multiple-choice question payload for client UI rendering and hydration.",
    type,
    ...rest,
    required: ["type", "questions"],
    properties: {
      type: {
        const: ASK_USER_QUESTION_TYPE,
        description:
          "Discriminator for fenced block parsing or persisted tool inputs",
      },
      ...(properties ?? {}),
    },
  };
}

export function buildCoachUserToolResultPayloadJsonSchema(): Record<
  string,
  unknown
> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://starshards.local/schemas/coach-user-tool-result-payload.schema.json",
    title: "CoachUserToolResultPayload",
    description:
      "User-side structured AI coach payload stored in tool_result.content for replies, skips, and draft-saved acknowledgements.",
    oneOf: [
      ...fitnessUserActionSchemas(),
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "repliesToAssistantMessageId", "decisionId"],
        properties: {
          kind: { const: "coach_decision_confirmation" },
          repliesToAssistantMessageId: { type: "string", minLength: 1 },
          decisionId: { type: "string", minLength: 1 },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "repliesToAssistantMessageId", "answers", "notes"],
        properties: {
          kind: {
            const: COACH_QUESTION_REPLY_KIND,
          },
          questionToolUseId: { type: "string", minLength: 1 },
          repliesToAssistantMessageId: {
            type: "string",
            minLength: 1,
          },
          answers: {
            type: "object",
            additionalProperties: {
              oneOf: [
                { type: "string" },
                {
                  type: "array",
                  items: { type: "string" },
                },
              ],
            },
          },
          notes: {
            type: "object",
            additionalProperties: {
              type: "string",
            },
          },
          skippedQuestionIds: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", minLength: 1 },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "repliesToAssistantMessageId"],
        properties: {
          kind: {
            const: COACH_QUESTION_SKIP_KIND,
          },
          questionToolUseId: { type: "string", minLength: 1 },
          repliesToAssistantMessageId: {
            type: "string",
            minLength: 1,
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "repliesToAssistantMessageId"],
        properties: {
          kind: {
            const: COACH_PLAN_DRAFT_SAVED_KIND,
          },
          repliesToAssistantMessageId: {
            type: "string",
            minLength: 1,
          },
          planId: {
            type: "string",
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "repliesToAssistantMessageId",
          "planId",
          "workoutId",
        ],
        properties: {
          kind: {
            const: PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND,
          },
          repliesToAssistantMessageId: {
            type: "string",
            minLength: 1,
          },
          planId: {
            type: "string",
            minLength: 1,
          },
          workoutId: {
            type: "string",
            minLength: 1,
          },
        },
      },
    ],
  };
}
import type {
  WorkoutStructure,
  WorkoutStructureKind,
} from "./workout-structure";
import type { WorkoutSummary } from "./workout-summary";
