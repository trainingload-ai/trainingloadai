"use client";
import CardLoader from "../ui/CardLoader";
import { cn } from "@/lib/utils";
import {
  ActivityLayer,
  type ActivityMapPadding,
  useActivityLayerManager,
} from "./hooks/userActivityMapLayerManager";

interface MapBoxMapProps {
  activityLayer?: ActivityLayer;
  className?: string;
  containerId?: string;
  fitBoundsPadding?: ActivityMapPadding;
  isLoading?: boolean;
  interactive?: boolean;
  lockedFitBoundsPadding?: ActivityMapPadding;
  showInteractionOverlay?: boolean;
  focusDistanceM?: number | null;
  focusRangeM?: readonly [number, number] | null;
}

const MapBoxMap = ({
  activityLayer,
  className,
  containerId = "map-container",
  fitBoundsPadding = 100,
  isLoading = false,
  interactive = true,
  lockedFitBoundsPadding = 50,
  showInteractionOverlay = true,
  focusDistanceM = null,
  focusRangeM = null,
}: MapBoxMapProps) => {
  // 地图实例和图层生命周期都由 hook 管理，组件只提供容器和交互遮罩。
  const { isMapConfigLoading } = useActivityLayerManager({
    activityLayer,
    containerId,
    fitBoundsPadding,
    interactive,
    lockedFitBoundsPadding,
    focusDistanceM,
    focusRangeM,
  });
  return (
    <div
      id={containerId}
      className={cn(
        "relative aspect-[16/9] min-h-[220px] w-full lg:min-h-[340px]",
        className,
      )}
    >
      {/* Map resources loading */}
      {(isLoading || isMapConfigLoading) && <CardLoader />}
      {!interactive && showInteractionOverlay ? (
        <div className="absolute inset-0 bg-black/5 dark:bg-white/5 z-1 cursor-not-allowed backdrop-blur-[0.5px] transition-all duration-200">
          <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-black/10 dark:to-white/10" />
        </div>
      ) : null}
    </div>
  );
};
export default MapBoxMap;
