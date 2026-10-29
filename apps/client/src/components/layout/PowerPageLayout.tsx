"use client";

import { SubHeaderWithTimes } from "@/components/SubHeader/SubHeader";
import { Time } from "@/components/DateSelector/types";
import { PowerFilters, SportType } from "@/lib/store";
import { TabsList, TabsTrigger } from "../ui/tabs";
import { MobileHorizontalSegmentedControl } from "@/components/mobile-app/components/MobileHorizontalSegmentedControl";
import { useTranslations } from "next-intl";
import { MOBILE_ANALYTICS_TIME_EXCLUDE } from "@/components/metrics/mobile-analytics-filter-options";

interface PowerPageLayoutProps {
  children: React.ReactNode;
  times: Time[];
  setTimes: (times: Time[]) => void;
  selectedSportType: SportType;
  setSportType: (type: SportType) => void;
  showFilters?: boolean;
  allowAll?: boolean;
  activeTab?: PowerFilters["activeTab"];
  onActiveTabChange?: (tab: PowerFilters["activeTab"]) => void;
  showActiveTab?: boolean;
}

export function PowerPageLayout({
  children,
  times,
  activeTab,
  onActiveTabChange,
  setTimes,
  selectedSportType,
  setSportType,
  showFilters = true,
  allowAll = true,
  showActiveTab = true,
}: PowerPageLayoutProps) {
  const t = useTranslations("power");
  const tMobile = useTranslations("MobileAnalytics.tabs");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-surface bg-neutral-100 p-2 dark:bg-muted/45 md:hidden">
        {showActiveTab && (
          <MobileHorizontalSegmentedControl
            value={activeTab ?? "curve"}
            options={[
              { value: "curve", label: tMobile("curve") },
              { value: "maximum", label: tMobile("maximum") },
              { value: "zones", label: tMobile("zones") },
              { value: "profile", label: tMobile("profile") },
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
          <TabsList className="no-scrollbar h-auto w-full justify-start overflow-x-auto bg-neutral-100 dark:bg-muted/45 md:w-auto md:overflow-visible">
            <TabsTrigger value="curve" className="min-w-20 flex-none md:flex-1">
              {t("tabs.curve")}
            </TabsTrigger>
            <TabsTrigger
              value="maximum"
              className="min-w-20 flex-none md:flex-1"
            >
              {t("tabs.maximum")}
            </TabsTrigger>
            <TabsTrigger value="zones" className="min-w-20 flex-none md:flex-1">
              {t("tabs.zones")}
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className="min-w-20 flex-none md:flex-1"
            >
              {t("tabs.profile")}
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
              multiple={
                !showActiveTab || activeTab === "curve" || activeTab === "zones"
              }
            />
          </div>
        ) : null}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
