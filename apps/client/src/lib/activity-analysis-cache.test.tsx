import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  focusManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/api/activities";
import { fetchActivity } from "@/api/activities";
import { useGetActivity } from "@/hooks/useActivities";
import {
  ACTIVITY_ANALYSIS_CACHE,
  invalidateActivityAnalysisCaches,
  refreshActivityAnalysisCaches,
  removeActivityAnalysisCaches,
} from "./activity-analysis-cache";
import { invalidateAfterActivityPipelineComplete } from "./query-invalidation";
import { queryKeys } from "./query-keys";

vi.mock("@/api/activities", () => ({
  fetchActivity: vi.fn(),
  fetchActivities: vi.fn(),
  fetchActivityStats: vi.fn(),
}));
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(value);
  return value;
}
afterEach(() => {
  for (const value of clients.splice(0)) value.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.clearAllMocks();
});
const original: Activity = {
  processingStatus: "READY",
  readyAt: "2026-11-11T00:00:00Z",
  startTime: "2026-11-10T00:00:00Z",
};

describe("activity analysis cache", () => {
  it("retains fresh series across unmounts, avoids focus refetch, and expires inactive data", async () => {
    vi.useFakeTimers();
    const qc = client();
    qc.mount();
    const fetch = vi.fn(async () => ({ rows: [1, 2, 3] }));
    const options = {
      ...ACTIVITY_ANALYSIS_CACHE,
      queryKey: queryKeys.activity.metricSeries("a", "heartRate"),
      queryFn: fetch,
    };
    const first = new QueryObserver(qc, options);
    const unsubscribe = first.subscribe(() => {});
    await qc.ensureQueryData(options);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(1);
    expect(qc.getQueryData(options.queryKey)).toEqual({ rows: [1, 2, 3] });
    const second = new QueryObserver(qc, options);
    const unsubscribeSecond = second.subscribe(() => {});
    await qc.ensureQueryData(options);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_001);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    unsubscribeSecond();
    await vi.advanceTimersByTimeAsync(ACTIVITY_ANALYSIS_CACHE.gcTime + 1);
    expect(qc.getQueryData(options.queryKey)).toBeUndefined();
    qc.unmount();
  });
  it("invalidates series and GPS for a changed analysis revision, preserving saved segments and other activities", async () => {
    const qc = client();
    const keys = [
      queryKeys.activity.metricSeries("a", "power"),
      queryKeys.activity.timelineTrack("a"),
      queryKeys.activity.timelineSegments("a"),
      queryKeys.activity.metricSeries("b", "power"),
    ];
    keys.forEach((key) => qc.setQueryData(key, { value: "cached" }));
    await refreshActivityAnalysisCaches(qc, "a", original, {
      ...original,
      readyAt: "2026-11-11T01:00:00Z",
    });
    expect(keys.map((key) => qc.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
  it("does not invalidate analysis when only the activity name or RPE changes", async () => {
    const qc = client();
    const key = queryKeys.activity.metricSeries("a", "power");
    qc.setQueryData(key, []);
    await refreshActivityAnalysisCaches(qc, "a", original, {
      ...original,
      activityName: "Renamed",
      sessionRpe: 5,
    });
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
  });
  it("cancels an older in-flight request without refetching while processing", async () => {
    const qc = client();
    let aborted = false;
    const fetch = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve("obsolete");
          });
        }),
    );
    const pending = qc
      .fetchQuery({
        ...ACTIVITY_ANALYSIS_CACHE,
        queryKey: queryKeys.activity.metricSeries("a", "power"),
        queryFn: fetch,
      })
      .catch(() => undefined);
    await refreshActivityAnalysisCaches(qc, "a", original, {
      ...original,
      processingStatus: "ANALYZING",
    });
    await pending;
    expect(aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      qc.getQueryData(queryKeys.activity.metricSeries("a", "power")),
    ).toBeUndefined();
  });
  it("refreshes analysis when the detail query receives a new readyAt", async () => {
    const qc = client();
    vi.mocked(fetchActivity)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({ ...original, readyAt: "2026-11-11T01:00:00Z" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useGetActivity("a"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const key = queryKeys.activity.metricSeries("a", "power");
    qc.setQueryData(key, { rows: [1] });
    await act(async () => {
      await hook.result.current.refetch();
    });
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    hook.unmount();
    expect(qc.getQueryData(queryKeys.activity.detail("a"))).toEqual({
      ...original,
      readyAt: "2026-11-11T01:00:00Z",
    });
  });
  it("removes deleted activity analysis, detail, layer and segments, keeping other activities", async () => {
    const qc = client();
    const deleted = [
      queryKeys.activity.detail("a"),
      queryKeys.activity.layer("a"),
      queryKeys.activity.timelineSegments("a"),
      queryKeys.activity.timelineTrack("a"),
      queryKeys.activity.metricSeries("a", "heartRate"),
    ];
    deleted.forEach((key) => qc.setQueryData(key, {}));
    const other = queryKeys.activity.metricSeries("b", "heartRate");
    qc.setQueryData(other, { rows: [2] });
    await removeActivityAnalysisCaches(qc, "a");
    expect(deleted.every((key) => qc.getQueryData(key) === undefined)).toBe(
      true,
    );
    expect(qc.getQueryData(other)).toEqual({ rows: [2] });
  });
  it("invalidates retained analysis after the activity pipeline completes", async () => {
    const qc = client();
    const key = queryKeys.activity.metricSeries("a", "heartRate");
    qc.setQueryData(key, {});
    await invalidateAfterActivityPipelineComplete(qc);
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
