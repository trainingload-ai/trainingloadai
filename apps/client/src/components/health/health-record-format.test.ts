import { describe, it, expect } from "vitest";
import { formatObservationTime } from "./health-record-format";
describe("recorded observation clock", () => {
  it("preserves source offset across midnight independently of viewer timezone", () => {
    expect(
      formatObservationTime(
        "2026-10-31T23:30:00Z",
        28800,
        "America/Los_Angeles",
        "zh-CN",
      ),
    ).toBe("2026-11-01 07:30:00 UTC+08:00");
  });
  it("keeps missing times missing and represents offsets without rounding", () => {
    expect(formatObservationTime(null, null, null, "en")).toBe("—");
    expect(
      formatObservationTime("2026-11-01T00:00:00Z", -12630, null, "en"),
    ).toContain("2026-10-31 20:29:30 UTC-03:30:30");
  });
});
