/** Versioned public contract. No raw sensor samples are sent to the model/client. */
export const FITNESS_METRICS = [
  "CP",
  "W_PRIME",
  "FTP",
  "MAX_HR",
  "RESTING_HR",
  "LTHR",
  "AET_HR",
  "CS",
  "TP",
  "AET_PACE",
  "VO2_MAX",
  "P_MAX",
] as const;
export type FitnessMetric = (typeof FITNESS_METRICS)[number];
export const FITNESS_SPORTS = ["RUN", "CYCLING", "SWIM", "UNKNOWN"] as const;
export type FitnessSport = (typeof FITNESS_SPORTS)[number];
export type FitnessScope =
  | { kind: "ACTIVITY"; activityHashId: string }
  | { kind: "DATE"; localDate: string }
  | { kind: "RECENT"; days?: number; asOf?: string };
export type FitnessStatus =
  | "ESTIMATED"
  | "OBSERVATION_ONLY"
  | "NEEDS_INPUT"
  | "WAITING_DATA"
  | "UNAVAILABLE"
  | "FAILED";
export type FitnessReason =
  | "SCOPE_UNSUPPORTED"
  | "AMBIGUOUS_SCOPE"
  | "TIMEZONE_REQUIRED"
  | "NO_MATCHING_ACTIVITY"
  | "MISSING_SIGNAL"
  | "QUALITY_REJECTED"
  | "PROTOCOL_UNKNOWN"
  | "PROTOCOL_MISMATCH"
  | "PROTOCOL_UNCONFIRMED"
  | "REFERENCE_REQUIRED"
  | "REFERENCE_CONFLICT"
  | "METHOD_UNAVAILABLE"
  | "EXECUTION_FAILED"
  | "RESOURCE_LIMIT"
  | "NON_CONVERGENCE"
  | "STALE"
  | "CONFIRMATION_REQUIRED";
export type FitnessCandidate = {
  /** VDOT is accepted only when rendering legacy artifacts. New results use VO2_MAX. */
  metric: FitnessMetric | "VDOT";
  value: number;
  unit: "bpm" | "W" | "J" | "m/s" | "s/km" | "ml/kg/min" | "index";
  currentValue: number | null;
  currentRecordedAt?: string | null;
  delta: number | null;
};
export type FitnessApplyOption = {
  id: string;
  sport: FitnessSport;
  effectiveDate: string;
  changes: FitnessCandidate[];
  proposalDigest: string;
  expiresAt: string;
};
export type FitnessAssessmentResult = {
  schemaVersion: 1;
  kind: "fitness_assessment_result";
  taskId: string;
  taskRevision: number;
  calculationId: string;
  sport: FitnessSport;
  requestedScope: FitnessScope;
  method: { id: string; version: string; policyVersion: string };
  status: FitnessStatus;
  reasonCode?: FitnessReason;
  candidates: FitnessCandidate[];
  observations: Array<{ metric: string; value: number; unit: string }>;
  evidence: {
    dailyRecordCount?: number;
    activityCount: number;
    readyCount: number;
    includedCount: number;
    truncated: boolean;
    from: string;
    to: string;
    latestEvidenceAt: string | null;
    activityHashIds: string[];
    candidateListTruncated?: boolean;
    activities?: Array<{ hashId: string; label: string }>;
    checks: Array<{
      code: string;
      passed: boolean;
      observed?: number;
      required?: number;
    }>;
    segment?: {
      activityHashId: string;
      startSeconds: number;
      endSeconds: number;
    };
  };
  preparationStatus?: "READY" | "NEEDS_INPUT" | "WAITING_DATA" | "UNAVAILABLE";
  application?: {
    actionId: string;
    appliedAt: string;
    refreshState: "PENDING" | "DONE";
  };
  timezone?: string;
  assessedAt: string;
  limitations: string[];
  nextActions: Array<
    | "ANSWER_PROTOCOL"
    | "SELECT_SEGMENT"
    | "WAIT"
    | "RETRY"
    | "RECOMPUTE"
    | "FIND_TEST"
    | "OFFER_WORKOUT"
    | "APPLY"
  >;
  applyOptions: FitnessApplyOption[];
  noMetricWrite: true;
};
export type FitnessConfirmation = {
  kind: "fitness_apply_confirmation";
  calculationId: string;
  applyOptionId: string;
  proposalDigest: string;
};
export type FitnessProtocolReply = {
  kind: "fitness_protocol_reply";
  calculationId: string;
  taskRevision: number;
  answer: "TEST" | "ORDINARY" | "SKIP";
};
export type FitnessTrackingReply = {
  kind: "fitness_tracking_reply";
  taskId: string;
  workoutId?: string;
  action: "START" | "STOP";
};
export function isFitnessResult(
  value: unknown,
): value is FitnessAssessmentResult {
  if (!value || typeof value !== "object") return false;
  const r = value as FitnessAssessmentResult;
  return (
    r.kind === "fitness_assessment_result" &&
    r.schemaVersion === 1 &&
    typeof r.calculationId === "string" &&
    typeof r.taskId === "string" &&
    Number.isInteger(r.taskRevision) &&
    FITNESS_SPORTS.includes(r.sport) &&
    [
      "ESTIMATED",
      "OBSERVATION_ONLY",
      "NEEDS_INPUT",
      "WAITING_DATA",
      "UNAVAILABLE",
      "FAILED",
    ].includes(r.status) &&
    Array.isArray(r.candidates) &&
    r.candidates.every(
      (c) =>
        c &&
        Number.isFinite(c.value) &&
        (c.metric === "VDOT" || FITNESS_METRICS.includes(c.metric)),
    ) &&
    Array.isArray(r.applyOptions) &&
    (r.status === "ESTIMATED" ||
      r.applyOptions.length === 0 ||
      (r.status === "OBSERVATION_ONLY" &&
        r.method?.id === "observed-max-hr" &&
        r.applyOptions.every(
          (o) =>
            Array.isArray(o.changes) &&
            o.changes.every((c) => c.metric === "MAX_HR"),
        ))) &&
    r.applyOptions.every(
      (o) =>
        o &&
        typeof o.id === "string" &&
        typeof o.effectiveDate === "string" &&
        Number.isFinite(Date.parse(o.expiresAt)) &&
        typeof o.proposalDigest === "string" &&
        Array.isArray(o.changes) &&
        o.changes.length > 0 &&
        o.changes.every((c) => Number.isFinite(c.value)),
    ) &&
    !!r.method &&
    typeof r.method.id === "string" &&
    typeof r.assessedAt === "string" &&
    Array.isArray(r.limitations) &&
    Array.isArray(r.observations) &&
    Array.isArray(r.nextActions) &&
    !!r.evidence &&
    Array.isArray(r.evidence.checks)
  );
}
export type FitnessUserAction =
  | FitnessConfirmation
  | FitnessProtocolReply
  | FitnessTrackingReply
  | {
      kind: "fitness_segment_reply";
      calculationId: string;
      activityHashId: string;
      startSeconds: number;
    }
  | { kind: "fitness_recompute"; calculationId: string; taskId?: string }
  | { kind: "fitness_workout_request"; taskId: string };
