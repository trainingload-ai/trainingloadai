import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getApiBaseUrl: () => "https://api.test",
  getRegion: () => "international",
}));

import {
  confirmAndApplyCoachDecision,
  fetchPendingCoachDecisions,
  rejectCoachDecision,
} from "../ai-coach";

describe("pending coach decision client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads pending decisions from the list envelope", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { decisions: [{ id: "dec-1" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchPendingCoachDecisions()).resolves.toEqual([
      { id: "dec-1" },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/ai/coach/pending-decisions",
    );
  });

  it("approves with the default apply option before applying", async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(JSON.stringify({ data: { result: "APPLIED" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await confirmAndApplyCoachDecision("dec-1");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.test/ai/coach/decisions/dec-1/approve",
      "https://api.test/ai/coach/decisions/dec-1/apply",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      selectedOptionKey: "apply",
    });
  });

  it("does not apply when approve fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "already applied" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(confirmAndApplyCoachDecision("dec-1")).rejects.toThrow(
      "already applied",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat apply conflict as success", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { result: "REBASE_REQUIRED" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    await expect(confirmAndApplyCoachDecision("dec-1")).rejects.toMatchObject({
      name: "CoachApplyNotAppliedError",
      applyResult: "REBASE_REQUIRED",
    });
  });

  it("rejects a home-card dismissal", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await rejectCoachDecision("dec-1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/ai/coach/decisions/dec-1/reject",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reason: "user_dismissed_home_card",
    });
  });
});
