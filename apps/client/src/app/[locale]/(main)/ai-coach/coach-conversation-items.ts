"use client";

import type { UIMessage } from "ai";
import type { CoachUserToolResultBlock } from "@/lib/ai-coach-stream";
import {
  getCoachToolResultBlocks,
  getCoachToolUseBlocks,
} from "./coach-message-meta";

export const COACH_READ_TOOL_CARD_NAMES = new Set([
  "PlanDayView",
  "FitnessAssessment",
  "FitnessTracking",
  "ActivityRecent",
  "ActivityDayView",
  "PmcRange",
  "TrainingVisualization",
  "ProfileZones",
  "ProfileZoneRanges",
  "CompetitionEvents",
]);

export const COACH_ARTIFACT_TOOL_CARD_NAMES = new Set([
  "AskUserQuestion",
  "PresentCoachPlanDraft",
  "PresentPlanWorkoutAdjustmentDraft",
  "CoachDecisionDraft",
]);

export const COACH_ACTION_RESULT_TOOL_CARD_NAMES = new Set([
  "MutationApplied",
  "CoachDecisionApplied",
]);

export const COACH_RENDERABLE_TOOL_CARD_NAMES = new Set([
  ...COACH_READ_TOOL_CARD_NAMES,
  ...COACH_ARTIFACT_TOOL_CARD_NAMES,
  ...COACH_ACTION_RESULT_TOOL_CARD_NAMES,
]);

const CANONICAL_TO_RENDERABLE_TOOL_NAME: Record<string, string> = {
  "fitness.evidence": "FitnessAssessment",
  "fitness.calculate": "FitnessAssessment",
  "plan.day_view": "PlanDayView",
  "activity.recent": "ActivityRecent",
  "activity.day_view": "ActivityDayView",
  "pmc.range": "PmcRange",
  present_training_visualization: "TrainingVisualization",
  "profile.zones": "ProfileZones",
  "profile.zone_ranges": "ProfileZoneRanges",
  "competition.events.list": "CompetitionEvents",
  ask_user_question: "AskUserQuestion",
  present_coach_plan_draft: "PresentCoachPlanDraft",
  present_plan_workout_adjustment_draft: "PresentPlanWorkoutAdjustmentDraft",
  coach_decision_draft: "CoachDecisionDraft",
  coach_decision_apply: "CoachDecisionApplied",
};

const RENDERABLE_TOOL_LABEL_KEYS: Record<string, string> = {
  FitnessAssessment: "actionResult",
  FitnessTracking: "actionResult",
  PlanDayView: "planDay",
  ActivityRecent: "activityRecent",
  ActivityDayView: "activityDay",
  PmcRange: "pmc",
  TrainingVisualization: "trainingVisualization",
  ProfileZones: "profileZones",
  ProfileZoneRanges: "profileZoneRanges",
  CompetitionEvents: "competitionEvents",
  AskUserQuestion: "question",
  PresentCoachPlanDraft: "planDraft",
  PresentPlanWorkoutAdjustmentDraft: "workoutAdjustment",
  CoachDecisionDraft: "decisionDraft",
  CoachDecisionApplied: "decisionApply",
  MutationApplied: "actionResult",
};

export type CoachConversationItemKind =
  | "text"
  | "evidence"
  | "artifact"
  | "action_result"
  | "exception"
  | "event";

export type CoachConversationItem = {
  id: string;
  kind: CoachConversationItemKind;
  role: UIMessage["role"];
  source: "message_text" | "assistant_tool_use" | "user_tool_result";
  name?: string;
  payload?: unknown;
  toolUseId?: string;
};

type AssistantToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isTextPart(part: unknown): part is { type: "text"; text: string } {
  return (
    isRecord(part) && part.type === "text" && typeof part.text === "string"
  );
}

function getContentBlocks(message: unknown): unknown[] {
  const content = (message as { content?: unknown } | null)?.content;
  return Array.isArray(content) ? content : [];
}

function getAssistantToolUseBlocksFromContent(
  content: unknown[],
): AssistantToolUseBlock[] {
  return content.filter((block): block is AssistantToolUseBlock => {
    if (!isRecord(block)) return false;
    return (
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string"
    );
  });
}

