"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { useStore } from "@/lib/store";
import { useActivityId } from "@/hooks/useActivityId";
import ThemeLogo from "@/components/ui/ThemeLogo";
import { ChartArea } from "@/components/ChartArea";
import YAxisSelection from "@/components/YAxisSelection";
import { downsampleEvenly } from "@/utils/downsample";
import {
  useActivitySwimOverview,
  type SwimReviewResult,
} from "@/api/use-activity";
import { useFormatterBySettings } from "@/hooks/useFormatterBySettings";
import { ActivityMetricGrid } from "../activity-metric-grid";
import { computeAverageSwolf, computeLengthSwolf } from "@/lib/swim-metrics";

// 工具方法：将速度（m/s）转换为配速（分钟/100米）
function speedMsToPaceMinutesPer100(speed: number): number | undefined {
  if (!Number.isFinite(speed) || speed <= 0) return undefined;
  return 100 / speed / 60; // 分钟/100米
}

// 工具方法：将配速（分钟）格式化成 mm:ss 文本
function formatPaceMinutes(mins?: number): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "0:00";
  const totalSeconds = Math.round(mins * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const Stat = ({
  title,
  id,
  metric,
  swimOverview,
  isLoading,
  disabled = false,
}: {
  title: string;
  id: string;
  metric: string;
  swimOverview?: SwimReviewResult | null;
  isLoading?: boolean;
  disabled?: boolean;
}) => {
  const { activitySelectedStat, setActivitySelectedStat } = useStore();
  const { getUnit } = useFormatterBySettings();

  const isSelected = activitySelectedStat?.id === id;
  const handleClick = () => {
    if (disabled) return;
    setActivitySelectedStat(id, metric);
  };

  const lengths = swimOverview?.lengths ?? [];

  // 根据 id 计算展示值：speed（平均）、strokeCount（平均）、swolf（平均）
  const computeValue = (): number => {
    if (!lengths.length) return 0;
    switch (id) {
      case "speed": {
        const sum = lengths.reduce(
          (acc, cur) => acc + (Number.isFinite(cur.speed) ? cur.speed : 0),
          0,
        );
        return sum / lengths.length;
      }
      case "totalStrokes": {
        const sum = lengths.reduce(
          (acc, cur) =>
            acc + (Number.isFinite(cur.totalStrokes) ? cur.totalStrokes : 0),
          0,
        );
        return sum / lengths.length;
      }
      case "swolf": {
        return computeAverageSwolf(lengths) ?? 0;
      }
      default:
        return 0;
    }
  };

  const displayValue = computeValue();
  const postfix =
    id === "speed" ? "min/100m" : id === "totalStrokes" ? getUnit("count") : "";

  // 将速度显示为配速（min/100m）
  const paceText = React.useMemo(() => {
    if (id !== "speed") return "";
    const paceMin = speedMsToPaceMinutesPer100(displayValue);
    return formatPaceMinutes(paceMin);
  }, [id, displayValue]);

  return (
    <div
      className={cn(
        "h-full bg-card p-4",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "tap-feedback hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
        isSelected && !disabled && "bg-neutral-100 dark:bg-neutral-800",
      )}
      onClick={handleClick}
    >
      <div className="mb-1 text-mobile-caption text-muted-foreground pc:text-xs">
        {title}
      </div>
      <div className="text-lg font-semibold">
        {isLoading ? (
          <Skeleton className="h-6 w-16" />
        ) : disabled ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {id === "speed" ? (
              <>
                <span>{paceText}</span>
                {postfix && (
                  <span className="ml-1 text-sm text-muted-foreground">
                    {postfix}
                  </span>
                )}
              </>
            ) : (
              <>
                <NumberFlow
                  value={displayValue}
                  format={{
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  }}
                />
                {postfix && (
                  <span className="ml-1 text-sm text-muted-foreground">
                    {postfix}
                  </span>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const OverviewChart: React.FC<{ swimOverview?: SwimReviewResult | null }> = ({
  swimOverview,
}) => {
  const { activitySelectedStat } = useStore();

  const rows = React.useMemo(() => {
    const lengths = swimOverview?.lengths ?? [];
    // 构造统一的数据结构：time（字符串）+ 可选指标列
    const ds = lengths.map((l) => ({
      elapsedTime: Number.isFinite(l.elapsedTime) ? l.elapsedTime : undefined,
      // 图表中使用配速（分钟/100米）作为 speed 数值
      speed: speedMsToPaceMinutesPer100(l.speed) ?? undefined,
      totalStrokes: Number.isFinite(l.totalStrokes)
        ? l.totalStrokes
        : undefined,
      swolf: computeLengthSwolf(l),
    }));
    return downsampleEvenly(ds);
  }, [swimOverview]);

  return (
    <CardContent className="p-2 md:p-4 py-2 md:py-2 flex flex-col">
      <div className="flex items-center justify-between px-2 md:px-0">
        <div className="flex items-center space-x-4 text-muted-foreground">
        <ThemeLogo width={120} height={20} />
        </div>
        <YAxisSelection />
      </div>
      <div className="h-[200px] md:h-[290px] relative">
        <ChartArea
          dataSource={rows}
          xAxis="elapsedTime"
          // formatYAxis={(value) => formatPaceMinutes(value)}
          metrics={[activitySelectedStat?.metric || "speed"]}
        />
      </div>
    </CardContent>
  );
};

const SwimOverview = React.memo(() => {
  const t = useTranslations("SwimOverview");

  const activityId = useActivityId();

  const { data: swimOverview, isLoading } = useActivitySwimOverview(
    activityId || "",
  );
  return (
    <>
      <Card>
        <CardContent className="p-0 md:p-0 w-full border-b border-neutral-100 dark:border-neutral-600">
          <ActivityMetricGrid desktopColumns={3}>
            {/* 使用 swimOverview 数据的统计卡片（heartRate 暂不处理） */}
            <Stat
              title={t("speed")}
              id="speed"
              metric="speed"
              swimOverview={swimOverview}
              isLoading={isLoading}
            />
            <Stat
              title={t("strokes")}
              id="totalStrokes"
              metric="totalStrokes"
              swimOverview={swimOverview}
              isLoading={isLoading}
            />
            <Stat
              title={t("swolf")}
              id="swolf"
              metric="swolf"
              swimOverview={swimOverview}
              isLoading={isLoading}
            />
          </ActivityMetricGrid>
        </CardContent>
        <OverviewChart swimOverview={swimOverview} />
      </Card>
    </>
  );
});

SwimOverview.displayName = "SwimOverview";

export default SwimOverview;
