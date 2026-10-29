import { describe, expect, it } from "vitest";
import {
  buildWorkoutTrendChartData,
  formatPace,
  speedMpsToPaceSecPerKm,
} from "./workout-trend-model";

describe("workout trend presentation", () => {
  it("formats running speed as pace instead of metres per second", () => {
    expect(speedMpsToPaceSecPerKm(2.871)).toBeCloseTo(348.31, 2);
    expect(formatPace(348.31)).toBe("5:48");
  });

  it("uses privacy-safe distance or elapsed axes and converts non-running speed to km/h", () => {
    const points = [
      { index: 0, distanceM: 0, elapsedSec: 0, speedMps: 5, heartRateBpm: 120 },
      { index: 1, distanceM: 1_000, elapsedSec: 200, speedMps: 6, heartRateBpm: 150 },
    ];

    const running = buildWorkoutTrendChartData(points, "RUN");
    const cycling = buildWorkoutTrendChartData(points, "CYCLING");

    expect(running.axis).toBe("distance");
    expect(running.data[1]).toMatchObject({ x: 1, paceSecPerKm: 166.67 });
    expect(cycling.data[1]).toMatchObject({ x: 1, speedKph: 21.6 });
    expect(JSON.stringify(running)).not.toMatch(/timestamp|latitude|longitude/i);
  });
});
