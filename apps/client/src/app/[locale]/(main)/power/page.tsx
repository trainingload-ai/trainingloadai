"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { PowerFilters, useStore } from "@/lib/store";
import { PowerPageLayout } from "@/components/layout/PowerPageLayout";
import { PowerTable } from "./components/PowerTable/PowerTable";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { LazyChartFallback } from "@/components/charts/lazy-chart-fallback";
import { useMobileMetricSubpageNavigation } from "@/components/metrics/use-mobile-metric-subpage-navigation";

const PowerChart = dynamic(
  () =>
    import("./components/PowerChart/PowerChart").then(
      (module) => module.PowerChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const MaximumPowerChart = dynamic(
  () =>
    import("./components/MaximumPowerChart/MaximumPowerChart").then(
      (module) => module.MaximumPowerChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const PowerProfile = dynamic(
  () =>
    import("./components/PowerProfile/PowerProfile").then(
      (module) => module.PowerProfile,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const PowerZonesChart = dynamic(
  () =>
    import("./components/PowerZonesChart/PowerZonesChart").then(
      (module) => module.PowerZonesChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const Power = () => {
  const t = useTranslations("power");
  useSetPageTitle(t("title"));
  useMobileMetricSubpageNavigation({ title: t("title") });
  const { powerFilters, setPowerTimes, setPowerSportType, setPowerActiveTab } =
    useStore();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <p className="px-0.5 text-[13px] leading-[18px] text-muted-foreground md:hidden">
        {t("header.description")}
      </p>
      <div className="relative flex h-full flex-col">
        <Tabs
          value={powerFilters.activeTab}
          onValueChange={(value) =>
            setPowerActiveTab(value as PowerFilters["activeTab"])
          }
        >
          <PowerPageLayout
            times={powerFilters.time}
            activeTab={powerFilters.activeTab}
            onActiveTabChange={setPowerActiveTab}
            setTimes={setPowerTimes}
            selectedSportType={powerFilters.selectedSportType}
            setSportType={setPowerSportType}
          >
            <TabsContent value="curve">
              <div className="grid grid-cols-1 gap-3 md:gap-6">
                <PowerTable
                  times={powerFilters.time}
                  sportType={powerFilters.selectedSportType}
                />
                <PowerChart
                  times={powerFilters.time}
                  sportType={powerFilters.selectedSportType}
                />
              </div>
            </TabsContent>
            <TabsContent value="maximum">
              <MaximumPowerChart
                times={powerFilters.time}
                sportType={powerFilters.selectedSportType}
              />
            </TabsContent>
            <TabsContent value="zones">
              <PowerZonesChart
                times={powerFilters.time}
                sportType={powerFilters.selectedSportType}
              />
            </TabsContent>
            <TabsContent value="profile">
              <PowerProfile
                times={powerFilters.time}
                sportType={powerFilters.selectedSportType}
              />
            </TabsContent>
          </PowerPageLayout>
        </Tabs>
      </div>
    </div>
  );
};

export default Power;
