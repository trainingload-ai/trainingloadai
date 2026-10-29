"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useMonthlyActivities } from "@/hooks/useActivities";
import { useStore } from "@/lib/store";

export function MonthlyActivityCalendar() {
  const t = useTranslations("activities");
  const { activitiesFilters } = useStore();
  const { selectedSportType } = activitiesFilters;
  const locale = useLocale();
  const [currentMonth, setCurrentMonth] = useState(dayjs());

  const dayjsLocale = locale === "zh" ? "zh-cn" : "en";
  dayjs.locale(dayjsLocale);

  const startOfMonth = currentMonth.startOf("month");
  const endOfMonth = currentMonth.endOf("month");
  const startGrid = startOfMonth.startOf("week");
  const days = Array.from({ length: 42 }, (_, index) =>
    startGrid.add(index, "day"),
  );

  const { data } = useMonthlyActivities(
    startOfMonth.toISOString(),
    endOfMonth.toISOString(),
    {
      sportType: selectedSportType,
    },
  );

  const activityMap = useMemo(() => {
    const nextMap = new Map<string, number>();
    data?.activities?.forEach((activity) => {
      const dateStr = dayjs(activity.startTime).format("YYYY-MM-DD");
      nextMap.set(dateStr, (nextMap.get(dateStr) || 0) + 1);
    });
    return nextMap;
  }, [data]);

  const weekDays = Array.from({ length: 7 }, (_, index) =>
    startGrid.add(index, "day").format("dd"),
  );

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {t("monthlyActivity")}
          </CardTitle>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">
              {currentMonth.format("YYYY MMMM")}
            </span>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  setCurrentMonth((prev) => prev.subtract(1, "month"))
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setCurrentMonth((prev) => prev.add(1, "month"))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 place-items-center w-full max-w-[400px] mx-auto">
          {weekDays.map((weekday) => (
            <div
              key={weekday}
              className="text-center text-mobile-caption pc:text-xs text-muted-foreground py-1"
            >
              {weekday}
            </div>
          ))}
          {days.map((dayItem) => {
            const dateStr = dayItem.format("YYYY-MM-DD");
            const count = activityMap.get(dateStr) || 0;
            const isCurrentMonth = dayItem.month() === currentMonth.month();

            let bgOpacity = 0;
            if (count === 1) bgOpacity = 0.4;
            else if (count === 2) bgOpacity = 0.7;
            else if (count >= 3) bgOpacity = 1;

            return (
              <TooltipProvider key={dateStr}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "aspect-square flex items-center justify-center text-mobile-caption pc:text-xs rounded-sm cursor-default transition-colors w-6 h-6",
                        !isCurrentMonth && "opacity-20",
                        count === 0 && "bg-secondary",
                      )}
                      style={{
                        backgroundColor:
                          count > 0
                            ? `rgba(22, 101, 52, ${bgOpacity})`
                            : undefined,
                        color: count > 0 ? "white" : undefined,
                      }}
                    >
                      <span
                        className={cn(
                          count === 0 && "text-muted-foreground/50",
                        )}
                      >
                        {dayItem.date()}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {dateStr}: {count} {t("activities")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
