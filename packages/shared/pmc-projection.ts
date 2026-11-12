export const PMC_PROJECTION_SCOPES = ["ALL", "RUN", "CYCLING", "SWIM"] as const;
export type PmcProjectionScope = (typeof PMC_PROJECTION_SCOPES)[number];
export const PMC_PROJECTION_SCENARIOS = ["AUTO", "HABIT", "REST"] as const;
export type PmcProjectionScenario = (typeof PMC_PROJECTION_SCENARIOS)[number];
export interface PmcProjectionSelection {
  scope: PmcProjectionScope;
  scenario: PmcProjectionScenario;
  historyDays: 60 | 90;
  expectedProjectionId?: string;
}

/** Client selections carry no athlete facts or write authority. Ignore all other fields. */
export function parsePmcProjectionSelection(
  value: unknown,
): PmcProjectionSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !PMC_PROJECTION_SCOPES.includes(row.scope as PmcProjectionScope) ||
    !PMC_PROJECTION_SCENARIOS.includes(row.scenario as PmcProjectionScenario) ||
    (row.historyDays !== 60 && row.historyDays !== 90) ||
    (row.expectedProjectionId !== undefined &&
      (typeof row.expectedProjectionId !== "string" ||
        !/^[a-f0-9]{64}$/.test(row.expectedProjectionId)))
  )
    return null;
  return {
    scope: row.scope as PmcProjectionScope,
    scenario: row.scenario as PmcProjectionScenario,
    historyDays: row.historyDays,
    ...(row.expectedProjectionId
      ? { expectedProjectionId: row.expectedProjectionId as string }
      : {}),
  };
}
export type PmcLoadBasis = "ACTUAL" | "PLAN" | "HABIT" | "REST" | "UNKNOWN";
export type PmcProjectionIssue =
  | "COLD_START"
  | "INSUFFICIENT_HISTORY"
  | "STALE_HISTORY"
  | "IRREGULAR_HISTORY"
  | "ACTUAL_LOAD_MISSING"
  | "BASELINE_VERSION_MISMATCH"
  | "PLAN_LOAD_MISSING"
  | "UNSCHEDULED_DAYS"
  | "APPROXIMATE_PLAN_LOAD";

export interface PmcProjectionPoint {
  date: string;
  load: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  basis: PmcLoadBasis;
  plannedLoad: number | null;
  habitLoad: number | null;
}
export interface PmcProjectionResult {
  projectionId: string;
  asOf: string;
  timezone: string;
  today: string;
  targetDate: string;
  scope: PmcProjectionScope;
  scenario: PmcProjectionScenario;
  availability: "READY" | "PARTIAL" | "UNAVAILABLE";
  basis: "PLAN" | "HABIT" | "MIXED" | "REST" | "UNKNOWN";
  model: { version: string; ctlTimeConstant: number; atlTimeConstant: number };
  baseline: {
    date: string;
    ctl: number;
    atl: number;
    initializedFromZero: boolean;
  };
  loadSources: { actual: string[]; planned: string[] };
  current: PmcProjectionPoint | null;
  history: PmcProjectionPoint[];
  /** Today's conditional end-of-day state; never replaces the actual current state. */
  todayProjection: PmcProjectionPoint | null;
  forecast: PmcProjectionPoint[];
  coverage: {
    historyStart: string | null;
    historyDays: number;
    planDays: number;
    habitDays: number;
    unknownDays: number;
    projectedDays: number;
    firstUnknownDate: string | null;
  };
  issues: PmcProjectionIssue[];
}
