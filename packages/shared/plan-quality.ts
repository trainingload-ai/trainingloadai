/** Structural consistency checks, not a medical safety certification. */
export const PLAN_WEEK_PHASES = [
  "BASE",
  "BUILD",
  "RECOVERY",
  "TAPER",
  "RACE",
  "MAINTENANCE",
] as const;
export type PlanNumberRange = { min: number; max: number };
export type PlanWeekTarget = {
  weekIndex: number;
  phase: (typeof PLAN_WEEK_PHASES)[number];
  focus: string;
  trainingDays: PlanNumberRange;
  durationMinutes: PlanNumberRange;
  loadTarget?: { sport: string; method: string; range: PlanNumberRange } | null;
};
export type PlanPhaseTarget = {
  name: string;
  startWeek: number;
  endWeek: number;
  purpose: string;
  durationMinutes?: PlanNumberRange;
};

const rangeSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["min", "max"],
  properties: {
    min: { type: "number" as const, minimum: 0 },
    max: { type: "number" as const, minimum: 0 },
  },
};
const PLAN_TARGET_SPORTS = ["RUN", "CYCLING", "SWIM", "STRENGTH"];
const PLAN_TARGET_LOAD_METHODS = ["POWER", "PACE", "HR", "HR/PROFILE", "HR/ESTIMATED_MAX_HR", "SESSION_RPE"];
export const planWeekTargetsSchema = {
  type: "array" as const,
  minItems: 1,
  maxItems: 520,
  items: {
    type: "object" as const,
    additionalProperties: false,
    required: ["weekIndex", "phase", "focus", "trainingDays", "durationMinutes"],
    properties: {
      weekIndex: { type: "integer" as const, minimum: 1, maximum: 520 },
      phase: { type: "string" as const, enum: [...PLAN_WEEK_PHASES] },
      focus: { type: "string" as const, minLength: 1, maxLength: 240 },
      trainingDays: rangeSchema,
      durationMinutes: {
        ...rangeSchema,
        description: "Total minutes across all sessions in this week, including warm-up, recovery and cool-down. Two complete 25–30 minute sessions total 50–60 minutes. For estimated weeks, start with a range about 15% wide (often 15–20 minutes for a two-hour week), then fit the athlete's actual availability. A per-session cap is only a ceiling. Reserve equal bounds for an explicitly fixed weekly total or fixed protocol; a rest week can be 0–0.",
      },
      loadTarget: {
        description: "Omit or return null without a reliable sport-specific estimate baseline.",
        anyOf: [
          { type: "null" as const },
          {
            type: "object" as const,
            additionalProperties: false,
            required: ["sport", "method", "range"],
            properties: {
              sport: { type: "string" as const, enum: PLAN_TARGET_SPORTS },
              method: { type: "string" as const, enum: PLAN_TARGET_LOAD_METHODS },
              range: rangeSchema,
            },
          },
        ],
      },
    },
  },
};

function validRange(value: unknown, maximum: number, integer = false): value is PlanNumberRange {
  if (!value || typeof value !== "object" || !("min" in value) || !("max" in value)) return false;
  const { min, max } = value;
  return typeof min === "number" && typeof max === "number" && Number.isFinite(min) &&
    Number.isFinite(max) && min >= 0 && max >= min && max <= maximum &&
    (!integer || (Number.isInteger(min) && Number.isInteger(max)));
}

export function validPlanWeekTargets(targets: unknown, periodWeeks?: number): targets is PlanWeekTarget[] {
  return Array.isArray(targets) && targets.length >= 1 && targets.length <= 520 &&
    (periodWeeks === undefined || targets.length === periodWeeks) && targets.every((target, index) =>
      target && target.weekIndex === index + 1 && PLAN_WEEK_PHASES.includes(target.phase) &&
      typeof target.focus === "string" && target.focus.trim().length > 0 && target.focus.length <= 240 &&
      validRange(target.trainingDays, 7, true) && validRange(target.durationMinutes, 7 * 1440) &&
      (target.loadTarget == null || (
        PLAN_TARGET_SPORTS.includes(target.loadTarget.sport) &&
        PLAN_TARGET_LOAD_METHODS.includes(target.loadTarget.method) &&
        validRange(target.loadTarget.range, Number.MAX_SAFE_INTEGER)
      )),
    );
}

