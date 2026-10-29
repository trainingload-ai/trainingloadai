import type { WorkoutIntensityIntent } from "./endurance-workout-ir";

export type PlanProposalMode = "ADAPT" | "SUPERSEDE";
export type PlanAdaptationScope = "WORKOUT" | "PLAN_REMAINING";
export type PlanAssessmentDisposition = "APPLY" | "PRESERVE";
export type PlanTargetDimension = "PACE" | "HEART_RATE" | "POWER";

export type PlanProposalEvidenceRef = {
  type: string;
  label: string;
  value?: string | number | null;
};

export type PlanAssessmentGroup = {
  workoutIds: string[];
  disposition: PlanAssessmentDisposition;
  intent: WorkoutIntensityIntent;
  targetDimension: PlanTargetDimension;
  zoneIndex?: number | null;
  fixedTarget?: {
    low: number;
    high?: number;
    unit: "SECONDS" | "KMH" | "BPM" | "WATTS";
    source: string;
    protocolSpecific: boolean;
  } | null;
  auxiliaryRpe?: { low: number; high?: number } | null;
  rationale: string;
  evidenceRefs: PlanProposalEvidenceRef[];
};

export type PlanAdaptationPreviewRequest = {
  mode: "ADAPT";
  planId: string;
  scope: PlanAdaptationScope;
  assessmentGroups: PlanAssessmentGroup[];
};

export type PlanReplacementWorkoutDraft = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  sportType: "RUN" | "CYCLING" | "SWIM";
  sportDefinitionCode?: string | null;
  name?: string;
  notes?: string;
  text: string;
  plannedSessionRpe?: number;
};

export type PlanReplacementDraft = {
  title: string;
  description?: string;
  goal?: string;
  periodWeeks: number;
  workouts: PlanReplacementWorkoutDraft[];
};

export type PlanSupersessionPreviewRequest = {
  mode: "SUPERSEDE";
  sourcePlanId: string;
  effectiveFrom: string;
  rationale: string;
  evidenceRefs: PlanProposalEvidenceRef[];
  plan: PlanReplacementDraft;
};

export type PlanProposalPreviewRequest =
  | PlanAdaptationPreviewRequest
  | PlanSupersessionPreviewRequest;

export type PlanProposalPresentationRow = {
  workoutId?: string;
  name: string;
  scheduledDate?: string | null;
  sportType: string;
  disposition: PlanAssessmentDisposition;
  before: string;
  after: string;
  rationale: string;
};

export type PlanProposalPresentation = {
  title: string;
  summary: string;
  mode: PlanProposalMode;
  effectiveFrom?: string;
  facts: PlanProposalEvidenceRef[];
  counts: {
    total: number;
    changed: number;
    preserved: number;
    skipped: number;
  };
  estimatedLoadDelta?: number | null;
  syncImpact: string;
  rows: PlanProposalPresentationRow[];
  warnings: string[];
};

export type PlanProposalPreviewResult = {
  kind: "plan_proposal_preview";
  previewId: string;
  mode: PlanProposalMode;
  expiresAt: string;
  decisionType: "PLAN_ADAPTATION" | "PLAN_SUPERSESSION";
  decisionPayload: {
    planId: string;
    previewId: string;
    presentation: PlanProposalPresentation;
  };
  presentation: PlanProposalPresentation;
};
