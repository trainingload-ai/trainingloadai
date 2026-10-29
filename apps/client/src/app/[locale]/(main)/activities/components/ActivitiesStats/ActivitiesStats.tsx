"use client";

import React, { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivityMetricSummary } from "@/api/charts";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  isAverageMetric,
  toActivityChartValue,
  type SupportedMetricKey,
} from "./activities-stats-model";
import {
  ActivityMetricBarChartBody,
  ActivityMetricChartLoading,
} from "./ActivityMetricChartParts";
import { ActivityMetricCardHeader } from "./ActivityMetricCardHeader";
import { MonthlyActivityCalendar } from "./MonthlyActivityCalendar";
import { YearlySummaryCard } from "./YearlySummaryCard";

// --- Weekly Chart Component ---

function WeeklyActivityChart({
  metricKey,
  onMetricKeyChange,
}: {
  metricKey: SupportedMetricKey;
  onMetricKeyChange: (metricKey: SupportedMetricKey) => void;
}) {
  const t = useTranslations("activities");
  const { activitiesFilters, systemUnit } = useStore();
  const { selectedSportType } = activitiesFilters;
  const locale = useLocale();
  const [currentWeek, setCurrentWeek] = useState(dayjs());

  // Calculate current week range (Monday to Sunday)
  const dayjsLocale = locale === "zh" ? "zh-cn" : "en";
  dayjs.locale(dayjsLocale);

  const startOfThisWeek = useMemo(() => {
    const today = dayjs();
    const dayOfWeek = today.day();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return today.subtract(diff, "day").startOf("day");
  }, []);

  const { startOfWeek, endOfWeek } = useMemo(() => {
    const dayOfWeek = currentWeek.day(); // 0 (Sun) to 6 (Sat)
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days to subtract to get to Monday
    const start = currentWeek.subtract(diff, "day").startOf("day");
    const end = start.add(6, "day").endOf("day");
    return { startOfWeek: start, endOfWeek: end };
  }, [currentWeek]);

  const isCurrentWeek = useMemo(() => {
    return startOfWeek.isSame(startOfThisWeek, "day");
  }, [startOfThisWeek, startOfWeek]);

  const weekLabel = useMemo(() => {
    const monthStart = currentWeek.startOf("month");
    const monthStartDow = monthStart.day();
    const monthStartDiff = monthStartDow === 0 ? 6 : monthStartDow - 1;
    const monthStartWeekStart = monthStart
      .subtract(monthStartDiff, "day")
      .startOf("day");

    const weekIndex =
      Math.floor(startOfWeek.diff(monthStartWeekStart, "day") / 7) + 1;
    const monthLabel = currentWeek.locale(dayjsLocale).format("YYYY MMMM");

    if (locale === "zh") {
      return `${monthLabel} 第${weekIndex}周`;
    }
    return `${monthLabel} Week ${weekIndex}`;
  }, [currentWeek, locale, startOfWeek, dayjsLocale]);

  const { data, isLoading } = useActivityMetricSummary(metricKey, {
    start: startOfWeek.toISOString(),
    end: endOfWeek.toISOString(),
    sportType: selectedSportType,
    mode: "range",
  });

  const chartData = useMemo(() => {
    if (!data?.rows) return [];

    // Create a map of existing data
    const dataMap = new Map(
      data.rows.map((row) => [dayjs(row.time).format("YYYY-MM-DD"), row.value]),
    );

    // Fill in missing days for the week
    const result = [];
    for (let i = 0; i < 7; i++) {
      const day = startOfWeek.add(i, "day");
      const dateStr = day.format("YYYY-MM-DD");
      const dayName = day.format("ddd"); // Mon, Tue... or 周一, 周二...
      const rawValue = dataMap.get(dateStr) || 0;
      const value = toActivityChartValue(rawValue, metricKey, systemUnit);
      result.push({
        day: dayName,
        date: dateStr,
        [metricKey]: value,
      });
    }
    return result;
  }, [data, metricKey, startOfWeek, systemUnit]);

  if (isLoading) {
    return (
      <ActivityMetricChartLoading
        barHeights={[96, 140, 72, 168, 120, 88, 152]}
        barWidthClass="w-8"
        periodWidthClass="w-44"
        titleWidthClass="w-24"
        xLabelWidthClass="w-8"
        xPaddingClass="px-6"
      />
    );
  }

  return (
    <Card>
      <ActivityMetricCardHeader
        metricKey={metricKey}
        onMetricKeyChange={onMetricKeyChange}
        title={t("weeklyActivity")}
        periodLabel={weekLabel}
        onPrev={() => setCurrentWeek((prev) => prev.subtract(1, "week"))}
        onNext={() => {
          if (isCurrentWeek) return;
          setCurrentWeek((prev) => prev.add(1, "week"));
        }}
        disableNext={isCurrentWeek}
      />
      <CardContent>
        <ActivityMetricBarChartBody
          chartData={chartData}
          metricKey={metricKey}
          maxBarSize={40}
          systemUnit={systemUnit}
          xAxisKey="day"
        />
      </CardContent>
    </Card>
  );
}