export function validPlanPhaseTargets(phases: unknown, periodWeeks: number): phases is PlanPhaseTarget[] {
  if (!Array.isArray(phases) || !phases.length || phases.length > 24) return false;
  let expectedStart = 1;
  for (const phase of phases) {
    if (!phase || typeof phase.name !== "string" || !phase.name.trim() ||
      typeof phase.purpose !== "string" || !phase.purpose.trim() ||
      phase.startWeek !== expectedStart || !Number.isInteger(phase.endWeek) ||
      phase.endWeek < phase.startWeek || phase.endWeek > periodWeeks ||
      (phase.durationMinutes !== undefined && !validRange(phase.durationMinutes, 7 * 1440 * periodWeeks))) return false;
    expectedStart = phase.endWeek + 1;
  }
  return expectedStart === periodWeeks + 1;
}

export type PlanAssessment = { assessmentId: string; weekTargets: PlanWeekTarget[]; phases?: PlanPhaseTarget[] };

export function parsePlanAssessment(raw: unknown, periodWeeks: number): PlanAssessment | undefined {
  if (!raw || typeof raw !== "object" || !("assessmentId" in raw) || !("weekTargets" in raw)) return undefined;
  const { assessmentId, weekTargets } = raw;
  if (typeof assessmentId !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(assessmentId) ||
    !validPlanWeekTargets(weekTargets, periodWeeks)) return undefined;
  const phases = "phases" in raw ? raw.phases : undefined;
  if (phases === undefined) return { assessmentId, weekTargets };
  if (validPlanPhaseTargets(phases, periodWeeks)) return { assessmentId, weekTargets, phases };
  return undefined;
}

export type PlanQualityContract = {
  startDate?: string;
  weekPhases?: Array<(typeof PLAN_WEEK_PHASES)[number]>;
  maxTrainingDaysPerWeek?: number;
  maxDailyMinutes?: number;
  maxMinutesByIsoWeekday?: Partial<Record<number, number>>;
  allowedDays?: number[];
  requiredSports?: string[];
  raceDiscipline?: "RUN" | "CYCLING" | "SWIM" | "TRIATHLON";
};

type DailyMinutes = Pick<PlanQualityContract, "maxDailyMinutes" | "maxMinutesByIsoWeekday">;

/** A weekday ceiling may narrow the plan-wide limit. ISO Monday = 1. */
export function planDailyMinuteLimit(contract?: DailyMinutes, isoWeekday?: number) {
  const specific = isoWeekday === undefined ? undefined : contract?.maxMinutesByIsoWeekday?.[isoWeekday];
  if (specific === undefined) return contract?.maxDailyMinutes;
  return Math.min(specific, contract?.maxDailyMinutes ?? specific);
}

export function planDayMinuteLimit(contract: PlanQualityContract | undefined, dayIndex: number) {
  if (!contract?.maxMinutesByIsoWeekday || !contract.startDate) return contract?.maxDailyMinutes;
  const startWeekday = new Date(`${contract.startDate}T00:00:00Z`).getUTCDay();
  return planDailyMinuteLimit(contract, ((startWeekday + dayIndex - 1) % 7) || 7);
}

export const planQualityContractSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    startDate: {
      type: "string" as const,
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description:
        "Agreed preview start date, not activation. Weeks/days are relative to this date.",
    },
    weekPhases: {
      type: "array" as const,
      maxItems: 520,
      items: { type: "string" as const, enum: [...PLAN_WEEK_PHASES] },
    },
    maxTrainingDaysPerWeek: {
      type: "integer" as const,
      minimum: 1,
      maximum: 7,
    },
    maxDailyMinutes: {
      type: "number" as const,
      exclusiveMinimum: 0,
      maximum: 1440,
      description:
        "Maximum combined duration for ordinary training on one day. Goal events are modeled separately and must never be truncated to fit this budget.",
    },
    maxMinutesByIsoWeekday: {
      type: "object" as const,
      description: "Combined session time limits for particular weekdays. Keys are ISO weekdays (1 Monday to 7 Sunday). For weekdays up to 45 minutes and Saturday up to 90, use the actual weekday limits and a daily ceiling of 90. Omit for uniform availability.",
      minProperties: 1,
      additionalProperties: false,
      properties: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((day) => [day, { type: "number" as const, exclusiveMinimum: 0, maximum: 1440 }])),
    },
    allowedDays: {
      type: "array" as const,
      description:
        "Allowed 1-based day offsets within each plan week, not ISO weekday numbers.",
      items: { type: "integer" as const, minimum: 1, maximum: 7 },
    },
    requiredSports: {
      type: "array" as const,
      items: {
        type: "string" as const,
        enum: ["RUN", "CYCLING", "SWIM", "STRENGTH"],
      },
    },
    raceDiscipline: {
      type: "string" as const,
      enum: ["RUN", "CYCLING", "SWIM", "TRIATHLON"],
    },
  },
};

