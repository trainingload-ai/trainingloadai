"use client";

import React, { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import MapBoxMap from "@/components/MapBoxMap/MapBoxMap";
import { Button } from "@/components/ui/button";
import { Lock, Unlock } from "lucide-react";
import ThemeLogo from "@/components/ui/ThemeLogo";
import { useActivityId } from "@/hooks/useActivityId";
import { useActivityLayer } from "@/api/useActivityLayer";
import {
  useActivityAnalysisLink,
  useActivityMapFocusDistance,
} from "./activity-analysis-link-context";

const DESKTOP_MAP_PADDING = {
  top: 32,
  bottom: 32,
  left: 64,
  right: 64,
} as const;

const ActivityMap = React.memo(() => {
  const t = useTranslations("ActivityMap");
  const [isMapLocked, setIsMapLocked] = useState(true); // 默认锁定

  // 优化地图锁定切换函数
  const toggleMapLock = useCallback(() => {
    setIsMapLocked(!isMapLocked);
  }, [isMapLocked]);

  const activityId = useActivityId();
  const mapContainerId = React.useId().replaceAll(":", "");
  const { data: activityLayer, isLoading } = useActivityLayer(activityId || "");
  const { selectedInterval } = useActivityAnalysisLink();
  const hoveredDistanceM = useActivityMapFocusDistance();
  const selectedRangeM = React.useMemo<readonly [number, number] | null>(() => {
    if (
      typeof selectedInterval?.startDistanceM !== "number" ||
      !Number.isFinite(selectedInterval.startDistanceM) ||
      typeof selectedInterval.endDistanceM !== "number" ||
      !Number.isFinite(selectedInterval.endDistanceM) ||
      selectedInterval.endDistanceM <= selectedInterval.startDistanceM
    ) {
      return null;
    }
    return [selectedInterval.startDistanceM, selectedInterval.endDistanceM];
  }, [selectedInterval]);

  if (!activityLayer?.maps?.length) return null;

  return (
    <section className="relative overflow-hidden rounded-md bg-zinc-900 ring-1 ring-border/60">
      <MapBoxMap
        activityLayer={activityLayer}
        containerId={`activity-detail-${mapContainerId}`}
        isLoading={isLoading}
        interactive={!isMapLocked}
        fitBoundsPadding={DESKTOP_MAP_PADDING}
        lockedFitBoundsPadding={DESKTOP_MAP_PADDING}
        showInteractionOverlay={false}
        focusDistanceM={hoveredDistanceM}
        focusRangeM={selectedRangeM}
        className="h-[clamp(220px,22vw,310px)] min-h-0 aspect-auto lg:min-h-0"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-background/88 px-3 py-2 shadow-sm backdrop-blur-md ring-1 ring-white/25">
        <ThemeLogo width={120} height={20} />
      </div>

      <Button
        variant="secondary"
        size="icon"
        onClick={toggleMapLock}
        className="absolute bottom-4 right-4 z-10 rounded-full border border-white/25 bg-background/88 text-foreground shadow-lg backdrop-blur-md transition-transform duration-200 hover:scale-105 hover:bg-background active:scale-95"
        title={isMapLocked ? t("locked") : t("unlocked")}
        aria-label={isMapLocked ? t("locked") : t("unlocked")}
      >
        {isMapLocked ? (
          <Lock className="h-4 w-4" />
        ) : (
          <Unlock className="h-4 w-4" />
        )}
      </Button>
    </section>
  );
});

ActivityMap.displayName = "ActivityMap";

export default ActivityMap;
