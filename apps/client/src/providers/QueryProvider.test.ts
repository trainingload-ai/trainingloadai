import { describe, expect, it, vi } from "vitest";

import { ApiFetchError } from "@/lib/api-error";
import { createAppQueryClient } from "./QueryProvider";

describe("createAppQueryClient", () => {
  it("does not report a transient failure when its retry succeeds", async () => {
    const reportError = vi.fn(() => true);
    const queryClient = createAppQueryClient(reportError);
    let attempts = 0;

    const result = await queryClient.fetchQuery({
      queryKey: ["retry-success"],
      retryDelay: 0,
      queryFn: async () => {
        attempts += 1;
        if (attempts === 1) throw new ApiFetchError("temporary", 500);
        return "ok";
      },
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a query only after its retries are exhausted", async () => {
    const reportError = vi.fn(() => true);
    const queryClient = createAppQueryClient(reportError);

    await expect(
      queryClient.fetchQuery({
        queryKey: ["retry-failure"],
        retryDelay: 0,
        queryFn: async () => {
          throw new ApiFetchError("still unavailable", 503);
        },
      }),
    ).rejects.toThrow("still unavailable");

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({
        scope: window.location.pathname,
        surface: "page",
      }),
    );
  });

  it("respects inline and silent query presentation metadata", async () => {
    const reportError = vi.fn(() => true);
    const queryClient = createAppQueryClient(reportError);

    for (const errorSurface of ["inline", "silent"] as const) {
      await expect(
        queryClient.fetchQuery({
          queryKey: ["presentation", errorSurface],
          retry: false,
          meta: { errorSurface },
          queryFn: async () => {
            throw new ApiFetchError("local error", 500);
          },
        }),
      ).rejects.toThrow("local error");
    }

    expect(reportError).not.toHaveBeenCalled();
  });
});

