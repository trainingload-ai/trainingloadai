import type { UIMessage } from "ai";
import type { CoachQuestionPrompt } from "./coach-question-card";
import { getMessageText } from "./ai-coach-utils";
import { getCoachAssistantToolItemsByName } from "./coach-conversation-items";
import {
  type AskUserQuestionData,
  safeParseAskUserQuestionData,
  safeParseAskUserQuestionPayload,
} from "@shared/ai-coach-schema";

const JSON_FENCE =
  /```json\s*([\s\S]*?)```/i;

function toCoachQuestionPrompt(data: CoachQuestionPrompt): CoachQuestionPrompt {
  return {
    questions: data.questions,
    metadata: data.metadata,
  };
}

function parseAskUserQuestionDataOrPayload(
  raw: unknown,
): AskUserQuestionData | null {
  return (
    safeParseAskUserQuestionPayload(raw) ?? safeParseAskUserQuestionData(raw)
  );
}

function findQuestionsArrayStart(raw: string): number {
  const key = raw.search(/"questions"\s*:/);
  if (key < 0) return -1;
  const start = raw.indexOf("[", key);
  return start >= 0 ? start : -1;
}

function extractTopLevelObjectsFromArray(raw: string, arrayStart: number) {
  const out: string[] = [];
  let objectStart = -1;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "[") {
      arrayDepth += 1;
      continue;
    }
    if (ch === "]") {
      arrayDepth -= 1;
      if (arrayDepth <= 0) break;
      continue;
    }

    if (arrayDepth !== 1) continue;

    if (ch === "{") {
      if (objectDepth === 0) objectStart = i;
      objectDepth += 1;
      continue;
    }
    if (ch === "}" && objectDepth > 0) {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        out.push(raw.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }

  return out;
}

function salvageAskUserQuestionPayload(raw: string): AskUserQuestionData | null {
  const arrayStart = findQuestionsArrayStart(raw);
  if (arrayStart < 0) return null;

  const seen = new Set<string>();
  const questions = extractTopLevelObjectsFromArray(raw, arrayStart)
    .map((item) => {
      try {
        return JSON.parse(item) as unknown;
      } catch {
        return null;
      }
    })
    .map((item) =>
      item == null ? null : safeParseAskUserQuestionData({ questions: [item] }),
    )
    .filter((item): item is AskUserQuestionData => item != null)
    .flatMap((item) => item.questions)
    .filter((question) => {
      if (seen.has(question.id)) return false;
      seen.add(question.id);
      return true;
    });

  if (questions.length === 0) return null;
  return safeParseAskUserQuestionData({
    questions: questions.slice(0, 4),
  });
}

function parseAskUserQuestionPayloadText(
  raw: string,
): AskUserQuestionData | null {
  try {
    return parseAskUserQuestionDataOrPayload(JSON.parse(raw.trim()));
  } catch {
    return salvageAskUserQuestionPayload(raw);
  }
}

/** 气泡展示用：去掉末尾用于恢复的 fenced JSON，避免把机器块渲染给用户 */
export function stripAskUserQuestionPayloadFenceForDisplay(
  content: string,
): string {
  const m = content.match(JSON_FENCE);
  if (!m || m.index === undefined) return content;
  if (!parseAskUserQuestionPayloadText(m[1])) return content;
  return content.slice(0, m.index).trimEnd();
}

/** 从助手落库正文中解析 ask_user_question（旧版 fenced JSON 兼容路径） */
export function parseAskUserQuestionFromAssistantContent(
  content: string,
): CoachQuestionPrompt | null {
  const m = content.match(JSON_FENCE);
  if (!m?.[1]) return null;
  const parsed = parseAskUserQuestionPayloadText(m[1]);
  return parsed ? toCoachQuestionPrompt(parsed) : null;
}

export function getAskUserQuestionPromptFromAssistantMessage(
  message: UIMessage,
): CoachQuestionPrompt | null {
  if (message.role !== "assistant") return null;
  for (const item of getCoachAssistantToolItemsByName(
    message,
    new Set(["AskUserQuestion"]),
  )) {
    const parsed = safeParseAskUserQuestionData(item.payload);
    if (parsed) return toCoachQuestionPrompt(parsed);
  }
  return parseAskUserQuestionFromAssistantContent(getMessageText(message));
}

/**
 * 从历史消息恢复「尚未作答」的结构化提问（刷新后可继续选）。
 * 规则：从后往前找带 ask JSON 的助手消息；若其**下一条**已是 user，视为已回答并跳过。
 */
export function derivePendingAskUserQuestionFromMessages(
  messages: UIMessage[],
): CoachQuestionPrompt | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const parsed = getAskUserQuestionPromptFromAssistantMessage(m);
    if (!parsed) continue;
    const next = messages[i + 1];
    if (next?.role === "user") continue;
    return parsed;
  }
  return null;
}

/** 与 derivePending 同一条助手消息，用于 UI 去重（不重复渲染 Markdown + 下方卡片） */
export function findPendingAskAssistantMessageId(
  messages: UIMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const parsed = getAskUserQuestionPromptFromAssistantMessage(m);
    if (!parsed) continue;
    const next = messages[i + 1];
    if (next?.role === "user") continue;
    return m.id ?? null;
  }
  return null;
}
