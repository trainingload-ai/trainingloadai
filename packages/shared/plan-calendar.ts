import {
  parsePlanQualityContract,
  type PlanQualityContract,
} from "./plan-quality";

export type ScheduleConstraints = {
  version: 1;
  revision: number;
  calendarTimeZone: string;
  fixedRestWeekdays: number[];
  unavailableDates: string[];
  /** Explicitly confirmed exceptions may override a recurring rest day. */
  availableDateOverrides: string[];
  effectiveFrom: string;
  effectiveUntil?: string;
  confirmation: { source: "USER"; reference: string };
};

const calendarDateSchema = {
  type: "string" as const,
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
};
export const scheduleConstraintsSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "version",
    "revision",
    "calendarTimeZone",
    "fixedRestWeekdays",
    "unavailableDates",
    "availableDateOverrides",
    "effectiveFrom",
    "confirmation",
  ],
  properties: {
    version: { type: "integer" as const, const: 1 },
    revision: { type: "integer" as const, minimum: 1 },
    calendarTimeZone: { type: "string" as const, minLength: 1 },
    fixedRestWeekdays: {
      type: "array" as const,
      uniqueItems: true,
      items: { type: "integer" as const, minimum: 1, maximum: 7 },
    },
    unavailableDates: {
      type: "array" as const,
      uniqueItems: true,
      items: calendarDateSchema,
    },
    availableDateOverrides: {
      type: "array" as const,
      uniqueItems: true,
      items: calendarDateSchema,
    },
    effectiveFrom: calendarDateSchema,
    effectiveUntil: calendarDateSchema,
    confirmation: {
      type: "object" as const,
      additionalProperties: false,
      required: ["source", "reference"],
      properties: {
        source: { type: "string" as const, const: "USER" },
        reference: { type: "string" as const, minLength: 1 },
      },
    },
  },
};

export function isCalendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function assertCalendarTimeZone(value: string): void {
  new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
}

/** UTC is used only as a civil-date arithmetic container, never as an athlete instant. */
export function addCalendarDays(date: string, days: number): string {
  if (!isCalendarDate(date) || !Number.isInteger(days))
    throw new Error("Invalid calendar date or offset");
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarIsoWeekday(date: string): number {
  if (!isCalendarDate(date)) throw new Error("Invalid calendar date");
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

export function parseScheduleConstraints(
  raw: unknown,
): ScheduleConstraints | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid schedule constraints");
  const v = raw as Record<string, unknown>;
  const keys = [
    "version",
    "revision",
    "calendarTimeZone",
    "fixedRestWeekdays",
    "unavailableDates",
    "availableDateOverrides",
    "effectiveFrom",
    "effectiveUntil",
    "confirmation",
  ];
  if (
    Object.keys(v).some((k) => !keys.includes(k)) ||
    v.version !== 1 ||
    !Number.isInteger(v.revision) ||
    Number(v.revision) < 1 ||
    typeof v.calendarTimeZone !== "string" ||
    !v.calendarTimeZone.trim() ||
    !isCalendarDate(v.effectiveFrom) ||
    (v.effectiveUntil !== undefined &&
      (!isCalendarDate(v.effectiveUntil) || v.effectiveUntil < v.effectiveFrom))
  )
    throw new Error("Invalid schedule constraints");
  assertCalendarTimeZone(v.calendarTimeZone);
  if (
    !Array.isArray(v.fixedRestWeekdays) ||
    v.fixedRestWeekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7) ||
    new Set(v.fixedRestWeekdays).size !== v.fixedRestWeekdays.length
  )
    throw new Error("Invalid rest weekdays");
  for (const key of ["unavailableDates", "availableDateOverrides"])
    if (
      !Array.isArray(v[key]) ||
      v[key].some((d) => !isCalendarDate(d)) ||
      new Set(v[key]).size !== v[key].length
    )
      throw new Error("Invalid calendar exceptions");
  if (
    (v.availableDateOverrides as string[]).some((d) =>
      (v.unavailableDates as string[]).includes(d),
    )
  )
    throw new Error("Conflicting calendar exceptions");
  const confirmation = v.confirmation as Record<string, unknown> | undefined;
  if (
    !confirmation ||
    confirmation.source !== "USER" ||
    typeof confirmation.reference !== "string" ||
    !confirmation.reference.trim() ||
    Object.keys(confirmation).some((k) => !["source", "reference"].includes(k))
  )
    throw new Error("User confirmation reference is required");
  return v as ScheduleConstraints;
}

