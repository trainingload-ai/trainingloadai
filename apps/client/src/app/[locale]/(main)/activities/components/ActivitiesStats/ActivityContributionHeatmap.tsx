"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { dayjs } from "@/lib/dayjs-tz";
import { cn } from "@/lib/utils";

export type ActivityContributionDay = {
  date: string;
  count: number;
};

type HeatmapMode = "recent" | "year";
type HeatmapVariant = "default" | "showcase";

type HeatmapDay = {
  date: string;
  count: number;
  inRange: boolean;
};

function startOfWeek(date: dayjs.Dayjs) {
  return date.startOf("day").subtract(date.day(), "day");
}

function endOfWeek(date: dayjs.Dayjs) {
  return date.startOf("day").add(6 - date.day(), "day");
}

function buildHeatmapWeeks({
  year,
  daysBack,
  counts,
  mode,
  rangeStart: explicitRangeStart,
  rangeEnd: explicitRangeEnd,
}: {
  year?: number;
  daysBack?: number;
  counts: Map<string, number>;
  mode: HeatmapMode;
  rangeStart?: string;
  rangeEnd?: string;
}) {
  const today = dayjs().startOf("day");
  const explicitStart = explicitRangeStart
    ? dayjs(explicitRangeStart).startOf("day")
    : null;
  const explicitEnd = explicitRangeEnd
    ? dayjs(explicitRangeEnd).startOf("day")
    : null;
  const rangeStart =
    explicitStart?.isValid() && explicitEnd?.isValid()
      ? explicitStart
      : mode === "year" && year
      ? dayjs(`${year}-01-01`).startOf("day")
      : today.subtract(Math.max((daysBack ?? 91) - 1, 0), "day");
  const rangeEnd =
    explicitStart?.isValid() && explicitEnd?.isValid()
      ? explicitEnd
      : mode === "year" && year
      ? dayjs(`${year}-12-31`).isAfter(today)
        ? today
        : dayjs(`${year}-12-31`).startOf("day")
      : today;
  const gridStart = startOfWeek(rangeStart);
  const gridEnd = endOfWeek(rangeEnd);
  const weeks: HeatmapDay[][] = [];

  for (
    let cursor = gridStart;
    cursor.isBefore(gridEnd) || cursor.isSame(gridEnd, "day");
    cursor = cursor.add(7, "day")
  ) {
    const week: HeatmapDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = cursor.add(i, "day");
      const key = date.format("YYYY-MM-DD");
      week.push({
        date: key,
        count: counts.get(key) ?? 0,
        inRange:
          (date.isAfter(rangeStart) || date.isSame(rangeStart, "day")) &&
          (date.isBefore(rangeEnd) || date.isSame(rangeEnd, "day")),
      });
    }
    weeks.push(week);
  }

  return { weeks, rangeStart, rangeEnd };
}

function getLevel(count: number) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function levelClass(level: number, variant: HeatmapVariant) {
  if (variant === "showcase") {
    if (level === 1) return "bg-emerald-200/90 dark:bg-emerald-900/70";
    if (level === 2) return "bg-emerald-400/85 dark:bg-emerald-700/80";
    if (level === 3) return "bg-emerald-600/85 dark:bg-emerald-500/85";
    if (level === 4) return "bg-emerald-800/90 dark:bg-emerald-300";
    return "bg-neutral-300/75 dark:bg-[#333631]";
  }
  if (level === 1) return "bg-sky-300/75 dark:bg-sky-900";
  if (level === 2) return "bg-sky-500/75 dark:bg-sky-700";
  if (level === 3) return "bg-sky-700/85 dark:bg-sky-500";
  if (level === 4) return "bg-sky-950 dark:bg-sky-300";
  return "bg-background ring-border/80 dark:bg-background/40";
}

function weekMonthLabel(week: HeatmapDay[], locale: string) {
  const firstOfMonth = week.find(
    (day) => day.inRange && day.date.endsWith("-01"),
  );
  if (!firstOfMonth) return "";
  const date = dayjs(firstOfMonth.date);
  return locale === "zh" ? `${date.month() + 1}月` : date.format("MMM");
}

function weekdayLabel(dayIndex: number, locale: string) {
  if (dayIndex === 1) return locale === "zh" ? "一" : "Mon";
  if (dayIndex === 3) return locale === "zh" ? "三" : "Wed";
  if (dayIndex === 5) return locale === "zh" ? "五" : "Fri";
  return "";
}

