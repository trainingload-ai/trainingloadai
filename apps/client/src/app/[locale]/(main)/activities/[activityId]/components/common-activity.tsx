"use client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BarChart3,
  Footprints,
  Gauge,
  HeartPulse,
  ListOrdered,
  Trophy,
  Zap,
} from "lucide-react";
import { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";

// Import analysis components
import Overview from "./Overview";
import ActivityMap from "./ActivityMap";
import HeartRatePage from "./heartRate/heartRatePage";
import { useRouter } from "@/i18n/routing";
import { useGetActivity } from "@/hooks/useActivities";
import { useActivityId } from "@/hooks/useActivityId";
import PowerZones from "./power/power";
import PacePage from "./pace/PacePage";
import SlopeAnalysis from "./slope/SlopeAnalysis";
import { ActivityHeader } from "./ActivityHeader";
import { ActivityLaps } from "./laps/ActivityLaps";
import { ActivityConfigDialog } from "./ActivityConfigDialog";
import { ActivityDataChart } from "./ActivityDataChart";
import AIAnalysis from "./AIAnalysis";
import { ActivityStrengthSection } from "./ActivityStrengthSection";
import { useActivityDataChartConfig } from "@/hooks/useActivityDataChartConfig";
import {
  getActivityDataChartsForSport,
  getVisibleActivityDataCharts,
} from "@/lib/activity-data-charts";
import {
  getActivityDetailPolicy,
  isActivityDataChartAllowed,
  isActivityDetailTabVisible,
} from "@/lib/activity-detail-policy";
import { useActivityMetricAvailability } from "@/api/useActivityMetric";
import { ActivityWeatherCard } from "./ActivityWeatherCard";
import RunningDynamicsPage from "./running-dynamics/RunningDynamicsPage";
import { ActivityAnalysisLinkProvider } from "./activity-analysis-link-context";
import { BestIntervals } from "./BestIntervals";

// 详情页 tabs 只维护稳定 value 和图标，显示文案统一从 i18n 读取。
const tabItems = [
  { value: "overview", icon: BarChart3 },
  { value: "lap", icon: ListOrdered },
  { value: "heartrate", icon: HeartPulse },
  { value: "power", icon: Zap },
  { value: "pace", icon: Gauge },
  { value: "runningDynamics", icon: Footprints },
  { value: "bestIntervals", icon: Trophy },
] as const;

const RUNNING_DYNAMICS_METRICS = [
  "cadence",
  "stepLength",
  "verticalOscillation",
  "verticalRatio",
  "stanceTime",
  "flightTime",
  "flightRatio",
  "totalSteps",
] as const;

/**
 * 活动详情页聚合概览、地图、AI 解读、圈段和各专项分析标签页。
 * @returns
 */
const CommonActivityDetail = () => {
  const router = useRouter();
  const activityId = useActivityId();
  const { data: activity, isLoading } = useGetActivity(activityId || "");
  const { charts: dataChartConfig } = useActivityDataChartConfig();

  // 针对活动类型，获取对应的活动详情策略
  const detailPolicy = getActivityDetailPolicy(activity);
  const candidateDataCharts = getActivityDataChartsForSport(
    activity?.sportType,
  ).filter((chart) => isActivityDataChartAllowed(activity, chart.id));
  const requestedMetrics = Array.from(
    new Set([
      ...candidateDataCharts.map((chart) => chart.metric),
      ...(detailPolicy.group === "RUN" ? RUNNING_DYNAMICS_METRICS : []),
    ]),
  );
  const { availableMetrics, isLoading: isChartAvailabilityLoading } =
    useActivityMetricAvailability(activityId || "", requestedMetrics);
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
  const hasRunningDynamics = RUNNING_DYNAMICS_METRICS.some((metric) =>
    availableMetrics.has(metric),
  );
  const visibleTabs = tabItems.filter(
    (item) =>
      isActivityDetailTabVisible(activity, item.value) &&
      (item.value !== "runningDynamics" ||
        (!isChartAvailabilityLoading && hasRunningDynamics)),
  );
  const t = useTranslations("ActivityDetail");
  const tAi = useTranslations("AIAnalysis");

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

  return (
    <ActivityAnalysisLinkProvider>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 pb-10">
        <header className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/activities")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("activityFeed")}
          </Button>
        </header>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-4">
            <div className="px-1 py-1">
              {activity ? <ActivityHeader activity={activity} /> : null}
            </div>
            <div className="overflow-hidden rounded-md">
              <Overview />
            </div>
          </section>

          <section className="relative overflow-hidden rounded-md bg-neutral-50 px-4 py-3.5 dark:bg-[#151817] md:px-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(117,185,155,0.20),transparent_46%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(112,189,152,0.20),transparent_46%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#4b8b70]/45 via-[#4b8b70]/15 to-transparent" />
            <div className="pointer-events-none absolute bottom-3.5 left-0 top-3.5 w-px bg-gradient-to-b from-[#4b8b70]/30 to-transparent" />
            <div className="relative flex items-center justify-between gap-3">
              <h2 className="text-mobile-caption font-semibold tracking-[0.2px] text-[#326c56] pc:text-xs dark:text-[#a4d5bf]">
                {t("coachReview")}
              </h2>
              <span className="text-[10px] tracking-[0.2px] text-muted-foreground/65">
                {tAi("generated")}
              </span>
            </div>
            <div className="relative mt-2.5">
              <AIAnalysis />
            </div>
          </section>
        </div>

        {detailPolicy.showMap ? <ActivityMap /> : null}

        <Tabs defaultValue="overview" className="relative space-y-3">
          <div className="overflow-x-auto border-b border-border pr-10 no-scrollbar">
            <TabsList className="h-auto gap-6 rounded-none bg-transparent p-0">
              {visibleTabs.map((item) => {
                const Icon = item.icon;
                const label =
                  item.value === "lap" || item.value === "pace"
                    ? t(`tabs.${item.value}`)
                    : t(`tabs.${item.value}`);
                return (
                  <TabsTrigger
                    key={item.value}
                    className="relative gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-mobile-caption text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none pc:text-xs"
                    value={item.value}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          {/* 总览标签页 */}
          <TabsContent value="overview" className="space-y-3">
            {!isChartAvailabilityLoading && availableDataCharts.length > 0 ? (
              <div className="absolute right-0 top-1 z-10">
                <ActivityConfigDialog
                  defaultTab="dataCharts"
                  tabs={["dataCharts"]}
                />
              </div>
            ) : null}
            <div className="space-y-4">
              <ActivityWeatherCard weather={activity?.weather} />
              {activity ? (
                <ActivityStrengthSection activity={activity} />
              ) : null}
              {!isChartAvailabilityLoading && availableDataCharts.length > 0 ? (
                <div className="grid w-full grid-cols-1 gap-3 pc:gap-4">
                  {visibleDataCharts.map((chart) => (
                    <ActivityDataChart
                      key={chart.id}
                      activityId={activityId || ""}
                      chartId={chart.id}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="bestIntervals" className="space-y-3">
            <BestIntervals activityId={activityId || ""} />
          </TabsContent>

          <TabsContent value="lap" className="space-y-3">
            {activity ? (
              <ActivityLaps
                laps={activity.laps || []}
                sportType={activity.sportType}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="heartrate" className="space-y-3">
            <Suspense fallback={<div>{t("suspenseFallback")}</div>}>
              <HeartRatePage />
            </Suspense>
          </TabsContent>

          <TabsContent value="power" className="space-y-3">
            <Suspense fallback={<div>{t("suspenseFallback")}</div>}>
              <PowerZones />
            </Suspense>
          </TabsContent>
          <TabsContent value="pace" className="space-y-3">
            <Suspense fallback={<div>{t("suspenseFallback")}</div>}>
              <PacePage />
            </Suspense>
          </TabsContent>
          <TabsContent value="runningDynamics" className="space-y-3">
            <Suspense fallback={<div>{t("suspenseFallback")}</div>}>
              <RunningDynamicsPage
                activityId={activityId || ""}
                availableMetrics={availableMetrics}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="slope" className="space-y-3">
            <SlopeAnalysis />
          </TabsContent>
        </Tabs>
      </main>
    </ActivityAnalysisLinkProvider>
  );
};

export default CommonActivityDetail;
