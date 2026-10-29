"use client";

import type { UIMessage } from "ai";
import {
  getCoachAssistantToolItemsByName,
  getCoachConversationItemsFromAssistantContent,
} from "./coach-conversation-items";
import {
  MutationAppliedCard,
  type MutationAppliedToolResult,
} from "./cards/MutationAppliedCard";

function isMutationAppliedPayload(v: unknown): v is MutationAppliedToolResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === "mutation_applied" &&
    o.ok === true &&
    typeof o.actionId === "string"
  );
}

/** 落库助手消息 metadata 内的 mutation 回执卡片 */
export function CoachAssistantMutationAppliedCards({
  message,
  onUndone,
}: {
  message: UIMessage;
  onUndone?: (actionId: string) => void;
}) {
  if (message.role !== "assistant") return null;
  const blocks = getCoachAssistantToolItemsByName(
    message,
    new Set(["MutationApplied"]),
  );
  const results = blocks
    .map((b) => b.payload)
    .filter(isMutationAppliedPayload);
  if (!results.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {results.map((r) => (
        <MutationAppliedCard
          key={r.actionId}
          result={r}
          onUndone={onUndone}
          dense
        />
      ))}
    </div>
  );
}

/** 流式阶段 SSE 下发的 mutation 回执（尚无落库 metadata 时） */
export function CoachVolatileMutationAppliedCards({
  cards,
  onUndone,
}: {
  cards: MutationAppliedToolResult[];
  onUndone?: (actionId: string) => void;
}) {
  if (!cards.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {cards.map((r) => (
        <MutationAppliedCard
          key={r.actionId}
          result={r}
          onUndone={onUndone}
          dense
        />
      ))}
    </div>
  );
}

export function parseMutationAppliedToolResultsFromAssistantContent(
  content: unknown[],
): MutationAppliedToolResult[] {
  return getCoachConversationItemsFromAssistantContent(content)
    .filter((item) => item.name === "MutationApplied")
    .map((item) => item.payload)
    .filter(isMutationAppliedPayload);
}
