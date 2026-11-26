"use client";

import {
  BarChart3,
  ChartLine,
  Footprints,
  Gauge,
  HeartPulse,
  ListOrdered,
  MapPin,
  Trophy,
  Zap,
} from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import type { CoachActivityFocus } from "@shared/ai-coach-schema";

// Import analysis components
import Overview from "./Overview";
import ActivityMap from "./ActivityMap";
import HeartRatePage from "./heartRate/heartRatePage";
import { useGetActivity } from "@/hooks/useActivities";
import { useActivityId } from "@/hooks/useActivityId";
import PowerZones from "./power/power";
import PacePage from "./pace/PacePage";
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
  type ActivityDetailSection,
} from "@/lib/activity-detail-policy";
import { useActivityMetricAvailability } from "@/api/useActivityMetric";
import { ActivityWeatherCard } from "./ActivityWeatherCard";
import RunningDynamicsPage from "./running-dynamics/RunningDynamicsPage";
import { ActivityAnalysisLinkProvider } from "./activity-analysis-link-context";
import { BestIntervals } from "./BestIntervals";
import { GenericActivityDataNotice } from "@/components/activities/generic-activity-data-notice";

// 详情页 tabs 只维护稳定 value 和图标，显示文案统一从 i18n 读取。
const tabItems = [
  { value: "overview", icon: BarChart3 },
  { value: "lap", icon: ListOrdered },
  { value: "heartrate", icon: HeartPulse },
  { value: "power", icon: Zap },
  { value: "pace", icon: Gauge },
  { value: "runningDynamics", icon: Footprints },
  { value: "bestIntervals", icon: Trophy },
  { value: "timeline", icon: ChartLine },
] as const;

function TimelineLoading() {
  const t = useTranslations("ActivityDetail");
  return (
    <div
      role="status"
      className="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
    >
      {t("loading")}
    </div>
  );
}

const ActivityTimeline = dynamic(() => import("./timeline/activity-timeline"), {
  loading: TimelineLoading,
});
const SwimOverview = dynamic(() => import("./swim/swim-overview"));

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

type ActivityDetailPreview = {
  section: ActivityDetailSection;
  onSectionChange: (section: ActivityDetailSection) => void;
  focus?: CoachActivityFocus;
};

