import type { UIMessage } from "ai";
import { getCoachAssistantToolItemsByName } from "./coach-conversation-items";
import {
  safeParsePlanWorkoutAdjustmentDraftToolUseInput,
  type PlanWorkoutAdjustmentDraft,
} from "@/lib/plan-workout-adjustment-draft";

export function getPlanWorkoutAdjustmentDraftFromAssistantMessage(
  message: UIMessage,
): PlanWorkoutAdjustmentDraft | null {
  if (message.role !== "assistant") return null;
  for (const item of getCoachAssistantToolItemsByName(
    message,
    new Set(["PresentPlanWorkoutAdjustmentDraft"]),
  )) {
    const parsed = safeParsePlanWorkoutAdjustmentDraftToolUseInput(
      item.payload,
    );
    if (parsed) return parsed;
  }
  return null;
}

export function deriveLatestPlanWorkoutAdjustmentDraftFromMessages(
  messages: UIMessage[],
): PlanWorkoutAdjustmentDraft | null {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (i <= lastUserIdx) break;
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const parsed = getPlanWorkoutAdjustmentDraftFromAssistantMessage(m);
    if (parsed) return parsed;
  }
  return null;
}

export function findLatestPlanWorkoutAdjustmentDraftAssistantMessageId(
  messages: UIMessage[],
): string | null {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (i <= lastUserIdx) break;
    const m = messages[i];
    if (m?.role !== "assistant" || !m.id) continue;
    const parsed = getPlanWorkoutAdjustmentDraftFromAssistantMessage(m);
    if (parsed) return m.id;
  }
  return null;
}
