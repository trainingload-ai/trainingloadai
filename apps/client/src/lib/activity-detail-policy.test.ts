import { describe, expect, it } from "vitest";
import type { Activity } from "@/api/activities";
import { isActivityDetailTabVisible } from "./activity-detail-policy";

describe("activity detail best-efforts tab", () => {
  it("only shows the tab when a peak has a valid interval boundary", () => {
    const activity = {
      sportType: "RUN",
      activityPeakMetrics: [
        {
          id: "peak-1",
          type: "pace",
          scaleType: "DISTANCE",
          scaleValue: 1000,
          value: 3.2,
          startElapsedSec: 120,
          endElapsedSec: 420,
        },
      ],
    } as Activity;

    expect(isActivityDetailTabVisible(activity, "bestIntervals")).toBe(true);
    expect(
      isActivityDetailTabVisible(
        { ...activity, activityPeakMetrics: [] },
        "bestIntervals",
      ),
    ).toBe(false);
  });
});
