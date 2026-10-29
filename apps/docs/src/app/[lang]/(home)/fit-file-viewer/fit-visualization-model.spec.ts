import { describe, expect, it } from "vitest";
import { buildFitVisualization } from "./fit-visualization-model";
import type { FitMessage } from "./fit-view-model";

function semicircles(degrees: number) {
  return Math.round((degrees * 2 ** 31) / 180);
}

describe("FIT viewer visualization model", () => {
  it("builds a local 3D route from FIT semicircle coordinates", () => {
    const records: FitMessage[] = [
      {
        timestamp: "2026-09-09T08:00:00.000Z",
        positionLat: semicircles(31.2304),
        positionLong: semicircles(121.4737),
        enhancedAltitude: 12,
        distance: 0,
      },
      {
        timestamp: "2026-09-09T08:00:10.000Z",
        positionLat: semicircles(31.2305),
        positionLong: semicircles(121.4738),
        enhancedAltitude: 16,
        distance: 20,
      },
    ];
    const result = buildFitVisualization(records);

    expect(result.route3d).toHaveLength(2);
    expect(result.route3d[1].xM).toBeGreaterThan(result.route3d[0].xM);
    expect(result.route3d[1].zM).toBeLessThan(result.route3d[0].zM);
    expect(result.route3d.map((point) => point.speedMps)).toEqual([2, 2]);
    expect(result.verticalExaggeration).toBeGreaterThanOrEqual(2);
  });

  it("exposes available record metrics and falls back without a route", () => {
    const result = buildFitVisualization([
      {
        timestamp: "2026-09-09T08:00:00.000Z",
        heartRate: 130,
        power: 210,
        cadence: 82,
        fractionalCadence: 0.5,
        temperature: 21,
        grade: 2.3,
      },
      {
        timestamp: "2026-09-09T08:00:01.000Z",
        heartRate: 132,
        power: 220,
        cadence: 83,
      },
    ]);

    expect(result.route3d).toEqual([]);
    expect(result.trends[0]).toMatchObject({
      elapsedSec: 0,
      heartRateBpm: 130,
      powerW: 210,
      cadenceRpm: 82.5,
      temperatureC: 21,
      gradePercent: 2.3,
    });
  });

  it("keeps short metric peaks when large record sets are reduced for charts", () => {
    const records = Array.from(
      { length: 5_000 },
      (_, index): FitMessage => ({
        timestamp: new Date(Date.UTC(2026, 8, 9, 8, 0, index)).toISOString(),
        distance: index * 3,
        heartRate: index === 2_503 ? 203 : 130,
        power: index === 1_337 ? 1_100 : 210,
      }),
    );

    const result = buildFitVisualization(records);

    expect(result.trends.length).toBeLessThanOrEqual(1_200);
    expect(result.trends.some((point) => point.heartRateBpm === 203)).toBe(
      true,
    );
    expect(result.trends.some((point) => point.powerW === 1_100)).toBe(true);
    expect(result.trends.at(0)?.index).toBe(0);
    expect(result.trends.at(-1)?.index).toBe(4_999);
  });
});
