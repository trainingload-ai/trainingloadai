import type { UIMessage } from "ai";
import { getMessageText } from "./ai-coach-utils";
import {
  getCoachPlanDraftSavedAckFromUserMessage,
} from "./coach-message-meta";
import { getCoachAssistantToolItemsByName } from "./coach-conversation-items";
import {
  type CoachPlanDraft,
  safeParseCoachPlanDraftFenceJson,
} from "@/lib/coach-plan-draft";
import { safeParseCoachPlanDraftData } from "@shared/ai-coach-schema";

/** 允许 ```json 或无语言标记的 ```（部分模型省略 json） */
const JSON_FENCE = /```(?:json)?\s*([\s\S]*?)```/gi;

/** 气泡展示：去掉 `type: coach_plan_draft` 的 fenced JSON，避免重复渲染 */
export function stripCoachPlanDraftFencesForDisplay(content: string): string {
  return content.replace(JSON_FENCE, (full, inner) => {
    try {
      const data = JSON.parse(String(inner).trim()) as unknown;
      const draft = safeParseCoachPlanDraftFenceJson(data);
      if (draft) return "";
    } catch {
      /* keep fence */
    }
    return full;
  })
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** 从助手正文解析最后一个有效的 coach_plan_draft 块 */
export function parseCoachPlanDraftFromAssistantContent(
  content: string,
): CoachPlanDraft | null {
  let last: CoachPlanDraft | null = null;
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    try {
      const data = JSON.parse(m[1]!.trim()) as unknown;
      const draft = safeParseCoachPlanDraftFenceJson(data);
      if (draft) last = draft;
    } catch {
      /* skip */
    }
  }
  return last;
}

export function getCoachPlanDraftFromAssistantMessage(
  message: UIMessage,
): CoachPlanDraft | null {
  if (message.role !== "assistant") return null;
  for (const item of getCoachAssistantToolItemsByName(
    message,
    new Set(["PresentCoachPlanDraft"]),
  )) {
    const parsed = safeParseCoachPlanDraftData(item.payload);
    if (parsed) return parsed;
  }
  return parseCoachPlanDraftFromAssistantContent(getMessageText(message));
}

/**
 * 取最近可展示的草案：默认「最后一条用户消息之后」的助手草案；若最后一条是「已保存计划」meta，则仍解析其指向的助手气泡（否则刷新后会丢失预览）。
 */
export function deriveLatestCoachPlanDraftFromMessages(
  messages: UIMessage[],
): CoachPlanDraft | null {
  const last = messages[messages.length - 1];
  const savedAck = last ? getCoachPlanDraftSavedAckFromUserMessage(last) : null;
  if (savedAck) {
    const asst = messages.find((m) => m.id === savedAck.repliesToAssistantMessageId);
    if (asst?.role === "assistant") {
      return getCoachPlanDraftFromAssistantMessage(asst);
    }
    return null;
  }

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
    const parsed = getCoachPlanDraftFromAssistantMessage(m);
    if (parsed) return parsed;
  }

  // 回退：若本轮未生成新草案，仍展示历史最近一份草案，避免用户继续对话后预览直接消失。
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const parsed = getCoachPlanDraftFromAssistantMessage(m);
    if (parsed) return parsed;
  }
  return null;
}

/** 当前草案对应的助手气泡 id（用于 meta / 是否已保存） */
export function findLatestCoachPlanDraftAssistantMessageId(
  messages: UIMessage[],
): string | null {
  const last = messages[messages.length - 1];
  const savedAck = last ? getCoachPlanDraftSavedAckFromUserMessage(last) : null;
  if (savedAck) return savedAck.repliesToAssistantMessageId;

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
    const parsed = getCoachPlanDraftFromAssistantMessage(m);
    if (parsed) return m.id;
  }

  // 与草案展示回退策略一致：本轮没有新草案时，回退到历史最近草案消息 id。
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant" || !m.id) continue;
    const parsed = getCoachPlanDraftFromAssistantMessage(m);
    if (parsed) return m.id;
  }
  return null;
}
