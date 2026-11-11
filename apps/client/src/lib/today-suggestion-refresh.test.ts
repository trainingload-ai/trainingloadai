import { afterEach, describe, expect, it, vi } from "vitest";
import { createTodaySuggestionRefetchInterval } from "@shared/today-suggestion-refresh";

describe("shared today suggestion refresh lifecycle", () => {
  afterEach(() => vi.useRealTimers());
  it("schedules the next local day from server expiry without periodic model polling", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-11-11T12:00:00Z"));
    const interval = createTodaySuggestionRefetchInterval();
    expect(
      interval({
        state: {
          data: {
            suggestionId: "daily",
            validUntil: "2026-11-11T16:00:00Z",
            delivery: { state: "GENERATED" },
          },
          dataUpdatedAt: 1,
        },
      }),
    ).toBe(4 * 3_600_000);
  });
  it("limits retries for the same pending generation and restarts on genuinely new facts", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-11-11T12:00:00Z"));
    const interval = createTodaySuggestionRefetchInterval();
    const data = {
      suggestionId: "pending",
      validUntil: "2026-11-11T12:00:30Z",
      evidence: [{ code: "ACTIVITY_PROCESSING_PENDING" }],
    };
    for (let index = 1; index < 5; index += 1) {
      expect(interval({ state: { data, dataUpdatedAt: index } })).toBe(30_000);
      expect(interval({ state: { data, dataUpdatedAt: index } })).toBe(30_000);
    }
    expect(interval({ state: { data, dataUpdatedAt: 5 } })).toBe(false);
    expect(
      interval({
        state: {
          data: { ...data, suggestionId: "new-facts" },
          dataUpdatedAt: 6,
        },
      }),
    ).toBe(30_000);
  });
  it("stops when offline instead of retrying expired data every second", () => {
    const interval = createTodaySuggestionRefetchInterval();
    expect(interval({ state: { status: "error", dataUpdatedAt: 0 } })).toBe(
      false,
    );
  });
});
