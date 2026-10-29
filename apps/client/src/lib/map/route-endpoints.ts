import type { GeoJSONSource, Map } from "@deployment/map-engine";

export type RouteLine = {
  routeId: string;
  coordinates: Array<[number, number]>;
};

export function buildRouteEndpointGeoJson(routes: RouteLine[]) {
  const grouped = new globalThis.Map<
    string,
    { first: [number, number]; last: [number, number] }
  >();
  for (const route of routes) {
    const coordinates = route.coordinates.filter(
      ([longitude, latitude]) =>
        Number.isFinite(longitude) && Number.isFinite(latitude),
    );
    if (coordinates.length < 2) continue;
    const existing = grouped.get(route.routeId);
    if (existing) {
      existing.last = coordinates.at(-1)!;
    } else {
      grouped.set(route.routeId, {
        first: coordinates[0]!,
        last: coordinates.at(-1)!,
      });
    }
  }

  return {
    type: "FeatureCollection" as const,
    features: [...grouped.entries()].flatMap(([routeId, endpoints]) => [
      {
        type: "Feature" as const,
        properties: { routeId, endpoint: "start" as const },
        geometry: { type: "Point" as const, coordinates: endpoints.first },
      },
      {
        type: "Feature" as const,
        properties: { routeId, endpoint: "end" as const },
        geometry: { type: "Point" as const, coordinates: endpoints.last },
      },
    ]),
  };
}

export function upsertRouteEndpointLayer(
  map: Map,
  args: {
    routes: RouteLine[];
    sourceId: string;
    layerId: string;
    minzoom?: number;
  },
) {
  const data = buildRouteEndpointGeoJson(args.routes);
  const source = map.getSource(args.sourceId) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(args.sourceId, { type: "geojson", data });
  if (map.getLayer(args.layerId)) return;
  map.addLayer({
    id: args.layerId,
    type: "circle",
    source: args.sourceId,
    ...(typeof args.minzoom === "number" ? { minzoom: args.minzoom } : {}),
    paint: {
      "circle-radius": 5,
      "circle-color": [
        "match",
        ["get", "endpoint"],
        "start",
        "#ffffff",
        "#f97316",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": [
        "match",
        ["get", "endpoint"],
        "start",
        "#f97316",
        "#ffffff",
      ],
    },
  });
}