function ShowcaseHeatmap({
  compact,
  weeks,
  locale,
  t,
}: {
  compact: boolean;
  weeks: HeatmapDay[][];
  locale: string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <div className="w-full">
      <div
        className={cn("grid w-full", compact ? "gap-0.5" : "gap-[3px]")}
        style={{
          gridTemplateColumns: `repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className={cn(
              "grid grid-rows-7",
              compact ? "gap-0.5" : "gap-[3px]",
            )}
          >
            {week.map((day) => {
              const level = day.inRange ? getLevel(day.count) : 0;
              return (
                <div
                  key={day.date}
                  role="gridcell"
                  aria-label={t("day", {
                    date: day.date,
                    count: day.inRange ? day.count : 0,
                  })}
                  title={t("day", {
                    date: day.date,
                    count: day.inRange ? day.count : 0,
                  })}
                  className={cn(
                    "aspect-square w-full justify-self-center",
                    compact
                      ? "max-w-[10px] rounded-micro"
                      : "max-w-[13px] rounded-xs",
                    levelClass(level, "showcase"),
                    !day.inRange && "opacity-30",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      {!compact ? (
        <div
          className="mt-2 grid w-full text-mobile-caption pc:text-xs font-medium text-[#a5a69f]"
          style={{
            gridTemplateColumns: `repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {weeks.map((week, weekIndex) => {
            const label = weekMonthLabel(week, locale);
            return (
              <div key={weekIndex} className="min-w-0">
                {label ? (
                  <span className="whitespace-nowrap">{label}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ActivityContributionHeatmap({
  days,
  year,
  daysBack = 91,
  mode = "recent",
  rangeStart: requestedRangeStart,
  rangeEnd: requestedRangeEnd,
  className,
  compact = false,
  variant = "default",
}: {
  days: ActivityContributionDay[];
  year?: number;
  daysBack?: number;
  mode?: HeatmapMode;
  rangeStart?: string;
  rangeEnd?: string;
  className?: string;
  compact?: boolean;
  variant?: HeatmapVariant;
}) {
  const t = useTranslations("V2ActivitiesStatsPage.heatmap");
  const locale = useLocale();
  const counts = React.useMemo(() => {
    const next = new Map<string, number>();
    for (const day of days) {
      if (!day.date) continue;
      next.set(day.date, (next.get(day.date) ?? 0) + Math.max(0, day.count));
    }
    return next;
  }, [days]);
  const { weeks, rangeStart, rangeEnd } = React.useMemo(
    () =>
      buildHeatmapWeeks({
        year,
        daysBack,
        counts,
        mode,
        rangeStart: requestedRangeStart,
        rangeEnd: requestedRangeEnd,
      }),
    [counts, daysBack, mode, requestedRangeEnd, requestedRangeStart, year],
  );
  const isShowcase = variant === "showcase";
  const cellSize = compact ? 12 : 10;
  const spacing = 3;
  const labelWidth = compact ? 0 : 28;
  const total = React.useMemo(
    () =>
      days.reduce((sum, day) => {
        const date = dayjs(day.date);
        if (
          date.isBefore(rangeStart, "day") ||
          date.isAfter(rangeEnd, "day")
        ) {
          return sum;
        }
        return sum + day.count;
      }, 0),
    [days, rangeEnd, rangeStart],
  );

  return (
    <div className={cn("min-w-0", className)}>
      {!compact && !isShowcase ? (
        <div className="mb-2 flex items-center justify-between gap-3 text-mobile-caption pc:text-xs text-muted-foreground">
          <span>
            {t("range", {
              start: rangeStart.format("MMM D"),
              end: rangeEnd.format("MMM D"),
            })}
          </span>
          <span>{t("total", { count: total })}</span>
        </div>
      ) : null}
      {isShowcase ? (
        <ShowcaseHeatmap
          compact={compact}
          weeks={weeks}
          locale={locale}
          t={t}
        />
      ) : (
      <div
        className={cn(
          compact
            ? "flex justify-center overflow-hidden"
            : isShowcase
              ? "overflow-x-auto overflow-y-hidden pb-1"
            : "overflow-x-auto overflow-y-hidden pb-1",
        )}
      >
        <table
          role={compact ? "presentation" : "grid"}
          aria-readonly="true"
          className="min-w-max table-fixed border-separate"
          style={{ borderSpacing: spacing }}
        >
          {!compact && !isShowcase ? (
            <thead>
              <tr style={{ height: 13 }}>
                <td style={{ width: labelWidth }} />
                {weeks.map((week, weekIndex) => (
                  <td
                    key={weekIndex}
                    className="relative text-mobile-unit pc:text-[10px] leading-none text-muted-foreground"
                    style={{ width: cellSize }}
                  >
                    {weekMonthLabel(week, locale)}
                  </td>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {Array.from({ length: 7 }, (_, dayIndex) => (
              <tr key={dayIndex} style={{ height: cellSize }}>
                {!compact && !isShowcase ? (
                  <td
                    className="relative pr-2 text-right text-mobile-unit pc:text-[10px] leading-none text-muted-foreground"
                    style={{ width: labelWidth }}
                  >
                    {weekdayLabel(dayIndex, locale)}
                  </td>
                ) : null}
                {weeks.map((week, weekIndex) => {
                  const day = week[dayIndex];
                  const level = day.inRange ? getLevel(day.count) : 0;
                  return (
                    <td
                      key={`${weekIndex}:${day.date}`}
                      role={compact ? undefined : "gridcell"}
                      aria-label={
                        compact
                          ? undefined
                          : t("day", {
                              date: day.date,
                              count: day.inRange ? day.count : 0,
                            })
                      }
                      title={t("day", {
                        date: day.date,
                        count: day.inRange ? day.count : 0,
                      })}
                      className={cn(
                        "rounded-micro ring-1 ring-inset ring-black/5 dark:ring-white/5",
                        isShowcase && "rounded-xs ring-0",
                        levelClass(level, variant),
                        !day.inRange && "opacity-30",
                      )}
                      style={{ width: cellSize, height: cellSize }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {!compact && !isShowcase ? (
        <div className="mt-2 flex items-center justify-end gap-1 text-mobile-unit pc:text-[10px] text-muted-foreground">
          <span>{t("less")}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={cn(
                "size-3 rounded-xs ring-1 ring-inset ring-black/5 dark:ring-white/5",
                levelClass(level, variant),
              )}
            />
          ))}
          <span>{t("more")}</span>
        </div>
      ) : null}
    </div>
  );
}