export function parsePlanQualityContract(
  raw: unknown,
): PlanQualityContract | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("qualityContract must be an object");
  const value = raw as Record<string, unknown>;
  const allowed = [
    "startDate",
    "weekPhases",
    "maxTrainingDaysPerWeek",
    "maxDailyMinutes",
    "maxMinutesByIsoWeekday",
    "allowedDays",
    "requiredSports",
    "raceDiscipline",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unknown qualityContract field");
  if (
    value.startDate !== undefined &&
    (typeof value.startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate) ||
      !Number.isFinite(Date.parse(`${value.startDate}T00:00:00Z`)) ||
      new Date(`${value.startDate}T00:00:00Z`).toISOString().slice(0, 10) !==
        value.startDate)
  )
    throw new Error("Invalid startDate");
  if (
    value.weekPhases !== undefined &&
    (!Array.isArray(value.weekPhases) ||
      value.weekPhases.length > 520 ||
      value.weekPhases.some((p) => !PLAN_WEEK_PHASES.includes(p)))
  )
    throw new Error("Invalid weekPhases");
  if (
    value.maxTrainingDaysPerWeek !== undefined &&
    (!Number.isInteger(value.maxTrainingDaysPerWeek) ||
      Number(value.maxTrainingDaysPerWeek) < 1 ||
      Number(value.maxTrainingDaysPerWeek) > 7)
  )
    throw new Error("Invalid maxTrainingDaysPerWeek");
  if (
    value.maxDailyMinutes !== undefined &&
    (typeof value.maxDailyMinutes !== "number" ||
      !Number.isFinite(value.maxDailyMinutes) ||
      value.maxDailyMinutes <= 0 ||
      value.maxDailyMinutes > 1440)
  )
    throw new Error("Invalid maxDailyMinutes");
  const weekdayLimits = value.maxMinutesByIsoWeekday;
  if (weekdayLimits !== undefined && (!weekdayLimits || typeof weekdayLimits !== "object" ||
    Array.isArray(weekdayLimits) || !Object.keys(weekdayLimits).length ||
    Object.entries(weekdayLimits).some(([day, minutes]) => !/^[1-7]$/.test(day) ||
      typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440))) {
    throw new Error("Invalid maxMinutesByIsoWeekday");
  }
  if (
    value.allowedDays !== undefined &&
    (!Array.isArray(value.allowedDays) ||
      !value.allowedDays.length ||
      value.allowedDays.some((d) => !Number.isInteger(d) || d < 1 || d > 7))
  )
    throw new Error("Invalid allowedDays");
  if (
    value.requiredSports !== undefined &&
    (!Array.isArray(value.requiredSports) ||
      value.requiredSports.some(
        (s) => !["RUN", "CYCLING", "SWIM", "STRENGTH"].includes(s),
      ))
  )
    throw new Error("Invalid requiredSports");
  if (
    value.raceDiscipline !== undefined &&
    !["RUN", "CYCLING", "SWIM", "TRIATHLON"].includes(
      String(value.raceDiscipline),
    )
  )
    throw new Error("Invalid raceDiscipline");
  return value as PlanQualityContract;
}

export type PlanQualityWorkout = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  sportType?: string;
  structureKind?: string;
  text?: string;
  durationSeconds: number | null;
  plannedSessionRpe?: number | null;
  estimatedLoad?: number | null;
  estimatedLoadRange?: PlanNumberRange;
  loadMethod?: string;
  durationNeedsPace?: boolean;
};


