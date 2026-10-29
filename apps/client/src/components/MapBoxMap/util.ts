import { decode } from "@mapbox/polyline";
import * as mapengine from "@deployment/map-engine";
import { upsertRouteEndpointLayer } from "@/lib/map/route-endpoints";

interface DistanceMarker {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    label: string;
    distance: number;
  };
}

/**
 * 向地图中添加一个栅格瓦片图层
 * @param map
 * @param url 瓦片url
 * @param sourceId 数据源id，保证唯一性即可
 * @param layerId 图层id，保证唯一性即可
 */
export const addRasterTileLayer = (
  url: string,
  sourceId: string,
  layerId: string,
  map?: mapengine.Map | null,
) => {
  map?.addSource(sourceId, {
    type: "raster",
    tiles: [url],
    tileSize: 256,
  });
  map?.addLayer({
    id: layerId,
    type: "raster",
    source: sourceId,
  });
};

export const getColor = (idx: number) => {
  const color = [
    "rgb(222, 129, 59)",
    "rgb(67, 161, 138)",
    "rgb(34, 59, 74)",
    "rgb(186, 142, 65)",
    "rgb(217, 123, 45)",
    "rgb(155, 98, 164)",
    "rgb(37, 144, 188)",
    "rgb(69, 151, 77)",
    "rgb(232, 208, 96)",
    "rgb(80, 42, 90)",
  ];

  return color[idx % 10];
};

/**
 * 生成距离标记点
 * @param coordinates 经纬度数组 [lng, lat]
 * @param systemUnit 系统单位 "metric" | "imperial"
 */
export const generateDistanceMarkers = (
  coordinates: [number, number][],
  systemUnit: "metric" | "imperial" = "metric",
  initialDistance: number = 0,
) => {
  const markers: DistanceMarker[] = [];
  let accumulatedDistance = initialDistance;
  const unitDistance = systemUnit === "imperial" ? 1609.344 : 1000;

  // Calculate the next marker target based on initial distance
  let nextMarkerTarget =
    (Math.floor(initialDistance / unitDistance) + 1) * unitDistance;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const from = new mapengine.LngLat(coordinates[i][0], coordinates[i][1]);
    const to = new mapengine.LngLat(
      coordinates[i + 1][0],
      coordinates[i + 1][1],
    );
    const segmentDist = from.distanceTo(to);

    while (accumulatedDistance + segmentDist >= nextMarkerTarget) {
      const ratio = (nextMarkerTarget - accumulatedDistance) / segmentDist;
      const lng =
        coordinates[i][0] + (coordinates[i + 1][0] - coordinates[i][0]) * ratio;
      const lat =
        coordinates[i][1] + (coordinates[i + 1][1] - coordinates[i][1]) * ratio;

      markers.push({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [lng, lat],
        },
        properties: {
          label: Math.round(nextMarkerTarget / unitDistance).toString(),
          distance: nextMarkerTarget,
        },
      });

      nextMarkerTarget += unitDistance;
    }
    accumulatedDistance += segmentDist;
  }

  return { markers, totalDistance: accumulatedDistance };
};

/**
 * 向地图添加距离标记图层
 * @param map Mapbox 地图实例
 * @param markers 标记点 GeoJSON Features
 */
export const addDistanceMarkers = (
  map: mapengine.Map,
  markers: DistanceMarker[],
) => {
  if (!markers || markers.length === 0) return;

  // 添加数据源
  map.addSource("distance-markers-source", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: markers,
    },
  });

  // 添加背景圆圈图层
  map.addLayer({
    id: "distance-markers-circle",
    type: "circle",
    source: "distance-markers-source",
    paint: {
      "circle-radius": 8,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgb(222, 129, 59)", // 与轨迹颜色一致
    },
  });

  // 添加文字标签图层
  map.addLayer({
    id: "distance-markers-label",
    type: "symbol",
    source: "distance-markers-source",
    layout: {
      "text-field": ["get", "label"],
      "text-size": 10,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "rgb(222, 129, 59)",
    },
  });
};

