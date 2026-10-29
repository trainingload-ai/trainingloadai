import { describe, expect, it } from "vitest";
import { resolveCoachActivityLoad } from "./coach-activity-load";

describe("resolveCoachActivityLoad", () => {
  it("uses the authoritative activity-feed load when present", () => {
    expect(resolveCoachActivityLoad({ load: 51.6, tss: 0, trimp: 73 })).toBe(
      52,
    );
  });

  it("does not let a zero legacy TSS hide a valid TRIMP value", () => {
    expect(resolveCoachActivityLoad({ tss: 0, trimp: 51.6 })).toBe(52);
  });

  it("preserves an explicit zero when no positive legacy load exists", () => {
    expect(resolveCoachActivityLoad({ tss: 0 })).toBe(0);
  });

  it("keeps missing and invalid loads hidden", () => {
    expect(resolveCoachActivityLoad({ load: Number.NaN })).toBeUndefined();
  });
});
