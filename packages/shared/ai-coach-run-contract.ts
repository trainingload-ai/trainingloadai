/** Public execution history. Never put provider reasoning or raw tool output here. */
export type CoachRunStatus =
  | "running"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type CoachActivityStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "skipped";
export type CoachActivityKind =
  | "analysis"
  | "skill"
  | "tool"
  | "question"
  | "narration"
  | "artifact"
  | "recovery";

export type CoachRunMetadata = {
  schemaVersion: 2;
  runId: string;
  attemptId: string;
  parentAttemptId?: string;
};

export type CoachRunSnapshot = {
  runId: string;
  attemptId: string;
  messageId: string;
  revision: number;
  status: CoachRunStatus;
  startedAt: string;
  endedAt?: string;
  /** Includes prior attempts, excludes time waiting for the user. */
  previousExecutionMs: number;
  executionMs: number;
  pendingInteractionId?: string;
  retryBlocked?: boolean;
};

export type CoachActivity = {
  activityId: string;
  runId: string;
  attemptId: string;
  seq: number;
  revision: number;
  kind: CoachActivityKind;
  status: CoachActivityStatus;
  labelKey: string;
  toolName?: string;
  /** Canonical registry name only; never skill prompts or model arguments. */
  skillName?: string;
  startedAt?: string;
  endedAt?: string;
  toolCallId?: string;
  interactionId?: string;
  artifactId?: string;
  summary?: string;
  /** Deliberately authored public explanation, never provider reasoning_content. */
  publicSummary?: CoachPublicReasoningSummary;
  /** Retraction of an intermediate step; not an error or diagnostic payload. */
  display?: "hidden";
};

export type CoachPublicReasoningSummary = {
  source: "assistant_public_summary";
  text: string;
};

export const COACH_PUBLIC_SUMMARY_MAX_CHARS = 600;

export function isCoachPublicReasoningSummary(
  value: unknown,
): value is CoachPublicReasoningSummary {
  return (
    isRecord(value) &&
    value.source === "assistant_public_summary" &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    value.text.length <= COACH_PUBLIC_SUMMARY_MAX_CHARS &&
    Object.keys(value).every((key) => key === "source" || key === "text")
  );
}

export type CoachInteractionSnapshot = {
  interactionId: string;
  runId: string;
  questionMessageId: string;
  questionToolCallId: string;
  status: "pending" | "resolved" | "skipped";
  revision: number;
  submissionId?: string;
  answers?: Record<string, string | string[]>;
  notes?: Record<string, string>;
  skippedQuestionIds?: string[];
};

export type CoachTextSegment = {
  segmentId: string;
  modelStepId: string;
  textOrdinal: number;
  placement: "pending" | "activity" | "answer";
};

export type CoachRunDataParts = {
  "coach-run": CoachRunSnapshot;
  "coach-activity": CoachActivity;
  "coach-interaction": CoachInteractionSnapshot;
  "coach-text-segment": CoachTextSegment;
};

/** Internal lifecycle notification. Diagnostic fields never enter public parts. */
export type CoachActivityEvent = {
  key: string;
  kind: CoachActivityKind;
  status: CoachActivityStatus;
  labelKey: string;
  toolName?: string;
  skillName?: string;
  toolCallId?: string;
  mutation?: boolean;
  at?: string;
  publicSummary?: CoachPublicReasoningSummary;
  failure?: { stage: string; code: string };
};

export type CoachRunCommand =
  | { kind: "start"; requestId: string }
  | {
      kind: "answer";
      requestId: string;
      runId: string;
      interactionId: string;
      submissionId: string;
    }
  | { kind: "retry"; requestId: string; runId: string; attemptId: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9:_.-]{1,160}$/.test(value);
const natural = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const optional = (value: unknown, validate: (value: unknown) => boolean) =>
  value === undefined || validate(value);

export function parseCoachRunCommand(value: unknown): CoachRunCommand | null {
  if (!isRecord(value) || !validId(value.requestId)) return null;
  if (value.kind === "start")
    return { kind: "start", requestId: value.requestId };
  if (!validId(value.runId)) return null;
  if (
    value.kind === "answer" &&
    validId(value.interactionId) &&
    validId(value.submissionId)
  ) {
    return {
      kind: "answer",
      requestId: value.requestId,
      runId: value.runId,
      interactionId: value.interactionId,
      submissionId: value.submissionId,
    };
  }
  if (value.kind === "retry" && validId(value.attemptId)) {
    return {
      kind: "retry",
      requestId: value.requestId,
      runId: value.runId,
      attemptId: value.attemptId,
    };
  }
  return null;
}

