import { describe, expect, it } from "vitest";
import { formatStrideLength, getLapColumnGroup } from "./ActivityLaps";

describe("activity lap column groups", () => {
  it("groups related metrics for visual scanning", () => {
    expect(getLapColumnGroup("duration")).toBe("lap");
    expect(getLapColumnGroup("gap")).toBe("pace");
    expect(getLapColumnGroup("avgHeartRate")).toBe("heartRate");
    expect(getLapColumnGroup("maxPower")).toBe("power");
    expect(getLapColumnGroup("elevation")).toBe("terrain");
    expect(getLapColumnGroup("verticalRatio")).toBe("dynamics");
    expect(getLapColumnGroup("temperature")).toBe("other");
  });

  it("converts FIT step length from millimeters to meters", () => {
    expect(formatStrideLength(958.3)).toBe("0.96 m");
    expect(formatStrideLength(undefined)).toBe("-");
  });
});