function MonthlyActivityBarChart({
  metricKey,
  onMetricKeyChange,
}: {
  metricKey: SupportedMetricKey;
  onMetricKeyChange: (metricKey: SupportedMetricKey) => void;
}) {
  const t = useTranslations("activities");
  const locale = useLocale();
  const { activitiesFilters, systemUnit } = useStore();
  const { selectedSportType } = activitiesFilters;
  const [currentMonth, setCurrentMonth] = useState(dayjs());

  const dayjsLocale = locale === "zh" ? "zh-cn" : "en";
  dayjs.locale(dayjsLocale);

  const startOfThisMonth = useMemo(() => dayjs().startOf("month"), []);
  const isCurrentMonth = useMemo(() => {
    return currentMonth.isSame(startOfThisMonth, "month");
  }, [currentMonth, startOfThisMonth]);

  const startOfMonth = useMemo(
    () => currentMonth.startOf("month"),
    [currentMonth],
  );
  const endOfMonth = useMemo(() => currentMonth.endOf("month"), [currentMonth]);

  const { data, isLoading } = useActivityMetricSummary(metricKey, {
    start: startOfMonth.toISOString(),
    end: endOfMonth.toISOString(),
    sportType: selectedSportType,
    mode: "range",
  });

  const chartData = useMemo(() => {
    if (!data?.rows) return [];

    const dataMap = new Map(
      data.rows.map((row) => [dayjs(row.time).format("YYYY-MM-DD"), row.value]),
    );

    const monthStart = startOfMonth.startOf("day");
    const monthEnd = endOfMonth.endOf("day");
    const monthStartDow = monthStart.day();
    const monthStartDiff = monthStartDow === 0 ? 6 : monthStartDow - 1;
    const monthStartWeekStart = monthStart
      .subtract(monthStartDiff, "day")
      .startOf("day");

    const lastDay = monthEnd.startOf("day");
    const maxWeekIndex =
      Math.floor(lastDay.diff(monthStartWeekStart, "day") / 7) + 1;

    const aggByWeekIndex = new Map<number, { sum: number; count: number }>();
    for (let i = 1; i <= maxWeekIndex; i++) {
      aggByWeekIndex.set(i, { sum: 0, count: 0 });
    }

    const dayCount = monthEnd.diff(monthStart, "day") + 1;
    for (let i = 0; i < dayCount; i++) {
      const day = monthStart.add(i, "day");
      const dateStr = day.format("YYYY-MM-DD");
      const rawValue = dataMap.get(dateStr) || 0;
      const weekIndex =
        Math.floor(day.startOf("day").diff(monthStartWeekStart, "day") / 7) + 1;
      const current = aggByWeekIndex.get(weekIndex) || { sum: 0, count: 0 };
      current.sum += rawValue;
      if (rawValue > 0) current.count += 1;
      aggByWeekIndex.set(weekIndex, current);
    }

    const result = [];
    for (let i = 1; i <= maxWeekIndex; i++) {
      const weekLabel = locale === "zh" ? `第${i}周` : `W${i}`;
      const agg = aggByWeekIndex.get(i) || { sum: 0, count: 0 };
      const rawValue = isAverageMetric(metricKey)
        ? agg.count > 0
          ? agg.sum / agg.count
          : 0
        : agg.sum;
      result.push({
        week: weekLabel,
        [metricKey]: toActivityChartValue(rawValue, metricKey, systemUnit),
      });
    }

    return result;
  }, [data, endOfMonth, locale, metricKey, startOfMonth, systemUnit]);

  if (isLoading) {
    return (
      <ActivityMetricChartLoading
        barHeights={[96, 140, 72, 168, 120, 88]}
        barWidthClass="w-8"
        periodWidthClass="w-36"
        titleWidthClass="w-24"
        xLabelWidthClass="w-8"
        xPaddingClass="px-6"
      />
    );
  }

  return (
    <Card>
      <ActivityMetricCardHeader
        metricKey={metricKey}
        onMetricKeyChange={onMetricKeyChange}
        title={t("monthlyActivity")}
        periodLabel={currentMonth.locale(dayjsLocale).format("YYYY MMMM")}
        onPrev={() => setCurrentMonth((prev) => prev.subtract(1, "month"))}
        onNext={() => {
          if (isCurrentMonth) return;
          setCurrentMonth((prev) => prev.add(1, "month"));
        }}
        disableNext={isCurrentMonth}
      />
      <CardContent>
        <ActivityMetricBarChartBody
          chartData={chartData}
          metricKey={metricKey}
          maxBarSize={56}
          systemUnit={systemUnit}
          xAxisKey="week"
        />
      </CardContent>
    </Card>
  );
}

