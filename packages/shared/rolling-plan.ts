import {
  addCalendarDays,
  isCalendarDate,
  calendarIsoWeekday,
} from "./plan-calendar";

export type PlanPlanningMode = "FIXED" | "ROLLING";
export type RollingPolicySettings = {
  goal: string;
  sportTypes: string[];
  autoPlanMonths: true;
  autoGenerateWeeks: true;
  autoAdjustFuture: true;
};
type RollingTargetRange = { min: number; max: number };
type RollingLoadRange = RollingTargetRange & { unit: "NORMALIZED_LOAD" };
export type RollingMonthDraft = {
  monthStart: string;
  objective: string;
  /** Null means unknown, never zero load. All values use the existing normalized load scale. */
  loadRange: RollingLoadRange | null;
  durationMinutesRange: RollingTargetRange | null;
  runningDistanceKmRange?: RollingTargetRange | null;
  monthOverMonthReason?: string | null;
  weekFocus: Array<{
    weekStart: string;
    focus: string;
    // Older strategies contain only a focus. Each new target covers the month's portion of the week.
    loadRange?: RollingLoadRange | null;
    durationMinutesRange?: RollingTargetRange | null;
  }>;
};
export type RollingStartSettings = {
  policy: RollingPolicySettings;
  monthStrategies: RollingMonthDraft[];
};
export type GenerationInterval = {
  from: string;
  through: string;
  weekStart: string;
};
export type GenerationCoverage = {
  from: string | null;
  through: string | null;
  status: "NOT_GENERATED" | "PARTIAL" | "GENERATED";
  intervals: GenerationInterval[];
};
export const isoWeekStart = (date: string) =>
  addCalendarDays(date, 1 - calendarIsoWeekday(date));
export function isoWeekStarts(from: string, through: string) {
  const starts: string[] = [];
  for (
    let start = isoWeekStart(from);
    start <= through;
    start = addCalendarDays(start, 7)
  )
    starts.push(start);
  return starts;
}
export const calendarMonthEnd = (date: string) => {
  const next = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
};

type MonthWindow = { monthStart: string; effectiveFrom: string };

export function findComparablePreviousMonth<T extends MonthWindow>(
  current: MonthWindow,
  history: readonly T[],
): T | undefined {
  if (current.effectiveFrom !== current.monthStart) return undefined;
  const previousStart = `${addCalendarDays(current.monthStart, -1).slice(0, 7)}-01`;
  return history.find(
    (month) => month.monthStart === previousStart && month.effectiveFrom === previousStart,
  );
}

export function hasRollingWeekTargets(
  strategy: Pick<RollingMonthDraft, "weekFocus">,
  from: string,
  through: string,
) {
  const starts = isoWeekStarts(from, through);
  const targets = new Map(
    strategy.weekFocus.map((week) => [week.weekStart, week]),
  );
  return (
    strategy.weekFocus.length === starts.length &&
    starts.every((start) => {
      const target = targets.get(start);
      return (
        target?.loadRange !== undefined &&
        target.durationMinutesRange !== undefined
      );
    })
  );
}

/** Check the planning totals within one month window, including partial weeks. */
export function conflictingRollingMonthTargets(strategy: Pick<RollingMonthDraft, "weekFocus"> &
  Partial<Pick<RollingMonthDraft, "loadRange" | "durationMinutesRange">>) {
  return (["loadRange", "durationMinutesRange"] as const).filter((metric) => {
    const month = strategy[metric];
    const weeks = strategy.weekFocus.map((week) => week[metric]);
    if (!month || !weeks.length || weeks.some((week) => !week)) return false;
    const minimum = weeks.reduce((sum, week) => sum + (week?.min ?? 0), 0);
    const maximum = weeks.reduce((sum, week) => sum + (week?.max ?? 0), 0);
    return minimum > month.max || maximum < month.min;
  });
}

