"use client";

import { useEffect, useRef } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import type { CoachBranchRequestContext } from "@/lib/ai-coach-stream";

export type CoachRuntimeEntry = {
  key: string;
  intent: string;
  branchContext: CoachBranchRequestContext;
  firstMessage: CoachUiMessage;
  resumeExisting?: boolean;
};

export function CoachRuntimeEntryStarter({
  entry,
  chat,
  ready,
}: {
  entry?: CoachRuntimeEntry;
  chat: UseChatHelpers<CoachUiMessage>;
  ready: boolean;
}) {
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    if (
      !entry ||
      entry.resumeExisting ||
      !ready ||
      consumed.current === entry.key
    )
      return;
    if (chat.messages.some((message) => message.id === entry.firstMessage.id)) {
      consumed.current = entry.key;
      return;
    }
    if (chat.status !== "ready") return;
    consumed.current = entry.key;
    void chat.sendMessage(entry.firstMessage);
  }, [entry, chat, ready]);
  return null;
}
