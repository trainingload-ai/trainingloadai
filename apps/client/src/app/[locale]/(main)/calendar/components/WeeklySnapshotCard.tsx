"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import type { Dayjs } from "dayjs";

type WeekStats = {
  count: number;
  distance: number;
  duration: number;
  tss: number;
};

export function WeeklySnapshotCard({
  weekStart,
  stats,
  previousStats,
  className,
}: {
  weekStart: Dayjs;
  stats: WeekStats;
  previousStats?: WeekStats;
  className?: string;
}) {
  const t = useTranslations("CalendarExperience");
  const tWeek = useTranslations("WeekSummaryCell");
  const { systemUnit } = useStore();

  const summaryItems = [
    {
      key: "count",
      label: tWeek("count"),
      value: String(stats.count),
      delta: stats.count - (previousStats?.count || 0),
    },
    {
      key: "tss",
      label: tWeek("tss"),
      value: String(Math.round(stats.tss)),
      delta: Math.round(stats.tss - (previousStats?.tss || 0)),
    },
    {
      key: "distance",
      label: tWeek("distance"),
      value: `${formatValue(stats.distance, "distance", systemUnit)} ${getUnit("distance", systemUnit)}`,
      delta: stats.distance - (previousStats?.distance || 0),
    },
    {
      key: "duration",
      label: tWeek("duration"),
      value: formatValue(stats.duration, "duration", systemUnit),
      delta: stats.duration - (previousStats?.duration || 0),
    },
  ];

  return (
    <Card className={cn("border-border/70", className)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="text-mobile-caption pc:text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {t("weeklySnapshot")}
        </div>
        <CardTitle className="text-base">
          {weekStart.format("MM/DD")} - {weekStart.add(6, "day").format("MM/DD")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {summaryItems.map((item) => (
          <div
            key={item.key}
            className="rounded-md border border-border/60 bg-neutral-100 dark:bg-muted/45 px-3 py-2"
          >
            <div className="text-mobile-caption pc:text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {item.label}
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {item.value}
            </div>
            <div
              className={cn(
                "mt-1 text-mobile-caption pc:text-xs",
                item.delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : item.delta < 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {item.delta === 0
                ? t("vsLastWeekFlat")
                : item.delta > 0
                  ? t("vsLastWeekUp")
                  : t("vsLastWeekDown")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
