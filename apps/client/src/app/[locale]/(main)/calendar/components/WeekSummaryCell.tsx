"use client";

import React from "react";
import { Dayjs } from "dayjs";
import { cn } from "@/lib/utils";
import type { Activity } from "@/api/activities";
import { useTranslations } from "next-intl";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";

interface WeekSummaryCellProps {
  weekStart: Dayjs;
  className?: string;
  activitiesByDate?: Record<string, Activity[]>;
  tssByDate?: Record<string, number>;
}

const WeekSummaryCell: React.FC<WeekSummaryCellProps> = ({
  weekStart,
  className,
  activitiesByDate = {},
  tssByDate = {},
}) => {
  const weekEnd = weekStart.add(6, "day");
  const t = useTranslations("WeekSummaryCell");
  const { systemUnit } = useStore();
  const dateKeys = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        weekStart.add(i, "day").format("YYYY-MM-DD"),
      ),
    [weekStart],
  );

  const weekly = React.useMemo(() => {
    let count = 0;
    let distance = 0;
    let duration = 0;
    let tss = 0;
    for (const key of dateKeys) {
      const acts = activitiesByDate[key] || [];
      count += acts.length;
      for (const a of acts as Array<
        Activity & { totalDistance?: number; totalElapsedTime?: number }
      >) {
        distance += a.totalDistance ?? a.distance ?? 0;
        duration += a.totalElapsedTime ?? a.duration ?? 0;
      }
      tss += tssByDate[key] || 0;
    }
    return { count, distance, duration, tss };
  }, [dateKeys, activitiesByDate, tssByDate]);

  return (
    <div
      className={cn(
        "p-2 h-full text-mobile-caption pc:text-xs text-muted-foreground/80 bg-white dark:bg-neutral-900",
        className,
      )}
    >
      <div className="font-medium text-muted-foreground">
        {weekStart.format("MM/DD")} - {weekEnd.format("MM/DD")}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-2 gap-y-0.5">
        <div>
          {t("count")}：{weekly.count}
        </div>
        <div>
          {t("tss")}：{Math.round(weekly.tss)}
        </div>
        <div>
          {t("distance")}：
          {`${formatValue(weekly.distance, "distance", systemUnit)} ${getUnit("distance", systemUnit)}`}
        </div>
        <div>
          {t("duration")}：
          {`${formatValue(weekly.duration, "duration", systemUnit)}`}
        </div>
      </div>
    </div>
  );
};

export default WeekSummaryCell;
