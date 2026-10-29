import type {
  CoachAssistantToolData,
  CoachUiMessage,
} from "@/lib/ai-coach-ui-parts";
import { normalizeCoachRenderableToolName } from "./coach-conversation-items";
import {
  isCoachRunMetadata,
  isRecord,
  type CoachInteractionSnapshot,
} from "@shared/ai-coach-run-contract";

function equalRecord(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => JSON.stringify(left[key]) === JSON.stringify(right[key]),
    )
  );
}

export function runSnapshot(message: CoachUiMessage) {
  return message.parts.find((part) => part.type === "data-coach-run")?.data;
}

/**
 * A recovered tool attempt remains available inside the collapsed trace, but
 * must not be promoted as a turn-level failure after the run completed.
 */
export function shouldPinFailedActivity(input: {
  open: boolean;
  runStatus: string;
  activityStatus: string;
}) {
  return (
    !input.open &&
    ["failed", "interrupted"].includes(input.runStatus) &&
    ["failed", "interrupted"].includes(input.activityStatus)
  );
}

// Evidence belongs to its execution. Deliverables and confirmation actions stay
// outside the collapsed process, even when they also originated in a tool.
const TIMELINE_EVIDENCE = new Set([
  "PlanDayView",
  "ActivityRecent",
  "ActivityDayView",
  "PmcRange",
  "ProfileZones",
  "ProfileZoneRanges",
  "CompetitionEvents",
]);

export function coachActivityResults(message: CoachUiMessage) {
  const results = new Map<string, CoachAssistantToolData>();
  const metadata = message.metadata;
  if (!isCoachRunMetadata(metadata) || !runSnapshot(message)) return results;
  const tools = new Map(
    message.parts.flatMap((part) => {
      if (part.type !== "data-coach-tool") return [];
      const name = normalizeCoachRenderableToolName(part.data.name);
      return name && TIMELINE_EVIDENCE.has(name)
        ? [[part.data.toolCallId, { ...part.data, name }] as const]
        : [];
    }),
  );
  const claimed = new Set<string>();
  for (const part of message.parts) {
    if (part.type !== "data-coach-activity") continue;
    const activity = part.data;
    if (
      activity.kind !== "tool" ||
      activity.display === "hidden" ||
      activity.runId !== metadata.runId ||
      activity.attemptId !== metadata.attemptId ||
      !activity.toolCallId ||
      claimed.has(activity.toolCallId)
    )
      continue;
    const tool = tools.get(activity.toolCallId);
    if (tool) {
      results.set(activity.activityId, tool);
      claimed.add(activity.toolCallId);
    }
  }
  return results;
}

export function coachInteractionIndex(messages: readonly CoachUiMessage[]) {
  const index = new Map<string, CoachInteractionSnapshot>();
  for (const message of messages)
    for (const part of message.parts) {
      if (part.type !== "data-coach-interaction") continue;
      const previous = index.get(part.data.interactionId);
      if (!previous || previous.revision < part.data.revision)
        index.set(part.data.interactionId, part.data);
    }
  return index;
}

export type CoachTranscriptGroup = {
  key: string;
  runId?: string;
  resumed: boolean;
  messages: CoachUiMessage[];
};

/** Only contiguous runs merge. Intervening user tasks are never reordered. */
export function groupCoachTranscript(
  messages: readonly CoachUiMessage[],
): CoachTranscriptGroup[] {
  const receipts = coachInteractionIndex(messages);
  const accepted = new Map(
    [...receipts.values()]
      .filter((item) => item.status !== "pending")
      .map((item) => [item.submissionId, item]),
  );
  const groups: CoachTranscriptGroup[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role === "user") {
      if (message.parts.length === 0) continue; // retry control, never a chat bubble
      if (
        !message.parts.some(
          (part) => part.type === "text" && part.text.trim(),
        ) &&
        message.parts.some(
          (part) =>
            part.type === "data-coach-user-tool-result" &&
            isRecord(part.data.content) &&
            [
              "coach_plan_draft_saved",
              "plan_workout_adjustment_applied",
            ].includes(String(part.data.content.kind)),
        )
      )
        continue; // Keep receipt data in state, without creating an empty user bubble.
      const answer = message.parts.find(
        (part) =>
          part.type === "data-coach-user-tool-result" &&
          isRecord(part.data.content) &&
          ["coach_question_reply", "coach_question_skip"].includes(
            String(part.data.content.kind),
          ),
      );
      if (
        answer?.type === "data-coach-user-tool-result" &&
        isRecord(answer.data.content)
      ) {
        const reply = answer.data.content;
        // Live SDK user identity and persisted server input identity differ; the
        // source question plus accepted payload identifies the same receipt.
        const receipt = [...accepted.values()].find(
          (item) =>
            item.questionMessageId === reply.repliesToAssistantMessageId &&
            item.questionToolCallId === reply.questionToolUseId &&
            item.status ===
              (reply.kind === "coach_question_skip" ? "skipped" : "resolved") &&
            equalRecord(item.answers ?? {}, reply.answers ?? {}) &&
            equalRecord(item.notes ?? {}, reply.notes ?? {}),
        );
        if (receipt) continue;
      }
    }
    const runId = isCoachRunMetadata(message.metadata)
      ? message.metadata.runId
      : undefined;
    const previous = groups.at(-1);
    if (runId && previous?.runId === runId) previous.messages.push(message);
    else {
      groups.push({
        key: message.id,
        runId,
        resumed: Boolean(runId && seen.has(runId)),
        messages: [message],
      });
      if (runId) seen.add(runId);
    }
  }
  return groups;
}