function validTargetRange(range: RollingTargetRange | null) {
  return (
    range === null ||
    Boolean(
      range &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max) &&
      range.min >= 0 &&
      range.max >= range.min,
    )
  );
}
export function generationCoverage(
  from: string | null,
  through: string | null,
  intervals: GenerationInterval[],
): GenerationCoverage {
  const relevant = intervals.filter(
    (i) => (!from || i.through >= from) && (!through || i.from <= through),
  );
  let covered = 0,
    total = 0;
  if (from && through)
    for (let date = from; date <= through; date = addCalendarDays(date, 1)) {
      total++;
      if (relevant.some((i) => date >= i.from && date <= i.through)) covered++;
    }
  return {
    from,
    through,
    intervals: relevant,
    status:
      covered === 0
        ? "NOT_GENERATED"
        : covered === total
          ? "GENERATED"
          : "PARTIAL",
  };
}
export function parseRollingStartSettings(
  value: unknown,
  startDate: string,
): RollingStartSettings {
  const data = value as RollingStartSettings;
  function fail(): never {
    throw new Error(
      "ROLLING START requires confirmed goal, sports, automatic scope and calendar month strategies",
    );
  }
  if (
    !data ||
    !data.policy ||
    typeof data.policy.goal !== "string" ||
    !data.policy.goal.trim() ||
    !Array.isArray(data.policy.sportTypes) ||
    !data.policy.sportTypes.length ||
    data.policy.sportTypes.some(
      (s) =>
        ![
          "RUN",
          "CYCLING",
          "SWIM",
          "STRENGTH",
          "OTHER",
          "UNKNOWN",
          "STRETCHING",
        ].includes(s),
    ) ||
    data.policy.autoPlanMonths !== true ||
    data.policy.autoGenerateWeeks !== true ||
    data.policy.autoAdjustFuture !== true ||
    !Array.isArray(data.monthStrategies)
  )
    fail();
  const end = addCalendarDays(isoWeekStart(startDate), 6);
  const months = [...new Set([startDate.slice(0, 7), end.slice(0, 7)])];
  if (data.monthStrategies.length !== months.length) fail();
  for (const month of months) {
    const strategy = data.monthStrategies.find(
      (m) => m.monthStart === `${month}-01`,
    );
    if (
      !strategy ||
      !isCalendarDate(strategy.monthStart) ||
      typeof strategy.objective !== "string" ||
      !strategy.objective.trim() ||
      !Array.isArray(strategy.weekFocus)
    )
      fail();
    if (
      !validTargetRange(strategy.loadRange) ||
      !validTargetRange(strategy.durationMinutesRange) ||
      (strategy.runningDistanceKmRange !== undefined &&
        !validTargetRange(strategy.runningDistanceKmRange)) ||
      (strategy.monthOverMonthReason != null &&
        (typeof strategy.monthOverMonthReason !== "string" ||
          !strategy.monthOverMonthReason.trim() ||
          strategy.monthOverMonthReason.length > 500)) ||
      (strategy.loadRange && strategy.loadRange.unit !== "NORMALIZED_LOAD")
    )
      fail();
    if (
      strategy.weekFocus.some(
        (w) =>
          !w ||
          !isCalendarDate(w.weekStart) ||
          isoWeekStart(w.weekStart) !== w.weekStart ||
          typeof w.focus !== "string" ||
          !w.focus.trim() ||
          addCalendarDays(w.weekStart, 6) < strategy.monthStart ||
          w.weekStart > calendarMonthEnd(strategy.monthStart) ||
          (w.loadRange !== undefined && !validTargetRange(w.loadRange)) ||
          (w.loadRange && w.loadRange.unit !== "NORMALIZED_LOAD") ||
          (w.durationMinutesRange !== undefined &&
            !validTargetRange(w.durationMinutesRange)),
      )
    )
      fail();
  }
  return JSON.parse(JSON.stringify(data));
}

export type RollingPlanAutomationJobState =
  | "PENDING"
  | "RUNNING"
  | "RETRY"
  | "APPLIED"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED";

export type RollingPlanAutomationJob = {
  id: string;
  kind: "MONTH" | "WEEK" | "ADJUST";
  windowStart: string;
  state: RollingPlanAutomationJobState;
  attempts: number;
  lastError: string | null;
  availableAt: string;
};

export type RollingPlanAutomationStatus = {
  enabled: boolean;
  revision: number | null;
  hasAuthorization: boolean;
  blockedReason?: string | null;
  jobs: RollingPlanAutomationJob[];
};
