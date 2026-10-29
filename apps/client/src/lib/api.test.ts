import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, parseDownloadFilename } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDownloadFilename", () => {
  it("removes Content-Disposition quotes instead of leaking them into the saved name", () => {
    expect(
      parseDownloadFilename('attachment; filename="convert_1786521304959.fit"'),
    ).toBe("convert_1786521304959.fit");
  });

  it("prefers and decodes RFC 5987 filenames", () => {
    expect(
      parseDownloadFilename(
        "attachment; filename=\"fallback.fit\"; filename*=UTF-8''%E6%AD%A5%E8%A1%8C.fit",
      ),
    ).toBe("步行.fit");
  });
});

describe("apiFetch error presentation metadata", () => {
  it("returns successful raw JSON for operational endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      apiFetch<{ ready: boolean }>("/api/runtime/capabilities", {
        responseFormat: "raw-json",
      }),
    ).resolves.toEqual({ ready: true });
  });

  it("prefers the shared snake-case business error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error_code: "AI_OPERATION_SETTLEMENT_PENDING",
            errorCode: "LEGACY_CODE",
            message: "pending",
            data: { actionId: "action-1" },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      apiFetch("/ai/operations/action-1"),
    ).rejects.toMatchObject({
      status: 409,
      errorCode: "AI_OPERATION_SETTLEMENT_PENDING",
      data: { actionId: "action-1" },
    });
  });

  it("preserves suppressErrorToast as a global notification suppression flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Health data is temporarily unavailable",
          errorCode: "HEALTH_DATA_UNAVAILABLE",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/health-data/overview", { suppressErrorToast: true }),
    ).rejects.toMatchObject({
      status: 500,
      errorCode: "HEALTH_DATA_UNAVAILABLE",
      suppressNotification: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty(
      "suppressErrorToast",
    );
  });

  it("preserves the consent business code and notifies active consent gates", async () => {
    const listener = vi.fn();
    window.addEventListener("trainingload:ai-data-consent-required", listener);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 10015,
            message: "Forbidden",
            data: null,
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(apiFetch("/ai/today-suggestion")).rejects.toMatchObject({
      status: 403,
      errorCode: "10015",
      suppressNotification: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      "trainingload:ai-data-consent-required",
      listener,
    );
  });
});
