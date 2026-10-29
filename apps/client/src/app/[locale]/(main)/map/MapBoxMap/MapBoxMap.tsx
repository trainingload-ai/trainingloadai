"use client";

import { useActivitiesLayer } from "@/api/useActivitiesLayer";
import { useTheme } from "next-themes";
import CardLoader from "@/components/ui/CardLoader";
import { useStore } from "@/lib/store";
import { useMapInitialization } from "./hooks/useMapInitialization";
import { buildFilterParams } from "@/lib/filterUtils";

interface MapBoxMapProps {
  interactive?: boolean;
}

const MapBoxMap = ({ interactive = true }: MapBoxMapProps) => {
  const { mapFilters } = useStore();
  const { resolvedTheme } = useTheme();

  // 构建过滤参数
  const filters = buildFilterParams(mapFilters);
  const { data: activitiesLayer, isLoading } = useActivitiesLayer(filters);
  // 初始化地图
  const { posterModal, isMapConfigLoading } = useMapInitialization({
    theme: resolvedTheme,
    containerId: "client-map-container",
    activitiesLayer,
  });

  return (
    <div
      id="client-map-container"
      className="w-full h-full min-h-0 flex-1 relative"
    >
      {posterModal}
      {/* 地图资源加载中 */}
      {(isLoading || isMapConfigLoading) && <CardLoader />}
      {!interactive && (
        <div className="absolute inset-0 bg-black/5 dark:bg-white/5 z-1 cursor-not-allowed backdrop-blur-[0.5px] transition-all duration-200">
          <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-black/10 dark:to-white/10" />
        </div>
      )}
    </div>
  );
};
export default MapBoxMap;
