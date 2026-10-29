import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as mapengine from "@deployment/map-engine";
import dynamic from "next/dynamic";
import {
  applyActivitiesEndpointLayer,
  applyActivitiesLineLayer,
  buildActivitiesGeoJson,
} from "@/lib/map/activities-layer-shared";
import { useRuntimeMapConfiguration } from "@/api/runtime-capabilities";
import { createMapProvider, routeOnlyStyle } from "@/lib/map/map-provider";

const loadActivitySharePosterModal = () =>
  import("../components/ActivitySharePosterModal");

const ActivitySharePosterModal = dynamic(
  () =>
    loadActivitySharePosterModal().then(
      (module) => module.ActivitySharePosterModal,
    ),
  { ssr: false },
);

interface Track {
  hashId: string;
  polyline: string;
  startTime?: string;
}

interface ActivitiesLayer {
  maps: Track[];
  bounds?: [[number, number], [number, number]];
}

interface UseMapInitializationProps {
  theme: string | undefined;
  containerId: string;
  activitiesLayer: ActivitiesLayer | undefined;
  mode?: "full" | "mini";
  miniOptions?: {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    fitPadding?: number;
    fitMaxZoom?: number;
  };
}

export const useMapInitialization = ({
  theme,
  containerId,
  activitiesLayer,
  mode = "full",
  miniOptions,
}: UseMapInitializationProps) => {
  const mapRef = useRef<null | mapengine.Map>(null);
  const { config: mapConfig, isLoading: isMapConfigLoading } =
    useRuntimeMapConfiguration();
  const mapProvider = useMemo(
    () => (mapConfig ? createMapProvider(mapConfig) : null),
    [mapConfig],
  );
  const activitiesLayerRef = useRef<ActivitiesLayer | undefined>(
    activitiesLayer,
  );
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterMounted, setPosterMounted] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const hoveredFeatureIdRef = useRef<number | string | null>(null);
  const selectedFeatureIdRef = useRef<number | string | null>(null);
  const hasSelectionRef = useRef(false);
  const listenersBoundRef = useRef(false);
  const lastFittedBoundsKeyRef = useRef<string | null>(null);
  const routeOnlyFallbackRef = useRef(false);

  useEffect(() => {
    activitiesLayerRef.current = activitiesLayer;
  }, [activitiesLayer]);

  const normalizeBoundsForMapbox = (
    bounds?: [[number, number], [number, number]],
  ): [number, number, number, number] | null => {
    if (!bounds) return null;
    const [[a1, a2], [b1, b2]] = bounds;
    const looksLikeLatLng =
      Math.abs(a1) <= 90 &&
      Math.abs(b1) <= 90 &&
      Math.abs(a2) <= 180 &&
      Math.abs(b2) <= 180;
    const looksLikeLngLat =
      Math.abs(a1) <= 180 &&
      Math.abs(b1) <= 180 &&
      Math.abs(a2) <= 90 &&
      Math.abs(b2) <= 90;
    if (looksLikeLatLng && !looksLikeLngLat) return [a2, a1, b2, b1];
    if (looksLikeLngLat && !looksLikeLatLng) return [a1, a2, b1, b2];
    return [a2, a1, b2, b1];
  };

  const addActivitiesLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // style 未完成加载时 addSource/addLayer 会抛错，直接导致地图交互中断/空白
    if (!map.isStyleLoaded()) return;
    const layerData = activitiesLayerRef.current;
    if (!layerData?.maps?.length) return;

    const geojsonData = buildActivitiesGeoJson(layerData.maps, {
      includeAgeBucket: mode === "full",
    });
    const fitLayerBounds = (duration: number) => {
      const bbox = normalizeBoundsForMapbox(layerData.bounds);
      if (!bbox) return;
      const boundsKey = bbox.join(",");
      if (lastFittedBoundsKeyRef.current === boundsKey) return;
      lastFittedBoundsKeyRef.current = boundsKey;
      map.fitBounds(bbox, {
        padding: mode === "mini" ? (miniOptions?.fitPadding ?? 22) : 80,
        maxZoom: mode === "mini" ? (miniOptions?.fitMaxZoom ?? 9.5) : 16,
        duration,
      });
    };
    const isRouteOnly =
      mapProvider?.routeOnly === true || routeOnlyFallbackRef.current;
    applyActivitiesLineLayer(map, {
      sourceId: "activities-source",
      layerId: "activities-layer",
      data: geojsonData,
      minzoom: mode === "full" ? 0 : undefined,
      maxzoom: mode === "full" ? 24 : undefined,
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: "visible",
      },
      paint:
        mode === "full"
          ? {
              "line-color": [
                "match",
                ["get", "ageBucket"],
                0,
                "#fb923c",
                1,
                "#f97316",
                2,
                "#ea580c",
                3,
                "#a3a3a3",
                4,
                "#737373",
                5,
                "#525252",
                "#fb923c",
              ],
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                3,
                8,
                4,
                12,
                5,
                16,
                6,
                18,
                6,
              ],
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,
                isRouteOnly ? 0.86 : 0.48,
              ],
              "line-blur": 0,
              "line-gap-width": 0,
            }
          : {
              "line-color": "#f97316",
              "line-opacity": 0.82,
              "line-width": 2.8,
            },
    });
    if (isRouteOnly) {
      applyActivitiesEndpointLayer(map, geojsonData, mode === "mini" ? 0 : 8);
    }

    // 强制重新渲染图层
    map.triggerRepaint();

    // mini 模式只渲染，不绑定交互事件
    if (mode === "mini") {
      fitLayerBounds(0);
      return;
    }

    // 事件监听只绑定一次，避免多次 addActivitiesLayer 导致 hover/opacity 被反复改写产生“断续/轻重闪烁”
    if (listenersBoundRef.current) {
      // bounds 仅在筛选结果真正变化时更新，避免重复动画与额外瓦片请求。
      fitLayerBounds(600);
      return;
    }
    listenersBoundRef.current = true;

    // hover：mousemove 更直观（mouseenter 只会在进入时触发一次）
    map.on("mousemove", "activities-layer", (e) => {
      const f = e.features?.[0];
      const fid = f?.id;
      if (fid == null) return;

      if (hoveredFeatureIdRef.current != null) {
        map.setFeatureState(
          { source: "activities-source", id: hoveredFeatureIdRef.current },
          { hover: false },
        );
      }
      hoveredFeatureIdRef.current = fid;
      map.setFeatureState(
        { source: "activities-source", id: fid },
        { hover: true },
      );
    });

    map.on("mouseleave", "activities-layer", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredFeatureIdRef.current != null) {
        map.setFeatureState(
          { source: "activities-source", id: hoveredFeatureIdRef.current },
          { hover: false },
        );
        hoveredFeatureIdRef.current = null;
      }
    });

    // 点击后“孤立显示”：选中这条更清晰，其余变得很淡（点空白恢复）
    map.on("click", "activities-layer", (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const activityId = feature.properties?.hashId;
        const fid = feature.id;

        if (activityId) {
          setPosterMounted(true);
          setPosterOpen(true);
          setSelectedActivityId(activityId);

          // 清理旧选中
          if (selectedFeatureIdRef.current != null) {
            map.setFeatureState(
              { source: "activities-source", id: selectedFeatureIdRef.current },
              { selected: false },
            );
          }
          if (fid != null) {
            selectedFeatureIdRef.current = fid;
            map.setFeatureState(
              { source: "activities-source", id: fid },
              { selected: true },
            );
            hasSelectionRef.current = true;
            // 孤立显示：无底图时保留更多上下文，带底图时进一步弱化其他路线。
            map.setPaintProperty("activities-layer", "line-opacity", [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              1,
              isRouteOnly ? 0.12 : 0.06,
            ]);
            map.setPaintProperty("activities-layer", "line-width", [
              // 注意：Mapbox 不允许在非顶层 interpolate/step 中直接使用 ["zoom"]
              // 这里改成顶层按 zoom 插值，每个档位里再按 selected 切换宽度
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              ["case", ["boolean", ["feature-state", "selected"], false], 5, 3],
              12,
              ["case", ["boolean", ["feature-state", "selected"], false], 7, 5],
              18,
              ["case", ["boolean", ["feature-state", "selected"], false], 9, 6],
            ]);
          }
        }
      }
    });

    map.on("mouseenter", "activities-layer", () => {
      void loadActivitySharePosterModal().catch(() => undefined);
      map.getCanvas().style.cursor = "pointer";
    });

    // 点击空白处：取消孤立显示，恢复“默认降存在感 + hover 高亮”
    map.on("click", (e) => {
      if (!map.getLayer("activities-layer")) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["activities-layer"],
      });
      if (features.length > 0) return;

      if (selectedFeatureIdRef.current != null) {
        map.setFeatureState(
          { source: "activities-source", id: selectedFeatureIdRef.current },
          { selected: false },
        );
        selectedFeatureIdRef.current = null;
      }
      hasSelectionRef.current = false;
      map.setPaintProperty("activities-layer", "line-opacity", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        1,
        isRouteOnly ? 0.76 : 0.28,
      ]);
      map.setPaintProperty("activities-layer", "line-width", [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        3,
        1,
        3,
        2,
        3,
        3,
        3,
        4,
        3,
        8,
        4,
        12,
        5,
        16,
        6,
        18,
        6,
      ]);
    });

    // 如果有边界数据，调整地图视图
    fitLayerBounds(0);
  }, [mode, miniOptions, mapProvider?.routeOnly]);

  // 隐藏底图的文本标签（去掉背景上的文字）
  const hideTextLabels = () => {
    const map = mapRef.current;
    const style = map?.getStyle() as unknown as {
      layers?: Array<{
        id: string;
        type: string;
        layout?: Record<string, unknown>;
      }>;
    };
    if (!map || !style?.layers) return;
    (
      style.layers as Array<{
        id: string;
        type: string;
        layout?: Record<string, unknown>;
      }>
    ).forEach((layer) => {
      if (layer.type === "symbol") {
        const layout = layer.layout as Record<string, unknown> | undefined;
        const hasText = layout?.["text-field"] || layout?.["text-size"];
        const isLabelId = /label/i.test(layer.id);
        if (hasText || isLabelId) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    });
  };

  useEffect(() => {
    if (!mapProvider) return;
    mapengine.configureMapEngine(mapConfig ?? undefined);
    const mapTheme = theme === "dark" ? "dark" : "light";
    // Mini maps follow the configured provider as well. Whether a deployment
    // may contact a basemap service is a runtime capability decision, not a
    // viewport-size decision. Core-local Self-host still resolves to the
    // route-only provider, while Cloud and connected Self-host render their
    // configured basemap.
    const renderRouteOnly = mapProvider.routeOnly;
    routeOnlyFallbackRef.current = renderRouteOnly;
    let resizeObserver: ResizeObserver | undefined;
    let styleFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const nextStyle = renderRouteOnly
      ? routeOnlyStyle(mapTheme)
      : mapProvider.style(mapTheme);

    if (!mapRef.current) {
      const initialBounds = normalizeBoundsForMapbox(
        activitiesLayerRef.current?.bounds,
      );
      if (initialBounds) {
        lastFittedBoundsKeyRef.current = initialBounds.join(",");
      }
      mapRef.current = new mapengine.Map({
        container: containerId,
        style: nextStyle,
        ...(initialBounds
          ? {
              bounds: initialBounds,
              fitBoundsOptions: {
                padding: mode === "mini" ? (miniOptions?.fitPadding ?? 22) : 80,
                maxZoom:
                  mode === "mini" ? (miniOptions?.fitMaxZoom ?? 9.5) : 16,
                duration: 0,
              },
            }
          : {
              center:
                mode === "mini" ? (miniOptions?.center ?? [104, 35]) : [0, 0],
              zoom: mode === "mini" ? (miniOptions?.zoom ?? 2.3) : 2,
            }),
        ...(mode === "mini"
          ? {
              minZoom: miniOptions?.minZoom ?? 1.8,
              maxZoom: miniOptions?.maxZoom ?? 12,
              interactive: false,
              attributionControl: false,
            }
          : {
              maxZoom: mapConfig?.maxZoom ?? 18,
              ...mapengine.getMapAttributionOptions(
                mapProvider.attributionControl,
              ),
            }),
        bearing: 0, // 初始方向
      });
      if (mode === "full") {
        mapRef.current.addControl(
          new mapengine.ScaleControl({ maxWidth: 120, unit: "metric" }),
          "bottom-left",
        );
      }
    } else {
      // 仅更新 style（不要因为数据变化重建 map）
      mapRef.current.setStyle(nextStyle);
    }

    const currentMap = mapRef.current;
    const clearStyleFallback = () => {
      if (!styleFallbackTimer) return;
      clearTimeout(styleFallbackTimer);
      styleFallbackTimer = undefined;
    };
    if (!renderRouteOnly) {
      // `load` waits for every visible source/tile. On a slow connection the
      // style can already be valid and rendering while `isStyleLoaded()` is
      // still false, so using only `load` makes the timeout erase a working
      // basemap. `style.load` is the correct boundary for style readiness.
      currentMap.once("style.load", clearStyleFallback);
      styleFallbackTimer = setTimeout(() => {
        if (!currentMap.isStyleLoaded()) {
          routeOnlyFallbackRef.current = true;
          currentMap.setStyle(routeOnlyStyle(mapTheme));
        }
      }, 8_000);
    }

    // 添加自动旋转
    currentMap.on("load", () => {
      clearStyleFallback();
      addActivitiesLayer();
      // 隐藏底图标签
      hideTextLabels();
      // 如果样式更新，重新隐藏标签
      mapRef.current?.on("styledata", hideTextLabels);
      // 添加 resize 监听器
      const mapContainer = document.getElementById(containerId);
      if (mapContainer) {
        resizeObserver = new ResizeObserver(() => {
          if (mapRef.current) {
            mapRef.current.resize();
          }
        });
        resizeObserver.observe(mapContainer);
      }

      // 输出初始缩放级别
    });

    // 添加缩放事件监听器
    // mapRef.current.on("zoom", () => {
    //   const currentZoom = mapRef.current?.getZoom();
    // });

    // // 添加缩放结束事件监听器
    // mapRef.current.on("zoomend", () => {
    //   const currentZoom = mapRef.current?.getZoom();
    //   console.log("缩放结束，最终级别:", currentZoom?.toFixed(2));
    // });

    return () => {
      clearStyleFallback();
      currentMap.off("style.load", clearStyleFallback);
      resizeObserver?.disconnect();
      listenersBoundRef.current = false;
      lastFittedBoundsKeyRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    theme,
    containerId,
    addActivitiesLayer,
    mode,
    miniOptions,
    mapConfig?.maxZoom,
    mapProvider,
  ]);

  useEffect(() => {
    // 数据变化时仅刷新图层，不重建地图
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      addActivitiesLayer();
      return;
    }

    // style 还没 ready（比如刚 setStyle 或首次初始化），等 load 再画一次
    map.once("load", addActivitiesLayer);
  }, [activitiesLayer, addActivitiesLayer]);

  const posterModal =
    mode === "full" && posterMounted ? (
      <ActivitySharePosterModal
        open={posterOpen}
        onOpenChange={(open) => {
          setPosterOpen(open);
          if (!open) setSelectedActivityId(null);
        }}
        activityId={selectedActivityId}
        theme={theme}
      />
    ) : null;

  return {
    mapRef,
    posterModal,
    isMapConfigLoading,
  };
};
