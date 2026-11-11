import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFetchError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { useAiAnalysisStream } from "./useAiAnalysis";

const mocks = vi.hoisted(() => ({
  getStream: vi.fn(),
  translate: (key: string) => key,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => mocks.translate,
}));
vi.mock("@/api/activity", () => ({
  getAiInfo: vi.fn(),
  getAiInfoStream: (...args: unknown[]) => mocks.getStream(...args),
}));
vi.mock("@/api/ai-operations", () => ({ fetchAiOperation: vi.fn() }));
vi.mock("@/lib/ai-operation-recovery", () => ({
  aiOperationRequestFingerprint: () => "same-request",
  operationIdForRequest: () => "operation-1",
  clearPendingAiOperation: vi.fn(),
}));

describe("activity review in-progress recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.getStream.mockReset();
  });
  it("waits for the canonical result and never starts a competing generation", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const key = queryKeys.activity.aiReview("activity-1", "zh");
    client.setQueryData(key, { found: true, status: "PENDING", markdown: "" });
    mocks.getStream.mockRejectedValueOnce(
      new ApiFetchError(
        "AI_OPERATION_IN_PROGRESS",
        409,
        "AI_OPERATION_IN_PROGRESS",
      ),
    );
    const { result, unmount } = renderHook(
      () => useAiAnalysisStream("activity-1"),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(mocks.getStream).toHaveBeenCalledTimes(1);
    client.setQueryData(key, {
      found: true,
      status: "SUCCEEDED",
      markdown: "训练已经完成，今天保持轻松恢复。",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.data).toBe("训练已经完成，今天保持轻松恢复。");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isDone).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mocks.getStream).toHaveBeenCalledTimes(1);
    unmount();
    client.clear();
  });
});