export type ScheduleConflict = {
  code: "FIXED_REST_DAY" | "UNAVAILABLE_DATE";
  date: string;
  workoutIndex: number;
};
export function scheduleDateConflict(
  date: string,
  constraints?: ScheduleConstraints,
): ScheduleConflict["code"] | null {
  if (
    !constraints ||
    date < constraints.effectiveFrom ||
    (constraints.effectiveUntil && date > constraints.effectiveUntil)
  )
    return null;
  if (constraints.unavailableDates.includes(date)) return "UNAVAILABLE_DATE";
  if (
    constraints.fixedRestWeekdays.includes(calendarIsoWeekday(date)) &&
    !constraints.availableDateOverrides.includes(date)
  )
    return "FIXED_REST_DAY";
  return null;
}

export function projectPlanCalendar<
  T extends { weekIndex: number; dayIndex: number; sessionIndex?: number },
>(input: {
  periodWeeks: number;
  startDate: string;
  calendarTimeZone: string;
  workouts: T[];
  constraints?: ScheduleConstraints;
}) {
  if (
    !Number.isInteger(input.periodWeeks) ||
    input.periodWeeks < 1 ||
    input.periodWeeks > 520
  )
    throw new Error("Invalid plan period");
  assertCalendarTimeZone(input.calendarTimeZone);
  const constraints = parseScheduleConstraints(input.constraints);
  if (constraints && constraints.calendarTimeZone !== input.calendarTimeZone)
    throw new Error("Calendar time zone does not match constraints");
  const endDate = addCalendarDays(input.startDate, input.periodWeeks * 7 - 1);
  const conflicts: ScheduleConflict[] = [];
  const workouts = input.workouts.map((workout, workoutIndex) => {
    if (
      !Number.isInteger(workout.weekIndex) ||
      workout.weekIndex < 1 ||
      workout.weekIndex > input.periodWeeks ||
      !Number.isInteger(workout.dayIndex) ||
      workout.dayIndex < 1 ||
      workout.dayIndex > 7
    )
      throw new Error("Workout lies outside plan period");
    const dayOffset = (workout.weekIndex - 1) * 7 + workout.dayIndex - 1;
    const date = addCalendarDays(input.startDate, dayOffset);
    const code = scheduleDateConflict(date, constraints);
    if (code) conflicts.push({ code, date, workoutIndex });
    return {
      workout,
      workoutIndex,
      dayOffset,
      date,
      isoWeekday: calendarIsoWeekday(date),
    };
  });
  const weeks = [];
  for (
    let monday = addCalendarDays(
      input.startDate,
      1 - calendarIsoWeekday(input.startDate),
    );
    monday <= endDate;
    monday = addCalendarDays(monday, 7)
  ) {
    weeks.push({
      startDate: monday,
      days: Array.from({ length: 7 }, (_, index) => {
        const date = addCalendarDays(monday, index);
        return {
          date,
          isoWeekday: index + 1,
          inPlan: date >= input.startDate && date <= endDate,
          workouts: workouts.filter((w) => w.date === date),
          conflicts: conflicts.filter((c) => c.date === date),
        };
      }),
    });
  }
  return {
    startDate: input.startDate,
    endDate,
    calendarTimeZone: input.calendarTimeZone,
    workouts,
    weeks,
    conflicts,
  };
}

export type ScheduleQualityContractTransition = (
  | { mode: "INHERIT" }
  | { mode: "REPLACE_ALLOWED_DAYS"; allowedDays: number[] | null }
) & {
  /** Only explicitly confirmed availability changes replace inherited budgets. */
  maxDailyMinutes?: number;
  maxTrainingDaysPerWeek?: number;
};

