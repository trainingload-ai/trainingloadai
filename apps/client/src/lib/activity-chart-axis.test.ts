import { describe, expect, it } from "vitest";

import { resolveActivityChartXAxis } from "./activity-chart-axis";

describe("resolveActivityChartXAxis", () => {
  it("preserves an explicit time preference", () => {
    expect(
      resolveActivityChartXAxis("time", [{ distance: 0 }, { distance: 1000 }]),
    ).toBe("time");
  });

  it("uses distance when cumulative distance progresses", () => {
    expect(
      resolveActivityChartXAxis("distance", [
        { distance: 0 },
        { distance: 250 },
      ]),
    ).toBe("distance");
  });

  it("falls back to time for a distance-less activity", () => {
    expect(
      resolveActivityChartXAxis("distance", [{ distance: 0 }, { distance: 0 }]),
    ).toBe("time");
  });
});
