import type {
  ScheduleConstraints,
  ScheduleQualityContractTransition,
} from "./plan-calendar";
import type { CoachPlanDraftData } from "./ai-coach-schema";
import type { WorkoutDefinitionInput } from "./workout-structure";
import type { WorkoutIntensityIntent } from "./endurance-workout-ir";

export type PlanProposalMode = "ADAPT" | "SUPERSEDE" | "START" | "SCHEDULE";
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

export type PlanStartWorkoutDraft = {
  plannedSessionRpe?: number;
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  sportType: string;
  sportDefinitionCode?: string | null;
  name?: string;
  notes?: string;
  text?: string;
  definition?: WorkoutDefinitionInput;
};

export type PlanStartPreviewRequest = {
  mode: "START";
  planId: string;
  startDate: string;
  rationale: string;
  evidenceRefs: PlanProposalEvidenceRef[];
  scheduleConstraints?: ScheduleConstraints;
  qualityContractTransition?: ScheduleQualityContractTransition;
  changes: Array<{
    sourceWorkoutId: string;
    expectedRevision: number;
    workout: PlanStartWorkoutDraft;
  }>;
  additions: Array<{ candidateKey: string; workout: PlanStartWorkoutDraft }>;
  deletions: Array<{ sourceWorkoutId: string; expectedRevision: number }>;
  /** The server expands every unmentioned source workout into an explicit preserved identity. */
  preserveUnmentioned?: boolean;
  preserved?: Array<{ sourceWorkoutId: string; expectedRevision: number }>;
};

export type PlanSchedulePreviewRequest = Omit<PlanStartPreviewRequest, "mode" | "startDate"> & {
  mode: "SCHEDULE";
  range: { from: string; to: string };
};

export type PlanProposalPreviewRequest =
  | PlanAdaptationPreviewRequest
  | PlanSupersessionPreviewRequest
  | PlanStartPreviewRequest
  | PlanSchedulePreviewRequest;

export type PlanProposalPresentationRow = {
  protectedReason?: string;
  changeKind?: "CHANGED" | "ADDED" | "DELETED" | "PRESERVED";
  workoutId?: string;
  name: string;
  scheduledDate?: string | null;
  sportType: string;
  disposition: PlanAssessmentDisposition;
  before: string;
  after: string;
  rationale: string;
};

export type RelatedCalendarConflict = {
  code: string;
  date: string;
  workoutId: string;
  planId: string | null;
  name?: string | null;
  managed: false;
};

export type PlanProposalPresentation = {
  relatedCalendarConflicts?: RelatedCalendarConflict[];
  title: string;
  summary: string;
  mode: PlanProposalMode;
  range?: { from: string; to: string };
  effectiveFrom?: string;
  startDate?: string;
  calendarTimeZone?: string;
  scheduleConstraints?: ScheduleConstraints;
  calendarDraft?: CoachPlanDraftData;
  facts: PlanProposalEvidenceRef[];
  counts: {
    total: number;
    changed: number;
    preserved: number;
    skipped: number;
    protected?: number;
    added?: number;
    deleted?: number;
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
  decisionType: "PLAN_ADAPTATION" | "PLAN_SUPERSESSION" | "PLAN_START" | "PLAN_SCHEDULE";
  decisionPayload: {
    planId: string;
    previewId: string;
    presentation: PlanProposalPresentation;
  };
  presentation: PlanProposalPresentation;
};
