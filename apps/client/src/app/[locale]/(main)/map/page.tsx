"use client";
import dynamic from "next/dynamic";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { SubHeader } from "@/components/SubHeader/SubHeader";

function MapLoadingFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-full w-full animate-pulse bg-neutral-200/70 dark:bg-muted/70"
    />
  );
}

const MapBoxMap = dynamic(() => import("./MapBoxMap/MapBoxMap"), {
  ssr: false,
  loading: MapLoadingFallback,
});

const MapPage = () => {
  const t = useTranslations("MapPage");
  useSetPageTitle(t("title"));
  const { mapFilters, setMapTime, setMapSportType } = useStore();

  return (
    <div className="h-full min-h-0">
      <div className="h-full min-h-0 relative">
        {/* 地图 */}
        <MapBoxMap interactive />

        {/* 顶部内嵌筛选器：覆盖在地图上方，不占用地图高度 */}
        <div className="absolute left-0 right-0 top-0 z-20 px-safe-or-4 pt-safe-or-2">
          <div>
            <SubHeader
              time={mapFilters.time}
              setTime={setMapTime}
              selectedSportType={mapFilters.selectedSportType}
              setSportType={setMapSportType}
              exclude={["nav"]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapPage;
