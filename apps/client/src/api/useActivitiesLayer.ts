import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** 地图轨迹数据，polyline 由后端编码后直接给 MapBox 渲染。 */
interface MapType {
  hashId: string;
  polyline: string; // Encoded polyline string
  startTime?: string; // ISO string
}

/** 活动地图图层响应，bounds/center 用来让地图自动定位到有轨迹的区域。 */
export interface ActivitiesLayerResponse {
  bounds?: [[number, number], [number, number]]; // Bounding box [SouthWest, NorthEast]
  center?: [number, number]; // Center point [Latitude, Longitude]
  maps: MapType[]; // Encoded track data
}

/**
 * Get activity map layer data
 * @param filters Filters
 * @returns
 */
export function useActivitiesLayer(filters?: {
  sportType?: string;
  startDate?: string;
  endDate?: string;
  take?: number;
}) {
  // 首页/活动地图按筛选条件加载轻量轨迹层，不拉完整活动详情。
  return useQuery<ActivitiesLayerResponse>({
    queryKey: queryKeys.activitiesLayer.all(filters),
    queryFn: async () => {
      // 只把有值的筛选项拼进查询参数，避免后端收到空字符串条件。
      const params = new URLSearchParams();
      if (filters?.sportType) {
        params.append("sportType", filters.sportType);
      }
      if (filters?.startDate) {
        params.append("startDate", filters.startDate);
      }
      if (filters?.endDate) {
        params.append("endDate", filters.endDate);
      }
      if (typeof filters?.take === "number" && Number.isFinite(filters.take)) {
        params.append("take", String(filters.take));
      }

      const url = `/activities/layer${params.toString() ? `?${params.toString()}` : ""}`;
      const data = await apiFetch<ActivitiesLayerResponse>(url);

      // 后端已经完成编码和裁剪，前端直接把 maps 交给地图组件。
      return data ?? { maps: [] };
    },
  });
}