function addRanges(a: PlanNumberRange, b: PlanNumberRange): PlanNumberRange {
  return { min: a.min + b.min, max: a.max + b.max };
}

function sameLoadGroups(a: Map<string, PlanNumberRange>, b: Map<string, PlanNumberRange>) {
  return a.size > 0 && a.size === b.size && [...a.keys()].every((key) => b.has(key));
}

function compareLoadGroups(current: Map<string, PlanNumberRange>, prior: Map<string, PlanNumberRange>) {
  if (!sameLoadGroups(current, prior)) return "UNVERIFIED";
  const pairs = [...current].map(([key, load]) => ({ load, baseline: prior.get(key)! }));
  if (pairs.every(({ load, baseline }) => load.min >= baseline.max)) return "NOT_REDUCED";
  if (
    pairs.every(({ load, baseline }) => load.max <= baseline.min) &&
    pairs.some(({ load, baseline }) => load.max < baseline.min)
  ) return "REDUCED";
  return "UNVERIFIED";
}

export type PlanRepairTarget =
  | { scope: "PLAN" }
  | { scope: "BLOCK"; firstWeek: number; lastWeek: number }
  | { scope: "WEEK"; weekIndex: number }
  | { scope: "DAY"; weekIndex: number; dayIndex: number; sessionIndex?: number };

