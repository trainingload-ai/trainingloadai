import * as mapengine from "@deployment/map-engine";
import type { LineLayerSpecification } from "@deployment/map-engine";
import { decode as decodePolyline } from "@mapbox/polyline";
import { upsertRouteEndpointLayer } from "./route-endpoints";

export type ActivityTrackLike = {
  hashId: string;
  polyline: string;
  startTime?: string;
};

type LineFeature = {
  type: "Feature";
  id: number;
  properties: {
    hashId: string;
    ageBucket?: number;
  };
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
};

export type ActivitiesGeoJson = {
  type: "FeatureCollection";
  features: LineFeature[];
};

type BuildOptions = {
  includeAgeBucket?: boolean;
};

export function buildActivitiesGeoJson(
  tracks: ActivityTrackLike[] = [],
  options: BuildOptions = {},
): ActivitiesGeoJson {
  const now = Date.now();
  const includeAgeBucket = options.includeAgeBucket === true;
  const features: LineFeature[] = [];

  for (let idx = 0; idx < tracks.length; idx += 1) {
    const track = tracks[idx]!;
    try {
      const coordinates = decodePolyline(track.polyline)
        .map(([lat, lng]) => [lng, lat] as [number, number])
        .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
      if (coordinates.length < 2) continue;

      let ageBucket: number | undefined;
      if (includeAgeBucket) {
        const startMs = track.startTime ? Date.parse(track.startTime) : NaN;
        const ageDays = Number.isFinite(startMs)
          ? Math.max(0, (now - startMs) / (1000 * 60 * 60 * 24))
          : Number.POSITIVE_INFINITY;
        ageBucket =
          ageDays <= 7
            ? 0
            : ageDays <= 30
              ? 1
              : ageDays <= 90
                ? 2
                : ageDays <= 180
                  ? 3
                  : ageDays <= 365
                    ? 4
                    : 5;
      }

      features.push({
        type: "Feature",
        id: idx,
        properties: {
          hashId: track.hashId,
          ...(typeof ageBucket === "number" ? { ageBucket } : {}),
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      });
    } catch {
      // ignore malformed polyline rows
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function upsertActivitiesGeoJsonSource(
  map: mapengine.Map,
  sourceId: string,
  data: ActivitiesGeoJson,
) {
  const existingSource = map.getSource(sourceId) as
    | mapengine.GeoJSONSource
    | undefined;
  if (existingSource) {
    existingSource.setData(data);
    return;
  }
  map.addSource(sourceId, {
    type: "geojson",
    data,
    tolerance: 0,
    lineMetrics: true,
  });
}

type ActivitiesLineLayerOptions = {
  sourceId: string;
  layerId: string;
  data: ActivitiesGeoJson;
  layout?: LineLayerSpecification["layout"];
  paint?: LineLayerSpecification["paint"];
  minzoom?: number;
  maxzoom?: number;
};

export function applyActivitiesLineLayer(
  map: mapengine.Map,
  options: ActivitiesLineLayerOptions,
) {
  upsertActivitiesGeoJsonSource(map, options.sourceId, options.data);
  if (map.getLayer(options.layerId)) return;

  map.addLayer({
    id: options.layerId,
    type: "line",
    source: options.sourceId,
    ...(typeof options.minzoom === "number"
      ? { minzoom: options.minzoom }
      : {}),
    ...(typeof options.maxzoom === "number"
      ? { maxzoom: options.maxzoom }
      : {}),
    layout: options.layout ?? {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: options.paint ?? {
      "line-color": "#22c55e",
      "line-opacity": 0.55,
      "line-width": 1.5,
    },
  });
}

export function applyActivitiesEndpointLayer(
  map: mapengine.Map,
  data: ActivitiesGeoJson,
  minzoom = 8,
) {
  upsertRouteEndpointLayer(map, {
    sourceId: "activities-endpoints-source",
    layerId: "activities-endpoints-layer",
    minzoom,
    routes: data.features.map((feature) => ({
      routeId: feature.properties.hashId,
      coordinates: feature.geometry.coordinates,
    })),
  });
}
