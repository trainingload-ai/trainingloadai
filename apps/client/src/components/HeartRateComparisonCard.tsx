"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivityMetricSummary } from "@/api/charts";
import { TimeRangeOption } from "@/components/TimeRangeFilter";
import { convertTimeRangeToParams } from "@/utils/timeRange";
import { Heart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import CardLoader from "@/components/ui/CardLoader";
import { formatValue } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";

export interface HeartRateComparisonCardProps {
  currentValue: number;
  metricType: "avg" | "max";
  timeRange: TimeRangeOption;
  title: string;
  className?: string;
}

const HeartRateComparisonCard: React.FC<HeartRateComparisonCardProps> = ({
  currentValue,
  metricType,
  timeRange,
  title,
  className,
}) => {
  const t = useTranslations("HeartRateComparisonCard");
  const { systemUnit } = useStore();
  const timeRangeParams = convertTimeRangeToParams(timeRange);

  const { data, isLoading, error } = useActivityMetricSummary("heartRate", {
    ...timeRangeParams,
    sportType: "all",
  });

  if (isLoading) {
    return (
      <Card className={`h-[220px] ${className || ""}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CardLoader />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={`h-[220px] ${className || ""}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">{t("noHistoricalData")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const historicalValue =
    metricType === "avg"
      ? parseFloat(data.metadata.avg || "0")
      : parseFloat(data.metadata.max || "0");

  const difference = currentValue - historicalValue;
  const percentageChange =
    historicalValue > 0 ? (difference / historicalValue) * 100 : 0;

  const getTrendIcon = () => {
    if (Math.abs(percentageChange) < 1) {
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
    return percentageChange > 0 ? (
      <TrendingUp className="h-4 w-4 text-emerald-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  const getTrendColor = () => {
    if (Math.abs(percentageChange) < 1) return "text-muted-foreground";
    return percentageChange > 0 ? "text-emerald-500" : "text-red-500";
  };

  return (
    <Card className={`h-[220px] ${className || ""}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 当前值 */}
        <div className="text-center">
          <div className="text-3xl font-bold text-red-600">
            {formatValue(currentValue, "heartRate", systemUnit)}
          </div>
          <div className="text-sm text-muted-foreground">{t("currentActivity")}</div>
        </div>

        {/* Comparison Info */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {metricType === "avg" ? t("historicalAvg") : t("historicalMax")}:
            </span>
            <span className="font-medium">
              {formatValue(historicalValue, "heartRate", systemUnit)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("diff")}:</span>
            <div className="flex items-center gap-1">
              {getTrendIcon()}
              <span className={`font-medium ${getTrendColor()}`}>
                {difference > 0 ? "+" : ""}
                {formatValue(Math.abs(difference), "heartRate", systemUnit)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("change")}:</span>
            <span className={`font-medium ${getTrendColor()}`}>
              {percentageChange > 0 ? "+" : ""}
              {percentageChange.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-mobile-caption pc:text-xs text-muted-foreground">
            <span>{metricType === "avg" ? t("historicalAvg") : t("historicalMax")}</span>
            <span>{t("current")}</span>
          </div>
          <div className="relative h-2 bg-muted rounded-full">
            <div
              className="absolute h-full bg-red-500 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, (currentValue / Math.max(historicalValue, currentValue)) * 100))}%`,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default HeartRateComparisonCard;
