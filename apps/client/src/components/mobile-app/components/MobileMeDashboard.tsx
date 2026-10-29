"use client";

import dayjs from "dayjs";
import { ChevronsUpDown, Grid2X2, List } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import {
  aggregateMobileMeMetric,
  buildMobileMeTrend,
  MOBILE_ME_METRICS,
  mobileMeMetricPrecision,
} from "../models/mobile-me-model";
import {
  MOBILE_ME_METRIC_COLORS,
  MOBILE_ME_RANGES,
  MOBILE_ME_SPORTS,
  type MobileMeSport,
} from "../models/mobile-me-dashboard-model";
import {
  MobileMeActivityProvider,
  useMobileMeActivityController,
} from "../hooks/use-mobile-me-activity-controller";
import {
  ActivityList,
  ActivityMasonry,
  MobileMeLoadMore,
  useMobileMeActivityFormatting,
} from "./MobileMeActivityFeed";
import { MobileHorizontalSegmentedControl } from "./MobileHorizontalSegmentedControl";
import { MobilePage } from "./MobilePage";
import { MobilePullToRefresh } from "./MobilePullToRefresh";

export { MobileMeActivityProvider };

const MobileMeTrendChart = dynamic(
  () =>
    import("./MobileMeTrendChart").then((module) => module.MobileMeTrendChart),
  {
    loading: () => (
      <div className="mx-3 my-3 h-36 animate-pulse rounded-xl bg-muted" />
    ),
  },
);

export function MobileMeDashboard() {
  const t = useTranslations("MobileApp.meDashboard");
  const locale = useLocale();
  const {
    endDate,
    feedItems,
    feedLoading,
    layout,
    metric,
    overviewError,
    overviewItems,
    overviewLoading,
    refresh,
    requestDelete,
    requestDeleteMenu,
    setLayout,
    setMetric,
    setSport,
    setWeeks,
    sport,
    startDate,
    weeks,
  } = useMobileMeActivityController();
  const labelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "numeric",
        day: "numeric",
      }),
    [locale],
  );
  const chartData = useMemo(
    () =>
      buildMobileMeTrend(overviewItems, weeks, metric, startDate).map(
        ({ date, value }) => ({
          key: dayjs(date).format("YYYY-MM-DD"),
          label: labelFormatter.format(date),
          value,
        }),
      ),
    [labelFormatter, metric, overviewItems, startDate, weeks],
  );
  const metricTotal = aggregateMobileMeMetric(overviewItems, metric);
  const precision = mobileMeMetricPrecision(metric);
  const { date, number, sportLabel } = useMobileMeActivityFormatting();
  const metricText =
    metricTotal == null
      ? "--"
      : Math.abs(metricTotal) >= 100
        ? String(Math.round(metricTotal))
        : precision > 0
          ? metricTotal.toFixed(precision)
          : String(Math.round(metricTotal));

  return (
    <MobilePullToRefresh
      className="-mx-3 -my-3 min-h-[calc(100%+1.5rem)] pc:hidden"
      onRefresh={refresh}
    >
      <MobilePage className="space-y-3 px-0 pb-6 tablet:max-w-3xl tablet:px-4 tablet:pt-3">
        <div className="flex items-center gap-3 py-3">
          <label className="relative min-w-0">
            <span className="flex items-center gap-1 text-[38px] font-semibold leading-[42px] text-[#007aff] dark:text-[#64d2ff]">
              {t(`sports.${sport}`)}
              <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
            </span>
            <select
              value={sport}
              onChange={(event) =>
                setSport(event.target.value as MobileMeSport)
              }
              aria-label={t("sportFilter")}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            >
              {MOBILE_ME_SPORTS.map((key) => (
                <option key={key} value={key}>
                  {t(`sports.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto grid w-[170px] grid-cols-3 rounded-lg bg-muted p-0.5">
            {MOBILE_ME_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setWeeks(range)}
                className={cn(
                  "min-h-7 rounded-md px-2 text-mobile-control font-medium",
                  weeks === range
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {t("weeks", { count: range })}
              </button>
            ))}
          </div>
        </div>

        <MobileHorizontalSegmentedControl
          ariaLabel={t("chartAria")}
          className=""
          value={metric}
          options={MOBILE_ME_METRICS.map((key) => ({
            value: key,
            label: t(`metrics.${key}`),
          }))}
          onValueChange={setMetric}
        />

        <section className="overflow-hidden rounded-surface bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-mobile-headline font-normal">
                {t(`metrics.${metric}`)}
              </h2>
              <p className="mt-0.5 text-mobile-caption text-muted-foreground">
                {labelFormatter.format(new Date(`${startDate}T00:00:00`))} -{" "}
                {labelFormatter.format(new Date(`${endDate}T00:00:00`))}
              </p>
            </div>
            <div className="flex items-baseline gap-1 text-right">
              <span className="text-[28px] font-semibold tabular-nums">
                {metricText}
              </span>
              {t(`units.${metric}`) ? (
                <span className="text-mobile-unit font-medium text-muted-foreground">
                  {t(`units.${metric}`)}
                </span>
              ) : null}
            </div>
          </div>
          {overviewLoading ? (
            <div className="mx-3 my-3 h-36 animate-pulse rounded-xl bg-muted" />
          ) : overviewError ? (
            <div className="grid h-36 place-items-center px-4 text-center text-mobile-control text-destructive">
              {t("failed")}
            </div>
          ) : (
            <MobileMeTrendChart
              data={chartData}
              valueLabel={t(`metrics.${metric}`)}
              ariaLabel={t("chartAria")}
              locale={locale}
              maximumFractionDigits={precision}
              color={MOBILE_ME_METRIC_COLORS[metric]}
            />
          )}
        </section>

        <section className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("recent")}</h2>
            <div className="grid grid-cols-2 rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setLayout("masonry")}
                aria-label={t("masonry")}
                className={cn(
                  "grid min-h-7 min-w-9 place-items-center rounded-md",
                  layout === "masonry" && "bg-background shadow-sm",
                )}
              >
                <Grid2X2 className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setLayout("list")}
                aria-label={t("list")}
                className={cn(
                  "grid min-h-7 min-w-9 place-items-center rounded-md",
                  layout === "list" && "bg-background shadow-sm",
                )}
              >
                <List className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {feedLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className={cn(
                    "animate-pulse rounded-surface bg-muted",
                    item % 2 ? "h-40" : "h-48",
                  )}
                />
              ))}
            </div>
          ) : feedItems.length ? (
            layout === "masonry" ? (
              <ActivityMasonry
                items={feedItems}
                date={date}
                onDeleteRequest={requestDeleteMenu}
                sportLabel={sportLabel}
              />
            ) : (
              <ActivityList
                items={feedItems}
                date={date}
                number={number}
                loadLabel={t("metrics.load")}
                onDeleteRequest={requestDelete}
                sportLabel={sportLabel}
              />
            )
          ) : (
            <p className="px-4 py-8 text-mobile-control text-muted-foreground">
              {t("empty")}
            </p>
          )}
          <MobileMeLoadMore />
        </section>
      </MobilePage>
    </MobilePullToRefresh>
  );
}