export function parseFitnessUserAction(
  value: unknown,
): FitnessUserAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = value as Record<string, unknown>;
  const id = (k: string) =>
    typeof x[k] === "string" &&
    (x[k] as string).length > 0 &&
    (x[k] as string).length < 256;
  switch (x.kind) {
    case "fitness_apply_confirmation":
      return id("calculationId") && id("applyOptionId") && id("proposalDigest")
        ? (x as unknown as FitnessConfirmation)
        : null;
    case "fitness_protocol_reply":
      return id("calculationId") &&
        Number.isInteger(x.taskRevision) &&
        Number(x.taskRevision) > 0 &&
        ["TEST", "ORDINARY", "SKIP"].includes(String(x.answer))
        ? (x as unknown as FitnessProtocolReply)
        : null;
    case "fitness_tracking_reply":
      return id("taskId") &&
        (x.action === "STOP" || (x.action === "START" && id("workoutId")))
        ? (x as unknown as FitnessTrackingReply)
        : null;
    case "fitness_segment_reply":
      return id("calculationId") &&
        id("activityHashId") &&
        typeof x.startSeconds === "number" &&
        Number.isFinite(x.startSeconds) &&
        x.startSeconds >= 0
        ? (x as unknown as FitnessUserAction)
        : null;
    case "fitness_recompute":
      return id("calculationId") ? (x as unknown as FitnessUserAction) : null;
    case "fitness_workout_request":
      return id("taskId") ? (x as unknown as FitnessUserAction) : null;
    default:
      return null;
  }
}
export function fitnessUserActionSchemas() {
  const id = { type: "string", minLength: 1, maxLength: 255 };
  const schema = (
    kind: string,
    properties: Record<string, unknown>,
    required = Object.keys(properties),
  ) => ({
    type: "object",
    additionalProperties: false,
    required: ["kind", ...required],
    properties: { kind: { const: kind }, ...properties },
  });
  return [
    schema("fitness_apply_confirmation", {
      calculationId: id,
      applyOptionId: id,
      proposalDigest: id,
    }),
    schema("fitness_protocol_reply", {
      calculationId: id,
      taskRevision: { type: "integer", minimum: 1 },
      answer: { enum: ["TEST", "ORDINARY", "SKIP"] },
    }),
    {
      ...schema(
        "fitness_tracking_reply",
        { taskId: id, workoutId: id, action: { enum: ["START", "STOP"] } },
        ["taskId", "action"],
      ),
      if: { properties: { action: { const: "START" } } },
      then: { required: ["workoutId"] },
    },
    schema("fitness_segment_reply", {
      calculationId: id,
      activityHashId: id,
      startSeconds: { type: "number", minimum: 0 },
    }),
    schema("fitness_recompute", { calculationId: id, taskId: id }, [
      "calculationId",
    ]),
    schema("fitness_workout_request", { taskId: id }),
  ];
}