export const addLayers = (map: mapengine.Map, routes: [number, number][][]) => {
  if (routes?.length) {
    routes?.map((lines: [number, number][], idx) => {
      // 数据源
      map.addSource(`routes-${idx}`, {
        type: "geojson",
        lineMetrics: true,
        generateId: true,
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: `routes-${idx}`,
              // 这里可以自定义一些属性
              properties: {
                id: `routes-${idx}`,
              },
              geometry: {
                type: "LineString",
                coordinates: lines,
              },
            },
          ],
        },
      });

      map.addLayer({
        id: `track-${idx}-fill`,
        type: "line",
        source: `routes-${idx}`,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": getColor(idx),
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            15, // 悬停宽度
            10, // 默认宽度
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1, // 悬停宽度
            0.6, // 默认宽度
          ],
        },
      });

      // 批量添加 箭头
      // lines?.forEach((v, idx) => {
      //   // 使用图标
      //   map.addLayer({
      //     id: `route-arrows-${idx}`,
      //     type: "symbol",
      //     source: `routes-${idx}`,
      //     layout: {
      //       "symbol-placement": "line",
      //       "symbol-spacing": 50,
      //       "icon-image": "arrow-image",
      //       "icon-size": 0.3,
      //     },
      //   });
      // });
    });
  }
};

export const addLayersToMap = (
  map: mapengine.Map,
  maps: {
    hashId?: string;
    id?: string;
    polyline: string;
    startTime?: string;
    state?: number;
  }[],
  systemUnit: "metric" | "imperial" = "metric",
) => {
  const allMarkers: DistanceMarker[] = [];
  let currentTotalDistance = 0;

  // 构建 GeoJSON 数据
  const features = maps?.map(
    (track: {
      hashId?: string;
      id?: string;
      polyline: string;
      state?: number;
    }) => {
      // 解码 polyline 字符串为坐标数组
      const decodedCoordinates = decode(track.polyline);
      // 转换为 GeoJSON 格式 [lng, lat]
      const coordinates = decodedCoordinates.map(([lat, lng]) => [lng, lat]);

      // Generate distance markers for each track
      const { markers, totalDistance } = generateDistanceMarkers(
        coordinates as [number, number][],
        systemUnit,
        currentTotalDistance,
      );
      allMarkers.push(...markers);
      currentTotalDistance = totalDistance;

      return {
        type: "Feature" as const,
        properties: {
          id: track.hashId ?? track.id ?? "",
          state: track.state ?? 1,
        },
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      };
    },
  );

  const geojsonData = {
    type: "FeatureCollection" as const,
    features,
  };

  // 添加数据源
  map.addSource("activities-source", {
    type: "geojson",
    data: geojsonData,
    // 添加配置来确保在所有缩放级别都显示数据
    tolerance: 0, // 减少简化
    buffer: 0, // 减少缓冲区
    lineMetrics: true, // 启用线条度量
    generateId: true, // 生成ID
  });

  // 添加轨迹图层
  map.addLayer({
    id: "activities-layer",
    type: "line",
    source: "activities-source",
    minzoom: 0, // 确保在所有缩放级别都可见
    maxzoom: 24, // 设置最大缩放级别
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: "visible", // 明确设置为可见
    },
    paint: {
      "line-color": "rgb(222, 129, 59)", // 橙色轨迹线
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        2,
        1,
        2,
        2,
        3,
        3,
        5,
        4,
        6,
        8,
        6,
        12,
        6,
        16,
        4,
        18,
        2,
      ],
      "line-opacity": 0.8,
      "line-blur": 0, // 确保线条清晰
      "line-gap-width": 0, // 无间隙
    },
    // 添加过滤器确保所有特征都显示
    filter: ["!=", ["get", "state"], -1], // 显示所有非隐藏状态的轨迹
  });

  upsertRouteEndpointLayer(map, {
    sourceId: "activity-route-endpoints-source",
    layerId: "activity-route-endpoints-layer",
    minzoom: 0,
    routes: features.map((feature) => ({
      routeId: feature.properties.id,
      coordinates: feature.geometry.coordinates as [number, number][],
    })),
  });

  // Add markers layer
  addDistanceMarkers(map, allMarkers);
};
