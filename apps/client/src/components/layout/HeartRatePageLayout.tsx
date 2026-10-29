"use client";

import { SubHeaderWithTimes } from "@/components/SubHeader/SubHeader";
import { Time } from "@/components/DateSelector/types";
import { HeartRateFilters, SportType } from "@/lib/store";
import { TabsList, TabsTrigger } from "../ui/tabs";
import { MobileHorizontalSegmentedControl } from "@/components/mobile-app/components/MobileHorizontalSegmentedControl";
import { useTranslations } from "next-intl";
import { MOBILE_ANALYTICS_TIME_EXCLUDE } from "@/components/metrics/mobile-analytics-filter-options";

interface HeartRatePageLayoutProps {
  children: React.ReactNode;
  times: Time[];
  setTimes: (times: Time[]) => void;
  selectedSportType: SportType;
  setSportType: (type: SportType) => void;
  showFilters?: boolean;
  allowAll?: boolean;
  activeTab?: HeartRateFilters["activeTab"];
  onActiveTabChange?: (tab: HeartRateFilters["activeTab"]) => void;
  showActiveTab?: boolean;
}

export function HeartRatePageLayout({
  children,
  times,
  setTimes,
  selectedSportType,
  setSportType,
  showFilters = true,
  allowAll = true,
  activeTab,
  onActiveTabChange,
  showActiveTab = true,
}: HeartRatePageLayoutProps) {
  const t = useTranslations("GlobalHeartRatePage");
  const tMobile = useTranslations("MobileAnalytics.tabs");
  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2 rounded-surface bg-neutral-100 p-2 dark:bg-muted/45 md:hidden">
        {showActiveTab && (
          <MobileHorizontalSegmentedControl
            value={activeTab ?? "curve"}
            options={[
              { value: "curve", label: tMobile("curve") },
              { value: "zones", label: tMobile("zones") },
            ]}
            onValueChange={(value) => onActiveTabChange?.(value)}
            ariaLabel={tMobile("navigationLabel")}
            className="min-w-0 flex-1"
            itemClassName="text-sm"
          />
        )}
        {showFilters && (
          <div className="shrink-0 [&>div>div]:mb-0">
            <SubHeaderWithTimes
              times={times}
              setTimes={setTimes}
              selectedSportType={selectedSportType}
              setSportType={setSportType}
              exclude={[...MOBILE_ANALYTICS_TIME_EXCLUDE]}
              allowAll={allowAll}
              multiple={false}
              inlineMobile
              compactAllLabel
            />
          </div>
        )}
      </div>
      <div className="hidden flex-col justify-between gap-2 rounded-surface bg-neutral-100 p-2 dark:bg-muted/45 md:flex md:flex-row md:items-center">
        {showActiveTab ? (
          <TabsList className="h-auto w-full bg-neutral-100 dark:bg-muted/45 md:w-auto">
            <TabsTrigger value="curve" className="flex-1">
              {t("tabs.curve")}
            </TabsTrigger>
            <TabsTrigger value="zones" className="flex-1">
              {t("tabs.zones")}
            </TabsTrigger>
          </TabsList>
        ) : null}
        {showFilters ? (
          <div className="[&>div>div]:mb-0">
            <SubHeaderWithTimes
              times={times}
              setTimes={setTimes}
              selectedSportType={selectedSportType}
              setSportType={setSportType}
              exclude={["customRange"]}
              allowAll={allowAll}
            />
          </div>
        ) : null}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
