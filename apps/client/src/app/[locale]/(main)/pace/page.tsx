"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { PaceFilters, useStore } from "@/lib/store";
import { PaceTable } from "./components/PaceTable/PaceTable";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PacePageLayout } from "@/components/layout/PacePageLayout";
import { Link, usePathname } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { LazyChartFallback } from "@/components/charts/lazy-chart-fallback";
import { useMobileMetricSubpageNavigation } from "@/components/metrics/use-mobile-metric-subpage-navigation";

const PaceChart = dynamic(
  () =>
    import("./components/PaceChart/PaceChart").then(
      (module) => module.PaceChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const PaceZonesChart = dynamic(
  () =>
    import("./components/PaceZonesChart/PaceZonesChart").then(
      (module) => module.PaceZonesChart,
    ),
  { loading: LazyChartFallback, ssr: false },
);

const Pace = () => {
  const t = useTranslations("PacePage");
  const tSidebar = useTranslations("sidebar");
  const pathname = usePathname();
  useSetPageTitle(t("title"));
  useMobileMetricSubpageNavigation({ title: t("title") });
  const { paceFilters, setPaceTimes, setPaceSportType, setPaceActiveTab } =
    useStore();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <p className="px-0.5 text-[13px] leading-[18px] text-muted-foreground md:hidden">
        {t("header.description")}
      </p>
      <div className="relative flex h-full flex-col">
        <Tabs
          value={paceFilters.activeTab}
          onValueChange={(value) =>
            setPaceActiveTab(value as PaceFilters["activeTab"])
          }
        >
          <PacePageLayout
            times={paceFilters.time}
            activeTab={paceFilters.activeTab}
            onActiveTabChange={setPaceActiveTab}
            setTimes={setPaceTimes}
            selectedSportType={paceFilters.selectedSportType}
            setSportType={setPaceSportType}
            allowAll={false}
          >
            <TabsContent value="curve">
              <div className="grid grid-cols-1 gap-3 md:gap-6">
                <PaceTable
                  times={paceFilters.time}
                  sportType={paceFilters.selectedSportType}
                />
                <PaceChart
                  times={paceFilters.time}
                  sportType={paceFilters.selectedSportType}
                />
              </div>
            </TabsContent>
            <TabsContent value="zones">
              <PaceZonesChart
                times={paceFilters.time}
                sportType={paceFilters.selectedSportType}
              />
            </TabsContent>
          </PacePageLayout>
        </Tabs>
      </div>
      <div className="space-y-2 md:hidden">
        <h2 className="px-0.5 text-sm font-medium text-foreground/80">
          {tSidebar("analysis")}
        </h2>
        <Link
          href={
            pathname.startsWith("/metrics/")
              ? "/metrics/pace/best-distance"
              : "/pace/best-distance"
          }
          className="flex min-h-12 items-center justify-between rounded-surface bg-neutral-100 px-4 py-3 text-sm font-medium dark:bg-muted/45"
        >
          <span>{tSidebar("bestDistance")}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
};

export default Pace;
