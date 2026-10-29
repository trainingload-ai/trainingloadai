import type { UIMessage } from "ai";
import {
  safeParseCoachPlanDraftSavedToolResultPayload,
  safeParseCoachQuestionReplyLikeToolResultPayload,
  safeParsePlanWorkoutAdjustmentAppliedToolResultPayload,
  type CoachPlanDraftSavedToolResultPayload,
  type CoachQuestionReplyLikeToolResultPayload,
  type PlanWorkoutAdjustmentAppliedToolResultPayload,
} from "@shared/ai-coach-schema";
import type {
  CoachUiMessageMetadata,
  CoachUserToolResultBlock,
} from "@/lib/ai-coach-stream";

export type CoachQuestionReplyToolResultPayload =
  CoachQuestionReplyLikeToolResultPayload;
export type { CoachPlanDraftSavedToolResultPayload };
export type { PlanWorkoutAdjustmentAppliedToolResultPayload };
export type CoachMessageUiMetadata = CoachUiMessageMetadata;

function getCoachMessageContent(m: UIMessage): unknown[] {
  const meta = m.metadata as CoachUiMessageMetadata | undefined;
  const content = meta?.coachMessage?.content;
  return Array.isArray(content) ? content : [];
}

export function getCoachToolUseBlocks(m: UIMessage): Array<{
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}> {
  return getCoachMessageContent(m).filter(
    (
      block,
    ): block is {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
    } => {
      if (!block || typeof block !== "object" || Array.isArray(block))
        return false;
      const b = block as Record<string, unknown>;
      return (
        b.type === "tool_use" &&
        typeof b.id === "string" &&
        typeof b.name === "string"
      );
    },
  );
}

export function getCoachToolResultBlocks(
  m: UIMessage,
): CoachUserToolResultBlock[] {
  return getCoachMessageContent(m).filter(
    (block): block is CoachUserToolResultBlock => {
      if (!block || typeof block !== "object" || Array.isArray(block))
        return false;
      const b = block as Record<string, unknown>;
      return b.type === "tool_result" && typeof b.tool_use_id === "string";
    },
  );
}

export function getCoachPlanDraftSavedAckFromUserMessage(
  m: UIMessage,
): { repliesToAssistantMessageId: string } | null {
  if (m.role !== "user") return null;
  for (const block of getCoachToolResultBlocks(m)) {
    const parsed = safeParseCoachPlanDraftSavedToolResultPayload(block.content);
    if (!parsed) continue;
    return { repliesToAssistantMessageId: parsed.repliesToAssistantMessageId };
  }
  return null;
}

export function buildCoachQuestionRepliesByAssistantId(
  messages: UIMessage[],
): Map<string, CoachQuestionReplyToolResultPayload> {
  const map = new Map<string, CoachQuestionReplyToolResultPayload>();
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    for (const block of getCoachToolResultBlocks(msg)) {
      const parsed = safeParseCoachQuestionReplyLikeToolResultPayload(
        block.content,
      );
      if (!parsed) continue;
      const id = parsed.repliesToAssistantMessageId.trim();
      if (id) map.set(id, parsed);
    }
  }
  return map;
}

export function getCoachQuestionReplyFromUserMessage(
  message: UIMessage,
): CoachQuestionReplyToolResultPayload | null {
  if (message.role !== "user") return null;
  for (const block of getCoachToolResultBlocks(message)) {
    const parsed = safeParseCoachQuestionReplyLikeToolResultPayload(
      block.content,
    );
    if (parsed) return parsed;
  }
  return null;
}

export function buildCoachPlanDraftSavedAssistantIds(
  messages: UIMessage[],
): Set<string> {
  const set = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    for (const block of getCoachToolResultBlocks(msg)) {
      const parsed = safeParseCoachPlanDraftSavedToolResultPayload(
        block.content,
      );
      if (!parsed) continue;
      const id = parsed.repliesToAssistantMessageId.trim();
      if (id) set.add(id);
    }
  }
  return set;
}

export function buildPlanWorkoutAdjustmentAppliedAssistantIds(
  messages: UIMessage[],
): Set<string> {
  const set = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    for (const block of getCoachToolResultBlocks(msg)) {
      const parsed = safeParsePlanWorkoutAdjustmentAppliedToolResultPayload(
        block.content,
      );
      if (!parsed) continue;
      const id = parsed.repliesToAssistantMessageId.trim();
      if (id) set.add(id);
    }
  }
  return set;
}
