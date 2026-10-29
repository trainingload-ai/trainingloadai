"use client";

import { useTranslations, useLocale } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useStore, type SportType } from "@/lib/store";
import { DateSelector } from "@/components/DateSelector/DateSelector";
import { usePaceBestPerformance } from "@/api/use-pace";
import { Loader2 } from "lucide-react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { DistanceTabs } from "./components/DistanceTabs";
import { BestPerformanceTable } from "./components/BestPerformanceTable";
import { useState, useMemo, useEffect } from "react";
import { DISTANCE_OPTIONS, TIME_OPTIONS } from "./components/DistanceSelector";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import { cn } from "@/lib/utils";
import { usePathname } from "@/i18n/navigation";
import { useMobileMetricSubpageNavigation } from "@/components/metrics/use-mobile-metric-subpage-navigation";

dayjs.extend(duration);

const BEST_DISTANCE_SPORT_TYPES: SportType[] = ["RUN", "CYCLING", "SWIM"];

const BestDistancePage = () => {
  const t = useTranslations("bestDistance");
  const tActivityFilter = useTranslations("activityFilter");
  const tDateSelector = useTranslations("dateSelector");
  const locale = useLocale();
  const pathname = usePathname();
  useSetPageTitle(t("title"));
  useMobileMetricSubpageNavigation({
    title: t("title"),
    backHref: pathname.startsWith("/metrics/") ? "/metrics/pace" : "/pace",
  });
  const {
    bestDistanceFilters,
    setBestDistanceTimes,
    setBestDistanceSportType,
  } = useStore();

  const [mode, setMode] = useState<"distance" | "time">("distance");
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const currentOptions = useMemo(() => {
    const opts =
      mode === "distance"
        ? DISTANCE_OPTIONS[bestDistanceFilters.selectedSportType]
        : TIME_OPTIONS[bestDistanceFilters.selectedSportType];
    return opts || [];
  }, [mode, bestDistanceFilters.selectedSportType]);

  const targets = useMemo(() => {
    return currentOptions
      .map((o) => parseInt(o.value))
      .filter((v) => !isNaN(v) && v > 0);
  }, [currentOptions]);

  useEffect(() => {
    if (currentOptions.length > 0) {
      setActiveTab(currentOptions[0].value);
    } else {
      setActiveTab(null);
    }
  }, [currentOptions]);

  useEffect(() => {
    if (
      !BEST_DISTANCE_SPORT_TYPES.includes(bestDistanceFilters.selectedSportType)
    ) {
      setBestDistanceSportType("RUN");
    }
  }, [bestDistanceFilters.selectedSportType, setBestDistanceSportType]);

  const { data, isLoading } = usePaceBestPerformance(
    bestDistanceFilters.time,
    bestDistanceFilters.selectedSportType,
    undefined,
    mode,
    targets,
    10,
  );

  const recordsByKey = useMemo(() => {
    if (!data) return {};

    type RecordType = {
      rank?: number;
      timeRangeLabel: string;
      timeRangeStart?: string;
      timeRangeEnd?: string;
      timeSec: number;
      paceSec: number;
      distanceM?: number;
      activityId?: number;
      activityTime?: string;
    };

    const result: Record<string, RecordType[]> = {};

    currentOptions.forEach((opt) => {
      result[opt.value] = [];
    });

    data.forEach((rangeData, index) => {
      const timeFilter = bestDistanceFilters.time[index];
      let rangeLabel = "";

      if (timeFilter) {
        const label = getTimeLabel(timeFilter, tDateSelector, locale);
        rangeLabel =
          label ??
          (rangeData.timeRange.start && rangeData.timeRange.end
            ? `${dayjs(rangeData.timeRange.start).format("YYYY-MM-DD")} - ${dayjs(
                rangeData.timeRange.end,
              ).format("YYYY-MM-DD")}`
            : t("allTime"));
      } else {
        rangeLabel =
          rangeData.timeRange.start && rangeData.timeRange.end
            ? `${dayjs(rangeData.timeRange.start).format("YYYY-MM-DD")} - ${dayjs(
                rangeData.timeRange.end,
              ).format("YYYY-MM-DD")}`
            : t("allTime");
      }

      if (rangeData.topValues) {
        Object.entries(rangeData.topValues).forEach(([key, valList]) => {
          if (!valList) return;

          if (!result[key]) {
            result[key] = [];
          }

          valList.forEach((val, rankIndex) => {
            result[key].push({
              rank: rankIndex + 1,
              timeRangeLabel: rangeLabel,
              timeRangeStart: rangeData.timeRange.start,
              timeRangeEnd: rangeData.timeRange.end,
              timeSec: val.timeSec,
              paceSec: val.paceSec,
              activityId: val.activityId,
              activityTime: val.activityTime,
            });
          });
        });
      } else {
        Object.entries(rangeData.values).forEach(([key, val]) => {
          if (!val) return;

          if (!result[key]) {
            result[key] = [];
          }

          result[key].push({
            timeRangeLabel: rangeLabel,
            timeRangeStart: rangeData.timeRange.start,
            timeRangeEnd: rangeData.timeRange.end,
            timeSec: val.timeSec,
            paceSec: val.paceSec,
            activityId: val.activityId,
            activityTime: val.activityTime,
          });
        });
      }
    });

    Object.keys(result).forEach((key) => {
      result[key] = result[key].map((r) => {
        if (mode === "time") {
          const base =
            bestDistanceFilters.selectedSportType === "SWIM" ? 100 : 1000;
          const dist = r.paceSec > 0 ? (r.timeSec * base) / r.paceSec : 0;
          return { ...r, distanceM: dist };
        }
        return r;
      });
    });

    return result;
  }, [
    data,
    currentOptions,
    bestDistanceFilters.time,
    tDateSelector,
    locale,
    t,
    mode,
    bestDistanceFilters.selectedSportType,
  ]);

  const activeRecords = activeTab ? recordsByKey[activeTab] || [] : [];
  const currentOption = currentOptions.find((o) => o.value === activeTab);
  const currentOptionLabel = currentOption?.translationKey
    ? t(`distances.${currentOption.translationKey}`)
    : currentOption?.label;
  const sportLabel = (sportType: SportType) => {
    if (sportType === "CYCLING") return tActivityFilter("cycling");
    if (sportType === "SWIM") return tActivityFilter("swim");
    return tActivityFilter("run");
  };
  const segmentButtonClassName =
    "h-9 cursor-pointer rounded-md px-2 text-mobile-caption pc:text-xs font-medium transition-colors sm:h-auto sm:px-2.5 sm:py-1.5";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 md:gap-5">
      <section className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="grid grid-cols-3 gap-1 rounded-md bg-background/60 p-1 dark:bg-background/25 sm:flex sm:bg-transparent sm:p-0 dark:sm:bg-transparent">
            {BEST_DISTANCE_SPORT_TYPES.map((sportType) => {
              const isActive =
                bestDistanceFilters.selectedSportType === sportType;
              return (
                <button
                  key={sportType}
                  type="button"
                  aria-pressed={isActive}
                  className={cn(
                    segmentButtonClassName,
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-neutral-200 dark:hover:bg-muted",
                    "sm:bg-neutral-200/45 sm:dark:bg-muted/45",
                    isActive && "sm:bg-foreground sm:dark:bg-foreground",
                  )}
                  onClick={() => setBestDistanceSportType(sportType)}
                >
                  {sportLabel(sportType)}
                </button>
              );
            })}
          </div>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <div className="grid grid-cols-2 gap-1 rounded-md bg-background/60 p-1 dark:bg-background/25 sm:flex sm:bg-transparent sm:p-0 dark:sm:bg-transparent">
            {(["distance", "time"] as const).map((option) => {
              const isActive = mode === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={isActive}
                  className={cn(
                    segmentButtonClassName,
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-neutral-200 dark:hover:bg-muted",
                    "sm:bg-neutral-200/45 sm:dark:bg-muted/45",
                    isActive && "sm:bg-foreground sm:dark:bg-foreground",
                  )}
                  onClick={() => setMode(option)}
                >
                  {option === "distance" ? t("byDistance") : t("byTime")}
                </button>
              );
            })}
          </div>
          <DateSelector
            time={bestDistanceFilters.time[0] || { mode: "all-time" }}
            setTime={(time) => setBestDistanceTimes([time])}
            exclude={["last7Days", "last14Days", "thisMonth"]}
            triggerSize="filter"
            triggerClassName="w-full justify-center border-0 bg-background/60 font-medium text-muted-foreground shadow-none hover:bg-neutral-200 dark:bg-background/25 dark:hover:bg-muted sm:w-auto sm:bg-neutral-200/70 sm:font-normal sm:dark:bg-muted sm:dark:hover:bg-muted/80 [&_svg]:hidden pc:text-xs"
          />
        </div>
      </section>

      <main className="flex min-w-0 flex-col gap-3 md:gap-4">
        <section className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
          <div className="mb-2 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
            {mode === "distance" ? t("byDistance") : t("byTime")}
          </div>
          <DistanceTabs
            activeDistance={activeTab}
            onDistanceChange={setActiveTab}
            options={currentOptions}
          />
        </section>

        <section>
          {isLoading ? (
            <div className="flex items-center justify-center rounded-md bg-neutral-100 py-12 text-sm text-muted-foreground dark:bg-muted/45">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <BestPerformanceTable
              records={activeRecords}
              distanceLabel={currentOptionLabel || ""}
              mode={mode}
            />
          )}
        </section>
      </main>
    </div>
  );
};

export default BestDistancePage;
