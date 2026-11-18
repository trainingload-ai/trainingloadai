import { visualColors as tokenVisual } from '@trainingloadai/design-tokens/colors';
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
  map?: MapEngine | null,
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
    tokenVisual.map.activity[0],
    tokenVisual.map.activity[1],
    tokenVisual.map.activity[2],
    tokenVisual.map.activity[3],
    tokenVisual.map.activity[4],
    tokenVisual.map.activity[5],
    tokenVisual.map.activity[6],
    tokenVisual.map.activity[7],
    tokenVisual.map.activity[8],
    tokenVisual.map.activity[9],
  ];

  return color[idx % 10];
};

export const addLayers = (map: MapEngine, routes: [number, number][][]) => {
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
import type { Map as MapEngine } from "@deployment/map-engine";
