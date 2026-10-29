import { describe, expect, it } from "vitest";
import type { ActivityPeakMetric } from "@/api/activities";
import {
  getBestIntervalDefaultBreakdown,
  peakTimeRangeLabel,
  selectDisplayPeaks,
} from "./BestIntervals";

const peak = (overrides: Partial<ActivityPeakMetric>): ActivityPeakMetric => ({
  id: "peak",
  type: "power",
  scaleType: "TIME",
  scaleValue: 60,
  value: 300,
  startElapsedSec: 10,
  endElapsedSec: 70,
  ...overrides,
});

describe("best interval presentation", () => {
  it("defaults running to distance and cycling to time", () => {
    expect(getBestIntervalDefaultBreakdown("RUN", true)).toBe("distance");
    expect(getBestIntervalDefaultBreakdown("CYCLING", true)).toBe("time");
    expect(getBestIntervalDefaultBreakdown("RUN", false)).toBe("time");
  });

  it("keeps useful scales and removes short running spikes", () => {
    const result = selectDisplayPeaks(
      [
        peak({ id: "one-second", scaleValue: 1 }),
        peak({ id: "one-minute", scaleValue: 60 }),
        peak({
          id: "one-kilometer",
          type: "pace",
          scaleType: "DISTANCE",
          scaleValue: 1000,
        }),
      ],
      "RUN",
    );

    expect(result.map((item) => item.id)).toEqual([
      "one-minute",
      "one-kilometer",
    ]);
  });

  it("shows the actual start and end time for each time-based result", () => {
    expect(
      peakTimeRangeLabel(peak({ startElapsedSec: 2530, endElapsedSec: 2590 })),
    ).toBe("0:42:10–0:43:10");
  });
});