export const COACH_RUN_STATUSES: readonly CoachRunStatus[] = [
  "running",
  "awaiting_input",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
];

export function isCoachRunSnapshot(value: unknown): value is CoachRunSnapshot {
  return (
    isRecord(value) &&
    validId(value.runId) &&
    validId(value.attemptId) &&
    validId(value.messageId) &&
    natural(value.revision) &&
    COACH_RUN_STATUSES.includes(value.status as CoachRunStatus) &&
    timestamp(value.startedAt) &&
    optional(value.endedAt, timestamp) &&
    optional(value.pendingInteractionId, validId) &&
    optional(value.retryBlocked, (v) => typeof v === "boolean") &&
    natural(value.executionMs) &&
    natural(value.previousExecutionMs)
  );
}

export function isCoachRunMetadata(value: unknown): value is CoachRunMetadata {
  return (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    validId(value.runId) &&
    validId(value.attemptId) &&
    optional(value.parentAttemptId, validId)
  );
}

export function isCoachActivity(value: unknown): value is CoachActivity {
  return (
    isRecord(value) &&
    validId(value.activityId) &&
    validId(value.runId) &&
    validId(value.attemptId) &&
    natural(value.seq) &&
    natural(value.revision) &&
    [
      "analysis",
      "skill",
      "tool",
      "question",
      "narration",
      "artifact",
      "recovery",
    ].includes(String(value.kind)) &&
    [
      "queued",
      "running",
      "waiting",
      "completed",
      "failed",
      "cancelled",
      "interrupted",
      "skipped",
    ].includes(String(value.status)) &&
    typeof value.labelKey === "string" &&
    optional(value.display, (v) => v === "hidden") &&
    optional(
      value.publicSummary,
      (summary) =>
        value.kind === "analysis" && isCoachPublicReasoningSummary(summary),
    ) &&
    optional(value.startedAt, timestamp) &&
    optional(value.endedAt, timestamp) &&
    [
      value.toolName,
      value.skillName,
      value.toolCallId,
      value.interactionId,
      value.artifactId,
      value.summary,
    ].every((v) => optional(v, (s) => typeof s === "string"))
  );
}

export function isCoachInteraction(
  value: unknown,
): value is CoachInteractionSnapshot {
  return (
    isRecord(value) &&
    validId(value.interactionId) &&
    validId(value.runId) &&
    validId(value.questionMessageId) &&
    validId(value.questionToolCallId) &&
    ["pending", "resolved", "skipped"].includes(String(value.status)) &&
    natural(value.revision) &&
    optional(value.submissionId, validId) &&
    optional(
      value.answers,
      (v) =>
        isRecord(v) &&
        Object.values(v).every(
          (a) =>
            typeof a === "string" ||
            (Array.isArray(a) && a.every((s) => typeof s === "string")),
        ),
    ) &&
    optional(
      value.notes,
      (v) =>
        isRecord(v) && Object.values(v).every((s) => typeof s === "string"),
    ) &&
    optional(
      value.skippedQuestionIds,
      (v) => Array.isArray(v) && v.every(validId),
    )
  );
}

export function isCoachTextSegment(value: unknown): value is CoachTextSegment {
  return (
    isRecord(value) &&
    validId(value.segmentId) &&
    validId(value.modelStepId) &&
    natural(value.textOrdinal) &&
    ["pending", "activity", "answer"].includes(String(value.placement))
  );
}

export const coachRunPartValidators = {
  "data-coach-run": isCoachRunSnapshot,
  "data-coach-activity": isCoachActivity,
  "data-coach-interaction": isCoachInteraction,
  "data-coach-text-segment": isCoachTextSegment,
};

export function isValidCoachRunPart(part: unknown): boolean {
  if (!isRecord(part) || typeof part.type !== "string") return false;
  const validate =
    coachRunPartValidators[part.type as keyof typeof coachRunPartValidators];
  return !validate || validate(part.data);
}

export const COACH_RUN_PART_TYPES = new Set([
  "data-coach-run",
  "data-coach-activity",
  "data-coach-interaction",
  "data-coach-text-segment",
]);
