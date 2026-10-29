import { useEffect, useMemo, useRef } from "react";
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
}

const FOCUS_SOURCE_ID = "activity-focus-source";
const FOCUS_CASING_LAYER_ID = "activity-focus-casing";
const FOCUS_LINE_LAYER_ID = "activity-focus-line";
const FOCUS_ENDPOINT_LAYER_ID = "activity-focus-endpoints";
const FOCUS_ENDPOINT_LABEL_LAYER_ID = "activity-focus-endpoint-labels";
const FOCUS_COLOR = "#2f7d61";

export const useActivityLayerManager = ({
  activityLayer,
  containerId = "map-container",
  fitBoundsPadding = 100,
  interactive = true,
  lockedFitBoundsPadding = 50,
  focusDistanceM = null,
  focusRangeM = null,
}: UseActivityLayerManagerProps) => {
  const mapRef = useRef<null | mapengine.Map>(null);
  const focusMarkerRef = useRef<null | mapengine.Marker>(null);
  const hadFocusRangeRef = useRef(false);
  const { systemUnit } = useStore();
  const { theme } = useTheme();
  const { config: mapConfig, isLoading: isMapConfigLoading } =
    useRuntimeMapConfiguration();
  const mapProvider = useMemo(
    () => (mapConfig ? createMapProvider(mapConfig) : null),
    [mapConfig],
  );
  useEffect(() => {
    let resizeObserver: ResizeObserver | undefined;
    let styleFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    // 初始化地图
    if (activityLayer?.center && mapProvider) {
      mapengine.configureMapEngine(mapConfig ?? undefined);
      // const [Lat, Lng] = ;

      mapRef.current = new mapengine.Map({
        container: containerId,
        style: mapProvider.style(theme === "dark" ? "dark" : "light"),
        center: activityLayer.center, // center 现在已经是 [lng, lat] 格式，可以直接使用
        zoom: 9, // starting zoom
        interactive: interactive, // 初始化时设置交互状态
        maxZoom: mapConfig?.maxZoom ?? 18,
        ...mapengine.getMapAttributionOptions(mapProvider.attributionControl),
      });
      mapRef.current.addControl(
        new mapengine.ScaleControl({ maxWidth: 120, unit: "metric" }),
        "bottom-left",
      );
      const currentMap = mapRef.current;
      const clearStyleFallback = () => {
        if (!styleFallbackTimer) return;
        clearTimeout(styleFallbackTimer);
        styleFallbackTimer = undefined;
      };
      if (!mapProvider.routeOnly) {
        // A valid style is ready before all visible source tiles finish. Clear
        // the failure timeout at the style boundary so slow tiles do not make
        // us replace an already working basemap with the route-only style.
        currentMap.once("style.load", clearStyleFallback);
        styleFallbackTimer = setTimeout(() => {
          if (!currentMap.isStyleLoaded()) {
            currentMap.setStyle(
              routeOnlyStyle(theme === "dark" ? "dark" : "light"),
            );
          }
        }, 8_000);
      }

      resizeObserver = new ResizeObserver(() => {
        mapRef.current?.resize();
      });
      resizeObserver.observe(mapRef.current.getContainer());

      mapRef.current?.on("load", () => {
        clearStyleFallback();
        if (activityLayer?.maps?.length) {
          addLayersToMap(
            mapRef.current as mapengine.Map,
            activityLayer.maps,
            systemUnit,
          );
          // 强制重新渲染图层
          //   mapRef.current?.triggerRepaint();

          //   // 添加缩放监听器来确保图层在低缩放级别保持可见
          //   const handleZoom = () => {
          //     const currentZoom = mapRef.current?.getZoom();

          //     // 在低缩放级别时强制显示图层
          //     if (currentZoom < 3 && mapRef.current?.getLayer("activities-layer")) {
          //       mapRef.current.setLayoutProperty("activities-layer", "visibility", "visible");
          //       mapRef.current.setPaintProperty("activities-layer", "line-opacity", 1.0);
          //     }
          //   };

          //   mapRef.current?.on("zoom", handleZoom);
          //   mapRef.current?.on("zoomend", handleZoom);
        }
      });
      // 设置地图边界以包含整个轨迹
      if (activityLayer?.bounds && activityLayer.bounds.length === 2) {
        // bounds 从后端返回格式: [[lat, lng], [lat, lng]] - [西南角, 东北角]
        // mapbox fitBounds 需要格式: [[lng, lat], [lng, lat]]
        const [[swLat, swLng], [neLat, neLng]] = activityLayer.bounds;
        mapRef.current.fitBounds(
          [
            [swLng, swLat], // 西南角：[经度, 纬度]
            [neLng, neLat], // 东北角：[经度, 纬度]
          ],
          {
            padding: fitBoundsPadding,
            maxZoom: 15, // 最大缩放级别，避免过度放大
          },
        );
      }
    }

    return () => {
      if (styleFallbackTimer) clearTimeout(styleFallbackTimer);
      resizeObserver?.disconnect();
      focusMarkerRef.current?.remove();
      focusMarkerRef.current = null;
      mapRef.current?.remove();
    };
  }, [
    activityLayer?.center,
    containerId,
    fitBoundsPadding,
    mapConfig?.maxZoom,
    mapProvider,
    systemUnit,
    theme,
    activityLayer?.bounds,
    activityLayer?.maps,
  ]);

  // 控制地图交互功能
  useEffect(() => {
    if (mapRef.current) {
      if (interactive) {
        // 启用所有交互
        mapRef.current.scrollZoom.enable();
        mapRef.current.boxZoom.enable();
        mapRef.current.dragRotate.enable();
        mapRef.current.dragPan.enable();
        mapRef.current.keyboard.enable();
        mapRef.current.doubleClickZoom.enable();
        mapRef.current.touchZoomRotate.enable();
      } else {
        // 禁用所有交互
        mapRef.current.scrollZoom.disable();
        mapRef.current.boxZoom.disable();
        mapRef.current.dragRotate.disable();
        mapRef.current.dragPan.disable();
        mapRef.current.keyboard.disable();
        mapRef.current.doubleClickZoom.disable();
        mapRef.current.touchZoomRotate.disable();

        // 锁定时恢复到初始边界
        if (activityLayer?.bounds && activityLayer.bounds.length === 2) {
          const [[swLat, swLng], [neLat, neLng]] = activityLayer.bounds;
          mapRef.current.fitBounds(
            [
              [swLng, swLat], // 西南角：[经度, 纬度]
              [neLng, neLat], // 东北角：[经度, 纬度]
            ],
            {
              padding: lockedFitBoundsPadding,
              maxZoom: 15, // 最大缩放级别，避免过度放大
              duration: 800, // 添加动画效果，800ms
            },
          );
        }
      }
    }
  }, [interactive, activityLayer?.bounds, lockedFitBoundsPadding]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activityLayer) return;

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

      if (hadFocusRangeRef.current && activityLayer.bounds?.length === 2) {
        const [[swLat, swLng], [neLat, neLng]] = activityLayer.bounds;
        map.fitBounds(
          [
            [swLng, swLat],
            [neLng, neLat],
          ],
          {
            padding: lockedFitBoundsPadding,
            maxZoom: 15,
            duration: 650,
          },
        );
      }
      hadFocusRangeRef.current = false;
    };
    const updateFocusedRoute = () => {
      if (!focusRangeM) {
        restoreWholeRoute();
        return;
      }

      const focusedTracks = sliceRouteByDistance(
        decodeActivityTracks(activityLayer.maps),
        focusRangeM[0],
        focusRangeM[1],
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
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: lockedFitBoundsPadding,
          maxZoom: 17,
          duration: 650,
        });
      }
      hadFocusRangeRef.current = true;
    };

    if (map.loaded()) updateFocusedRoute();
    else map.once("load", updateFocusedRoute);
    return () => {
      map.off("load", updateFocusedRoute);
    };
  }, [activityLayer, focusRangeM, lockedFitBoundsPadding]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activityLayer || focusDistanceM == null) {
      focusMarkerRef.current?.remove();
      focusMarkerRef.current = null;
      return;
    }
    const updateMarker = () => {
      const coordinate = coordinateAtRouteDistance(
        decodeActivityTracks(activityLayer.maps),
        focusDistanceM,
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
    if (map.loaded()) updateMarker();
    else map.once("load", updateMarker);
    return () => {
      map.off("load", updateMarker);
    };
  }, [activityLayer, focusDistanceM]);

  return { map: mapRef.current, isMapConfigLoading };
};