export function assessPlanQuality(
  periodWeeks: number,
  workouts: PlanQualityWorkout[],
  contract?: PlanQualityContract,
  assessment?: Pick<PlanAssessment, "weekTargets" | "phases">,
) {
  const weekTargets = assessment?.weekTargets;
  const issues: Array<{
    code: string;
    severity: "ERROR" | "WARNING";
    weekIndex?: number;
    message: string;
    target: PlanRepairTarget;
  }> = [];
  const issue = (
    code: string,
    severity: "ERROR" | "WARNING",
    message: string,
    weekIndex?: number,
    target: PlanRepairTarget = weekIndex ? { scope: "WEEK", weekIndex } : { scope: "PLAN" },
  ) =>
    issues.push({
      code,
      severity,
      message,
      target,
      ...(weekIndex ? { weekIndex } : {}),
    });
  if (!Number.isInteger(periodWeeks) || periodWeeks < 1 || periodWeeks > 520) {
    issue(
      "INVALID_PERIOD",
      "ERROR",
      "periodWeeks must be an integer from 1 to 520",
    );
    return { valid: false, weeks: [], issues };
  }
  if (!workouts.length)
    issue("EMPTY_PLAN", "ERROR", "At least one workout is required");
  if (contract?.maxMinutesByIsoWeekday && !contract.startDate)
    issue("WEEKDAY_BUDGET_START_DATE_REQUIRED", "ERROR", "Provide the plan start date to apply the agreed weekday time limits.");
  if (contract?.weekPhases && contract.weekPhases.length !== periodWeeks)
    issue("PHASE_COVERAGE", "ERROR", "weekPhases must cover every plan week");
  if (weekTargets && !validPlanWeekTargets(weekTargets, periodWeeks)) {
    issue("WEEK_TARGET_COVERAGE", "ERROR", "Week targets must cover every plan week in order");
    return { valid: false, weeks: [], issues };
  }
  if (weekTargets && contract?.weekPhases && weekTargets.some((week, index) => week.phase !== contract.weekPhases?.[index]))
    issue("PHASE_TARGET_MISMATCH", "ERROR", "The calendar phases differ from the assessed week targets");
  const positions = new Set<string>();
  const sportSet = new Set<string>();
  const weekly = Array.from({ length: periodWeeks }, (_, i) => ({
    weekIndex: i + 1,
    phase: weekTargets?.[i]?.phase ?? contract?.weekPhases?.[i] ?? null,
    knownDurationSeconds: 0,
    unknownDurationSessions: 0,
    knownEstimatedLoad: 0,
    knownLoadRange: { min: 0, max: 0 },
    loadGroups: new Map<string, PlanNumberRange>(),
    unknownLoadSessions: 0,
    unknownLoadSports: new Set<string>(),
    longestSeconds: 0,
    sessions: 0,
    days: new Map<number, number>(),
    fingerprints: [] as string[],
    prescriptions: [] as string[],
    trainingStructures: [] as string[],
    hasEnduranceSessionRpe: false,
  }));
  for (const w of workouts) {
    if (
      !Number.isInteger(w.weekIndex) ||
      w.weekIndex < 1 ||
      w.weekIndex > periodWeeks ||
      !Number.isInteger(w.dayIndex) ||
      w.dayIndex < 1 ||
      w.dayIndex > 7 ||
      !Number.isInteger(w.sessionIndex ?? 1) ||
      (w.sessionIndex ?? 1) < 1
    ) {
      issue(
        "INVALID_SCHEDULE",
        "ERROR",
        "Workout position lies outside the plan",
      );
      continue;
    }
    const key = `${w.weekIndex}:${w.dayIndex}:${w.sessionIndex ?? 1}`;
    if (positions.has(key))
      issue(
        "DUPLICATE_POSITION",
        "ERROR",
        `Duplicate position ${key}`,
        w.weekIndex,
        { scope: "DAY", weekIndex: w.weekIndex, dayIndex: w.dayIndex, sessionIndex: w.sessionIndex ?? 1 },
      );
    positions.add(key);
    if (contract?.allowedDays && !contract.allowedDays.includes(w.dayIndex))
      issue(
        "UNAVAILABLE_DAY",
        "ERROR",
        `Day ${w.dayIndex} is outside the agreed schedule`,
        w.weekIndex,
        { scope: "DAY", weekIndex: w.weekIndex, dayIndex: w.dayIndex },
      );
    const sport = w.structureKind === "STRENGTH" ? "STRENGTH" : (w.sportType ?? "UNKNOWN");
    sportSet.add(sport);
    const week = weekly[w.weekIndex - 1];
    const duration = w.durationSeconds;
    const known =
      typeof duration === "number" && Number.isFinite(duration) && duration > 0;
    const dayLimit = planDayMinuteLimit(contract, w.dayIndex);
    if (!known && w.durationNeedsPace && (weekTargets || contract?.maxMinutesByIsoWeekday) && dayLimit) {
      issue(
        "UNBOUNDED_DISTANCE_SESSION",
        "ERROR",
        `Week ${w.weekIndex}, day ${w.dayIndex} has distance steps with no grounded duration under the agreed ${dayLimit}-minute limit. Use a supported pace or replace every unbounded distance step, including recoveries inside repeats, with timed steps. Count the entire session against the limit.`,
        w.weekIndex,
        { scope: "DAY", weekIndex: w.weekIndex, dayIndex: w.dayIndex, sessionIndex: w.sessionIndex ?? 1 },
      );
    } else if (!known && contract?.maxMinutesByIsoWeekday && dayLimit) {
      issue("DAILY_TIME_UNVERIFIED", "ERROR",
        `Provide a grounded duration for week ${w.weekIndex}, day ${w.dayIndex} so the ${dayLimit}-minute limit can be checked.`,
        w.weekIndex, { scope: "DAY", weekIndex: w.weekIndex, dayIndex: w.dayIndex, sessionIndex: w.sessionIndex ?? 1 });
    }
    week.sessions++;
    week.days.set(
      w.dayIndex,
      (week.days.get(w.dayIndex) ?? 0) + (known ? duration : 0),
    );
    if (known) {
      week.knownDurationSeconds += duration;
      week.longestSeconds = Math.max(week.longestSeconds, duration);
    } else week.unknownDurationSessions++;
    const range = w.estimatedLoadRange ?? (typeof w.estimatedLoad === "number"
      ? { min: w.estimatedLoad, max: w.estimatedLoad }
      : undefined);
    if (range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min >= 0 && range.max > 0 && range.max >= range.min) {
      const group = `${sport}:${w.loadMethod ?? "UNSPECIFIED"}`;
      week.loadGroups.set(group, addRanges(week.loadGroups.get(group) ?? { min: 0, max: 0 }, range));
      week.knownLoadRange = addRanges(week.knownLoadRange, range);
      const displayLoad = typeof w.estimatedLoad === "number" && Number.isFinite(w.estimatedLoad)
        ? w.estimatedLoad : range.min === range.max ? range.min : 0;
      week.knownEstimatedLoad += Math.round(displayLoad * 10);
    } else {
      week.unknownLoadSessions++;
      week.unknownLoadSports.add(sport);
    }
    week.hasEnduranceSessionRpe ||= sport !== "STRENGTH" && w.loadMethod === "SESSION_RPE";
    week.trainingStructures.push(JSON.stringify([sport, w.structureKind, w.durationSeconds, w.text?.trim()]));
    const prescription = JSON.stringify([w.sportType, w.structureKind, w.durationSeconds, w.plannedSessionRpe, w.text?.trim()]);
    week.prescriptions.push(prescription);
    week.fingerprints.push(JSON.stringify([w.dayIndex, w.sessionIndex ?? 1, prescription]));
  }
  const required = new Set(contract?.requiredSports ?? []);
  if (contract?.raceDiscipline === "TRIATHLON")
    ["RUN", "CYCLING", "SWIM"].forEach((sport) => required.add(sport));
  else if (contract?.raceDiscipline) required.add(contract.raceDiscipline);
  for (const sport of required)
    if (!sportSet.has(sport))
      issue(
        "MISSING_DISCIPLINE",
        "ERROR",
        `The brief/race requires ${sport}; clarify a conflicting brief instead of silently omitting it`,
      );
  let lastTrainingWeek: (typeof weekly)[number] | undefined;
  for (const week of weekly) {
    const target = weekTargets?.[week.weekIndex - 1];
    if (target) {
      const { trainingDays, durationMinutes, loadTarget } = target;
      if (week.days.size < trainingDays.min || week.days.size > trainingDays.max)
        issue("WEEK_TARGET_TRAINING_DAYS", "ERROR", `Week ${week.weekIndex} has ${week.days.size} training days; assessed range is ${trainingDays.min}–${trainingDays.max}.`, week.weekIndex);
      const minutes = week.knownDurationSeconds / 60;
      if (minutes > durationMinutes.max || (!week.unknownDurationSessions && minutes < durationMinutes.min))
        issue("WEEK_TARGET_DURATION", "ERROR", `Week ${week.weekIndex} has ${minutes.toFixed(1)} known minutes; assessed range is ${durationMinutes.min}–${durationMinutes.max}.`, week.weekIndex);
      if (loadTarget) {
        const measured = week.loadGroups.get(`${loadTarget.sport}:${loadTarget.method}`);
        const complete = !week.unknownLoadSports.has(loadTarget.sport) &&
          [...week.loadGroups.keys()].filter((group) => group.startsWith(`${loadTarget.sport}:`)).length === 1;
        if (measured && (measured.min > loadTarget.range.max || (complete && measured.max < loadTarget.range.min)))
          issue("WEEK_TARGET_LOAD", "ERROR", `Week ${week.weekIndex} estimated ${loadTarget.sport} ${loadTarget.method} load is ${measured.min.toFixed(1)}–${measured.max.toFixed(1)}; assessed range is ${loadTarget.range.min}–${loadTarget.range.max}.`, week.weekIndex);
        else if (!measured || !complete || measured.min < loadTarget.range.min || measured.max > loadTarget.range.max)
          issue("WEEK_TARGET_LOAD_UNVERIFIED", "WARNING", `Review week ${week.weekIndex}: the estimate does not fully cover the assessed load range and method.`, week.weekIndex);
      }
    }
    if (
      week.sessions === 0 &&
      ["BASE", "BUILD", "MAINTENANCE"].includes(week.phase ?? "")
    )
      issue(
        "EMPTY_TRAINING_WEEK",
        "ERROR",
        "A declared training week has no sessions; cover the full requested cycle",
        week.weekIndex,
      );
    if (
      contract?.maxTrainingDaysPerWeek &&
      week.days.size > contract.maxTrainingDaysPerWeek
    )
      issue(
        "WEEKLY_DAY_BUDGET",
        "ERROR",
        "Training days exceed the agreed availability",
        week.weekIndex,
      );
    for (const [dayIndex, seconds] of week.days) {
      const dayLimit = planDayMinuteLimit(contract, dayIndex);
      if (dayLimit !== undefined && seconds > dayLimit * 60)
        issue(
          "DAILY_TIME_BUDGET",
          "ERROR",
          `Day ${dayIndex} totals ${seconds / 60} minutes, above the agreed ${dayLimit}-minute limit including warm-up and recovery.`,
          week.weekIndex,
          { scope: "DAY", weekIndex: week.weekIndex, dayIndex },
        );
    }
    if (week.unknownDurationSessions)
      issue(
        "UNKNOWN_DURATION",
        "WARNING",
        "Distance/open-ended sessions have no exact duration; do not describe weekly time as exact",
        week.weekIndex,
      );
    const prior = weekly[week.weekIndex - 2];
    const reducedPhase = week.phase === "RECOVERY" || week.phase === "TAPER";
    const recoveryBaseline = prior?.phase === "RECOVERY" || prior?.phase === "TAPER"
      ? lastTrainingWeek ?? prior : prior;
    if (reducedPhase && recoveryBaseline?.sessions && week.sessions) {
      const baseline = recoveryBaseline;
      const comparison = !baseline.unknownLoadSessions && !week.unknownLoadSessions
        ? compareLoadGroups(week.loadGroups, baseline.loadGroups) : "UNVERIFIED";
      const samePrescriptions = JSON.stringify(week.prescriptions.slice().sort()) === JSON.stringify(baseline.prescriptions.slice().sort());
      if ((baseline.unknownLoadSessions || week.unknownLoadSessions) && samePrescriptions) {
        issue(
          "RECOVERY_NOT_REDUCED",
          "ERROR",
          `Week ${week.weekIndex} (${week.phase}) repeats the prescriptions from week ${baseline.weekIndex}. Change the prescribed intensity, duration, or number of sessions.`,
          week.weekIndex,
        );
      } else if (comparison === "NOT_REDUCED") {
        issue(
          "RECOVERY_NOT_REDUCED",
          "ERROR",
          `Week ${week.weekIndex} (${week.phase}) has no verified reduction against week ${baseline.weekIndex}. Known load spans ${week.knownLoadRange.min.toFixed(1)}–${week.knownLoadRange.max.toFixed(1)} versus ${baseline.knownLoadRange.min.toFixed(1)}–${baseline.knownLoadRange.max.toFixed(1)}. Reduce prescribed intensity, duration, or number of sessions.`,
          week.weekIndex,
        );
      } else if (comparison === "UNVERIFIED" || (
        week.hasEnduranceSessionRpe &&
        JSON.stringify(week.trainingStructures.slice().sort()) === JSON.stringify(baseline.trainingStructures.slice().sort())
      )) {
        issue(
          "RECOVERY_LOAD_UNVERIFIED",
          "WARNING",
          `Review reduction against week ${baseline.weekIndex}. Estimates may overlap, use different methods, lack coverage, or differ only in planned RPE for the same prescription.`,
          week.weekIndex,
        );
      }
    }
    const trainingPhase = week.phase === "BASE" || week.phase === "BUILD" || week.phase === "MAINTENANCE";
    if (trainingPhase && week.sessions && !week.unknownLoadSessions) {
      if (
        lastTrainingWeek &&
        (prior?.phase === "RECOVERY" || prior?.phase === "TAPER") &&
        sameLoadGroups(week.loadGroups, lastTrainingWeek.loadGroups) &&
        week.knownLoadRange.min > lastTrainingWeek.knownLoadRange.max * 1.3
      )
        issue(
          "POST_RECOVERY_LOAD_JUMP_REVIEW",
          "WARNING",
          `Week ${week.weekIndex} returns to estimated load ${week.knownEstimatedLoad / 10}; review the increase from ${lastTrainingWeek.knownEstimatedLoad / 10} in week ${lastTrainingWeek.weekIndex}, before the reduced weeks.`,
          week.weekIndex,
        );
      lastTrainingWeek = week;
    } else if (trainingPhase) lastTrainingWeek = undefined;
    if (
      !prior ||
      !prior.knownDurationSeconds ||
      prior.unknownDurationSessions ||
      week.unknownDurationSessions
    )
      continue;
    if (reducedPhase && week.longestSeconds >= prior.longestSeconds)
      issue(
        "LONG_SESSION_NOT_REDUCED",
        "WARNING",
        "Recovery/taper longest session did not shorten; review intensity and recovery cost",
        week.weekIndex,
      );
    // A review flag, not a universal safe/unsafe physiological threshold.
    if (
      week.knownDurationSeconds > prior.knownDurationSeconds * 1.3 &&
      prior.phase !== "RECOVERY" &&
      prior.phase !== "TAPER"
    )
      issue(
        "VOLUME_JUMP_REVIEW",
        "WARNING",
        "Weekly duration increased by over 30%; justify against the athlete baseline",
        week.weekIndex,
      );
    if (
      week.weekIndex > 2 &&
      week.fingerprints.slice().sort().join("|") ===
        prior.fingerprints.slice().sort().join("|") &&
      week.fingerprints.slice().sort().join("|") ===
        weekly[week.weekIndex - 3].fingerprints.slice().sort().join("|") &&
      week.sessions
    )
      issue(
        "REPEATED_WEEKS_REVIEW",
        "WARNING",
        "Three identical weeks: confirm this is intentional maintenance, not accidental duplication",
        week.weekIndex,
      );
  }
  for (const phase of assessment?.phases ?? []) {
    if (!phase.durationMinutes) continue;
    const weeks = weekly.slice(phase.startWeek - 1, phase.endWeek);
    const minutes = weeks.reduce((total, week) => total + week.knownDurationSeconds / 60, 0);
    if (minutes > phase.durationMinutes.max || (
      minutes < phase.durationMinutes.min && weeks.every((week) => !week.unknownDurationSessions)
    )) issue("PHASE_TARGET_DURATION", "ERROR",
      `Weeks ${phase.startWeek}–${phase.endWeek} total ${minutes.toFixed(1)} known minutes; the assessed phase range is ${phase.durationMinutes.min}–${phase.durationMinutes.max}.`,
      undefined, { scope: "BLOCK", firstWeek: phase.startWeek, lastWeek: phase.endWeek });
  }
  return {
    valid: !issues.some((item) => item.severity === "ERROR"),
    weeks: weekly.map(({ days, fingerprints: _fingerprints, prescriptions: _prescriptions, trainingStructures: _structures, hasEnduranceSessionRpe: _hasEnduranceSessionRpe, knownEstimatedLoad, loadGroups, knownLoadRange, unknownLoadSports: _unknownLoadSports, ...week }) => ({
      ...week,
      trainingDays: days.size,
      totalEstimatedLoad: week.unknownLoadSessions || knownLoadRange.min !== knownLoadRange.max ? null : knownEstimatedLoad / 10,
      estimatedLoadRange: week.unknownLoadSessions ? null : knownLoadRange,
      knownEstimatedLoadRange: loadGroups.size ? knownLoadRange : null,
      totalDurationSeconds: week.unknownDurationSessions
        ? null
        : week.knownDurationSeconds,
    })),
    issues,
  };
}

