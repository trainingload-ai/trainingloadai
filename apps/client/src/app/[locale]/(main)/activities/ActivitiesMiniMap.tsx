"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useActivitiesLayer } from "@/api/useActivitiesLayer";
import CardLoader from "@/components/ui/CardLoader";
import { useMapInitialization } from "../map/MapBoxMap/hooks/useMapInitialization";

export function ActivitiesMiniMap() {
  const { resolvedTheme } = useTheme();
  const { data: layerData, isLoading } = useActivitiesLayer({ take: 5 });
  const containerId = React.useId().replace(/[:]/g, "");
  const miniOptions = React.useMemo(
    () => ({
      center: [104, 35] as [number, number],
      zoom: 2.3,
      minZoom: 1.8,
      maxZoom: 12,
      fitPadding: 22,
      fitMaxZoom: 9.5,
    }),
    [],
  );

  const { isMapConfigLoading } = useMapInitialization({
    theme: resolvedTheme,
    containerId,
    activitiesLayer: layerData,
    mode: "mini",
    miniOptions,
  });

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      <div id={containerId} className="h-full w-full" />
      {isLoading || isMapConfigLoading ? <CardLoader /> : null}
    </div>
  );
}
