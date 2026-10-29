import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { aiCoachMessagesQueryKey } from "@/api/ai-coach";
import { markCoachMessagesStale } from "./coach-message-cache";

describe("markCoachMessagesStale", () => {
  it("marks persisted history stale without refetching the live transcript", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await markCoachMessagesStale(queryClient, "existing-session");

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: aiCoachMessagesQueryKey("existing-session"),
      refetchType: "none",
    });
  });
});
