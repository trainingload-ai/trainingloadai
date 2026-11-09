import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { usePersonalConnection } from "./personal-integrations";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  api.fetch.mockReset();
});
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.useRealTimers();
});
function mount(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return renderHook(() => usePersonalConnection("garmin", enabled), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
describe("personal sync polling", () => {
  it("keeps polling failed discovery while durable child imports are still pending, then stops", async () => {
    const job = {
      id: "partial",
      kind: "SYNC",
      status: "FAILED",
      result: { imported: 0, pending: 1 },
    };
    const settled = { jobs: [{ ...job, result: { imported: 1, pending: 0 } }] };
    api.fetch.mockResolvedValueOnce({ jobs: [job] }).mockResolvedValue(settled);
    const view = mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5001);
    });
    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(view.result.current.data?.jobs[0].result?.imported).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.fetch).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it("never requests a disabled personal integration", async () => {
    const view = mount(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.fetch).not.toHaveBeenCalled();
    view.unmount();
  });
});
