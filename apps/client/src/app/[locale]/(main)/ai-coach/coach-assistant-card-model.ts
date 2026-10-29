import { getCoachToolParts } from "@/lib/ai-coach-ui-parts";
import type {
  CoachAssistantToolData,
  CoachUiMessage,
} from "@/lib/ai-coach-ui-parts";
import type { MutationAppliedToolResult } from "./cards/MutationAppliedCard";
import type { CoachQuestionPrompt } from "./coach-question-card";
import { normalizeCoachRenderableToolName } from "./coach-conversation-items";

export function getNormalizedToolCards(message: CoachUiMessage | null) {
  if (!message) return [];
  return getCoachToolParts(message)
    .map((tool) => {
      const name = normalizeCoachRenderableToolName(tool.name);
      return name
        ? {
            ...tool,
            name,
          }
        : null;
    })
    .filter((tool): tool is CoachAssistantToolData => tool != null);
}

export function getCoachToolCardIdentity(tool: CoachAssistantToolData) {
  return `${tool.toolCallId}:${tool.name}`;
}

export function dedupeCoachToolCards(
  tools: CoachAssistantToolData[],
): CoachAssistantToolData[] {
  const byIdentity = new Map<string, CoachAssistantToolData>();
  for (const tool of tools) {
    byIdentity.set(getCoachToolCardIdentity(tool), tool);
  }
  return Array.from(byIdentity.values());
}

export function getCoachToolRenderKey(
  assistantMessageId: string,
  scope: string,
  tool: CoachAssistantToolData,
  index: number,
) {
  const messageId = assistantMessageId || "assistant-message";
  return `${messageId}:${scope}:${getCoachToolCardIdentity(tool)}:${index}`;
}

export function isMutationAppliedPayload(
  v: unknown,
): v is MutationAppliedToolResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === "mutation_applied" &&
    o.ok === true &&
    typeof o.actionId === "string"
  );
}

export function isValidDecisionPayload(name: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (name === "CoachDecisionDraft") {
    return (
      payload.kind === "coach_decision_draft" &&
      typeof payload.decisionId === "string" &&
      typeof payload.decisionType === "string" &&
      typeof payload.riskTier === "string"
    );
  }
  if (name === "CoachDecisionApplied") {
    return (
      payload.kind === "coach_decision_apply" &&
      typeof payload.decisionId === "string" &&
      typeof payload.result === "string"
    );
  }
  return false;
}

export function buildQuestionAnswerMessage(
  prompt: CoachQuestionPrompt,
  payload: {
    answers: Record<string, string | string[]>;
    notes: Record<string, string>;
    skippedQuestionIds?: string[];
  },
  labels: { title: string; note: string; skipped?: string },
) {
  const lines = prompt.questions.map((question) => {
    if (payload.skippedQuestionIds?.includes(question.id)) {
      return `- ${question.header}: ${labels.skipped ?? "Skipped"}`;
    }
    const raw = payload.answers[question.id];
    const selectedValues = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const selectedLabels = selectedValues
      .map(
        (value) =>
          question.options.find((option) => option.value === value)?.label ??
          value,
      )
      .filter(Boolean);
    const note = payload.notes[question.id]?.trim();
    const answer = selectedLabels.length > 0 ? selectedLabels.join(", ") : "-";
    return note
      ? `- ${question.header}: ${answer} (${labels.note}: ${note})`
      : `- ${question.header}: ${answer}`;
  });
  return [labels.title, ...lines].join("\n");
}
