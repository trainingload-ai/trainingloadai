"use client";

import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { useGetActivityStats } from "@/hooks/useActivities";
import {
  formatDuration,
  formatValue,
  getUnit,
} from "@/hooks/useFormatterBySettings";

export function YearlySummaryCard() {
  const t = useTranslations("activities");
  const { systemUnit } = useStore();
  const currentYear = dayjs().year();
  const { data: yearlyStats } = useGetActivityStats(currentYear);

  const formattedDistance = formatValue(
    yearlyStats?.totalDistance || 0,
    "distance",
    systemUnit,
  );
  const formattedDuration = formatDuration(yearlyStats?.totalDuration || 0);
  const formattedCalories = Math.round(
    yearlyStats?.totalCalories || 0,
  ).toLocaleString();

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {t("yearlySummary")}
        </CardTitle>
        <Badge variant="secondary" className="font-normal">
          {currentYear}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col justify-center space-y-1">
        <div className="flex flex-col justify-between items-end">
          <div className="flex gap-2 items-end">
            <span className="text-sm font-medium text-muted-foreground">
              {t("totalCount")}
            </span>
          </div>
          <span className="text-xl font-bold">
            {(yearlyStats?.totalCount || 0).toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col justify-between items-end">
          <div className="flex gap-2 items-end">
            <span className="text-sm font-medium text-muted-foreground">
              {t("totalDistance")}
            </span>
            <span className="text-mobile-caption pc:text-xs text-muted-foreground">
              {getUnit("distance", systemUnit)}
            </span>
          </div>
          <span className="text-xl font-bold">{formattedDistance}</span>
        </div>

        <div className="flex flex-col justify-between items-end">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-muted-foreground">
              {t("totalDuration")}
            </span>
          </div>
          <span className="text-xl font-bold">{formattedDuration}</span>
        </div>

        <div className="flex flex-col justify-between items-end">
          <div className="flex gap-2 items-end">
            <span className="text-sm font-medium text-muted-foreground">
              {t("totalCalories")}
            </span>
            <span className="text-mobile-caption pc:text-xs text-muted-foreground">kcal</span>
          </div>
          <span className="text-xl font-bold">{formattedCalories}</span>
        </div>
      </CardContent>
    </Card>
  );
}
