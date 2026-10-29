import type { UIMessage } from "ai";
import { aiOperationErrorCode } from "@/lib/ai-operation-errors";
import { hasRenderableCoachMessageBody } from "./coach-conversation-items";

export function filterCoachMessagesForDisplay(
  messages: UIMessage[],
): UIMessage[] {
  // 工具结果回填类 user 消息没有可见文本，不应该占用一行聊天气泡。
  return messages.filter((m) => {
    const text = m.parts
      .filter((part): part is { type: "text"; text: string } => {
        return part.type === "text" && typeof part.text === "string";
      })
      .map((part) => part.text)
      .join("")
      .trim();
    if (m.role === "user") return text.length > 0;
    if (m.role !== "assistant") return true;
    const coachMessage = (m.metadata as { coachMessage?: unknown } | undefined)
      ?.coachMessage;
    const hasRenderableTool = hasRenderableCoachMessageBody(coachMessage);
    return text.length > 0 || hasRenderableTool;
  });
}

/** 客户端 meta 行，不落库 */
export type CoachTranscriptMetaReason =
  | "timeout"
  | "disconnect"
  | "rate_limit"
  | "access_required"
  | "action_in_progress"
  | "settlement_pending"
  | "model_tier"
  | "model_unavailable"
  | "auth"
  | "server"
  | "internal"
  | "unknown";

export type CoachTranscriptItem = {
  id: string;
  type: "error" | "system" | "turn_failed";
  reason: CoachTranscriptMetaReason;
  detail?: string;
  /** Server-localized body that replaces the generic reason copy. */
  message?: string;
  retryable?: boolean;
};

export type CoachTranscriptRow =
  | { kind: "chat"; message: UIMessage }
  | { kind: "meta"; item: CoachTranscriptItem };

/** 合并规则：先按顺序渲染全部 UIMessage，再渲染 meta 行（通常仅一条失败提示） */
export function buildCoachTranscriptRows(
  messages: UIMessage[],
  metaItems: CoachTranscriptItem[],
): CoachTranscriptRow[] {
  const chatRows: CoachTranscriptRow[] = messages.map((message) => ({
    kind: "chat",
    message,
  }));
  const metaRows: CoachTranscriptRow[] = metaItems.map((item) => ({
    kind: "meta",
    item,
  }));
  return [...chatRows, ...metaRows];
}

export function classifyMetaReasonFromErrorMessage(
  message: string | undefined,
): CoachTranscriptMetaReason {
  // 将底层错误归并为少数几个 UI 可翻译 reason，避免在组件里匹配英文/供应商文案。
  if (!message) return "unknown";
  const m = message.toLowerCase();
  if (m.includes("ai_operation_in_progress")) {
    return "action_in_progress";
  }
  if (m.includes("ai_operation_settlement_pending")) {
    return "settlement_pending";
  }
  if (
    m.includes("ai_model_tier_unavailable") ||
    m.includes("ai_model_purpose_unavailable")
  ) {
    return "model_tier";
  }
  if (m.includes("model_unavailable")) {
    return "model_unavailable";
  }
  if (m.includes("ai_access_required")) {
    return "access_required";
  }
  if (m.includes("timeout") || m.includes("超时")) return "timeout";
  if (
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("429") ||
    m.includes("请求过于频繁")
  ) {
    return "rate_limit";
  }
  if (
    m.includes("quota") ||
    m.includes("额度") ||
    m.includes("配額") ||
    m.includes("利用枠")
  ) {
    return "access_required";
  }
  if (
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("401") ||
    m.includes("403") ||
    m.includes("登录") ||
    m.includes("signin") ||
    m.includes("sign in")
  ) {
    return "auth";
  }
  if (
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror")
  ) {
    return "disconnect";
  }
  if (
    m.includes("internal server error") ||
    m.includes("service unavailable") ||
    m.includes("server error") ||
    m.includes("bad gateway") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("服务器")
  ) {
    return "server";
  }
  if (
    m.includes("deprecated") ||
    m.includes("openrouter") ||
    m.includes("the free model") ||
    m.includes("404")
  ) {
    return "internal";
  }
  return "unknown";
}

export function buildCoachTranscriptErrorItem(args: {
  error?: Error | null;
  detail?: string;
  retryable?: boolean;
}): CoachTranscriptItem {
  const operationCode = args.error ? aiOperationErrorCode(args.error) : null;
  const detail = (
    args.detail ??
    operationCode ??
    args.error?.message ??
    ""
  ).trim();
  const reason = classifyMetaReasonFromErrorMessage(detail);
  // 不向用户展示上游模型/供应商返回的原始英文或内部信息，仅用语义化 reason + i18n 主文案
  return {
    id: crypto.randomUUID(),
    type: "turn_failed",
    reason,
    detail: undefined,
    retryable: args.retryable,
  };
}
