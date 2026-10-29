"use client";

import { useMemo } from "react";
import { useCoachMessage, useCoachThread } from "./coach-chat-provider";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoachAssistantToolData } from "@/lib/ai-coach-ui-parts";
import { CoachMarkdown } from "./coach-markdown";
import {
  readCoachProgressSnapshot,
  resolveCoachProgressMessageKey,
} from "./coach-progress-model";
import { normalizeCoachRenderableToolName } from "./coach-conversation-items";
import { useSmoothStreamingText } from "./use-smooth-streaming-text";
import { shouldShowTrailingCoachWaiting } from "./coach-streaming-content";
import { useCoachThinkingEnabled } from "./coach-thinking-context";
import { CoachV2AssistantCards } from "./coach-assistant-cards";
import {
  isCoachTurnErrorEchoText,
  readCoachTurnError,
} from "./coach-turn-error-model";
import { CoachTurnErrorCard } from "./coach-turn-error-card";
import { coachActivityResults } from "./coach-run-view-model";

function isOnlyStreamingPunctuation(text: string) {
  const compact = text.trim();
  return compact.length > 0 && /^[\s:：,，.。!！?？、;-]*$/.test(compact);
}

function AssistantMessageWaiting() {
  const t = useTranslations("AiCoachPage");
  const thinkingEnabled = useCoachThinkingEnabled();
  const progressMessageKey = useCoachMessage((state) =>
    resolveCoachProgressMessageKey(readCoachProgressSnapshot(state.content)),
  );
  const waitingLabel = thinkingEnabled
    ? t("rendering.thinking")
    : t(progressMessageKey);
  return (
    <div className="inline-flex items-center gap-2 border-l border-border/70 py-1 pl-3 text-sm text-muted-foreground">
      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      <span>{waitingLabel}</span>
    </div>
  );
}

function AssistantMessageTextBlock({
  id,
  isStreaming,
  text,
}: {
  id: string;
  isStreaming: boolean;
  text: string;
}) {
  const rendered = useSmoothStreamingText(text, isStreaming, id);
  if (!rendered.text.trim()) return null;
  if (rendered.isRendering && isOnlyStreamingPunctuation(rendered.text)) {
    return <AssistantMessageWaiting />;
  }
  return (
    <CoachMarkdown streaming={rendered.isRendering}>
      {rendered.text}
    </CoachMarkdown>
  );
}

type OrderedAssistantContent =
  | { kind: "text"; id: string; text: string }
  | { kind: "tools"; id: string; tools: CoachAssistantToolData[] };

function useOrderedAssistantContent() {
  const serialized = useCoachMessage((message) => {
    const parts: Array<
      | { kind: "text"; id: string; text: string }
      | {
          kind: "tool";
          id: string;
          tool: CoachAssistantToolData;
        }
    > = [];
    let textOrdinal = 0;
    const hasRun = message.ui.parts.some(
      (part) => part.type === "data-coach-run",
    );
    const ownedResults = new Set(
      [...coachActivityResults(message.ui).values()].map(
        (tool) => tool.toolCallId,
      ),
    );
    const activityText = new Set(
      message.ui.parts.flatMap((part) =>
        part.type === "data-coach-text-segment" &&
        part.data.placement !== "answer"
          ? [part.data.textOrdinal]
          : [],
      ),
    );
    const turnError = readCoachTurnError(message.content);
    message.content.forEach((part) => {
      if (part.type === "text") {
        const ordinal = textOrdinal++;
        if (activityText.has(ordinal)) return;
        if (isCoachTurnErrorEchoText(part.text, turnError)) return;
        parts.push({
          kind: "text",
          // Text parts are append-only during a response, while tool parts can
          // appear between them. An ordinal scoped only to text keeps the
          // component (and its typewriter buffer) mounted when that happens.
          id: `${message.id}:text:${ordinal}`,
          text: part.text,
        });
        return;
      }
      if (part.type !== "data" || part.name !== "coach-tool") return;
      const data = part.data as CoachAssistantToolData;
      const name = normalizeCoachRenderableToolName(data?.name);
      if (!name || !data?.toolCallId) return;
      if (hasRun && name === "AskUserQuestion") return;
      if (ownedResults.has(data.toolCallId)) return;
      parts.push({
        kind: "tool",
        id: `${message.id}:tool:${data.toolCallId}`,
        tool: { ...data, name },
      });
    });
    return JSON.stringify({
      id: message.id,
      status: message.status,
      parts,
      turnError,
    });
  });
  return useMemo(() => {
    const parsed = JSON.parse(serialized) as {
      id: string;
      status?: { type?: string };
      parts: Array<
        | { kind: "text"; id: string; text: string }
        | { kind: "tool"; id: string; tool: CoachAssistantToolData }
      >;
      turnError: ReturnType<typeof readCoachTurnError>;
    };
    const content: OrderedAssistantContent[] = [];
    for (const part of parsed.parts) {
      if (part.kind === "text") {
        if (part.text.trim()) content.push(part);
        continue;
      }
      const last = content.at(-1);
      if (last?.kind === "tools") {
        last.tools.push(part.tool);
      } else {
        content.push({ kind: "tools", id: part.id, tools: [part.tool] });
      }
    }
    return {
      content,
      messageId: parsed.id,
      status: parsed.status,
      turnError: parsed.turnError,
    };
  }, [serialized]);
}

