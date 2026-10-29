/** Structural consistency checks, not a medical safety certification. */
export const PLAN_WEEK_PHASES = [
  "BASE",
  "BUILD",
  "RECOVERY",
  "TAPER",
  "RACE",
  "MAINTENANCE",
] as const;
export type PlanQualityContract = {
  startDate?: string;
  weekPhases?: Array<(typeof PLAN_WEEK_PHASES)[number]>;
  maxTrainingDaysPerWeek?: number;
  maxDailyMinutes?: number;
  allowedDays?: number[];
  requiredSports?: string[];
  raceDiscipline?: "RUN" | "CYCLING" | "SWIM" | "TRIATHLON";
};

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
};

export function assessPlanQuality(
  periodWeeks: number,
  workouts: PlanQualityWorkout[],
  contract?: PlanQualityContract,
) {
  const issues: Array<{
    code: string;
    severity: "ERROR" | "WARNING";
    weekIndex?: number;
    message: string;
  }> = [];
  const issue = (
    code: string,
    severity: "ERROR" | "WARNING",
    message: string,
    weekIndex?: number,
  ) =>
    issues.push({
      code,
      severity,
      message,
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
  if (contract?.weekPhases && contract.weekPhases.length !== periodWeeks)
    issue("PHASE_COVERAGE", "ERROR", "weekPhases must cover every plan week");
  const positions = new Set<string>();
  const sportSet = new Set<string>();
  const weekly = Array.from({ length: periodWeeks }, (_, i) => ({
    weekIndex: i + 1,
    phase: contract?.weekPhases?.[i] ?? null,
    knownDurationSeconds: 0,
    unknownDurationSessions: 0,
    longestSeconds: 0,
    sessions: 0,
    days: new Map<number, number>(),
    fingerprints: [] as string[],
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
      );
    positions.add(key);
    if (contract?.allowedDays && !contract.allowedDays.includes(w.dayIndex))
      issue(
        "UNAVAILABLE_DAY",
        "ERROR",
        `Day ${w.dayIndex} is outside the agreed schedule`,
        w.weekIndex,
      );
    sportSet.add(
      w.structureKind === "STRENGTH" ? "STRENGTH" : (w.sportType ?? "UNKNOWN"),
    );
    const week = weekly[w.weekIndex - 1];
    const duration = w.durationSeconds;
    const known =
      typeof duration === "number" && Number.isFinite(duration) && duration > 0;
    week.sessions++;
    week.days.set(
      w.dayIndex,
      (week.days.get(w.dayIndex) ?? 0) + (known ? duration : 0),
    );
    if (known) {
      week.knownDurationSeconds += duration;
      week.longestSeconds = Math.max(week.longestSeconds, duration);
    } else week.unknownDurationSessions++;
    week.fingerprints.push(
      `${w.dayIndex}:${w.sessionIndex ?? 1}:${w.sportType}:${w.structureKind}:${w.text?.trim()}`,
    );
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
  for (const week of weekly) {
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
    if (
      contract?.maxDailyMinutes &&
      [...week.days.values()].some(
        (seconds) => seconds > contract.maxDailyMinutes! * 60,
      )
    )
      issue(
        "DAILY_TIME_BUDGET",
        "ERROR",
        "Combined sessions exceed the agreed daily time budget, including warm-up and recovery",
        week.weekIndex,
      );
    if (week.unknownDurationSessions)
      issue(
        "UNKNOWN_DURATION",
        "WARNING",
        "Distance/open-ended sessions have no exact duration; do not describe weekly time as exact",
        week.weekIndex,
      );
    const prior = weekly[week.weekIndex - 2];
    if (
      !prior ||
      !prior.knownDurationSeconds ||
      prior.unknownDurationSessions ||
      week.unknownDurationSessions
    )
      continue;
    const reducedPhase = week.phase === "RECOVERY" || week.phase === "TAPER";
    if (reducedPhase && week.knownDurationSeconds >= prior.knownDurationSeconds)
      issue(
        "RECOVERY_NOT_REDUCED",
        "ERROR",
        "Declared recovery/taper week does not reduce total duration from the previous week",
        week.weekIndex,
      );
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
  return {
    valid: !issues.some((item) => item.severity === "ERROR"),
    weeks: weekly.map(({ days, fingerprints: _fingerprints, ...week }) => ({
      ...week,
      trainingDays: days.size,
      totalDurationSeconds: week.unknownDurationSessions
        ? null
        : week.knownDurationSeconds,
    })),
    issues,
  };
}
