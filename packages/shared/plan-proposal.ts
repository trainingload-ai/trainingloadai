import type { RollingStartSettings } from "./rolling-plan";
import type {
  ScheduleConstraints,
  ScheduleQualityContractTransition,
  ScheduleRulePeriod,
} from "./plan-calendar";
import type { CoachPlanDraftData } from "./ai-coach-schema";
import type { WorkoutDefinitionInput } from "./workout-structure";
import type { WorkoutIntensityIntent } from "./endurance-workout-ir";
import type { PlanQualityContract } from "./plan-quality";

export type PlanProposalMode = "ADAPT" | "SUPERSEDE" | "START" | "SCHEDULE";
export type PlanCalendarMoveInput = {
  targetDate: string;
  expectedRevision: number;
};

export type PlanCalendarEditWorkout = {
  sportType: string;
  sportDefinitionCode?: string | null;
  name?: string | null;
  notes?: string | null;
  definition: WorkoutDefinitionInput;
};

export type PlanCalendarEdit =
  | { kind: "ADD"; candidateKey: string; targetDate: string; workout: PlanCalendarEditWorkout }
  | { kind: "UPDATE"; workoutId: string; expectedRevision: number; targetDate: string; workout?: PlanCalendarEditWorkout }
  | { kind: "DELETE"; workoutId: string; expectedRevision: number };

export type PlanCalendarEditsInput = {
  batchId: string;
  edits: PlanCalendarEdit[];
};

export type ReviseCalendarAdjustmentInput = Pick<PlanCalendarEditsInput, "edits"> & {
  confirmationId: string;
};

export type CalendarMoveWeekTotals = {
  sessions: number;
  trainingDays: number;
  durationMinutes: number | null;
  estimatedLoad: number | null;
};

export type CalendarAdjustmentWeek = {
  weekStart: string;
  before: CalendarMoveWeekTotals;
  after: CalendarMoveWeekTotals;
};

export type PlanCalendarMoveImpact = {
  workoutId: string;
  from: string;
  to: string;
  reasons: Array<
    | "WEEKLY_DISTRIBUTION_CHANGED"
    | "ADJACENT_TRAINING_CHANGED"
    | "CALENDAR_CONFLICT"
  >;
  weeks: CalendarAdjustmentWeek[];
};

export type PlanCalendarMoveReceipt = {
  previewId: string;
  planId: string;
  readbackVerified: true;
  deletedWorkoutIds?: string[];
  identityMap: Array<{
    workoutId: string;
    scheduledDate: string;
    revision: number;
  }>;
};

export const PlanCalendarMoveState = {
  Pending: "PENDING",
  Applied: "APPLIED",
  Cancelled: "CANCELLED",
  Expired: "EXPIRED",
  Invalidated: "INVALIDATED",
} as const;
export type PlanCalendarMoveState =
  (typeof PlanCalendarMoveState)[keyof typeof PlanCalendarMoveState];

export type PlanCalendarMovePreview = {
  previewId: string;
  planId?: string;
  expiresAt: string;
  state: PlanCalendarMoveState;
  requiresCoachConfirmation?: true;
  confirmationId?: string;
  impact: PlanCalendarMoveImpact;
  presentation: PlanProposalPresentation;
  receipt: PlanCalendarMoveReceipt | null;
};
export type PlanCalendarMoveRefreshResult =
  | { status: "refreshed"; preview: PlanCalendarMovePreview }
  | { status: "alreadyApplied" | "discarded" | "datesPassed" | "scheduleChanged" };

export type PlanCalendarCoachSession = {
  sid: string;
  planId: string;
  previewId: string;
  impact: PlanCalendarMoveImpact;
  range: { from: string; to: string };
  branchId?: string;
  expired?: true;
};
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
  rolling?: RollingStartSettings;
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

export type PlanSchedulePreviewRequest = Omit<
  PlanStartPreviewRequest,
  "mode" | "startDate"
> & {
  mode: "SCHEDULE";
  range: { from: string; to: string };
  calendarAdjustment?: { id: string; baseVersionId: string };
};

export type PlanProposalPreviewRequest =
  | PlanAdaptationPreviewRequest
  | PlanSupersessionPreviewRequest
  | PlanStartPreviewRequest
  | PlanSchedulePreviewRequest;

export type PlanProposalPresentationRow = {
  candidateKey?: string;
  beforeName?: string;
  beforeScheduledDate?: string;
  protectedReason?: string;
  changeKind?: "CHANGED" | "ADDED" | "DELETED" | "PRESERVED";
  workoutId?: string;
  sourceRevision?: number;
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
  calendarMoveImpact?: PlanCalendarMoveImpact;
  calendarMoveOnly?: true;
  calendarAdjustmentWeeks?: CalendarAdjustmentWeek[];
  calendarDraftStartDate?: string;
  rolling?: RollingStartSettings & {
    generatedFrom: string;
    generatedThrough: string;
  };
  scheduleRulePeriods?: ScheduleRulePeriod[];
  qualityContract?: PlanQualityContract;
  relatedCalendarConflicts?: RelatedCalendarConflict[];
  title: string;
  summary: string;
  mode: PlanProposalMode;
  range?: { from: string; to: string };
  effectiveFrom?: string;
  startDate?: string;
  calendarTimeZone?: string;
  scheduleConstraints?: ScheduleConstraints;
  calendarDraft?: Omit<CoachPlanDraftData, "workouts"> & {
    workouts: Array<CoachPlanDraftData["workouts"][number] & { sourceWorkoutId?: string; candidateKey?: string }>;
  };
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
  decisionType:
    | "PLAN_ADAPTATION"
    | "PLAN_SUPERSESSION"
    | "PLAN_START"
    | "PLAN_SCHEDULE";
  decisionPayload: {
    planId: string;
    previewId: string;
    calendarAdjustmentId?: string;
    presentation: PlanProposalPresentation;
  };
  presentation: PlanProposalPresentation;
};

export const CalendarAdjustmentState = {
  Ready: "READY",
  Stale: "STALE",
  Expired: "EXPIRED",
  Invalidated: "INVALIDATED",
  Superseded: "SUPERSEDED",
  Discarded: "DISCARDED",
  Applied: "APPLIED",
} as const;

export type CalendarAdjustmentState =
  (typeof CalendarAdjustmentState)[keyof typeof CalendarAdjustmentState];

export type CalendarAdjustmentReceipt = {
  planId: string;
  versionId: string;
  readbackVerified: true;
  changedWorkoutCount: number;
  addedWorkoutCount: number;
  deletedWorkoutCount: number;
};

export type CalendarAdjustment = {
  id: string;
  planId: string;
  versionId: string;
  currentVersionId: string;
  decisionId?: string | null;
  isVersioned: boolean;
  state: CalendarAdjustmentState;
  expiresAt: string;
  presentation: PlanProposalPresentation;
  conflicts: Array<{ key: string; reason: string }>;
  operationKeys: string[];
  receipt: CalendarAdjustmentReceipt | null;
};
