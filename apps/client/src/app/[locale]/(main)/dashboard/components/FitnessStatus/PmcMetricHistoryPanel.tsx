"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import {
  PMC_PROJECTION_SCOPES,
  type PmcProjectionScope,
} from "@shared/pmc-projection";
import { usePmcProjection } from "@/api/pmc-projection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useThemeColor } from "@/components/charts/uplot/useElementSize";
import {
  pmcAccentToken,
  type PmcMetric,
} from "@/components/charts/pmc/pmc-visuals";
import { useStore } from "@/lib/store";
import { MetricHistoryRangeTabs } from "./MetricHistoryRangeTabs";
import { formatMetricRangeLabel } from "./metric-history-chart-view-model";
import type { MetricHistoryPanelProps } from "./MetricHistoryDialog";
import type { RangeDays } from "./metric-history-chart-types";
import { metricForecastEnd } from "@/lib/metric-forecast-window";

const Chart = dynamic(
  () => import("@/components/charts/pmc/PMCProjectionChart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-surface" />,
  },
);

export function PmcMetricHistoryPanel({
  metricKey,
  title,
  description,
  links,
  enabled = true,
  showHeader = true,
  showMetricTitle = true,
  containerClassName,
}: MetricHistoryPanelProps & { metricKey: PmcMetric }) {
  const t = useTranslations("PmcProjection");
  const metricText = useTranslations("dashboard.fitnessStatus");
  const locale = useLocale();
  const format = useFormatter();
  const color = useThemeColor();
  const [range, setRange] = useState<RangeDays>("7");
  const selectedSport = useStore(
    (state) => state.dashboardFilters.selectedSportType,
  );
  const scope = PMC_PROJECTION_SCOPES.includes(
    selectedSport as PmcProjectionScope,
  )
    ? (selectedSport as PmcProjectionScope)
    : "ALL";
  const query = usePmcProjection(scope, "AUTO", 60, enabled, 30);
  const result = useMemo(
    () =>
      query.data
        ? {
            ...query.data,
            targetDate: metricForecastEnd(query.data.today, range),
            history: query.data.history.slice(-Number(range)),
            forecast: query.data.forecast.filter(
              (point) =>
                point.date <= metricForecastEnd(query.data!.today, range),
            ),
          }
        : null,
    [query.data, range],
  );
  const value = result?.current?.[metricKey];
  const ranges = (
    <MetricHistoryRangeTabs
      disabled={false}
      rangeDays={range}
      onValueChange={setRange}
      rangeLabel={(days) =>
        formatMetricRangeLabel({
          days,
          isWeeklyMetric: false,
          locale,
          t: metricText,
        })
      }
    />
  );

  return (
    <div
      className={`flex min-h-0 flex-col gap-5 ${containerClassName ?? ""}`}
      data-testid={`pmc-metric-panel-${metricKey}`}
    >
      {showHeader ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            {showMetricTitle ? (
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: color(pmcAccentToken(metricKey, value)),
                  }}
                  aria-hidden
                />
                {title}
              </h2>
            ) : null}
            {query.isPending ? (
              <Skeleton className="h-9 w-24" />
            ) : (
              <p
                className="text-3xl font-semibold leading-none tabular-nums"
                data-testid="pmc-dialog-current"
              >
                {value == null
                  ? "—"
                  : format.number(value, { maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          {ranges}
        </header>
      ) : null}
      {query.isPending ? (
        <Skeleton className="h-80 w-full rounded-surface" />
      ) : null}
      {query.isError && !result ? (
        <div
          role="status"
          className="flex min-h-52 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        >
          <p>{t("failed")}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {result ? (
        result.history.length ? (
          <Chart
            result={result}
            metric={metricKey}
            compact
            showLoad={false}
            refreshError={query.isError}
            tools={showHeader ? undefined : ranges}
          />
        ) : (
          <p
            role="status"
            className="py-16 text-center text-sm text-muted-foreground"
          >
            {t("empty")}
          </p>
        )
      ) : null}
      {description || links?.length ? (
        <div className="flex flex-col gap-3 border-t border-border/50 pt-4 text-xs leading-relaxed text-muted-foreground">
          {description ? (
            <p className="whitespace-pre-line">{description}</p>
          ) : null}
          {links?.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {link.label}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
