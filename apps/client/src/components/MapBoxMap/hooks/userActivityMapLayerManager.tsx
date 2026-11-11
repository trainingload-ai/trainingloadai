import { useEffect, useMemo, useRef, useState } from "react";
import * as mapengine from "@deployment/map-engine";
import { useStore } from "@/lib/store";
import { useTheme } from "next-themes";
import { addLayersToMap } from "../util";
import { attachFocusMarker } from "../focus-marker";
import { useRuntimeMapConfiguration } from "@/api/runtime-capabilities";
import { createMapProvider, routeOnlyStyle } from "@/lib/map/map-provider";
import {
  coordinateAtRouteDistance,
  decodeActivityTracks,
  sliceRouteByDistance,
  type RouteCoordinate,
} from "../activity-route-focus";

interface Track {
  hashId: string;
  polyline: string;
  startTime?: string;
}

export interface ActivityLayer {
  maps: Track[];
  center?: [number, number];
  bounds?: [[number, number], [number, number]];
}

export type ActivityMapPadding = number | mapengine.PaddingOptions;

interface UseActivityLayerManagerProps {
  activityLayer: ActivityLayer | undefined;
  containerId?: string;
  fitBoundsPadding?: ActivityMapPadding;
  interactive?: boolean;
  lockedFitBoundsPadding?: ActivityMapPadding;
  focusDistanceM?: number | null;
  focusRangeM?: readonly [number, number] | null;
  focusCoordinate?: RouteCoordinate | null;
  focusTracks?: RouteCoordinate[][] | null;
  autoFitFocus?: boolean;
}

const FOCUS_SOURCE_ID = "activity-focus-source";
const FOCUS_CASING_LAYER_ID = "activity-focus-casing";
const FOCUS_LINE_LAYER_ID = "activity-focus-line";
const FOCUS_ENDPOINT_LAYER_ID = "activity-focus-endpoints";
const FOCUS_ENDPOINT_LABEL_LAYER_ID = "activity-focus-endpoint-labels";
const FOCUS_COLOR = "#2f7d61";

function useStablePadding(padding: ActivityMapPadding) {
  const top = typeof padding === "number" ? padding : (padding.top ?? 0);
  const bottom = typeof padding === "number" ? padding : (padding.bottom ?? 0);
  const left = typeof padding === "number" ? padding : (padding.left ?? 0);
  const right = typeof padding === "number" ? padding : (padding.right ?? 0);
  return useMemo(
    () => ({ top, bottom, left, right }),
    [top, bottom, left, right],
  );
}

function syncMapStyle(map: mapengine.Map, update: () => void) {
  const apply = () => {
    map.off("idle", apply);
    update();
  };
  map.on("style.load", apply);
  // Source updates can temporarily make isStyleLoaded() false after the
  // initial load; wait for idle in that case, not an already-fired load event.
  if (map.isStyleLoaded()) apply();
  else map.once("idle", apply);
  return () => {
    map.off("style.load", apply);
    map.off("idle", apply);
  };
}

