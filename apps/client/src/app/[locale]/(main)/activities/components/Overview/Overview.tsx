"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { useStore } from "@/lib/store";
import CardLoader from "@/components/ui/CardLoader";
import ThemeLogo from "@/components/ui/ThemeLogo";
import { SummaryMetricKey, useActivityMetricSummary } from "@/api/charts";
import { timeToRange } from "@/lib/timeRange";
import { ChartArea } from "../../../dashboard/components/ChartArea/ChartArea";

const Stat = ({
  titleKey,
  id,
  postfixKey,
}: {
  titleKey: string;
  id: SummaryMetricKey;
  postfixKey?: string;
}) => {
  const t = useTranslations("activities");
  const [isHovering, setIsHovering] = useState(false);
  const { selectedStat, setSelectedStat, activitiesFilters } = useStore();
  const { time, selectedSportType } = activitiesFilters;

  const tr = timeToRange(time);
  const at = selectedSportType;
  const { data, isLoading } = useActivityMetricSummary(id as SummaryMetricKey, {
    start: tr?.start,
    end: tr?.end,
    sportType: at,
  });
  const value = useMemo(() => {
    switch (id) {
      case "count":
        return Number(data?.metadata?.sum).toFixed(0);
      case "duration":
      case "distance":
        return Number(data?.metadata?.sum).toFixed(2);
      default:
        return Number(data?.metadata?.max).toFixed(2);
    }
  }, [data, id]);

  return (
    <div
      className={cn(
        "tap-feedback flex flex-col border-r border-neutral-100 dark:border-neutral-600 last:border-r-0 text-nowrap",
        selectedStat?.id === id && "bg-neutral-100 dark:bg-neutral-700",
        isHovering ? "bg-neutral-200 dark:bg-neutral-800" : "",
      )}
      onClick={() => setSelectedStat(id, "")}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex flex-col px-3 py-2 gap-6">
        <div className="text-sm font-medium text-muted-foreground">
          {t(titleKey)}
        </div>
        <div className="text-2xl font-medium flex gap-2 items-center justify-between">
          {isLoading ? (
            <>
              <Skeleton className="w-[60px] h-9 rounded-md" />
              <Skeleton className="w-[50px] h-5 rounded-md" />
            </>
          ) : (
            <div className="flex gap-1 items-baseline">
              <span className="font-medium text-foreground">
                <NumberFlow
                  respectMotionPreference={false}
                  value={Number(value)}
                  format={{ notation: "compact" }}
                />
              </span>
              {postfixKey && (
                <span className="text-muted-foreground text-mobile-caption pc:text-xs">
                  {t(postfixKey)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const OverviewChart = () => {
  const { selectedStat, activitiesFilters } = useStore();
  const { time, selectedSportType, previousTime } = activitiesFilters;
  const tr = timeToRange(time);
  const pr = timeToRange(previousTime);
  const at = selectedSportType;

  const { data: cur, isLoading: loadingCur } = useActivityMetricSummary(
    selectedStat?.id as SummaryMetricKey,
    {
      start: tr?.start,
      end: tr?.end,
      sportType: at,
    },
  );
  const { data: prev, isLoading: loadingPrev } = useActivityMetricSummary(
    selectedStat?.id as SummaryMetricKey,
    {
      start: pr?.start,
      end: pr?.end,
      sportType: at,
    },
  );

  const metaField: "avg" | "sum" = useMemo(() => {
    return ["count", "duration", "distance"].includes(
      (selectedStat?.id as string) || "",
    )
      ? "sum"
      : "avg";
  }, [selectedStat?.id]);

  const curVal = useMemo(() => {
    const v = cur?.metadata?.[metaField];
    const n = v != null && v !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  }, [cur, metaField]);

  const prevVal = useMemo(() => {
    const v = prev?.metadata?.[metaField];
    const n = v != null && v !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  }, [prev, metaField]);

  const diff = curVal - prevVal;
  const pct = prevVal > 0 ? (diff / prevVal) * 100 : curVal > 0 ? 100 : 0;

  const isLoading = loadingCur || loadingPrev;

  // 合并当前和对比数据为ChartArea组件期望的格式
  const mergedData = useMemo(() => {
    const currentRows = cur?.rows || [];
    const previousRows = prev?.rows || [];

    // 创建时间点的映射
    const timeMap = new Map<
      string,
      { time: string; current?: number; previous?: number }
    >();

    // 添加当前数据
    currentRows.forEach((row) => {
      timeMap.set(row.time, { time: row.time, current: row.value });
    });

    // 添加对比数据
    previousRows.forEach((row) => {
      const existing = timeMap.get(row.time);
      if (existing) {
        existing.previous = row.value;
      } else {
        timeMap.set(row.time, { time: row.time, previous: row.value });
      }
    });

    return Array.from(timeMap.values()).sort((a, b) =>
      a.time.localeCompare(b.time),
    );
  }, [cur?.rows, prev?.rows]);

  return (
    <CardContent className="p-2 md:p-2 flex flex-col gap-2">
      {isLoading && <CardLoader />}
      <div className="flex items-center justify-between px-2 md:px-0">
        <div className="flex items-center space-x-4 text-muted-foreground">
        <ThemeLogo width={120} height={20} />
        </div>
        <div className="text-sm text-muted-foreground">
          {!isLoading && (
            <span
              className={cn(
                "text-mobile-caption pc:text-xs",
                pct > 0
                  ? "text-emerald-500"
                  : pct < 0
                    ? "text-red-500"
                    : "text-muted-foreground",
              )}
            >
              {pct > 0 ? "+" : ""}
              {pct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-[290px] relative">
        <div className="absolute top-0 left-0 w-full h-full">
          <ChartArea
            dataSource={mergedData}
            metrics={["current", "previous"]}
          />
        </div>
      </div>
    </CardContent>
  );
};

const Overview = React.memo(() => {
  return (
    <>
      <Card>
        <CardContent className="p-0 md:p-0 w-full border-b border-neutral-100 dark:border-neutral-600">
          <div className="grid grid-cols-2 md:grid-cols-3 md:grid-cols-6 gap-0 items-center">
            <Stat titleKey="activities" id="count" postfixKey="times" />
            <Stat titleKey="distance" id="distance" postfixKey="km" />
            <Stat titleKey="duration" id="duration" postfixKey="hours" />
            <Stat titleKey="heartRate" id="heartRate" postfixKey="bpm" />
            <Stat titleKey="power" id="power" postfixKey="watts" />
            <Stat titleKey="cadence" id="cadence" postfixKey="rpm" />
          </div>
        </CardContent>
        <OverviewChart />
      </Card>
    </>
  );
});

Overview.displayName = "Overview";

export default Overview;