function classifyAssistantToolUse(
  name: string,
  payload: unknown,
): CoachConversationItemKind {
  if (COACH_READ_TOOL_CARD_NAMES.has(name)) return "evidence";
  if (COACH_ARTIFACT_TOOL_CARD_NAMES.has(name)) return "artifact";
  if (name === "CoachDecisionApplied") {
    const result = isRecord(payload) ? String(payload.result ?? "") : "";
    return result === "REBASE_REQUIRED" || result === "FAILED"
      ? "exception"
      : "action_result";
  }
  if (COACH_ACTION_RESULT_TOOL_CARD_NAMES.has(name)) return "action_result";
  return "event";
}

function classifyUserToolResult(
  block: CoachUserToolResultBlock,
): CoachConversationItemKind {
  if (block.is_error) return "exception";
  const payload = block.content;
  const kind = isRecord(payload) ? String(payload.kind ?? "") : "";
  if (
    kind === "coach_plan_draft_saved" ||
    kind === "plan_workout_adjustment_applied"
  ) {
    return "action_result";
  }
  if (kind === "coach_question_reply" || kind === "coach_question_skip") {
    return "event";
  }
  return "event";
}

export function normalizeCoachRenderableToolName(name: string): string | null {
  const raw = name.trim();
  if (!raw || raw === "batch") return null;
  if (COACH_RENDERABLE_TOOL_CARD_NAMES.has(raw)) return raw;
  if (raw.startsWith("mutation_")) return "MutationApplied";
  return CANONICAL_TO_RENDERABLE_TOOL_NAME[raw] ?? null;
}

export function getCoachRenderableToolLabelKey(name: string): string {
  return RENDERABLE_TOOL_LABEL_KEYS[name] ?? "generic";
}

export function normalizeCoachRenderableToolNames(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const normalized = normalizeCoachRenderableToolName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function getCoachConversationItems(
  message: UIMessage,
): CoachConversationItem[] {
  const items: CoachConversationItem[] = [];
  const text = (message.parts ?? [])
    .filter(isTextPart)
    .map((part) => part.text)
    .join("")
    .trim();
  if (text) {
    items.push({
      id: `${message.id}:text`,
      kind: "text",
      role: message.role,
      source: "message_text",
      payload: text,
    });
  }

  for (const block of getCoachToolUseBlocks(message)) {
    items.push({
      id: `${message.id}:tool:${block.id}`,
      kind: classifyAssistantToolUse(block.name, block.input),
      role: message.role,
      source: "assistant_tool_use",
      name: block.name,
      payload: block.input,
      toolUseId: block.id,
    });
  }

  for (const block of getCoachToolResultBlocks(message)) {
    items.push({
      id: `${message.id}:tool_result:${block.tool_use_id}`,
      kind: classifyUserToolResult(block),
      role: message.role,
      source: "user_tool_result",
      payload: block.content,
      toolUseId: block.tool_use_id,
    });
  }

  return items;
}

export function getCoachConversationItemsFromAssistantContent(
  content: unknown[],
): CoachConversationItem[] {
  return getAssistantToolUseBlocksFromContent(content).map((block) => ({
    id: `stream:tool:${block.id}`,
    kind: classifyAssistantToolUse(block.name, block.input),
    role: "assistant",
    source: "assistant_tool_use",
    name: block.name,
    payload: block.input,
    toolUseId: block.id,
  }));
}

export function getCoachAssistantToolNames(message: UIMessage): string[] {
  if (message.role !== "assistant") return [];
  return getCoachConversationItems(message)
    .filter((item) => item.source === "assistant_tool_use" && item.name)
    .map((item) => item.name!);
}

export function hasRenderableCoachMessageBody(message: unknown): boolean {
  const content = getContentBlocks(message);
  return getAssistantToolUseBlocksFromContent(content).some((block) =>
    COACH_RENDERABLE_TOOL_CARD_NAMES.has(block.name),
  );
}

export function getCoachAssistantItemsByKind(
  message: UIMessage,
  kinds: readonly CoachConversationItemKind[],
): CoachConversationItem[] {
  if (message.role !== "assistant") return [];
  const allowed = new Set(kinds);
  return getCoachConversationItems(message).filter((item) =>
    allowed.has(item.kind),
  );
}

export function getCoachAssistantToolItemsByName(
  message: UIMessage,
  names: ReadonlySet<string>,
): CoachConversationItem[] {
  if (message.role !== "assistant") return [];
  return getCoachConversationItems(message).filter(
    (item) =>
      item.source === "assistant_tool_use" &&
      !!item.name &&
      names.has(item.name),
  );
}
