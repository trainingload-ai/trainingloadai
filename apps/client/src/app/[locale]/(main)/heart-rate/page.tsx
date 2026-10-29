"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { HeartRateFilters, useStore } from "@/lib/store";
import { HeartRatePageLayout } from "@/components/layout/HeartRatePageLayout";
import { HeartRateTable } from "./components/HeartRateTable/HeartRateTable";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { LazyChartFallback } from "@/components/charts/lazy-chart-fallback";
import { useMobileMetricSubpageNavigation } from "@/components/metrics/use-mobile-metric-subpage-navigation";

const HeartRateChart = dynamic(
  () =>
    import("./components/HeartRateChart/HeartRateChart").then(
      (module) => module.HeartRateChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const HeartRateZonesChart = dynamic(
  () =>
    import("./components/HeartRateZonesChart/HeartRateZonesChart").then(
      (module) => module.HeartRateZonesChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const HeartRate = () => {
  const t = useTranslations("GlobalHeartRatePage");
  useSetPageTitle(t("title"));
  useMobileMetricSubpageNavigation({ title: t("heartRateAnalysis") });
  const {
    heartRateFilters,
    setHeartRateTimes,
    setHeartRateSportType,
    setHeartRateActiveTab,
  } = useStore();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <p className="px-0.5 text-[13px] leading-[18px] text-muted-foreground md:hidden">
        {t("header.description")}
      </p>
      <div className="relative flex h-full flex-col">
        <Tabs
          value={heartRateFilters.activeTab}
          onValueChange={(value) =>
            setHeartRateActiveTab(value as HeartRateFilters["activeTab"])
          }
        >
          <HeartRatePageLayout
            times={heartRateFilters.time}
            activeTab={heartRateFilters.activeTab}
            onActiveTabChange={setHeartRateActiveTab}
            setTimes={setHeartRateTimes}
            selectedSportType={heartRateFilters.selectedSportType}
            setSportType={setHeartRateSportType}
          >
            <TabsContent value="curve">
              <div className="grid grid-cols-1 gap-3 md:gap-6">
                {/* 心率数据表 */}
                <HeartRateTable
                  times={heartRateFilters.time}
                  sportType={heartRateFilters.selectedSportType}
                />
                {/* 心率曲线图 */}
                <HeartRateChart
                  times={heartRateFilters.time}
                  sportType={heartRateFilters.selectedSportType}
                />
              </div>
            </TabsContent>
            <TabsContent value="zones">
              <HeartRateZonesChart
                times={heartRateFilters.time}
                sportType={heartRateFilters.selectedSportType}
              />
            </TabsContent>
          </HeartRatePageLayout>
        </Tabs>
      </div>
    </div>
  );
};

export default HeartRate;
