import type { UIMessage, UIMessagePart } from "ai";
import {
  COACH_RUN_PART_TYPES,
  isCoachRunMetadata,
  isValidCoachRunPart,
  type CoachRunDataParts,
  type CoachRunMetadata,
} from "@shared/ai-coach-run-contract";
import {
  safeParseAskUserQuestionData,
  safeParseCoachPlanDraftToolUseInput,
  safeParsePlanWorkoutAdjustmentDraftData,
} from "@shared/ai-coach-schema";
import {
  COACH_TURN_ERROR_PART_TYPE,
  type CoachTurnErrorData,
} from "@shared/coach-turn-error";

export type { CoachTurnErrorData };

export type CoachAssistantToolData = {
  toolCallId: string;
  name: string;
  input: unknown;
};

export type CoachUserToolResultData = {
  toolUseId: string;
  content: unknown;
  isError?: boolean;
};

export type CoachStatusData = {
  status: "running" | "model" | "tool_run";
  step?: number;
  progress?:
    | "thinking"
    | "preparing"
    | "analyzing_request"
    | "synthesizing_evidence"
    | "drafting_plan"
    | "running_tools";
};

export type CoachToolProgressData = {
  toolName: string;
  status: "issued" | "start" | "end" | "done";
  ok?: boolean;
  resultCount?: number;
  toolNames?: string[];
};

export type CoachContextWindowData = {
  step: number;
  maxContextTokens: number;
  reservedOutputTokens: number;
  inputBudgetTokens: number;
  usedInputTokens: number;
  remainingInputTokens: number;
  compressionThresholdTokens: number;
  usageRatio: number;
  estimator: "chars_div_4" | "mixed_chars_v1";
  compressed: boolean;
  compactedMessages: number;
};

export type CoachBranchOpenedData = {
  id: string;
  contextId: string;
  status: string;
  baseEventSeq?: number;
  baseCommitId?: string | null;
};

export type CoachUiDataParts = CoachRunDataParts & {
  "coach-operation": { operation: unknown };
  "coach-tool": CoachAssistantToolData;
  "coach-user-tool-result": CoachUserToolResultData;
  "coach-status": CoachStatusData;
  "coach-tool-progress": CoachToolProgressData;
  "coach-context-window": CoachContextWindowData;
  "coach-branch-opened": CoachBranchOpenedData;
  "coach-turn-error": CoachTurnErrorData;
};

export type CoachUiMessage = UIMessage<unknown, CoachUiDataParts>;

export type CoachUiPart = UIMessagePart<
  CoachUiDataParts,
  Record<string, never>
>;

export type StoredCoachUiMessageEnvelope = {
  kind: "ui_message";
  version: 1 | 2;
  metadata?: CoachRunMetadata;
  role: UIMessage["role"];
  parts: CoachUiPart[];
  legacyMessage?: unknown;
  providerReplay?: boolean;
};

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isStoredCoachUiMessageEnvelope(
  v: unknown,
): v is StoredCoachUiMessageEnvelope {
  return (
    isRecord(v) &&
    v.kind === "ui_message" &&
    (v.version === 1 || v.version === 2) &&
    Array.isArray(v.parts)
  );
}

function isInvalidInternalDeliveryToolPart(part: CoachUiPart): boolean {
  if (part.type !== "data-coach-tool" || !isRecord(part.data)) return false;
  const name = part.data.name;
  const input = part.data.input;
  if (name === "ask_user_question") {
    return safeParseAskUserQuestionData(input) == null;
  }
  if (name === "present_coach_plan_draft") {
    return safeParseCoachPlanDraftToolUseInput(input) == null;
  }
  if (name === "present_plan_workout_adjustment_draft") {
    return safeParsePlanWorkoutAdjustmentDraftData(input) == null;
  }
  return false;
}

