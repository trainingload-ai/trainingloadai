import { describe, expect, it } from "vitest";
import { splitActivityDateRange } from "./useActivities";

describe("splitActivityDateRange", () => {
  it("keeps a server-safe range unchanged", () => {
    expect(splitActivityDateRange("2026-07-01", "2026-07-31")).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-31" },
    ]);
  });

  it("splits the calendar's seven-month range into safe requests", () => {
    expect(splitActivityDateRange("2026-04-01", "2026-10-31")).toEqual([
      { startDate: "2026-04-01", endDate: "2026-06-30" },
      { startDate: "2026-07-01", endDate: "2026-09-30" },
      { startDate: "2026-10-01", endDate: "2026-10-31" },
    ]);
  });

  it("splits an exact three-month endpoint because end-of-day exceeds the limit", () => {
    expect(splitActivityDateRange("2026-04-01", "2026-07-01")).toEqual([
      { startDate: "2026-04-01", endDate: "2026-06-30" },
      { startDate: "2026-07-01", endDate: "2026-07-01" },
    ]);
  });
});
