"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  LoadComparisonChart,
  type LoadComparisonChartPoint,
} from "@/components/charts/load-comparison-chart";

export function PlanWeekLoadChart({
  data,
  week,
  plannedSessions,
}: {
  data: LoadComparisonChartPoint[];
  week: number;
  plannedSessions: number;
}) {
  const t = useTranslations("V2PlanPage.weekLoad");
  const tLoad = useTranslations("V2HomePage.load");
  const locale = useLocale();
  const actual = data.reduce((sum, day) => sum + day.actual, 0);
  const planned = data.reduce((sum, day) => sum + day.planned, 0);
  const formatLoad = (value: number) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
    }).format(value);

  return (
    <div className="flex flex-col gap-2 tabular-nums">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <span>{t("currentWeek", { week })}</span>
        <span>
          {t("plannedSessions")} {plannedSessions}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl bg-neutral-100 pb-1 pt-3 dark:bg-muted/45">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-0.5 w-2.5 rounded-full bg-[#7c3aed] dark:bg-[#a78bfa]"
              />
              {tLoad("actual")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg
                aria-hidden="true"
                width="10"
                height="10"
                viewBox="0 0 12 12"
                className="shrink-0 text-[#7c3aed] dark:text-[#a78bfa]"
              >
                <rect
                  x="0.5"
                  y="0.5"
                  width="11"
                  height="11"
                  rx="1"
                  fill="currentColor"
                  fillOpacity="0.1"
                  stroke="currentColor"
                  strokeOpacity="0.24"
                />
                <path
                  d="M1 5L5 1 M1 11L11 1 M7 11L11 7"
                  stroke="currentColor"
                  strokeOpacity="0.42"
                  strokeWidth="1.5"
                />
              </svg>
              {tLoad("expected")}
            </span>
          </div>
          <span>
            {tLoad("todayValues", {
              actual: formatLoad(actual),
              planned: formatLoad(planned),
            })}
          </span>
        </div>
        <LoadComparisonChart
          className="h-[168px]"
          xAxisHeight={40}
          ariaLabel={t("barHeightHint")}
          actualLabel={tLoad("actual")}
          plannedLabel={tLoad("expected")}
          data={data}
        />
      </div>
    </div>
  );
}
