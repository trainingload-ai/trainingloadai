import type { UIMessage } from "ai";
import {
  coachUserToolResultBlockFromData,
  getCoachUserToolResultParts,
} from "@/lib/ai-coach-ui-parts";
import type {
  AskUserQuestionData,
  CoachPlanDraftData,
  PlanWorkoutAdjustmentDraftData,
} from "@shared/ai-coach-schema";

export type CoachUserToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};

export type CoachUserMessageBody = {
  content: Array<{ type: "text"; text: string } | CoachUserToolResultBlock>;
};

export type CoachUiMessageMetadata = {
  coachMessage?:
    | CoachUserMessageBody
    | Extract<CoachWireMessage, { type: "assistant" }>["message"];
};

export type CoachBranchRequestContext = {
  caseId?: string | null;
  branchId?: string | null;
  contextId?: string | null;
  planId?: string | null;
  openReason?: string | null;
  sourceNode?: unknown;
};

type CoachSendMessagesRequestArgs = {
  id: string;
  messages: UIMessage[];
  trigger: "submit-message" | "regenerate-message";
  messageId?: string;
  body?: Record<string, unknown>;
};

/**
 * AI SDK 默认会在每轮请求中提交完整 UI 消息历史。教练历史已按 sid 存在服务端，
 * 因此前端只需提交本轮最后一条消息，避免把大型工具卡片和计划草稿重复上传。
 */
export function buildCoachSendMessagesRequestBody({
  id,
  messages,
  trigger,
  messageId,
  body,
}: CoachSendMessagesRequestArgs): Record<string, unknown> {
  const extraBody = { ...body };
  delete extraBody.messages;
  delete extraBody.message;
  const message = messages[messages.length - 1];

  return {
    ...extraBody,
    id,
    trigger,
    ...(messageId ? { messageId } : {}),
    ...(message ? { message } : {}),
  };
}

/**
 * 从 AI SDK 的 UIMessage.parts 中提取用户可见文本。
 * 这里只拼 text part，避免把工具结果或非文本 part 误当成用户 prompt。
 */
function extractMessageText(
  message: (UIMessage & { content?: readonly unknown[] }) | undefined,
): string {
  if (!message) return "";

  const parts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : [];
  const text = parts
    .filter(
      (
        part,
      ): part is Extract<
        (typeof parts)[number],
        { type: "text"; text: string }
      > => part?.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");

  return text.trim();
}

/**
 * 兼容 useChat 单条 message 与 messages 数组两种提交形态，取本轮最后一条用户消息。
 */
function findLastUserMessageInChatBody(
  body: Record<string, unknown>,
): UIMessage | undefined {
  const single = body.message as UIMessage | undefined;
  if (single?.role === "user") return single;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as UIMessage;
    if (m?.role === "user") return m;
  }
  return undefined;
}

/** 从 AI SDK chat POST body 解析本轮用户文案（仅 user，避免把 assistant 错误回灌进 `q`） */
export function parseLastUserPromptFromChatBody(
  body: Record<string, unknown>,
): string {
  const m = findLastUserMessageInChatBody(body);
  return m ? extractMessageText(m) : "";
}

/**
 * 将 AI SDK 的提交体转成后端 CoachUserMessageBody。
 * 若 metadata 里已有结构化 coachMessage（例如工具结果回复），优先保留该结构。
 */
export function coachUserMessageFromChatBody(
  body: Record<string, unknown>,
): CoachUserMessageBody | null {
  const m = findLastUserMessageInChatBody(body);
  const text = m ? extractMessageText(m) : "";
  const toolResultBlocks = m
    ? getCoachUserToolResultParts(m).map(coachUserToolResultBlockFromData)
    : [];
  if (toolResultBlocks.length > 0) {
    return {
      content: [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...toolResultBlocks,
      ],
    };
  }
  if (m?.metadata && typeof m.metadata === "object") {
    const coachMessage = (m.metadata as CoachUiMessageMetadata).coachMessage;
    if (coachMessage?.content?.length) {
      const structured = coachMessage as CoachUserMessageBody;
      const hasTextBlock = structured.content.some(
        (block) => block.type === "text" && block.text.trim().length > 0,
      );
      if (hasTextBlock || !text) return structured;
      return {
        content: [{ type: "text", text }, ...structured.content],
      };
    }
  }
  return text ? { content: [{ type: "text", text }] } : null;
}

/** 与 Nest `SseStream` 序列化后的 Coach 事件对齐（单一 discriminated union；与 Claude Code queryLoop 式 agent 轮次一致） */
export type CoachWireMessage =
  | {
      type: "stream_event";
      event:
        | { type: "text_delta"; text: string }
        | { type: "reasoning_delta"; text: string }
        | { type: "phase"; phase: "model" | "tool_run" };
    }
  | {
      type: "assistant";
      message: {
        content: Array<
          | { type: "text"; text: string }
          | {
              type: "tool_use";
              id: string;
              name: "AskUserQuestion";
              input: AskUserQuestionData;
            }
          | {
              type: "tool_use";
              id: string;
              name: "PresentCoachPlanDraft";
              input: CoachPlanDraftData;
            }
          | {
              type: "tool_use";
              id: string;
              name: "PresentPlanWorkoutAdjustmentDraft";
              input: PlanWorkoutAdjustmentDraftData;
            }
          | {
              type: "tool_use";
              id: string;
              name: Exclude<
                string,
                | "AskUserQuestion"
                | "PresentCoachPlanDraft"
                | "PresentPlanWorkoutAdjustmentDraft"
              >;
              input: unknown;
            }
        >;
      };
    }
  | {
      type: "user";
      message: CoachUserMessageBody;
    }
  | {
      type: "system";
      subtype: "status";
      status: "running" | "model" | "tool_run";
      step?: number;
      progress?:
        | "thinking"
        | "preparing"
        | "analyzing_request"
        | "synthesizing_evidence"
        | "drafting_plan"
        | "running_tools";
    }
  | {
      type: "system";
      subtype: "context_window";
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
    }
  | {
      type: "tool_progress";
      tool_name: string;
      status: "issued" | "start" | "end" | "done";
      ok?: boolean;
      result_count?: number;
      tool_names?: string[];
    }
  | {
      type: "result";
      subtype: "success" | "error_during_execution";
      is_error: boolean;
      result: string;
      usage?: unknown;
      error_code?: string;
    }
  | {
      type: "branch";
      subtype: "opened";
      branch: {
        id: string;
        contextId: string;
        status: string;
        baseEventSeq?: number;
        baseCommitId?: string | null;
      };
    };
