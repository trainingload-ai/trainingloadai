"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  aiCoachMessagesQueryKey,
  deleteCoachSession,
  fetchCoachSessionMessages,
  invalidateCoachSessionLists,
} from "@/api/ai-coach";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { getLoginHrefWithCallback } from "@/lib/auth-callback";
import { useRouter } from "@/i18n/navigation";
import { coachRowsToUiMessages } from "./coach-rows-to-ui-messages";
import { shouldReleaseEmptyCoachSid } from "./coach-sid-model";
import { useCoachSid } from "./use-coach-sid";

const COACH_SESSION_INTENT_STORAGE_KEY = "ai-coach-v2-session-intent";

function clearStoredSessionIntent() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(COACH_SESSION_INTENT_STORAGE_KEY);
  } catch {
    // Ignore private browsing / quota errors.
  }
}

export function useCoachPageState(enabled: boolean) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sid, applySid, clearCoachSidFromUrl } = useCoachSid();
  const { data: session, isPending: sessionPending } = useViewerSession();
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const showAllHistory = searchParams.get("view") === "history";

  const messagesQuery = useQuery({
    queryKey: aiCoachMessagesQueryKey(sid || "__no_sid__"),
    queryFn: () => fetchCoachSessionMessages(sid),
    enabled: Boolean(enabled && session?.user?.id && sid),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const initialMessages = useMemo(() => {
    if (!sid || messagesQuery.status !== "success") return [];
    return coachRowsToUiMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data, messagesQuery.status, sid]);

  const selectSession = useCallback(
    (nextSid: string) => {
      setHistorySheetOpen(false);
      applySid(nextSid);
    },
    [applySid],
  );

  const startNewConversation = useCallback(() => {
    if (!session?.user?.id && !sessionPending) {
      router.push(getLoginHrefWithCallback());
      return;
    }
    clearStoredSessionIntent();
    setHistorySheetOpen(false);
    clearCoachSidFromUrl();
  }, [clearCoachSidFromUrl, router, session?.user?.id, sessionPending]);

  const releasedEmptySidRef = useRef<string>("");
  useEffect(() => {
    if (
      !shouldReleaseEmptyCoachSid({
        sid,
        messagesStatus: messagesQuery.status,
        messageCount: messagesQuery.data?.length ?? 0,
      })
    ) {
      if ((messagesQuery.data?.length ?? 0) > 0) {
        releasedEmptySidRef.current = "";
      }
      return;
    }
    if (releasedEmptySidRef.current === sid) return;
    releasedEmptySidRef.current = sid;
    const orphanSid = sid;
    void deleteCoachSession(orphanSid)
      .catch(() => false)
      .finally(() => {
        void queryClient.removeQueries({
          queryKey: aiCoachMessagesQueryKey(orphanSid),
        });
        invalidateCoachSessionLists(queryClient);
      });
    startNewConversation();
  }, [
    messagesQuery.data?.length,
    messagesQuery.status,
    queryClient,
    sid,
    startNewConversation,
  ]);

  const closeFullHistory = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    const query = next.toString();
    router.replace(query ? `/ai-coach?${query}` : "/ai-coach", {
      scroll: false,
    });
  }, [router, searchParams]);

  const handleSessionDeleted = useCallback(
    (deletedSid: string) => {
      void queryClient.removeQueries({
        queryKey: aiCoachMessagesQueryKey(deletedSid),
      });
      if (deletedSid !== sid) return;
      startNewConversation();
    },
    [queryClient, sid, startNewConversation],
  );

  return {
    sid,
    historySheetOpen,
    setHistorySheetOpen,
    showAllHistory,
    closeFullHistory,
    selectSession,
    startNewConversation,
    handleSessionDeleted,
    initialMessages,
    isLoading:
      Boolean(enabled && session?.user?.id && sid) && messagesQuery.isPending,
  };
}