export function fitnessNotificationTarget(
  item: { kind?: string; data?: unknown } | null,
) {
  if (
    item?.kind !== "FITNESS_ASSESSMENT" ||
    !item.data ||
    typeof item.data !== "object"
  )
    return null;
  const d = item.data as Record<string, unknown>;
  return typeof d.sessionId === "string" && d.sessionId
    ? {
        sid: d.sessionId,
        branchId: typeof d.branchId === "string" ? d.branchId : undefined,
      }
    : null;
}
/** Message keys only; localized copy belongs to the application messages catalogs. */
const FITNESS_MESSAGE_CODES = {
  limitations: [
    "PARTIAL_EVIDENCE",
    "CANDIDATE_LIST_LIMIT",
    "APPLICATION_NOT_ENABLED",
    "FIELD_ESTIMATE_NOT_LAB_MEASUREMENT",
    "USER_REPORTED_PROTOCOL",
    "ORDINARY_ACTIVITY_LTHR",
    "SOURCE_VERSION_UNVERIFIED",
    "DERIVED_ACTIVITY_PEAKS",
    "CYCLING_SPEED_ENVIRONMENT",
    "HR_WINDOW_AVERAGE",
    "TP_EMPIRICAL_OFFSET",
    "VDOT_NOT_LAB_VO2MAX",
    "DERIVED_ACTIVITY_ESTIMATES",
    "DAILY_HEALTH_MEDIAN",
    "OBSERVED_HR_NOT_MAXIMUM",
    "NO_VALIDATED_AEROBIC_METHOD",
    "USER_ADOPTED_ESTIMATE",
    "PREVIEW_METHOD",
    "RECORDED_PERFORMANCE_NOT_MAXIMAL_CAPACITY",
    "FTP_PRODUCT_MAPPING_095_UNVALIDATED",
  ],
  methods: [
    "lthr-activity-observation",
    "lthr-30-minute",
    "cycling-extended-cp",
    "running-extended-cp",
    "critical-speed",
    "running-5k-threshold-pace",
    "running-performance-vdot",
    "running-effective-vo2max",
    "observed-max-hr",
    "daily-resting-hr",
    "aerobic-threshold-unavailable",
  ],
  statuses: [
    "ESTIMATED",
    "OBSERVATION_ONLY",
    "NEEDS_INPUT",
    "WAITING_DATA",
    "UNAVAILABLE",
    "FAILED",
  ],
  checks: [
    "ORDERED_TIMESTAMPS",
    "FULL_COVERAGE",
    "TAIL_COVERAGE",
    "MAX_GAP_SECONDS",
    "NO_KNOWN_PAUSE",
    "FIT_CONVERGED",
    "INDEPENDENT_ACTIVITIES",
    "FIT_R_SQUARED",
    "OBSERVED_DURATIONS",
  ],
  observations: ["last20MinutesMeanHeartRate", "observedMaxHr", "dPrime"],
  sports: ["RUN", "CYCLING", "SWIM", "UNKNOWN"],
} as const;
export function fitnessMessageKey(
  group: keyof typeof FITNESS_MESSAGE_CODES,
  code: string,
) {
  return (FITNESS_MESSAGE_CODES[group] as readonly string[]).includes(code)
    ? group + "." + code
    : null;
}
export type FitnessTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;
export function fitnessCheckText(
  check: FitnessAssessmentResult["evidence"]["checks"][number],
  t: FitnessTranslator,
) {
  const key = fitnessMessageKey("checks", check.code);
  if (!key) return "";
  const amount =
    check.observed === undefined
      ? ""
      : check.code.includes("COVERAGE")
        ? " " + (check.observed * 100).toFixed(1) + "%"
        : " " + check.observed + (check.code === "MAX_GAP_SECONDS" ? "s" : "");
  return t("checkResult", {
    label: t(key),
    amount,
    status: t(check.passed ? "pass" : "notMet"),
  });
}
export function fitnessEvidenceSummary(
  evidence: FitnessAssessmentResult["evidence"],
  t: FitnessTranslator,
) {
  return evidence.dailyRecordCount !== undefined
    ? t("evidence.daily", { count: evidence.dailyRecordCount })
    : t("evidence.activities", {
        included: evidence.includedCount,
        total: evidence.activityCount,
      });
}
export function fitnessAdoptionMessageKey(result: FitnessAssessmentResult) {
  return result.applyOptions.some((o) =>
    o.changes.some((c) => c.metric === "MAX_HR"),
  )
    ? "adoption.maxHr"
    : "adoption.estimate";
}
export function fitnessDateTime(
  value: string,
  locale: string,
  timezone?: string,
) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

/** Product terminology: VO2_MAX is the canonical storage key for VDOT. */
export function fitnessMetricLabel(metric: FitnessCandidate["metric"]) {
  return metric === "VO2_MAX" || metric === "VDOT" ? "VDOT" : metric;
}
