export type PlanTemplateCoachReminderReasonDetail = {
  code: string;
  actual: number;
  required: number;
  unit:
    | "weeks"
    | "runs_per_week"
    | "minutes"
    | "meters"
    | "meters_per_week"
    | "ml_kg_min"
    | "seconds"
    | "days";
};

export type PlanTemplateCoachReminderOption = {
  reasonCodes: readonly string[];
  missingInputs: readonly string[];
  reasonDetails?: readonly PlanTemplateCoachReminderReasonDetail[];
};

export type PlanTemplateCoachReminderReason =
  | { kind: "capabilityRequired" }
  | {
      kind: "reason";
      code: string;
      detail?: PlanTemplateCoachReminderReasonDetail;
    }
  | { kind: "genericRequirement" };

const supportedReasonCodes = new Set([
  "GOAL_NOT_SUPPORTED",
  "TEN_K_BASELINE_REQUIRED",
  "HALF_MARATHON_BASELINE_REQUIRED",
  "MARATHON_LONG_RUN_REQUIRED",
  "VO2_MAX_BELOW_SUPPORTED_RANGE",
  "VO2_MAX_LOW_FOR_LONG_DISTANCE",
  "PLAN_PERIOD_TOO_SHORT",
]);

/**
 * Normalizes API eligibility reasons before they reach either client UI.
 * Unknown backend rules collapse into one fallback instead of repeating the
 * same generic sentence for every rule code.
 */
export function selectPlanTemplateCoachReminderReasons(
  option: PlanTemplateCoachReminderOption,
): PlanTemplateCoachReminderReason[] {
  const selected: PlanTemplateCoachReminderReason[] = [];
  if (option.missingInputs.includes("currentCapability")) {
    selected.push({ kind: "capabilityRequired" });
  }

  const details = new Map(
    (option.reasonDetails ?? []).map((detail) => [detail.code, detail]),
  );
  let hasUnknownReason = false;
  for (const code of new Set(option.reasonCodes)) {
    if (!supportedReasonCodes.has(code)) {
      hasUnknownReason = true;
      continue;
    }
    selected.push({ kind: "reason", code, detail: details.get(code) });
  }

  if (hasUnknownReason && selected.length === 0) {
    selected.push({ kind: "genericRequirement" });
  }
  return selected;
}
