import { describe, expect, it } from "vitest";
import {
  ESTIMATED_LTHR_MAX_HR_RATIO,
  resolveLthrForCalculation,
} from "@shared/lthr";

describe("resolveLthrForCalculation", () => {
  it("prefers a real LTHR", () => {
    expect(resolveLthrForCalculation({ lthr: 172, maxHeartRate: 200 })).toEqual(
      { value: 172, source: "PROFILE" },
    );
  });

  it("estimates from MAXHR only when real LTHR is missing", () => {
    expect(ESTIMATED_LTHR_MAX_HR_RATIO).toBe(0.88);
    expect(resolveLthrForCalculation({ maxHeartRate: 190 })).toEqual({
      value: 167,
      source: "ESTIMATED_MAX_HR",
    });
  });

  it("returns undefined when neither input is usable", () => {
    expect(resolveLthrForCalculation({})).toBeUndefined();
  });
});