function YearlyActivityBarChart({
  metricKey,
  onMetricKeyChange,
}: {
  metricKey: SupportedMetricKey;
  onMetricKeyChange: (metricKey: SupportedMetricKey) => void;
}) {
  const t = useTranslations("activities");
  const locale = useLocale();
  const { activitiesFilters, systemUnit } = useStore();
  const { selectedSportType } = activitiesFilters;
  const [currentYear, setCurrentYear] = useState(dayjs());

  const dayjsLocale = locale === "zh" ? "zh-cn" : "en";
  dayjs.locale(dayjsLocale);

  const startOfThisYear = useMemo(() => dayjs().startOf("year"), []);
  const isCurrentYear = useMemo(() => {
    return currentYear.isSame(startOfThisYear, "year");
  }, [currentYear, startOfThisYear]);

  const startOfYear = useMemo(() => currentYear.startOf("year"), [currentYear]);
  const endOfYear = useMemo(() => {
    return isCurrentYear ? dayjs().endOf("day") : currentYear.endOf("year");
  }, [currentYear, isCurrentYear]);

  const { data, isLoading } = useActivityMetricSummary(metricKey, {
    start: startOfYear.toISOString(),
    end: endOfYear.toISOString(),
    sportType: selectedSportType,
    mode: "range",
  });

  const chartData = useMemo(() => {
    if (!data?.rows) return [];

    const aggByMonthKey = new Map<string, { sum: number; count: number }>();
    for (const row of data.rows) {
      const monthKey = dayjs(row.time).format("YYYY-MM");
      const current = aggByMonthKey.get(monthKey) || { sum: 0, count: 0 };
      current.sum += row.value;
      if (row.value > 0) current.count += 1;
      aggByMonthKey.set(monthKey, current);
    }

    const result = [];
    for (let i = 0; i < 12; i++) {
      const month = startOfYear.add(i, "month");
      const monthKey = month.format("YYYY-MM");
      const label =
        locale === "zh"
          ? `${i + 1}月`
          : month.locale(dayjsLocale).format("MMM");
      const agg = aggByMonthKey.get(monthKey) || { sum: 0, count: 0 };
      const rawValue = isAverageMetric(metricKey)
        ? agg.count > 0
          ? agg.sum / agg.count
          : 0
        : agg.sum;
      result.push({
        month: label,
        [metricKey]: toActivityChartValue(rawValue, metricKey, systemUnit),
      });
    }

    return result;
  }, [data, dayjsLocale, locale, metricKey, startOfYear, systemUnit]);

  if (isLoading) {
    return (
      <ActivityMetricChartLoading
        barHeights={[80, 120, 96, 160, 112, 140, 72, 168, 104, 136, 88, 152]}
        barWidthClass="w-4"
        periodWidthClass="w-28"
        titleWidthClass="w-24"
        xLabelWidthClass="w-4"
        xPaddingClass="px-4"
      />
    );
  }

  return (
    <Card>
      <ActivityMetricCardHeader
        metricKey={metricKey}
        onMetricKeyChange={onMetricKeyChange}
        title={t("yearlySummary")}
        periodLabel={String(startOfYear.year())}
        onPrev={() => setCurrentYear((prev) => prev.subtract(1, "year"))}
        onNext={() => {
          if (isCurrentYear) return;
          setCurrentYear((prev) => prev.add(1, "year"));
        }}
        disableNext={isCurrentYear}
      />
      <CardContent>
        <ActivityMetricBarChartBody
          chartData={chartData}
          metricKey={metricKey}
          maxBarSize={32}
          systemUnit={systemUnit}
          xAxisKey="month"
        />
      </CardContent>
    </Card>
  );
}

export function ActivitiesStats() {
  const [metricKey, setMetricKey] = useState<SupportedMetricKey>("distance");
  return (
    <div className="mb-2">
      <div className="md:hidden">
        <Tabs defaultValue="week">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="week" className="w-full">
              周
            </TabsTrigger>
            <TabsTrigger value="month" className="w-full">
              月
            </TabsTrigger>
            <TabsTrigger value="year" className="w-full">
              年
            </TabsTrigger>
          </TabsList>
          <TabsContent value="week">
            <WeeklyActivityChart
              metricKey={metricKey}
              onMetricKeyChange={setMetricKey}
            />
          </TabsContent>
          <TabsContent value="month">
            <MonthlyActivityBarChart
              metricKey={metricKey}
              onMetricKeyChange={setMetricKey}
            />
          </TabsContent>
          <TabsContent value="year">
            <YearlyActivityBarChart
              metricKey={metricKey}
              onMetricKeyChange={setMetricKey}
            />
          </TabsContent>
        </Tabs>
      </div>

      <div className="hidden md:grid grid-cols-8 gap-2">
        <div className="col-span-3">
          <WeeklyActivityChart
            metricKey={metricKey}
            onMetricKeyChange={setMetricKey}
          />
        </div>
        <div className="col-span-3">
          <MonthlyActivityCalendar />
        </div>
        <div className="col-span-2">
          <YearlySummaryCard />
        </div>
      </div>
    </div>
  );
}