function storedTextOf(parts: CoachUiPart[]): string {
  return parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/**
 * Assistant rows stored with `providerReplay: false` are visible-only turn
 * failures. Rows written before the failure part existed only carry text, so
 * derive the part from that text to render them as a failure as well.
 */
function withStoredTurnErrorPart(
  message: StoredCoachUiMessageEnvelope,
  parts: CoachUiPart[],
): CoachUiPart[] {
  if (
    message.version === 2 ||
    message.role !== "assistant" ||
    message.providerReplay !== false
  ) {
    return parts;
  }
  if (parts.some((part) => part.type === COACH_TURN_ERROR_PART_TYPE)) {
    return parts;
  }
  return [
    ...parts,
    {
      type: COACH_TURN_ERROR_PART_TYPE,
      id: "coach-turn-error",
      data: { code: "internal", message: storedTextOf(parts) },
    },
  ];
}

function getStoredRenderableParts(
  message: StoredCoachUiMessageEnvelope,
): CoachUiPart[] {
  const parts = message.parts.filter(
    (part) =>
      isRecord(part) &&
      isValidCoachRunPart(part) &&
      part.type !== "reasoning" &&
      !isInvalidInternalDeliveryToolPart(part),
  );
  return withStoredTurnErrorPart(message, parts);
}

function getStoredLegacyMessage(message: unknown): unknown {
  return isStoredCoachUiMessageEnvelope(message)
    ? (message.legacyMessage ?? null)
    : message;
}

function getContentBlocks(message: unknown): unknown[] {
  const legacy = getStoredLegacyMessage(message);
  if (!isRecord(legacy)) return [];
  return Array.isArray(legacy.content) ? legacy.content : [];
}

export function coachTextFromWireMessage(
  message: unknown,
  fallback = "",
): string {
  const text = getContentBlocks(message)
    .map((block) => {
      if (!isRecord(block)) return "";
      return block.type === "text" && typeof block.text === "string"
        ? block.text
        : "";
    })
    .join("")
    .trim();
  return text || fallback;
}

export function coachWireMessageHasRenderableBody(
  role: UIMessage["role"],
  message: unknown,
  fallback = "",
): boolean {
  if (isStoredCoachUiMessageEnvelope(message)) {
    return getStoredRenderableParts(message).some((part) => {
      if (part.type === "text") return part.text.trim().length > 0;
      // Receipt-only user rows carry durable card state even without a bubble.
      if (role === "user" && readCoachUserToolResultDataFromPart(part))
        return true;
      if (role !== "assistant") return false;
      return (
        part.type === "data-coach-tool" ||
        COACH_RUN_PART_TYPES.has(part.type) ||
        part.type === COACH_TURN_ERROR_PART_TYPE
      );
    });
  }

  const text = coachTextFromWireMessage(message, fallback).trim();
  if (text) return true;
  if (role !== "assistant") return false;
  return getContentBlocks(message).some(
    (block) => isRecord(block) && block.type === "tool_use",
  );
}

export function coachMetadataFromWireMessage(
  message: unknown,
): CoachRunMetadata | undefined {
  return isStoredCoachUiMessageEnvelope(message) &&
    isCoachRunMetadata(message.metadata)
    ? message.metadata
    : undefined;
}

export function coachPartsFromWireMessage(
  role: UIMessage["role"],
  message: unknown,
  fallback = "",
): CoachUiPart[] {
  if (isStoredCoachUiMessageEnvelope(message) && message.parts.length > 0) {
    return getStoredRenderableParts(message);
  }

  const parts: CoachUiPart[] = [];
  const content = getContentBlocks(message);
  let hasText = false;

  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      if (block.text.trim()) {
        parts.push({ type: "text", text: block.text });
        hasText = true;
      }
      continue;
    }
    if (
      role === "assistant" &&
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string"
    ) {
      const tool = block as ToolUseBlock;
      parts.push({
        type: "data-coach-tool",
        id: tool.id,
        data: {
          toolCallId: tool.id,
          name: tool.name,
          input: tool.input,
        },
      });
      continue;
    }
    if (
      role === "user" &&
      block.type === "tool_result" &&
      typeof block.tool_use_id === "string" &&
      block.content !== undefined
    ) {
      const result = block as ToolResultBlock;
      parts.push({
        type: "data-coach-user-tool-result",
        id: result.tool_use_id,
        data: {
          toolUseId: result.tool_use_id,
          content: result.content,
          ...(typeof result.is_error === "boolean"
            ? { isError: result.is_error }
            : {}),
        },
      });
    }
  }

  if (!hasText && fallback.trim()) {
    parts.unshift({ type: "text", text: fallback.trim() });
  }

  return parts;
}

export function getCoachToolParts(
  message: Pick<UIMessage, "role" | "parts">,
): CoachAssistantToolData[] {
  if (message.role !== "assistant") return [];
  return (message.parts ?? [])
    .filter(
      (part): part is Extract<CoachUiPart, { type: "data-coach-tool" }> =>
        part.type === "data-coach-tool",
    )
    .map((part) => part.data);
}

function getCoachMessageParts(
  message: Pick<UIMessage, "role" | "parts"> & { content?: readonly unknown[] },
): readonly unknown[] {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts;
  }
  if (Array.isArray(message.content) && message.content.length > 0) {
    return message.content;
  }
  return [];
}

function isCoachUserToolResultDataPart(
  part: unknown,
): part is CoachUserToolResultData {
  return (
    isRecord(part) && typeof part.toolUseId === "string" && "content" in part
  );
}

function readCoachUserToolResultDataFromPart(
  part: unknown,
): CoachUserToolResultData | null {
  if (!isRecord(part)) return null;

  if (
    part.type === "data-coach-user-tool-result" &&
    isCoachUserToolResultDataPart(part.data)
  ) {
    return part.data;
  }

  if (
    part.type === "data" &&
    part.name === "coach-user-tool-result" &&
    isCoachUserToolResultDataPart(part.data)
  ) {
    return part.data;
  }

  return null;
}

export function getCoachUserToolResultParts(
  message: Pick<UIMessage, "role" | "parts"> & { content?: readonly unknown[] },
): CoachUserToolResultData[] {
  if (message.role !== "user") return [];

  const results: CoachUserToolResultData[] = [];
  for (const part of getCoachMessageParts(message)) {
    const data = readCoachUserToolResultDataFromPart(part);
    if (data) results.push(data);
  }
  return results;
}

export function getCoachUserToolResultsFromRuntimeMessages(
  messages: readonly { role?: string; content?: readonly unknown[] }[],
): CoachUserToolResultData[] {
  const results: CoachUserToolResultData[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    results.push(
      ...getCoachUserToolResultParts({
        role: "user",
        parts: [],
        content: message.content,
      }),
    );
  }
  return results;
}

export function coachUserToolResultBlockFromData(
  data: CoachUserToolResultData,
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: data.toolUseId,
    content: data.content,
    ...(typeof data.isError === "boolean" ? { is_error: data.isError } : {}),
  };
}