export function ActivityDetailContent({
  activity,
  activityId,
  preview,
}: {
  activity: Activity | undefined;
  activityId: string;
  preview?: ActivityDetailPreview;
}) {
  const [pageSection, setPageSection] = useState<ActivityDetailSection>("overview");
  const readOnly = Boolean(preview);
  const activeSection = preview?.section ?? pageSection;
  const { charts: dataChartConfig } = useActivityDataChartConfig();

  // 针对活动类型，获取对应的活动详情策略
  const detailPolicy = getActivityDetailPolicy(activity);
  const isSwimming = detailPolicy.group === "SWIM";
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
    useActivityMetricAvailability(activityId, requestedMetrics);
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
  const availableTabs = tabItems.filter(
    (item) =>
      isActivityDetailTabVisible(activity, item.value) &&
      (item.value !== "runningDynamics" ||
        (!isChartAvailabilityLoading && hasRunningDynamics)),
  );
  const t = useTranslations("ActivityDetail");
  const tAi = useTranslations("AIAnalysis");
  const tSidebar = useTranslations("sidebar");
  const tOverview = useTranslations("Overview");
  const canConfigureOverview = !isChartAvailabilityLoading && availableDataCharts.length > 0;
  const visibleTabs = tabItems.filter((item) =>
    availableTabs.includes(item) || item.value === preview?.section,
  );
  const sections = preview?.section === "map"
    ? [...visibleTabs, { value: "map", icon: MapPin } as const]
    : visibleTabs;
  const hasSection = (section: ActivityDetailSection) => section === "map"
    ? detailPolicy.showMap
    : availableTabs.some((item) => item.value === section);

  const panels: Record<ActivityDetailSection, ReactNode> = {
    overview: (
      <div className="space-y-4">
        {isSwimming ? <SwimOverview /> : null}
        <ActivityWeatherCard weather={activity?.weather} />
        {activity ? <ActivityStrengthSection activity={activity} /> : null}
        {canConfigureOverview ? (
          <div className="grid w-full grid-cols-1 gap-3 pc:gap-4">
            {visibleDataCharts.map((chart) => (
              <ActivityDataChart key={chart.id} activityId={activityId} chartId={chart.id} />
            ))}
          </div>
        ) : null}
      </div>
    ),
    timeline: activity ? (
      <ActivityTimeline
        key={`${activityId}:${JSON.stringify(preview?.focus ?? null)}`}
        activity={activity}
        activityId={activityId}
        initialFocus={preview?.focus}
        readOnly={readOnly}
      />
    ) : null,
    bestIntervals: <BestIntervals activityId={activityId} />,
    lap: activity ? <ActivityLaps laps={activity.laps || []} sportType={activity.sportType} /> : null,
    heartrate: <HeartRatePage />,
    power: <PowerZones />,
    pace: <PacePage />,
    runningDynamics: <RunningDynamicsPage activityId={activityId} availableMetrics={availableMetrics} />,
    map: <ActivityMap showEmpty />,
  };

  return (
    <ActivityAnalysisLinkProvider>
      <div className="@container/activity-detail flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-4">
            <div className="px-1 py-1">
              {activity ? <ActivityHeader activity={activity} readOnly={readOnly} /> : null}
            </div>
            {isSwimming ? null : <Overview />}
            {activity ? (
              <GenericActivityDataNotice activity={activity} />
            ) : null}
          </section>

          {isSwimming ? null : <section className="relative overflow-clip rounded-md bg-neutral-50 px-4 py-3.5 dark:bg-visual-artwork-inset-dark @min-[42rem]/activity-detail:px-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--visual-review-gradient-start)_20%,transparent),transparent_46%)] dark:bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--visual-review-gradient-start-dark)_20%,transparent),transparent_46%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-visual-review-accent/45 via-visual-review-accent/15 to-transparent" />
            <div className="pointer-events-none absolute bottom-3.5 left-0 top-3.5 w-px bg-gradient-to-b from-visual-review-accent/30 to-transparent" />
            <div className="relative flex items-center justify-between gap-3">
              <h2 className="text-mobile-caption font-semibold tracking-[0.2px] text-visual-review-title pc:text-xs dark:text-visual-review-title-dark">
                {t("coachReview")}
              </h2>
              <span className="text-[10px] tracking-[0.2px] text-muted-foreground/65">
                {tAi("generated")}
              </span>
            </div>
            <div className="relative mt-2.5">
              <AIAnalysis readOnly={readOnly} />
            </div>
          </section>}
        </div>

        {detailPolicy.showMap && activeSection !== "map" ? <ActivityMap /> : null}

        <Tabs
          value={activeSection}
          onValueChange={(value) => {
            const section = sections.find((item) => item.value === value)?.value;
            if (section) (preview?.onSectionChange ?? setPageSection)(section);
          }}
          activationMode={preview ? "manual" : "automatic"}
          className="min-w-0 space-y-3"
        >
          <div className="flex min-w-0 items-center gap-2 border-b border-border">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <TabsList aria-label={t("title")} className="h-auto gap-4 rounded-none bg-transparent p-0 @min-[42rem]/activity-detail:gap-6">
                {sections.map(({ value, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    className="relative shrink-0 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-mobile-caption text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none pc:text-xs"
                    value={value}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {value === "map" ? tSidebar("map") : t(`tabs.${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {!readOnly && activeSection === "overview" && canConfigureOverview ? (
              <ActivityConfigDialog defaultTab="dataCharts" tabs={["dataCharts"]} />
            ) : null}
          </div>
          {sections.map(({ value }) => (
            <TabsContent key={value} value={value} className="min-w-0 space-y-3">
              {hasSection(value) ? (
                <Suspense fallback={<div role="status">{t("loading")}</div>}>
                  {panels[value]}
                </Suspense>
              ) : (
                <p role="status" className="p-3 text-sm text-muted-foreground">{tOverview("noData")}</p>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ActivityAnalysisLinkProvider>
  );
}

export default function CommonActivityDetail() {
  const activityId = useActivityId() || "";
  const { data: activity, isLoading } = useGetActivity(activityId);
  if (isLoading) return <TimelineLoading />;

  return (
    <main className="mx-auto w-full max-w-7xl pb-10">
      <ActivityDetailContent
        activity={activity}
        activityId={activityId}
      />
    </main>
  );
}
