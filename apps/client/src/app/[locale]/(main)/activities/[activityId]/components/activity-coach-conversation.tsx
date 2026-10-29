"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  aiCoachMessagesQueryKey,
  fetchCoachSessionMessages,
} from "@/api/ai-coach";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import {
  activityCoachSessionId,
  attachActivityCoachContextToUserMessage,
  shouldAttachActivityCoachContext,
  withActivityReviewAssistantSeed,
} from "@/lib/activity-ai-coach-context";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { coachRowsToUiMessages } from "@/app/[locale]/(main)/ai-coach/coach-rows-to-ui-messages";
import { CoachThreadLoading } from "@/app/[locale]/(main)/ai-coach/coach-thread";
import { CoachRuntimeProvider } from "@/app/[locale]/(main)/ai-coach/coach-runtime-provider";

export function ActivityCoachConversation({
  activityId,
  markdown,
}: {
  activityId: string;
  markdown: string;
}) {
  const sid = activityCoachSessionId(activityId);
  const { data: session, isPending: sessionPending } = useViewerSession();
  const messagesQuery = useQuery({
    queryKey: aiCoachMessagesQueryKey(sid),
    queryFn: () => fetchCoachSessionMessages(sid),
    enabled: Boolean(sid && session?.user?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const persistedMessages = useMemo(() => {
    if (messagesQuery.status !== "success") return [];
    return coachRowsToUiMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data, messagesQuery.status]);

  const initialMessages = useMemo(
    () =>
      withActivityReviewAssistantSeed(persistedMessages, {
        activityId,
        markdown,
      }),
    [activityId, markdown, persistedMessages],
  );

  const serverHadUserTurn = persistedMessages.some(
    (message) => message.role === "user",
  );

  const prepareOutgoingUserMessage = useCallback(
    (
      message: CoachUiMessage,
      messages: CoachUiMessage[],
      trigger: "submit-message" | "regenerate-message",
    ) => {
      if (
        !shouldAttachActivityCoachContext({
          trigger,
          messages,
          serverHadUserTurn,
        })
      ) {
        return message;
      }
      return attachActivityCoachContextToUserMessage(message, {
        activityId,
        analysisMarkdown: markdown,
      });
    },
    [activityId, markdown, serverHadUserTurn],
  );

  if (
    sessionPending ||
    (Boolean(session?.user?.id) && messagesQuery.isPending)
  ) {
    return <CoachThreadLoading />;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <CoachRuntimeProvider
        key={sid}
        sid={sid}
        initialMessages={initialMessages}
        variant="embedded"
        enableUrlSeed={false}
        prepareOutgoingUserMessage={prepareOutgoingUserMessage}
      />
    </div>
  );
}
