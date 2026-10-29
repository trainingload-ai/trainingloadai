"use client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, HeartPulse } from "lucide-react";
import React, { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";

// Import analysis components
import HeartRatePage from "./heartRate/heartRatePage";
import { useRouter } from "@/i18n/routing";
import { useGetActivity } from "@/hooks/useActivities";
import { useActivityId } from "@/hooks/useActivityId";
import { ActivityHeader } from "./ActivityHeader";
import OverviewHeartRateChart from "./charts/heart-rate-chart";
import SwimOverview from "./swim/swim-overview";
import { ActivityConfigDialog } from "./ActivityConfigDialog";
import { useActivityDataChartConfig } from "@/hooks/useActivityDataChartConfig";
import {
  getActivityDataChartsForSport,
  getVisibleActivityDataCharts,
} from "@/lib/activity-data-charts";
import {
  isActivityDataChartAllowed,
  isActivityDetailTabVisible,
} from "@/lib/activity-detail-policy";
import { useActivityMetricAvailability } from "@/api/useActivityMetric";
import { ActivityWeatherCard } from "./ActivityWeatherCard";

function DetailSectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}
const SwimActivityDetail = () => {
  const router = useRouter();
  const activityId = useActivityId();
  const { data: activity, isLoading } = useGetActivity(activityId || "");
  const { charts: dataChartConfig } = useActivityDataChartConfig();
  const candidateDataCharts = getActivityDataChartsForSport(
    activity?.sportType,
  ).filter((chart) => isActivityDataChartAllowed(activity, chart.id));
  const { availableMetrics, isLoading: isChartAvailabilityLoading } =
    useActivityMetricAvailability(
      activityId || "",
      candidateDataCharts.map((chart) => chart.metric),
    );
  const availableDataCharts = candidateDataCharts.filter((chart) =>
    availableMetrics.has(chart.metric),
  );
  const visibleDataCharts = getVisibleActivityDataCharts(
    activity?.sportType,
    dataChartConfig,
  ).filter(
    (chart) =>
      isActivityDataChartAllowed(activity, chart.id) &&
      availableMetrics.has(chart.metric),
  );
  const showHeartRate = isActivityDetailTabVisible(activity, "heartrate");

  const t = useTranslations("ActivityDetail");

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  // 如果没有 activityId，也跳转到 not-found
  if (!activityId) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-6">
      <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/activities")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("activityFeed")}
          </Button>
        </div>
        {activity && <ActivityHeader activity={activity} />}
      </div>

      <Tabs defaultValue="overview" className="space-y-3">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="h-auto gap-1 rounded-md bg-neutral-100 p-1 dark:bg-muted/45">
            <TabsTrigger
              className="gap-1.5 rounded-md px-3 py-2 text-mobile-caption pc:text-xs data-[state=active]:bg-background data-[state=active]:shadow-none md:px-5"
              value="overview"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {t("tabs.overview")}
            </TabsTrigger>

            {showHeartRate ? (
              <TabsTrigger
                className="gap-1.5 rounded-md px-3 py-2 text-mobile-caption pc:text-xs data-[state=active]:bg-background data-[state=active]:shadow-none md:px-5"
                value="heartrate"
              >
                <HeartPulse className="h-3.5 w-3.5" />
                {t("tabs.heartrate")}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-3">
          <div className="space-y-4">
            <DetailSectionTitle title={t("tabs.overview")} />
            <SwimOverview />
            <ActivityWeatherCard weather={activity?.weather} />
            {!isChartAvailabilityLoading && availableDataCharts.length > 0 ? (
              <>
                <DetailSectionTitle
                  title={t("dataCharts")}
                  action={
                    <ActivityConfigDialog
                      defaultTab="dataCharts"
                      tabs={["dataCharts"]}
                    />
                  }
                />
                {visibleDataCharts.some((chart) => chart.id === "heartRate") ? (
                  <div className="grid w-full grid-cols-1 gap-4">
                    <OverviewHeartRateChart activityId={activityId || ""} />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </TabsContent>

        {showHeartRate ? (
          <TabsContent value="heartrate" className="space-y-3">
            <Suspense fallback={<div>{t("suspenseFallback")}</div>}>
              <HeartRatePage />
            </Suspense>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
};

export default SwimActivityDetail;