/** Validate rolling prescriptions in bounded plan-week groups; date budgets use assessPlanSchedule. */
export function assessRollingPlanQuality(
  workouts: PlanQualityWorkout[],
  contract?: PlanQualityContract,
) {
  const groups = new Map<number, PlanQualityWorkout[]>();
  for (const workout of workouts) {
    const list = groups.get(workout.weekIndex) ?? [];
    list.push({ ...workout, weekIndex: 1 });
    groups.set(workout.weekIndex, list);
  }
  const reports = [...groups.values()].map((group) =>
    assessPlanQuality(
      1,
      group,
      contract
        ? {
            ...contract,
            weekPhases: undefined,
            requiredSports: undefined,
            maxTrainingDaysPerWeek: undefined,
            maxDailyMinutes: undefined,
            maxMinutesByIsoWeekday: undefined,
            allowedDays: undefined,
          }
        : undefined,
    ),
  );
  const issues = reports.flatMap((r) => r.issues);
  for (const sport of contract?.requiredSports ?? [])
    if (!workouts.some((w) => w.sportType === sport))
      issues.push({
        code: "MISSING_SPORT",
        severity: "ERROR",
        message: `Required sport ${sport} is missing`,
        target: { scope: "PLAN" },
      });
  return {
    valid: issues.every((i) => i.severity !== "ERROR"),
    weeks: reports.flatMap((r) => r.weeks),
    issues,
  };
}