/** Replacement is explicit: the legacy contract never implies weekday provenance. */
export function resolveScheduleQualityContract(
  contract: PlanQualityContract | undefined,
  transition: ScheduleQualityContractTransition,
): PlanQualityContract | undefined {
  if (
    !transition ||
    !["INHERIT", "REPLACE_ALLOWED_DAYS"].includes(transition.mode) ||
    Object.keys(transition).some(
      (key) =>
        ![
          "mode",
          "maxDailyMinutes",
          "maxTrainingDaysPerWeek",
          ...(transition.mode === "REPLACE_ALLOWED_DAYS"
            ? ["allowedDays"]
            : []),
        ].includes(key),
    ) ||
    (transition.mode === "REPLACE_ALLOWED_DAYS" &&
      transition.allowedDays !== null &&
      (!Array.isArray(transition.allowedDays) ||
        !transition.allowedDays.length ||
        transition.allowedDays.some(
          (d) => !Number.isInteger(d) || d < 1 || d > 7,
        )))
  )
    throw new Error("Invalid quality contract transition");
  const next = { ...contract };
  if (transition.mode === "REPLACE_ALLOWED_DAYS") {
    delete next.allowedDays;
    if (transition.allowedDays !== null)
      next.allowedDays = transition.allowedDays;
  }
  if (transition.maxDailyMinutes !== undefined)
    next.maxDailyMinutes = transition.maxDailyMinutes;
  if (transition.maxTrainingDaysPerWeek !== undefined)
    next.maxTrainingDaysPerWeek = transition.maxTrainingDaysPerWeek;
  return Object.keys(next).length ? parsePlanQualityContract(next) : undefined;
}

export type ScheduledPlanWorkout = {
  id: string;
  dayOffset: number;
  scheduledDate?: string | null;
  status: string;
  durationSeconds?: number | null;
};

/** Evaluate final persisted dates, including combined sessions on changed days. */
export function assessPlanSchedule(input: {
  startDate: string;
  periodWeeks: number;
  workouts: ScheduledPlanWorkout[];
  changedWorkoutIds: string[];
  constraints?: ScheduleConstraints;
  qualityContract?: PlanQualityContract;
  projectDates?: boolean;
}) {
  const issues: Array<{ code: string; date?: string; workoutId?: string }> = [];
  const touched = new Set(input.changedWorkoutIds);
  const dateOf = (w: ScheduledPlanWorkout) =>
    input.projectDates || !w.scheduledDate
      ? addCalendarDays(input.startDate, w.dayOffset)
      : w.scheduledDate;
  const dates = new Set<string>();
  const planWeeks = new Set<number>();
  for (const w of input.workouts) {
    if (!touched.has(w.id)) continue;
    const date = dateOf(w);
    dates.add(date);
    planWeeks.add(Math.floor(w.dayOffset / 7));
    if (
      w.dayOffset < 0 ||
      w.dayOffset >= input.periodWeeks * 7 ||
      !Number.isInteger(w.dayOffset)
    )
      issues.push({ code: "OUTSIDE_PLAN", date, workoutId: w.id });
    if (date !== addCalendarDays(input.startDate, w.dayOffset))
      issues.push({ code: "DATE_POSITION_MISMATCH", date, workoutId: w.id });
    const code = scheduleDateConflict(date, input.constraints);
    if (code) issues.push({ code, date, workoutId: w.id });
    if (
      input.qualityContract?.allowedDays &&
      !input.qualityContract.allowedDays.includes((w.dayOffset % 7) + 1)
    )
      issues.push({ code: "UNAVAILABLE_DAY", date, workoutId: w.id });
  }
  for (const date of dates) {
    const daily = input.workouts.filter(
      (w) => !["MOVED", "SKIPPED"].includes(w.status) && dateOf(w) === date,
    );
    if (
      input.qualityContract?.maxDailyMinutes &&
      daily.reduce((sum, w) => sum + (w.durationSeconds ?? 0), 0) >
        input.qualityContract.maxDailyMinutes * 60
    )
      issues.push({ code: "DAILY_TIME_BUDGET", date });
  }
  for (const week of planWeeks) {
    const days = new Set(
      input.workouts
        .filter(
          (w) =>
            !["MOVED", "SKIPPED"].includes(w.status) &&
            Math.floor(w.dayOffset / 7) === week,
        )
        .map((w) => w.dayOffset),
    );
    if (
      input.qualityContract?.maxTrainingDaysPerWeek &&
      days.size > input.qualityContract.maxTrainingDaysPerWeek
    )
      issues.push({ code: "WEEKLY_DAY_BUDGET" });
  }
  return { valid: issues.length === 0, issues };
}
