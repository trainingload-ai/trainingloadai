import type { QueryClient } from "@tanstack/react-query";
import { aiCoachMessagesQueryKey } from "@/api/ai-coach";

/**
 * Persistence is recovery/history state. During a live turn useChat
 * owns the transcript, so cache invalidation must never refetch and
 * replace the in-memory SSE message.
 */
export function markCoachMessagesStale(queryClient: QueryClient, sid: string) {
  return queryClient.invalidateQueries({
    queryKey: aiCoachMessagesQueryKey(sid),
    refetchType: "none",
  });
}
