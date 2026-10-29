"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActivityMetricSummary } from "@/api/charts";
import {
  getV2ActivitiesFeed,
  type V2ActivitiesFeedQuery,
} from "@/api/v2-activities";
import { Button } from "@/components/ui/button";
import { DeferredMount } from "@/components/deferred-mount";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { dayjs } from "@/lib/dayjs-tz";
import { useStore, type SportType } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  getActivityMetricLabel,
  type SupportedMetricKey,
} from "../components/ActivitiesStats/activities-stats-model";
import {
  ActivityContributionHeatmap,
  type ActivityContributionDay,
} from "../components/ActivitiesStats/ActivityContributionHeatmap";
import type { ChartGranularity } from "./ActivitiesMetricLineChart";

const MetricLineChart = dynamic(
  () =>
    import("./ActivitiesMetricLineChart").then(
      (module) => module.ActivitiesMetricLineChart,
    ),
  {
    loading: () => (
      <Skeleton className="h-[292px] w-full animate-none rounded-md bg-neutral-100 dark:bg-muted/45" />
    ),
  },
);

const LINE_METRICS: SupportedMetricKey[] = [
  "distance",
  "duration",
  "heartRate",
  "count",
  "calories",
];

const CHART_GRANULARITY_OPTIONS = [
  { value: "day", labelKey: "granularity.day" },
  { value: "week", labelKey: "granularity.week" },
  { value: "month", labelKey: "granularity.month" },
] satisfies Array<{ value: ChartGranularity; labelKey: string }>;

function buildContributionDays(
  rows: Array<{ time: string; value: number }> | undefined,
) {
  return (rows ?? []).map<ActivityContributionDay>((row) => ({
    date: dayjs(row.time).format("YYYY-MM-DD"),
    count: Math.max(0, Math.round(row.value)),
  }));
}

function toFeedSportType(
  sportType: SportType,
): V2ActivitiesFeedQuery["sportType"] {
  return sportType === "all" ? "ALL" : sportType;
}

async function fetchEarliestActivityYear(sportType: SportType) {
  const response = await getV2ActivitiesFeed({
    page: 1,
    perPage: 1,
    sportType: toFeedSportType(sportType),
    orderBy: "startTime",
    orderDirection: "asc",
  });
  const startTime = response.items[0]?.startTime;
  if (!startTime) return null;
  const date = dayjs(startTime);
  return date.isValid() ? date.year() : null;
}

function buildYearOptions({
  currentYear,
  firstYear,
}: {
  currentYear: number;
  firstYear: number | null | undefined;
}) {
  const startYear =
    typeof firstYear === "number" && Number.isFinite(firstYear)
      ? Math.min(firstYear, currentYear)
      : currentYear;

  return Array.from(
    { length: currentYear - startYear + 1 },
    (_, index) => currentYear - index,
  );
}

function YearHeatmapCard({
  days,
  isLoading,
  rangeEnd,
  rangeStart,
}: {
  days: ActivityContributionDay[];
  isLoading: boolean;
  rangeEnd: string;
  rangeStart: string;
}) {
  return (
    <section className="overflow-hidden rounded-md p-2">
      {isLoading ? (
        <Skeleton className="h-[128px] w-full animate-none rounded-md bg-neutral-100 dark:bg-[#343832]" />
      ) : (
        <ActivityContributionHeatmap
          days={days}
          rangeEnd={rangeEnd}
          rangeStart={rangeStart}
          variant="showcase"
        />
      )}
    </section>
  );
}

