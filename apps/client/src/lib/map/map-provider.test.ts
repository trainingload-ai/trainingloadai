import { describe, expect, it } from "vitest";
import type { RuntimeMapConfiguration } from "@/api/runtime-capabilities";
import { createMapProvider, routeOnlyStyle } from "./map-provider";

function config(
  overrides: Partial<RuntimeMapConfiguration> = {},
): RuntimeMapConfiguration {
  return {
    provider: "none",
    styleUrl: null,
    tileUrl: null,
    attribution: null,
    maxZoom: 18,
    publicToken: null,
    tilePolicy: { browserOnly: false, bulkDownloadAllowed: false },
    ...overrides,
  };
}

describe("MapProvider", () => {
  it("renders a local route canvas without any remote source", () => {
    const provider = createMapProvider(config());

    expect(provider.routeOnly).toBe(true);
    expect(provider.attributionControl).toBe(false);
    expect(provider.style("light")).toEqual(routeOnlyStyle("light"));
    expect((provider.style("light") as { sources: object }).sources).toEqual(
      {},
    );
  });

  it("keeps OSM attribution on the raster source", () => {
    const provider = createMapProvider(
      config({
        provider: "osm-raster",
        tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors",
        tilePolicy: { browserOnly: true, bulkDownloadAllowed: false },
      }),
    );
    const style = provider.style("light") as unknown as {
      sources: { basemap: { attribution: string; tiles: string[] } };
    };

    expect(provider.attributionControl).toEqual({});
    expect(style.sources.basemap).toMatchObject({
      attribution: "© OpenStreetMap contributors",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    });
  });

  it("loads the fixed OpenFreeMap vector style with native attribution", () => {
    const provider = createMapProvider(
      config({
        provider: "openfreemap",
        styleUrl: "https://tiles.openfreemap.org/styles/liberty",
        attribution: "© OpenMapTiles © OpenStreetMap contributors",
        tilePolicy: { browserOnly: true, bulkDownloadAllowed: false },
      }),
    );

    expect(provider.name).toBe("openfreemap");
    expect(provider.routeOnly).toBe(false);
    expect(provider.attributionControl).toEqual({});
    expect(provider.style("dark")).toBe(
      "https://tiles.openfreemap.org/styles/liberty",
    );
  });

  it("shows operator supplied attribution for external style providers", () => {
    const provider = createMapProvider(
      config({
        provider: "custom-style",
        styleUrl: "https://maps.example/style.json",
        attribution: "© Example Maps",
      }),
    );

    expect(provider.attributionControl).toEqual({
      customAttribution: "© Example Maps",
    });
  });

  it("falls back to route-only when a selected provider is incomplete", () => {
    const provider = createMapProvider(config({ provider: "custom-raster" }));
    expect(provider.routeOnly).toBe(true);
  });

  it("keeps native Mapbox style URLs for the managed Mapbox SDK", () => {
    const provider = createMapProvider(
      config({ provider: "mapbox", publicToken: "pk.test" }),
    );

    expect(provider.style("light")).toBe("mapbox://styles/mapbox/outdoors-v12");
    expect(provider.style("dark")).toBe("mapbox://styles/mapbox/dark-v11");
  });
});
