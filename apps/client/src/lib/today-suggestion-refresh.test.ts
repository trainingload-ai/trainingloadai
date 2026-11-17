import { afterEach, describe, expect, it, vi } from "vitest";
import { createTodaySuggestionRefetchInterval } from "./today-suggestion-refresh";

describe("today guidance transport refresh", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps checking the backend while the page is open even when today's content is cached", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-11-18T12:00:00Z"));
    const interval = createTodaySuggestionRefetchInterval();
    for (let request = 0; request < 12; request++)
      expect(
        interval({ state: { data: { validUntil: "2026-11-18T16:00:00Z" } } }),
      ).toBe(120_000);
  });
  it("honors the server retry deadline without counting model attempts in the browser", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-11-18T12:00:00Z"));
    expect(
      createTodaySuggestionRefetchInterval()({
        state: { data: { retryAt: "2026-11-18T12:01:00Z" } },
      }),
    ).toBe(60_000);
  });
  it("refreshes at an earlier server expiry and avoids a tight loop on errors", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-11-18T12:00:00Z"));
    const interval = createTodaySuggestionRefetchInterval();
    expect(
      interval({ state: { data: { validUntil: "2026-11-18T12:00:30Z" } } }),
    ).toBe(30_000);
    expect(interval({ state: { status: "error" } })).toBe(120_000);
  });
});
