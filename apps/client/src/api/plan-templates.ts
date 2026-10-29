import { apiFetch } from "@/lib/api";
import type { WorkoutDefinitionInput } from "@shared/workout-structure";

export type RunPlanTemplateGoal = "5K" | "10K" | "HALF_MARATHON" | "MARATHON";
export type PlanTemplateOutcome = "FINISH" | "IMPROVE" | "TARGET";

export type PlanTemplateCoachFlow = {
  runtimeAiCalled: false;
  aiTokensConsumed: false;
  title: string;
  summary: string;
  stages: Array<{
    id: "TRACK" | "ASSESS" | "ADJUST";
    title: string;
    description: string;
  }>;
};

export type PlanTemplateIntensityGuidance = {
  basis: string;
  rpe: { min: number; max: number; display: string };
  talkTest: string;
  summary: string;
  pace?: {
    fastSecPerKm: number;
    slowSecPerKm: number;
    display: string;
    zoneLabel?: string;
    zoneSystem?: string;
    source: string;
  };
};

export type PlanTemplateCard = {
  key: string;
  version: string;
  slug: string;
  goal: RunPlanTemplateGoal;
  outcome: PlanTemplateOutcome | null;
  methodId: string | null;
  copyVersion: string;
  publicExample: { id: string; vdot: number; resolverVersion: string } | null;
  capabilityRequirements: string[];
  intensityMode:
    | "PACE_RANGE_WITH_RPE_FALLBACK"
    | "RPE_WITH_OPTIONAL_PERSONAL_PACE";
  contentHash: string;
  title: string;
  description: string;
  eligibility: string;
  promise: string;
  periodWeeks: number;
  trainingDaysPerWeek: number;
  availableVariants: Array<{ id: string; periodWeeks: number }>;
};

export type PlanTemplateDetail = PlanTemplateCard & {
  variantId: string;
  coachFlow: PlanTemplateCoachFlow;
  weeks: Array<{
    weekIndex: number;
    phase: string;
    title: string;
    description: string;
    workouts: Array<{
      semanticId: string;
      slotIndex: number;
      quality: boolean;
      intensityKind: string;
      plannedRpe: number;
      plannedRpeRange: { min: number; max: number };
      intensityGuidance: PlanTemplateIntensityGuidance;
      name: string;
      notes: string;
      definition: WorkoutDefinitionInput;
    }>;
  }>;
};

export type PlanTemplateEligibilityStatus =
  | "ELIGIBLE"
  | "ELIGIBLE_WITH_WARNING"
  | "ELIGIBLE_RPE_FALLBACK"
  | "INPUT_REQUIRED"
  | "NOT_ELIGIBLE";

export type PlanTemplateEligibilityOption = {
  slug: string;
  status: PlanTemplateEligibilityStatus;
  reasonCodes: string[];
  missingInputs: string[];
  reasonDetails?: Array<{
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
  }>;
};

export type PlanTemplateRecommendation = {
  recommendation: {
    slug: string;
    variantId: string;
    reasonCode?: string;
    reasons?: string[];
    status?: PlanTemplateEligibilityStatus;
  } | null;
  baseline?: {
    personalizationReadiness: "none" | "sparse" | "adequate";
    activityCount: number;
    activeDaysPerWeek: number;
    validWeeks?: number;
    medianRunsPerWeek?: number;
    medianDistanceMetersPerWeek?: number;
    latestWeekDurationMinutes?: number;
    longestRunDistanceMeters?: number | null;
    longestContinuousRunMinutes: number | null;
    recent5kSeconds: number | null;
  };
  reasonCode?: string;
  reasons?: string[];
  alternatives: string[];
  options?: PlanTemplateEligibilityOption[];
  capability?: {
    state: "AVAILABLE" | "MISSING" | "STALE" | "CONFLICTING";
    vdot?: number | null;
    vo2Max?: number | null;
    source?: "PUBLIC_EXAMPLE" | "VO2_MAX" | "RECENT_RACE" | "TP" | "CS" | null;
    sourceRecordedAt?: string | null;
  };
};

export type PlanTemplatePreview = {
  previewToken: string;
  expiresAt: string;
  startDate: string;
  template: PlanTemplateDetail;
  draft: {
    title: string;
    description: string;
    periodWeeks: number;
    workouts: Array<{
      weekIndex: number;
      dayIndex: number;
      name: string;
      notes: string;
      definition: WorkoutDefinitionInput;
    }>;
  };
  calendar: Array<{
    workoutIndex: number;
    weekIndex: number;
    dayIndex: number;
    date: string;
    name: string;
  }>;
  capability?: PlanTemplateRecommendation["capability"];
};

export async function listPlanTemplates(
  goal: RunPlanTemplateGoal,
  locale: string,
) {
  return apiFetch<{ templates: PlanTemplateCard[] }>(
    `/public/plan-templates?goal=${goal}&locale=${encodeURIComponent(locale)}`,
  );
}

export async function getPlanTemplate(
  slug: string,
  locale: string,
  variantId?: string,
) {
  const params = new URLSearchParams({ locale });
  if (variantId) params.set("variantId", variantId);
  return apiFetch<{
    template: PlanTemplateDetail;
    capability: PlanTemplateRecommendation["capability"] | null;
  }>(`/plan-templates/${encodeURIComponent(slug)}?${params.toString()}`);
}

export async function getPlanTemplateRecommendation(goal: RunPlanTemplateGoal) {
  return apiFetch<PlanTemplateRecommendation>(
    `/plan-templates/recommendation?goal=${goal}`,
  );
}

export async function createPlanTemplatePreview(
  slug: string,
  input: {
    startDate: string;
    preferredWeekdays: number[];
    locale: string;
    variantId?: string;
    longRunWeekday?: number;
    targetRaceEventId?: string;
  },
) {
  return apiFetch<PlanTemplatePreview>(
    `/plan-templates/${encodeURIComponent(slug)}/previews`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function instantiatePlanTemplate(
  slug: string,
  previewToken: string,
) {
  return apiFetch<{
    plan: { id: string; title: string; status: "DRAFT" };
    reused: boolean;
  }>(`/plan-templates/${encodeURIComponent(slug)}/instantiate`, {
    method: "POST",
    body: JSON.stringify({ previewToken }),
  });
}