export const useActivityLayerManager = ({
  activityLayer,
  containerId = "map-container",
  fitBoundsPadding = 100,
  interactive = true,
  lockedFitBoundsPadding = 50,
  focusDistanceM = null,
  focusRangeM = null,
  focusCoordinate,
  focusTracks,
  autoFitFocus = true,
}: UseActivityLayerManagerProps) => {
  const [map, setMap] = useState<mapengine.Map | null>(null);
  const mapRef = useRef<mapengine.Map | null>(null);
  const focusMarkerRef = useRef<null | mapengine.Marker>(null);
  const hadFocusRangeRef = useRef(false);
  const { systemUnit } = useStore();
  const { theme } = useTheme();
  const { config: mapConfig, isLoading: isMapConfigLoading } =
    useRuntimeMapConfiguration();
  const mapProvider = useMemo(
    () => (mapConfig ? createMapProvider(mapConfig) : null),
    [
      mapConfig?.provider,
      mapConfig?.styleUrl,
      mapConfig?.tileUrl,
      mapConfig?.attribution,
      mapConfig?.maxZoom,
      mapConfig?.publicToken,
    ],
  );
  const centerLng = activityLayer?.center?.[0];
  const centerLat = activityLayer?.center?.[1];
  const swLat = activityLayer?.bounds?.[0]?.[0];
  const swLng = activityLayer?.bounds?.[0]?.[1];
  const neLat = activityLayer?.bounds?.[1]?.[0];
  const neLng = activityLayer?.bounds?.[1]?.[1];
  const bounds = useMemo<[[number, number], [number, number]] | null>(
    () =>
      swLat != null && swLng != null && neLat != null && neLng != null
        ? [
            [swLng, swLat],
            [neLng, neLat],
          ]
        : null,
    [swLat, swLng, neLat, neLng],
  );
  const padding = useStablePadding(fitBoundsPadding);
  const lockedPadding = useStablePadding(lockedFitBoundsPadding);
  const lastFramingRef = useRef<{
    map: mapengine.Map;
    bounds: typeof bounds;
    padding: mapengine.PaddingOptions;
    interactive: boolean;
  } | null>(null);

  // Route/focus updates must not tear down the basemap or reset its camera.
  useEffect(() => {
    if (centerLng == null || centerLat == null || !mapProvider) return;
    mapengine.configureMapEngine(mapConfig ?? undefined);
    const currentMap = new mapengine.Map({
      container: containerId,
      style: mapProvider.style(theme === "dark" ? "dark" : "light"),
      center: [centerLng, centerLat],
      zoom: 9,
      interactive: false,
      maxZoom: mapConfig?.maxZoom ?? 18,
      ...mapengine.getMapAttributionOptions(mapProvider.attributionControl),
    });
    currentMap.addControl(
      new mapengine.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );
    let styleFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const clearStyleFallback = () => {
      clearTimeout(styleFallbackTimer);
      styleFallbackTimer = undefined;
    };
    if (!mapProvider.routeOnly) {
      currentMap.once("style.load", clearStyleFallback);
      styleFallbackTimer = setTimeout(() => {
        if (!currentMap.isStyleLoaded()) {
          currentMap.setStyle(
            routeOnlyStyle(theme === "dark" ? "dark" : "light"),
          );
        }
      }, 8_000);
    }
    const resizeObserver = new ResizeObserver(() => currentMap.resize());
    resizeObserver.observe(currentMap.getContainer());
    mapRef.current = currentMap;
    setMap(currentMap);
    return () => {
      clearStyleFallback();
      resizeObserver.disconnect();
      focusMarkerRef.current?.remove();
      focusMarkerRef.current = null;
      hadFocusRangeRef.current = false;
      currentMap.remove();
      if (mapRef.current === currentMap) mapRef.current = null;
    };
  }, [
    centerLng,
    centerLat,
    containerId,
    mapConfig?.maxZoom,
    mapProvider,
    theme,
  ]);

  useEffect(() => {
    if (!map || mapRef.current !== map) return;
    const updateRoute = () =>
      addLayersToMap(map, activityLayer?.maps ?? [], systemUnit);
    return syncMapStyle(map, updateRoute);
  }, [map, activityLayer?.maps, systemUnit]);

  useEffect(() => {
    if (!map || mapRef.current !== map) return;
    const controls = [
      map.scrollZoom,
      map.boxZoom,
      map.dragRotate,
      map.dragPan,
      map.keyboard,
      map.doubleClickZoom,
      map.touchZoomRotate,
    ];
    for (const control of controls) {
      if (interactive) control.enable();
      else control.disable();
    }
  }, [map, interactive]);

  useEffect(() => {
    if (!map || mapRef.current !== map || !bounds) return;
    const currentPadding = interactive ? padding : lockedPadding;
    const previous = lastFramingRef.current;
    lastFramingRef.current = {
      map,
      bounds,
      padding: currentPadding,
      interactive,
    };
    const changedRoute = previous?.map !== map || previous.bounds !== bounds;
    const locking = previous?.interactive === true && !interactive;
    if (
      changedRoute ||
      locking ||
      (previous?.interactive === interactive &&
        previous.padding !== currentPadding)
    ) {
      map.fitBounds(bounds, {
        padding: currentPadding,
        maxZoom: 15,
        duration: changedRoute ? 0 : 800,
      });
    }
  }, [map, bounds, interactive, padding, lockedPadding]);

  useEffect(() => {
    if (!map || mapRef.current !== map || !activityLayer) return;

    const setLayerVisibility = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          visible ? "visible" : "none",
        );
      }
    };
    const restoreWholeRoute = () => {
      if (map.getLayer("activities-layer")) {
        map.setPaintProperty("activities-layer", "line-opacity", 0.8);
      }
      setLayerVisibility("distance-markers-circle", true);
      setLayerVisibility("distance-markers-label", true);
      setLayerVisibility(FOCUS_CASING_LAYER_ID, false);
      setLayerVisibility(FOCUS_LINE_LAYER_ID, false);
      setLayerVisibility(FOCUS_ENDPOINT_LAYER_ID, false);
      setLayerVisibility(FOCUS_ENDPOINT_LABEL_LAYER_ID, false);

      if (
        autoFitFocus &&
        hadFocusRangeRef.current &&
        activityLayer.bounds?.length === 2
      ) {
        const [[swLat, swLng], [neLat, neLng]] = activityLayer.bounds;
        map.fitBounds(
          [
            [swLng, swLat],
            [neLng, neLat],
          ],
          {
            padding: lockedPadding,
            maxZoom: 15,
            duration: 650,
          },
        );
      }
      hadFocusRangeRef.current = false;
    };
    const updateFocusedRoute = () => {
      if (focusTracks === null || (focusTracks === undefined && !focusRangeM)) {
        restoreWholeRoute();
        return;
      }

      const focusedTracks =
        focusTracks ??
        sliceRouteByDistance(
          decodeActivityTracks(activityLayer.maps),
          focusRangeM![0],
          focusRangeM![1],
        );
      if (!focusedTracks.length) {
        restoreWholeRoute();
        return;
      }

      const focusData = {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: { kind: "range" },
            geometry: {
              type: "MultiLineString" as const,
              coordinates: focusedTracks,
            },
          },
          {
            type: "Feature" as const,
            properties: { kind: "endpoint", endpoint: "start" },
            geometry: {
              type: "Point" as const,
              coordinates: focusedTracks[0][0],
            },
          },
          {
            type: "Feature" as const,
            properties: { kind: "endpoint", endpoint: "end" },
            geometry: {
              type: "Point" as const,
              coordinates: focusedTracks.at(-1)?.at(-1) ?? focusedTracks[0][0],
            },
          },
        ],
      };
      const existingSource = map.getSource(
        FOCUS_SOURCE_ID,
      ) as mapengine.GeoJSONSource;
      if (existingSource) {
        existingSource.setData(focusData);
      } else {
        map.addSource(FOCUS_SOURCE_ID, { type: "geojson", data: focusData });
        map.addLayer({
          id: FOCUS_CASING_LAYER_ID,
          type: "line",
          source: FOCUS_SOURCE_ID,
          filter: ["==", ["get", "kind"], "range"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 11,
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: FOCUS_LINE_LAYER_ID,
          type: "line",
          source: FOCUS_SOURCE_ID,
          filter: ["==", ["get", "kind"], "range"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": FOCUS_COLOR,
            "line-width": 7,
            "line-opacity": 1,
          },
        });
        map.addLayer({
          id: FOCUS_ENDPOINT_LAYER_ID,
          type: "circle",
          source: FOCUS_SOURCE_ID,
          filter: ["==", ["get", "kind"], "endpoint"],
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "match",
              ["get", "endpoint"],
              "start",
              "#ffffff",
              FOCUS_COLOR,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": [
              "match",
              ["get", "endpoint"],
              "start",
              FOCUS_COLOR,
              "#ffffff",
            ],
          },
        });
        map.addLayer({
          id: FOCUS_ENDPOINT_LABEL_LAYER_ID,
          type: "symbol",
          source: FOCUS_SOURCE_ID,
          filter: ["==", ["get", "kind"], "endpoint"],
          layout: {
            "text-field": ["match", ["get", "endpoint"], "start", "S", "E"],
            "text-size": 10,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": [
              "match",
              ["get", "endpoint"],
              "start",
              FOCUS_COLOR,
              "#ffffff",
            ],
          },
        });
      }

      // Mapbox 图层会跨 React Fast Refresh 保留；每次更新选区时同步样式，
      // 避免已创建图层继续使用旧颜色。
      map.setPaintProperty(FOCUS_LINE_LAYER_ID, "line-color", FOCUS_COLOR);
      map.setPaintProperty(FOCUS_ENDPOINT_LAYER_ID, "circle-color", [
        "match",
        ["get", "endpoint"],
        "start",
        "#ffffff",
        FOCUS_COLOR,
      ]);
      map.setPaintProperty(FOCUS_ENDPOINT_LAYER_ID, "circle-stroke-color", [
        "match",
        ["get", "endpoint"],
        "start",
        FOCUS_COLOR,
        "#ffffff",
      ]);
      map.setPaintProperty(FOCUS_ENDPOINT_LABEL_LAYER_ID, "text-color", [
        "match",
        ["get", "endpoint"],
        "start",
        FOCUS_COLOR,
        "#ffffff",
      ]);

      if (map.getLayer("activities-layer")) {
        map.setPaintProperty("activities-layer", "line-opacity", 0.25);
      }
      setLayerVisibility("distance-markers-circle", false);
      setLayerVisibility("distance-markers-label", false);
      setLayerVisibility(FOCUS_CASING_LAYER_ID, true);
      setLayerVisibility(FOCUS_LINE_LAYER_ID, true);
      setLayerVisibility(FOCUS_ENDPOINT_LAYER_ID, true);
      setLayerVisibility(FOCUS_ENDPOINT_LABEL_LAYER_ID, true);

      const bounds = new mapengine.LngLatBounds();
      focusedTracks.flat().forEach((coordinate) => bounds.extend(coordinate));
      if (autoFitFocus && !bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: lockedPadding,
          maxZoom: 17,
          duration: 650,
        });
      }
      hadFocusRangeRef.current = autoFitFocus && !bounds.isEmpty();
    };

    return syncMapStyle(map, updateFocusedRoute);
  }, [
    map,
    activityLayer,
    focusRangeM,
    focusTracks,
    autoFitFocus,
    lockedPadding,
  ]);

  useEffect(() => {
    if (
      !map ||
      mapRef.current !== map ||
      !activityLayer ||
      (focusCoordinate === undefined
        ? focusDistanceM == null
        : focusCoordinate === null)
    ) {
      focusMarkerRef.current?.remove();
      focusMarkerRef.current = null;
      return;
    }
    const updateMarker = () => {
      const coordinate =
        focusCoordinate ??
        coordinateAtRouteDistance(
          decodeActivityTracks(activityLayer.maps),
          focusDistanceM!,
        );
      if (!coordinate) return;
      if (!focusMarkerRef.current) {
        focusMarkerRef.current = attachFocusMarker(
          new mapengine.Marker({
            color: "#111827",
            scale: 0.72,
          }),
          map,
          coordinate,
        );
        return;
      }
      focusMarkerRef.current.setLngLat(coordinate);
    };
    return syncMapStyle(map, updateMarker);
  }, [map, activityLayer, focusDistanceM, focusCoordinate]);

  return { map, isMapConfigLoading };
};
