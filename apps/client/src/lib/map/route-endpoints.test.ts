import { describe, expect, it } from "vitest";
import { buildRouteEndpointGeoJson } from "./route-endpoints";

describe("route endpoints", () => {
  it("uses the first and final coordinate across route segments", () => {
    const data = buildRouteEndpointGeoJson([
      { routeId: "a", coordinates: [[1, 2], [3, 4]] },
      { routeId: "a", coordinates: [[5, 6], [7, 8]] },
    ]);

    expect(data.features).toEqual([
      expect.objectContaining({
        properties: { routeId: "a", endpoint: "start" },
        geometry: { type: "Point", coordinates: [1, 2] },
      }),
      expect.objectContaining({
        properties: { routeId: "a", endpoint: "end" },
        geometry: { type: "Point", coordinates: [7, 8] },
      }),
    ]);
  });

  it("ignores invalid and one-point routes", () => {
    expect(
      buildRouteEndpointGeoJson([
        { routeId: "short", coordinates: [[1, 2]] },
        { routeId: "invalid", coordinates: [[Number.NaN, 2], [3, 4]] },
      ]).features,
    ).toEqual([]);
  });
});
