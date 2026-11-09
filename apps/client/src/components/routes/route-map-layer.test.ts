import { describe, expect, it } from "vitest";
import { decode } from "@mapbox/polyline";
import { savedRouteMapLayer } from "./route-map-layer";
describe("local route rendering", () => {
  it("keeps original gaps as separate map lines", () => {
    const geometry: any = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [0.001, 0],
        ],
        [
          [100, 1],
          [100.001, 1],
        ],
      ],
    };
    const layer = savedRouteMapLayer(geometry);
    expect(layer.maps).toHaveLength(2);
    expect(decode(layer.maps[0].polyline)).toEqual([
      [0, 0],
      [0, 0.001],
    ]);
    expect(geometry.coordinates[1][0]).toEqual([100, 1]);
  });
  it("fits a crossing of the date line without spanning the whole world", () => {
    const geometry: any = {
      type: "MultiLineString",
      coordinates: [
        [
          [179.999, 1],
          [-179.999, 1],
        ],
      ],
    };
    const layer = savedRouteMapLayer(geometry);
    expect(layer.bounds![1][1] - layer.bounds![0][1]).toBeCloseTo(0.002);
    expect(geometry.coordinates[0][1][0]).toBe(-179.999);
  });
});
