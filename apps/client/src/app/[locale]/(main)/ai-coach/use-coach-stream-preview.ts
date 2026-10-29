"use client";

import { useCallback, useMemo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { stripAskUserQuestionPayloadFenceForDisplay } from "./coach-ask-user-question-hydrate";
import { stripCoachPlanDraftFencesForDisplay } from "./coach-plan-draft-hydrate";
import { getMessageText } from "./ai-coach-utils";
import type { CoachStreamPhase } from "./coach-status-model";

/**
 * 流式正文展示：直接使用 AI SDK 已接收的文本。
 * 不做逐帧打字动画；assistant 正文由消息组件交给 streaming markdown renderer 处理。
 */
export function useCoachStreamPreview(
  messages: UIMessage[],
  isStreaming: boolean,
  _streamPhase: CoachStreamPhase | null,
) {
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  const lastAssistantId = lastAssistantMessage?.id ?? "";
  const lastAssistantText = lastAssistantMessage
    ? getMessageText(lastAssistantMessage)
    : "";
  const lastMessageRole = messages[messages.length - 1]?.role;

  const renderedStreamText = lastAssistantText;

  const getDisplayText = useCallback(
    (message: UIMessage) => {
      const raw = getMessageText(message);
      return message.role === "assistant"
        ? stripCoachPlanDraftFencesForDisplay(
            stripAskUserQuestionPayloadFenceForDisplay(raw),
          )
        : raw;
    },
    [],
  );

  const hasAssistantText = lastAssistantText.trim().length > 0;
  const showPendingAssistant =
    isStreaming &&
    (messages.length === 0 ||
      lastMessageRole !== "assistant" ||
      !hasAssistantText);

  return {
    lastAssistantId,
    getDisplayText,
    showPendingAssistant,
    renderedStreamText,
  };
}