function StatsControlSidebar({
  year,
  years,
  onYearChange,
}: {
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-3">
      <section>
        <div className="grid grid-cols-3 gap-2 lg:max-h-[calc(100vh-96px)] lg:grid-cols-1 lg:overflow-y-auto lg:pr-1">
          {years.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="touch"
              className={cn(
                "justify-start rounded-lg px-3 text-left font-medium",
                option === year
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onYearChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function MetricSelect({
  metricKey,
  onMetricChange,
}: {
  metricKey: SupportedMetricKey;
  onMetricChange: (metricKey: SupportedMetricKey) => void;
}) {
  const t = useTranslations("V2ActivitiesStatsPage");
  const tActivities = useTranslations("activities");
  const tDashboard = useTranslations("dashboard");

  return (
    <Select
      value={metricKey}
      onValueChange={(value) => onMetricChange(value as SupportedMetricKey)}
    >
      <SelectTrigger className="h-11 w-[128px] rounded-lg border-0 bg-muted pc:h-8 pc:border pc:bg-background">
        <SelectValue placeholder={t("controls.metric")} />
      </SelectTrigger>
      <SelectContent>
        {LINE_METRICS.map((option) => (
          <SelectItem key={option} value={option}>
            {getActivityMetricLabel(tActivities, tDashboard, option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GranularitySelect({
  granularity,
  onGranularityChange,
}: {
  granularity: ChartGranularity;
  onGranularityChange: (granularity: ChartGranularity) => void;
}) {
  const t = useTranslations("TimeFilters");

  return (
    <Select
      value={granularity}
      onValueChange={(value) => onGranularityChange(value as ChartGranularity)}
    >
      <SelectTrigger className="h-11 w-[100px] rounded-lg border-0 bg-muted pc:h-8 pc:border pc:bg-background">
        <SelectValue placeholder={t("granularity.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {CHART_GRANULARITY_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectionHeading({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {title}
        </h2>
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function getHeatmapRange(year: number, currentYear: number) {
  const rangeEnd =
    year === currentYear
      ? dayjs().startOf("day")
      : dayjs(`${year}-12-31`).startOf("day");

  return {
    start: rangeEnd.subtract(364, "day"),
    end: rangeEnd,
  };
}

export function ActivitiesStatsPageClient() {
  const t = useTranslations("V2ActivitiesStatsPage");
  const [year, setYear] = React.useState(() => dayjs().year());
  const [metricKey, setMetricKey] =
    React.useState<SupportedMetricKey>("distance");
  const [chartGranularity, setChartGranularity] =
    React.useState<ChartGranularity>("month");
  const { activitiesFilters } = useStore();
  const selectedSportType = activitiesFilters.selectedSportType;
  useSetPageTitle(t("title"));

  const currentYear = dayjs().year();
  const earliestActivityYearQuery = useQuery({
    queryKey: ["v2-activities-stats-earliest-year", selectedSportType],
    queryFn: () => fetchEarliestActivityYear(selectedSportType),
  });
  const years = React.useMemo(
    () =>
      buildYearOptions({
        currentYear,
        firstYear: earliestActivityYearQuery.data,
      }),
    [currentYear, earliestActivityYearQuery.data],
  );
  const effectiveYear =
    years.length > 0 && !years.includes(year) ? years[0] : year;
  const heatmapRange = React.useMemo(
    () => getHeatmapRange(effectiveYear, currentYear),
    [currentYear, effectiveYear],
  );
  const { data: heatmapData, isLoading: heatmapLoading } =
    useActivityMetricSummary("count", {
      start: heatmapRange.start.toISOString(),
      end: heatmapRange.end.endOf("day").toISOString(),
      sportType: selectedSportType,
      mode: "range",
    });
  const contributionDays = React.useMemo(
    () => buildContributionDays(heatmapData?.rows),
    [heatmapData?.rows],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Link
            href="/activities"
            className="hidden items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground pc:inline-flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("back")}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-start">
        <main className="flex min-w-0 flex-col gap-4">
          <YearHeatmapCard
            days={contributionDays}
            isLoading={heatmapLoading}
            rangeEnd={heatmapRange.end.format("YYYY-MM-DD")}
            rangeStart={heatmapRange.start.format("YYYY-MM-DD")}
          />

          <section className="space-y-2">
            <SectionHeading title={t("chartTitle")}>
              <MetricSelect
                metricKey={metricKey}
                onMetricChange={setMetricKey}
              />
              <GranularitySelect
                granularity={chartGranularity}
                onGranularityChange={setChartGranularity}
              />
            </SectionHeading>
            <DeferredMount
              fallback={
                <Skeleton className="h-[292px] w-full animate-none rounded-md bg-neutral-100 dark:bg-muted/45" />
              }
            >
              <MetricLineChart
                granularity={chartGranularity}
                metricKey={metricKey}
                year={effectiveYear}
              />
            </DeferredMount>
          </section>
        </main>

        <StatsControlSidebar
          year={effectiveYear}
          years={years}
          onYearChange={setYear}
        />
      </div>
    </div>
  );
}