function UserMessageText() {
  const content = useCoachMessage((state) => state.content);
  const text = content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

  return (
    <div className="whitespace-pre-wrap break-words leading-[23px]">
      {text || "…"}
    </div>
  );
}

function CoachUserMessage() {
  return (
    <div className="group flex justify-end gap-3 [contain-intrinsic-size:auto_72px] [content-visibility:auto]">
      <div className="ml-auto max-w-[82%] space-y-2">
        <div className="ml-auto inline-flex max-w-full flex-wrap gap-1 rounded-surface rounded-tr-xs border border-border/60 bg-neutral-100 px-3.5 py-2.5 text-[15px] font-normal leading-[23px] tracking-normal text-foreground dark:bg-muted/45">
          <UserMessageText />
        </div>
      </div>
    </div>
  );
}

function CoachAssistantMessage() {
  const hasRun = useCoachMessage((message) =>
    message.ui.parts.some((part) => part.type === "data-coach-run"),
  );
  const ordered = useOrderedAssistantContent();
  const isThreadRunning = useCoachThread((state) => state.isRunning);
  const isLastMessage = useCoachThread(
    (state) =>
      state.messages[state.messages.length - 1]?.id === ordered.messageId,
  );
  const isStreaming =
    ordered.status?.type === "running" || (isThreadRunning && isLastMessage);
  const lastTextIndex = ordered.content.findLastIndex(
    (part) => part.kind === "text",
  );
  const turnError = ordered.turnError;
  const showTrailingWaiting =
    !hasRun &&
    !turnError &&
    shouldShowTrailingCoachWaiting(ordered.content, isStreaming);
  return (
    <div className="group flex justify-start gap-3">
      <div className="min-w-0 max-w-full flex-1 space-y-3 text-foreground sm:max-w-[860px]">
        {ordered.content.map((part, index) =>
          part.kind === "text" ? (
            <AssistantMessageTextBlock
              key={part.id}
              id={part.id}
              text={part.text}
              isStreaming={isStreaming && index === lastTextIndex}
            />
          ) : (
            <CoachV2AssistantCards key={part.id} toolsOverride={part.tools} />
          ),
        )}
        {showTrailingWaiting ? <AssistantMessageWaiting /> : null}
        {turnError ? (
          // The inline card replaces the generic stream error for this turn.
          <CoachTurnErrorCard
            turnError={turnError}
            messageId={ordered.messageId}
            isLastMessage={isLastMessage}
          />
        ) : null}
      </div>
    </div>
  );
}

export const COACH_MESSAGE_COMPONENTS = {
  UserMessage: CoachUserMessage,
  AssistantMessage: CoachAssistantMessage,
};
