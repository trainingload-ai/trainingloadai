"use client";

import {
  ArrowRight,
  CalendarRange,
  HeartPulse,
  Link2,
  Plus,
  Route,
  TrendingUp,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { PlanCreateLauncher } from "@/components/plan/plan-create-launcher";
import dayjs from "dayjs";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  getV2Home,
  type HomeMetricSport,
  type V2HomeTodayAdvice,
  type V2HomeResponse,
  type V2HomePlanWorkout,
} from "@/api/v2-home";
import { usePMCData } from "@/api/usePMC";
import {
  getAiTodaySuggestion,
  readAuthorizedWeatherLocation,
  type AiTodaySuggestionResponse,
} from "@/api/ai-today-suggestion";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  getV2ActivitiesFeed,
  type V2ActivityListItem,
} from "@/api/v2-activities";
import { TimezoneProfilePromptDialog } from "./components/timezone-profile-prompt-dialog";
import { HomeSuggestionCardStack } from "./components/home-suggestion-card-stack";
import {
  buildHomeWeeklySummary,
  formatHomeMonthDay,
  formatHomeWeekday,
} from "./home-weekly-summary";
import { ActivityUploadCard } from "@/components/activities/ActivityUploadCard";
import { DeferredMount } from "@/components/deferred-mount";
import {
  estimateWorkoutDurationSeconds,
  formatWorkoutDuration,
} from "@/lib/workout-display-utils";
import { usePlanWorkoutActions } from "@/hooks/usePlanWorkoutActions";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useDeviceTimezone } from "@/hooks/use-device-timezone";
import { useIsMobile, useMobileViewport } from "@/hooks/use-mobile";
import { useStore, type TimeFormat } from "@/lib/store";
import { useDashboardWeeklySummaryPair } from "@/api/charts";
import { queryKeys } from "@/lib/query-keys";
import { MobilePullToRefresh } from "@/components/mobile-app/components/MobilePullToRefresh";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import ThemeLogo from "@/components/ui/ThemeLogo";
import { invalidateActivityDerivedCaches } from "@/lib/query-invalidation";
import { MapThumbnail } from "@/components/activities/map-thumbnail";
import { formatLocalMonthDayClock } from "@/lib/time-format";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import type { SportType } from "@/api/activities";
import { getHomeWeekRange } from "./home-week-range";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { useAiDataConsent } from "@/api/ai-data-consent";
import { AiDataConsentReminder } from "@/components/ai-consent/AiDataConsentReminder";
import { PlanWorkoutListRow } from "@/components/plan/plan-workout-list-row";
import { WorkoutMiniChart } from "@/components/plan/mobile-plan-workout-row";
import { getPlanWorkoutDisplayKind } from "@/components/plan/detail/plan-detail-utils";
import { MobilePmcStatusPreview } from "./components/mobile-pmc-status-preview";
import { WorkoutActionConfirm } from "@/components/plan/workout-action-confirm";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

type TranslateFn = ReturnType<typeof useTranslations>;

const HomeWeeklyLoadChart = dynamic(
  () =>
    import("./components/home-weekly-load-chart").then(
      (module) => module.HomeWeeklyLoadChart,
    ),
  {
    loading: () => (
      <div className="mx-4 h-44 animate-pulse rounded-lg bg-background/70" />
    ),
  },
);

const FitnessStateMiniCards = dynamic(() => import("./FitnessStateMiniCards"), {
  loading: () => <div className="h-52 animate-pulse rounded-md bg-muted/45" />,
});

const MobileHealthOverviewSection = dynamic(
  () =>
    import("@/components/health/HealthOverviewSection").then(
      (module) => module.HealthOverviewSection,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-5 w-24 animate-pulse rounded-xs bg-muted/60" />
        <div className="h-36 animate-pulse rounded-surface bg-muted/45" />
      </div>
    ),
  },
);

const HomeMetricsOverviewSection = dynamic(
  () =>
    import("@/components/home/HomeMetricsOverviewSection").then(
      (module) => module.HomeMetricsOverviewSection,
    ),
  {
    loading: () => (
      <div className="h-64 animate-pulse rounded-md bg-muted/45" />
    ),
  },
);

const ViewWorkoutDialog = dynamic(
  () =>
    import("@/components/plan/view-workout-dialog").then(
      (module) => module.ViewWorkoutDialog,
    ),
  { ssr: false },
);

/**
 * 构建首页数据
 * @param t 翻译函数
 * @returns 首页数据
 */
function buildHomeData(t: TranslateFn) {
  const todayKey = dayjs().format("YYYY-MM-DD");
  return {
    aiTodaySuggestion: {
      title: t("aiTodaySuggestion.title"),
      summary: t("aiTodaySuggestion.loading"),
      tags: [] as string[],
      weatherAttribution: null as
        | V2HomeTodayAdvice["weatherAttribution"]
        | null,
      details: null as AiTodaySuggestionResponse | null,
    },
    recentActivity: {
      id: "",
      title: t("recentActivity.title"),
      sportType: "UNKNOWN" as V2ActivityListItem["sportType"],
      subSportType: null as string | null,
      time: t("recentActivity.time"),
      summary: t("recentActivity.summary"),
      status: t("recentActivity.status"),
      href: null as string | null,
      mapThumbnailDarkUrl: null as string | null,
      mapThumbnailUrl: null as string | null,
    },
    currentPlan: {
      title: t("currentPlan.title"),
      cycle: t("currentPlan.cycle"),
      weekLabel: t("currentPlan.weekLabel"),
      todayFocus: t("currentPlan.noWorkoutToday"),
      weekTargetLoad: 0,
    },
    loadComparison: {
      currentWeekLoad: 0,
      previousWeekLoad: 0,
      days: [
        { day: t("weekday.mon"), planned: 0, actual: null },
        { day: t("weekday.tue"), planned: 0, actual: null },
        { day: t("weekday.wed"), planned: 0, actual: null },
        { day: t("weekday.thu"), planned: 0, actual: null },
        { day: t("weekday.fri"), planned: 0, actual: null },
        { day: t("weekday.sat"), planned: 0, actual: null },
        { day: t("weekday.sun"), planned: 0, actual: null },
      ],
    },
    today: {
      isoDate: todayKey,
      date: t("today.date"),
      weekday: t("today.weekday"),
      plannedWorkouts: [] as Array<{
        id: string;
        planId: string;
        title: string;
        sport: string;
        duration: string;
        sessionCount: number;
        description: string;
        status: string;
        linkedActivity: string | null;
        estimatedLoad: number | null;
        dayOffset: number;
        sessionIndex: number;
        rawStatus: "PLANNED" | "IN_PROGRESS" | "DONE" | "SKIPPED" | "MOVED";
        rawText: string;
        rawNotes: string | null;
        rawName: string | null;
        rawSportType: "RUN" | "CYCLING" | "SWIM" | "STRETCHING" | "UNKNOWN";
      }>,
    },
    summaryMetrics: [
      {
        key: "pmc",
        title: t("summaryMetrics.pmc.title"),
        label: t("summaryMetrics.pmc.label"),
        value: "--",
        hint: t("summaryMetrics.pmc.hint"),
        mobileValue: "--",
        mobileHint: t("summaryMetrics.pmc.hint"),
        href: "/metrics/pmc",
        desktopHref: "/pmc",
        icon: TrendingUp,
      },
      {
        key: "power",
        title: t("summaryMetrics.power.title"),
        label: t("summaryMetrics.power.label"),
        value: "--",
        hint: t("summaryMetrics.power.hint"),
        mobileValue: "--",
        mobileHint: t("summaryMetrics.power.hint"),
        href: "/metrics/power",
        desktopHref: "/power",
        icon: Zap,
      },
      {
        key: "speed",
        title: t("summaryMetrics.speed.title"),
        label: t("summaryMetrics.speed.label"),
        value: "--",
        hint: t("summaryMetrics.speed.hint"),
        mobileValue: "--",
        mobileHint: t("summaryMetrics.speed.hint"),
        href: "/metrics/pace",
        desktopHref: "/pace",
        icon: Route,
      },
      {
        key: "hr",
        title: t("summaryMetrics.hr.title"),
        label: t("summaryMetrics.hr.label"),
        value: t("summaryMetrics.hr.value"),
        hint: t("summaryMetrics.hr.hint"),
        mobileValue: "--",
        mobileHint: t("summaryMetrics.hr.hint"),
        href: "/metrics/hr",
        desktopHref: "/heart-rate",
        icon: HeartPulse,
      },
    ],
  };
}
/**
 * 节点标题
 * @param title 标题
 * @param action 操作按钮
 * @param t 翻译函数
 * @returns
 */
function SectionTitle({
  title,
  action,
  t,
}: {
  title: string;
  action?: string;
  t: TranslateFn;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={() => toast.message(t("toast.inProgress"))}
          className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
/**
 * 软面板
 * @param children 子元素
 * @param className 类名
 * @returns
 */
function SoftPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}
/**
 * 加载对比图表
 * @param t 翻译函数
 * @param homeData 首页数据
 * @returns
 */
function LoadComparisonChart({
  t,
  homeData,
  plannedWorkouts = [],
}: {
  t: TranslateFn;
  homeData: ReturnType<typeof buildHomeData>;
  plannedWorkouts?: V2HomePlanWorkout[];
}) {
  const locale = useLocale();
  const todayKey = String(homeData.today.isoDate).slice(0, 10);
  const { startDate, endDate, dateKeys } = useMemo(
    () => getHomeWeekRange(dayjs(todayKey)),
    [todayKey],
  );
  const { data: pmcData, isLoading } = usePMCData({ startDate, endDate });
  const chartPoints = useMemo(() => {
    const actualByDate = new Map(
      (pmcData ?? []).map((item) => [
        String(item.date).slice(0, 10),
        Number(item.value) || 0,
      ]),
    );
    const plannedByDate = new Map<string, number>();
    for (const workout of plannedWorkouts) {
      if (!workout.scheduledDate || workout.status === "MOVED") continue;
      const key = String(workout.scheduledDate).slice(0, 10);
      const workoutLoad =
        typeof workout.estimatedLoad === "number" &&
        Number.isFinite(workout.estimatedLoad)
          ? Math.max(0, workout.estimatedLoad)
          : 0;
      plannedByDate.set(key, (plannedByDate.get(key) ?? 0) + workoutLoad);
    }
    return dateKeys.map((key, index) => {
      return {
        key,
        label: homeData.loadComparison.days[index]?.day ?? key,
        actual: actualByDate.get(key) ?? 0,
        planned: plannedByDate.get(key) ?? 0,
      };
    });
  }, [dateKeys, homeData.loadComparison.days, plannedWorkouts, pmcData]);
  const hasData = chartPoints.some(
    (point) => point.actual > 0 || point.planned > 0,
  );
  const weeklySummary = useMemo(
    () => buildHomeWeeklySummary(plannedWorkouts),
    [plannedWorkouts],
  );
  const loadProgress =
    weeklySummary.plannedLoad > 0
      ? Math.min(
          100,
          Math.round(
            (homeData.loadComparison.currentWeekLoad /
              weeklySummary.plannedLoad) *
              100,
          ),
        )
      : 0;
  const todayPoint = chartPoints.find((point) => point.key === todayKey);
  const formatLoad = (value: number | undefined) =>
    isLoading || value == null
      ? "—"
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
        }).format(value);

  return (
    <SoftPanel className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("load.chartTitle")}</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="truncate text-mobile-caption font-medium text-muted-foreground pc:text-xs">
            {t("load.weeklyTrainingLoad")}
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-semibold leading-none tabular-nums">
                {homeData.loadComparison.currentWeekLoad}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {t("load.loadUnit")}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-muted-foreground">
                {t("load.goal")} {weeklySummary.plannedLoad}
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {loadProgress}%
              </div>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              aria-label={t("load.weeklyTrainingLoad")}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={loadProgress}
              className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              role="progressbar"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 truncate text-mobile-caption font-medium text-muted-foreground pc:text-xs">
              {t("load.weeklySessionCount")}
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-2xl font-semibold leading-none tabular-nums">
                  {weeklySummary.completedSessions}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  / {weeklySummary.plannedSessions}
                </span>
              </div>
              <div className="mt-1 text-[9px] text-muted-foreground">
                {t("load.completedLabel")} / {t("load.goal")}
              </div>
            </div>
          </div>
          <div className="mt-auto flex items-end justify-between gap-1 pt-1">
            {weeklySummary.sessionBars.map((bar, index) => {
              const plannedHeight =
                bar.planned > 0 ? Math.min(30, 18 + bar.planned * 8) : 6;
              const completedRatio =
                bar.planned > 0 ? bar.completed / bar.planned : 0;
              return (
                <div
                  key={dateKeys[index]}
                  className="min-w-0 flex-1 text-center"
                >
                  <div
                    aria-hidden="true"
                    className="mx-auto flex w-full max-w-3 items-end overflow-hidden rounded-t-sm bg-neutral-200 dark:bg-neutral-700/80"
                    style={{ height: plannedHeight }}
                  >
                    <div
                      className="w-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ height: plannedHeight * completedRatio }}
                    />
                  </div>
                  <div className="mt-1 truncate text-[8px] text-muted-foreground">
                    {homeData.loadComparison.days[index]?.day}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-neutral-100 pb-2 pt-4 dark:bg-muted/45">
        <div className="mb-2 flex items-center justify-between gap-3 px-4 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="block h-[3px] w-3 shrink-0 rounded-full bg-[#7c3aed] dark:bg-[#a78bfa]" />
              {t("load.actual")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="shrink-0 text-[#7c3aed] dark:text-[#a78bfa]"
              >
                <rect
                  x="0.5"
                  y="0.5"
                  width="11"
                  height="11"
                  fill="currentColor"
                  fillOpacity="0.1"
                  stroke="currentColor"
                  strokeOpacity="0.24"
                />
                <path
                  d="M1 5L5 1 M1 11L11 1 M7 11L11 7"
                  stroke="currentColor"
                  strokeOpacity="0.42"
                  strokeWidth="1.5"
                />
              </svg>
              {t("load.expected")}
            </span>
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {t("load.todayValues", {
              planned: formatLoad(todayPoint?.planned),
              actual: formatLoad(todayPoint?.actual),
            })}
          </span>
        </div>
        {isLoading ? (
          <div className="mx-4 h-44 animate-pulse rounded-lg bg-background/70" />
        ) : hasData ? (
          <HomeWeeklyLoadChart
            data={chartPoints}
            actualLabel={t("load.actual")}
            plannedLabel={t("load.expected")}
            ariaLabel={t("load.chartAria")}
          />
        ) : (
          <div className="mx-4 grid h-44 place-items-center text-sm text-muted-foreground">
            {t("load.noData")}
          </div>
        )}
      </div>
    </SoftPanel>
  );
}
/**
 * 摘要面板
 * @param t 翻译函数
 * @param homeData 首页数据
 * @returns
 */
function SummaryPanel({
  t,
  homeData,
}: {
  t: TranslateFn;
  homeData: ReturnType<typeof buildHomeData>;
}) {
  const tSidebar = useTranslations("sidebar");
  const getMobileLabel = (
    item: ReturnType<typeof buildHomeData>["summaryMetrics"][number],
  ) => {
    if (item.key === "power") return tSidebar("power");
    if (item.key === "speed") return tSidebar("pace");
    if (item.key === "hr") return tSidebar("heartRate");
    return item.label;
  };

  return (
    <SoftPanel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t("summary.title")}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 pc:hidden">
        {homeData.summaryMetrics.map((item) => {
          const Icon = item.icon;
          const mobileLabel = getMobileLabel(item);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={`${mobileLabel}, ${item.mobileValue}, ${item.mobileHint}`}
              className="group min-h-[124px] min-w-0 rounded-surface bg-neutral-100 p-3 transition-colors active:bg-neutral-200 dark:bg-muted/45 dark:active:bg-muted"
            >
              <div className="flex h-full min-h-[100px] flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
                    {mobileLabel}
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-background text-muted-foreground dark:bg-black/20">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-semibold leading-5 tabular-nums text-foreground">
                    {item.mobileValue}
                  </div>
                  <div className="mt-1 flex items-end gap-1">
                    <div className="line-clamp-2 min-w-0 flex-1 text-mobile-caption leading-4 text-muted-foreground pc:text-xs">
                      {item.mobileHint}
                    </div>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="hidden grid-cols-2 gap-3 pc:grid">
        {homeData.summaryMetrics.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.desktopHref}
              className="group rounded-md bg-neutral-100 px-3 py-3 transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors group-hover:text-foreground dark:bg-black/20">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-semibold">
                      {item.title}
                    </div>
                    <span className="shrink-0 rounded-md bg-background px-2 py-0.5 text-mobile-unit text-muted-foreground pc:text-[10px] dark:bg-black/20">
                      {item.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-mobile-caption text-muted-foreground pc:text-xs">
                    {item.value} · {item.hint}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </Link>
          );
        })}
      </div>
    </SoftPanel>
  );
}
/**
 * 当前状态面板
 * @returns
 */
function CurrentStatePanel() {
  const isMobileLayout = useIsMobile();

  return (
    <SoftPanel className="space-y-3">
      <FitnessStateMiniCards />
      {isMobileLayout ? (
        <MobileHealthOverviewSection appearance="soft" />
      ) : null}
    </SoftPanel>
  );
}
/**
 * 今日执行面板
 * @param t 翻译函数
 * @param homeData 首页数据
 * @returns
 */
function TodayExecutionPanel({
  t,
  homeData,
}: {
  t: TranslateFn;
  homeData: ReturnType<typeof buildHomeData>;
}) {
  const queryClient = useQueryClient();
  const tActivities = useTranslations("activities");
  const tLoad = useTranslations("V2PlanDetailPage.mobile.loadChart");
  const tWorkoutDialog = useTranslations("ViewWorkoutDialog.mobile");
  const dayHref = `/day/${homeData.today.isoDate}`;
  const {
    pendingWorkoutId,
    postponeWorkout: runPostponeWorkout,
    skipWorkout: runSkipWorkout,
  } = usePlanWorkoutActions();
  const [pendingPostponeWorkout, setPendingPostponeWorkout] = useState<
    (typeof homeData.today.plannedWorkouts)[number] | null
  >(null);
  const [pendingSkipWorkout, setPendingSkipWorkout] = useState<
    (typeof homeData.today.plannedWorkouts)[number] | null
  >(null);
  const [selectedWorkout, setSelectedWorkout] = useState<
    (typeof homeData.today.plannedWorkouts)[number] | null
  >(null);

  const postponeWorkout = async (
    workout: (typeof homeData.today.plannedWorkouts)[number],
  ) => {
    if (workout.rawStatus === "DONE" || workout.rawStatus === "SKIPPED") return;
    try {
      await runPostponeWorkout({
        planId: workout.planId,
        workoutId: workout.id,
        status: workout.rawStatus,
        sourceDayOffset: workout.dayOffset,
        text: workout.rawText,
        notes: workout.rawNotes ?? null,
        name: workout.rawName ?? null,
        sportType: workout.rawSportType,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.plans.active(),
      });
      toast.success(t("todayExecution.toastPostponeSuccess"));
    } catch {
      toast.error(t("todayExecution.toastPostponeFailed"));
    }
  };

  const skipWorkout = async (
    workout: (typeof homeData.today.plannedWorkouts)[number],
  ) => {
    if (workout.rawStatus === "DONE" || workout.rawStatus === "SKIPPED") return;
    try {
      await runSkipWorkout({
        planId: workout.planId,
        workoutId: workout.id,
        status: workout.rawStatus,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.plans.active(),
      });
      toast.success(t("todayExecution.toastSkipSuccess"));
    } catch {
      toast.error(t("todayExecution.toastSkipFailed"));
    }
  };

  return (
    <>
      <SoftPanel className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              <span className="pc:hidden">
                {t("todayExecution.mobileTitle")}
              </span>
              <span className="hidden pc:inline">
                {t("todayExecution.title")}
              </span>
            </h2>
            <p className="text-mobile-caption pc:text-xs text-muted-foreground">
              <span className="pc:hidden">
                {t("todayExecution.mobileMeta", {
                  weekday: homeData.today.weekday,
                  count: homeData.today.plannedWorkouts.length,
                })}
              </span>
              <span className="hidden pc:inline">
                ｜{" "}
                {t("todayExecution.meta", {
                  date: homeData.today.date,
                  weekday: homeData.today.weekday,
                  count: homeData.today.plannedWorkouts.length,
                })}
              </span>
            </p>
          </div>
          <Link
            href={dayHref}
            aria-label={t("todayExecution.enterToday")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-mobile-caption font-medium leading-none text-muted-foreground transition-colors hover:bg-neutral-100 hover:text-foreground pc:h-4 pc:w-auto pc:gap-1 pc:rounded-none pc:hover:bg-transparent pc:text-xs dark:hover:bg-muted pc:dark:hover:bg-transparent"
          >
            <span className="hidden pc:inline">
              {t("todayExecution.enterToday")}
            </span>
            <ArrowRight className="h-4 w-4 pc:h-3.5 pc:w-3.5" />
          </Link>
        </div>
        <div className="space-y-1.5">
          {homeData.today.plannedWorkouts.length === 0 ? (
            <div className="rounded-surface border border-dashed border-border/70 bg-neutral-100 px-4 py-6 text-sm text-muted-foreground dark:bg-muted/45">
              {t("todayExecution.empty")}
            </div>
          ) : null}
          {homeData.today.plannedWorkouts.map((workout) => {
            const displayKind = getPlanWorkoutDisplayKind({
              status: workout.rawStatus,
              scheduledDate: homeData.today.isoDate,
            });
            const canMutate =
              workout.rawStatus !== "DONE" &&
              workout.rawStatus !== "SKIPPED" &&
              workout.rawStatus !== "MOVED";
            const meta = [
              workout.sport,
              workout.duration !== "--" ? workout.duration : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <PlanWorkoutListRow
                key={workout.id}
                displayKind={displayKind}
                onOpen={() => setSelectedWorkout(workout)}
                statusLabel={workout.status}
                subtitle={workout.description}
                title={workout.title}
                meta={meta}
                chart={
                  <WorkoutMiniChart
                    workout={null}
                    fallbackText={workout.rawText}
                  />
                }
                metrics={[
                  { label: tActivities("distance"), value: "—" },
                  {
                    label: tActivities("duration"),
                    value: workout.duration !== "--" ? workout.duration : "—",
                  },
                  {
                    label: tLoad("plannedLoad"),
                    value:
                      workout.estimatedLoad != null
                        ? String(Math.round(workout.estimatedLoad))
                        : "—",
                  },
                ]}
                footerLeading={
                  <span className="inline-flex max-w-full items-center gap-1.5 text-mobile-caption text-muted-foreground pc:text-[11px]">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {workout.linkedActivity
                        ? t("todayExecution.linked", {
                            activity: workout.linkedActivity,
                          })
                        : t("todayExecution.notLinked")}
                    </span>
                  </span>
                }
                footerVisibility="desktop"
                footerActions={
                  canMutate ? (
                    <>
                      <button
                        type="button"
                        disabled={pendingWorkoutId === workout.id}
                        onClick={() => setPendingPostponeWorkout(workout)}
                        className="pointer-events-auto rounded-compact bg-background/35 px-1.5 py-0.5 text-mobile-caption text-muted-foreground/65 transition-colors hover:bg-background/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/10 dark:hover:bg-muted pc:text-[11px]"
                      >
                        {pendingWorkoutId === workout.id
                          ? t("todayExecution.actionPending")
                          : t("todayExecution.actionPostpone")}
                      </button>
                      <button
                        type="button"
                        disabled={pendingWorkoutId === workout.id}
                        onClick={() => setPendingSkipWorkout(workout)}
                        className="pointer-events-auto rounded-compact bg-background/35 px-1.5 py-0.5 text-mobile-caption text-destructive/55 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/10 pc:text-[11px]"
                      >
                        {t("todayExecution.actionSkip")}
                      </button>
                    </>
                  ) : null
                }
              />
            );
          })}
        </div>
      </SoftPanel>
      <WorkoutActionConfirm
        open={Boolean(pendingPostponeWorkout)}
        onOpenChange={(open) => {
          if (!open) setPendingPostponeWorkout(null);
        }}
        title={t("todayExecution.postponeConfirmTitle")}
        description={t("todayExecution.postponeConfirmDescription")}
        cancelLabel={t("todayExecution.postponeConfirmCancel")}
        confirmLabel={t("todayExecution.postponeConfirmAction")}
        pending={Boolean(pendingWorkoutId)}
        onConfirm={async () => {
          if (!pendingPostponeWorkout) return;
          await postponeWorkout(pendingPostponeWorkout);
          setPendingPostponeWorkout(null);
        }}
      />
      <WorkoutActionConfirm
        open={Boolean(pendingSkipWorkout)}
        onOpenChange={(open) => {
          if (!open) setPendingSkipWorkout(null);
        }}
        title={tWorkoutDialog("confirmSkipTitle")}
        description={tWorkoutDialog("confirmSkipMessage")}
        cancelLabel={tWorkoutDialog("cancel")}
        confirmLabel={tWorkoutDialog("skip")}
        pending={Boolean(pendingWorkoutId)}
        destructive
        onConfirm={async () => {
          if (!pendingSkipWorkout) return;
          await skipWorkout(pendingSkipWorkout);
          setPendingSkipWorkout(null);
        }}
      />
      {selectedWorkout ? (
        <ViewWorkoutDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelectedWorkout(null);
          }}
          planId={selectedWorkout.planId}
          workoutId={selectedWorkout.id}
          weekIndex={Math.floor(Math.max(0, selectedWorkout.dayOffset) / 7)}
          dayIndex={Math.max(0, selectedWorkout.dayOffset) % 7}
          notes={selectedWorkout.rawNotes}
          text={selectedWorkout.rawText}
          sportType={selectedWorkout.rawSportType as SportType}
        />
      ) : null}
    </>
  );
}

/**
 * 最近活动面板
 * @param t 翻译函数
 * @param homeData 首页数据
 * @returns
 */
function RecentActivityPanel({
  t,
  homeData,
  timeFormat,
}: {
  t: TranslateFn;
  homeData: ReturnType<typeof buildHomeData>;
  timeFormat: TimeFormat;
}) {
  const tActivityTitle = useTranslations("ActivityTitle");
  const { data: recentFeed } = useQuery({
    queryKey: queryKeys.home.recentActivities(),
    queryFn: () =>
      getV2ActivitiesFeed({
        page: 1,
        perPage: 5,
        orderBy: "startTime",
        orderDirection: "desc",
      }),
    staleTime: 30_000,
  });

  const list: V2ActivityListItem[] = useMemo(() => {
    if (recentFeed?.items?.length) return recentFeed.items.slice(0, 5);
    if (!homeData.recentActivity.href) return [];
    return [
      {
        id: Number(homeData.recentActivity.id) || 0,
        hashId: homeData.recentActivity.href.split("/").pop() || "",
        title: homeData.recentActivity.title,
        sportType: homeData.recentActivity.sportType,
        subSportType: homeData.recentActivity.subSportType,
        startTime: null,
        duration: null,
        distance: null,
        load: null,
        status: "UNKNOWN",
        note: null,
        providers: [],
        primaryProvider: "manual",
        thirdPartyMappings: [],
        mapThumbnailDarkUrl: homeData.recentActivity.mapThumbnailDarkUrl,
        mapThumbnailUrl: homeData.recentActivity.mapThumbnailUrl,
      },
    ];
  }, [recentFeed?.items, homeData.recentActivity]);

  const statusLabel = (status: V2ActivityListItem["status"]) => {
    if (status === "PROCESSING") return t("dynamic.activityStatus.processing");
    if (status === "PARTIAL_FAILED")
      return t("dynamic.activityStatus.partialFailed");
    if (status === "FAILED") return t("dynamic.activityStatus.failed");
    return null;
  };

  return (
    <SoftPanel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t("recentActivity.titleSection")}
        </h2>
        <Link
          href="/activities"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted"
          aria-label={t("recentActivity.titleSection")}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((activity) => {
            const statusText = statusLabel(activity.status);
            return (
              <Link
                key={`${activity.id}-${activity.hashId}`}
                href={`/activities/${activity.hashId}`}
                className="group flex items-center gap-3 rounded-md bg-neutral-100 p-2.5 transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
              >
                <MapThumbnail
                  darkUrl={activity.mapThumbnailDarkUrl}
                  lightUrl={activity.mapThumbnailUrl}
                  sizes="96px"
                  className="h-20 w-24"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center border border-zinc-200/80 bg-zinc-100/80 text-muted-foreground dark:border-white/[0.06] dark:bg-zinc-800/70">
                      <Route className="h-5 w-5" aria-hidden="true" />
                    </div>
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {getLocalizedActivityTitle(
                      activity,
                      tActivityTitle,
                      t("recentActivity.untitled"),
                    )}
                  </div>
                  <div className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                    {activity.startTime
                      ? formatLocalMonthDayClock(activity.startTime, timeFormat)
                      : homeData.recentActivity.time}
                  </div>
                  <div className="mt-0.5 truncate text-mobile-caption pc:text-xs text-muted-foreground">
                    {typeof activity.distance === "number" &&
                    typeof activity.duration === "number"
                      ? `${(activity.distance / 1000).toFixed(1)} km · ${Math.round(activity.duration / 60)} min`
                      : homeData.recentActivity.summary}
                  </div>
                </div>
                {statusText ? (
                  <span className="shrink-0 rounded-md bg-background px-2 py-0.5 text-mobile-unit pc:text-[10px] text-muted-foreground dark:bg-black/20">
                    {statusText}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md bg-neutral-100 p-3 text-mobile-caption pc:text-xs text-muted-foreground dark:bg-muted/45">
          {homeData.recentActivity.summary}
        </div>
      )}
    </SoftPanel>
  );
}

/**
 * 上传训练桌面端
 * @param t 翻译函数
 * @returns
 */
function HomeUploadTrainingDesktop({ t }: { t: TranslateFn }) {
  const queryClient = useQueryClient();
  return (
    <SoftPanel>
      <SectionTitle title={t("upload.title")} t={t} />
      <ActivityUploadCard
        cardTitle={t("upload.cardTitle")}
        description={t("upload.description")}
        buttonLabel={t("upload.selectFile")}
        onUploaded={() => {
          void invalidateActivityDerivedCaches(queryClient);
        }}
      />
    </SoftPanel>
  );
}
/**
 * 两列布局的首页
 * @param homeData 首页数据
 * @param t 翻译函数
 * @returns
 */
function HomeTwoColumnSection({
  homeData,
  t,
  timeFormat,
  plannedWorkouts,
}: {
  homeData: ReturnType<typeof buildHomeData>;
  t: TranslateFn;
  timeFormat: TimeFormat;
  plannedWorkouts?: V2HomePlanWorkout[];
}) {
  const isMobileViewport = useMobileViewport();

  return (
    <div
      className={
        "flex flex-col gap-3 " +
        "md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start" +
        "md:grid-rows-[auto_auto_auto] " +
        "md:[grid-template-areas:'main_state'_'main_recent'_'main_upload']"
      }
    >
      <main className="contents md:flex md:min-h-0 md:min-w-0 md:flex-col md:gap-3 md:[grid-area:main] md:order-none">
        <div className="order-2 min-w-0 md:order-none">
          <DeferredMount
            fallback={
              <div className="h-64 animate-pulse rounded-md bg-muted/45" />
            }
          >
            <LoadComparisonChart
              homeData={homeData}
              plannedWorkouts={plannedWorkouts}
              t={t}
            />
          </DeferredMount>
        </div>
        <div className="order-1 min-w-0 md:order-none">
          <TodayExecutionPanel homeData={homeData} t={t} />
        </div>
        <div className="order-4 min-w-0 md:order-none">
          <SummaryPanel homeData={homeData} t={t} />
        </div>
        {isMobileViewport === false ? (
          <div className="hidden min-w-0 md:block md:order-none">
            <HomeMetricsOverviewSection />
          </div>
        ) : null}
      </main>
      <div className="order-3 min-w-0 md:[grid-area:state] md:order-none">
        <DeferredMount
          fallback={
            <div className="h-52 animate-pulse rounded-md bg-muted/45" />
          }
        >
          <CurrentStatePanel />
        </DeferredMount>
      </div>
      <div className="order-5 min-w-0 md:[grid-area:recent] md:order-none">
        <DeferredMount
          fallback={
            <div className="h-64 animate-pulse rounded-md bg-muted/45" />
          }
        >
          <RecentActivityPanel
            homeData={homeData}
            t={t}
            timeFormat={timeFormat}
          />
        </DeferredMount>
      </div>
      {isMobileViewport === false ? (
        <div className="order-7 hidden min-w-0 md:block md:[grid-area:upload] md:order-none">
          <HomeUploadTrainingDesktop t={t} />
        </div>
      ) : null}
    </div>
  );
}

function EmptyHomePage({
  t,
  homeData,
  timeFormat,
}: {
  t: TranslateFn;
  homeData: ReturnType<typeof buildHomeData>;
  timeFormat: TimeFormat;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 ">
      <header className="">
        <section className="relative">
          <HomeSuggestionCardStack
            suggestion={{
              title: homeData.aiTodaySuggestion.title,
              date: homeData.today.date,
              weekday: homeData.today.weekday,
              summary: homeData.aiTodaySuggestion.summary,
              tags: homeData.aiTodaySuggestion.tags,
              weatherAttribution: homeData.aiTodaySuggestion.weatherAttribution,
              details: homeData.aiTodaySuggestion.details,
            }}
            suggestionPreviewLeading={<MobilePmcStatusPreview />}
            suggestionLeadingActions={
              <>
                <PlanCreateLauncher
                  variant="default"
                  size="sm"
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus className="h-4 w-4" />
                  {t("empty.createPlan")}
                </PlanCreateLauncher>
              </>
            }
          />
        </section>
      </header>

      <HomeTwoColumnSection homeData={homeData} t={t} timeFormat={timeFormat} />
      {/* <VipPricingPlansSection /> */}
    </div>
  );
}

function V2HomeDialogs() {
  return (
    <>
      <TimezoneProfilePromptDialog />
    </>
  );
}

function buildSummaryMetrics(
  baseHomeData: ReturnType<typeof buildHomeData>,
  data: V2HomeResponse,
  t: TranslateFn,
) {
  const fitness = data.fitnessStatus;
  const profile = data.profile;
  const sportLabel = (sport?: HomeMetricSport | null) => {
    if (sport === "RUN") return t("dynamic.sport.run");
    if (sport === "CYCLING") return t("dynamic.sport.cycle");
    if (sport === "SWIM") return t("dynamic.sport.swim");
    return null;
  };
  const formatPaceFromSpeed = (speedMps?: number | null) => {
    if (
      typeof speedMps !== "number" ||
      !Number.isFinite(speedMps) ||
      speedMps <= 0
    ) {
      return null;
    }
    return `${formatSecondsToTime(1000 / speedMps)}/km`;
  };

  return baseHomeData.summaryMetrics.map((metric) => {
    if (metric.key === "pmc") {
      const value = fitness
        ? `${t("summaryMetrics.pmc.fitness")} ${Math.round(fitness.ctl)} · ${t("summaryMetrics.pmc.fatigue")} ${Math.round(fitness.atl)}`
        : "--";
      const hint = fitness
        ? `${t("summaryMetrics.pmc.form")} ${Math.round(fitness.tsb)}`
        : metric.hint;
      return {
        ...metric,
        value,
        hint,
        mobileValue: value,
        mobileHint: hint,
      };
    }

    if (metric.key === "power") {
      const powerValue = profile?.ftp ?? profile?.cp;
      const primaryPowerSport = profile?.ftp
        ? profile?.ftpSport
        : profile?.cpSport;
      const primaryPowerSportLabel = sportLabel(primaryPowerSport);
      const secondaryPowerValue =
        profile?.ftp && profile?.cp ? profile.cp : null;
      const secondaryPowerSportLabel = sportLabel(profile?.cpSport);
      return {
        ...metric,
        value: powerValue
          ? `${profile?.ftp ? "FTP" : "CP"} ${Math.round(powerValue)}W${
              primaryPowerSportLabel ? ` (${primaryPowerSportLabel})` : ""
            }`
          : "--",
        hint: secondaryPowerValue
          ? `CP ${Math.round(secondaryPowerValue)}W${
              secondaryPowerSportLabel ? ` (${secondaryPowerSportLabel})` : ""
            }`
          : powerValue
            ? "--"
            : metric.hint,
        mobileValue: profile?.ftp ? `FTP ${Math.round(profile.ftp)} W` : "--",
        mobileHint: profile?.cp
          ? `CP ${Math.round(profile.cp)} W`
          : metric.mobileHint,
      };
    }

    if (metric.key === "speed") {
      const speedValue = profile?.tp ?? profile?.cs;
      const primarySpeedSport = profile?.tp
        ? profile?.tpSport
        : profile?.csSport;
      const primarySpeedSportLabel = sportLabel(primarySpeedSport);
      const paceValue = formatPaceFromSpeed(speedValue);
      const secondarySpeedValue =
        profile?.tp && profile?.cs ? profile.cs : null;
      const secondarySpeedSportLabel = sportLabel(profile?.csSport);
      const secondaryPaceValue = formatPaceFromSpeed(secondarySpeedValue);
      return {
        ...metric,
        value:
          speedValue && paceValue
            ? `${profile?.tp ? "TP" : "CS"} ${paceValue}${
                primarySpeedSportLabel ? ` (${primarySpeedSportLabel})` : ""
              }`
            : "--",
        hint: secondaryPaceValue
          ? `CS ${secondaryPaceValue}${
              secondarySpeedSportLabel ? ` (${secondarySpeedSportLabel})` : ""
            }`
          : speedValue
            ? "--"
            : metric.hint,
        mobileValue:
          speedValue && paceValue
            ? `${profile?.tp ? "TP" : "CS"} ${paceValue}`
            : "--",
        mobileHint: metric.mobileHint,
      };
    }

    if (metric.key === "hr") {
      return {
        ...metric,
        value: profile?.restingHeartRate
          ? `${t("currentState.healthCard.restingHeartRate")} ${Math.round(
              profile.restingHeartRate,
            )} bpm`
          : "--",
        hint: profile?.maxHeartRate
          ? `${t("currentState.healthCard.maxHeartRate")} ${Math.round(
              profile.maxHeartRate,
            )} bpm`
          : metric.hint,
        mobileValue: profile?.lthr
          ? `LTHR ${Math.round(profile.lthr)} bpm`
          : "--",
        mobileHint: profile?.maxHeartRate
          ? `MHR ${Math.round(profile.maxHeartRate)} bpm`
          : metric.mobileHint,
      };
    }

    return metric;
  });
}

function buildRecentActivity(
  baseHomeData: ReturnType<typeof buildHomeData>,
  data: V2HomeResponse,
  t: TranslateFn,
  timeFormat: TimeFormat,
) {
  const recentActivity = data.recentActivity;
  if (!recentActivity) {
    return {
      ...baseHomeData.recentActivity,
    };
  }

  return {
    ...baseHomeData.recentActivity,
    id: String(recentActivity.id),
    title: recentActivity.title.trim() || t("recentActivity.untitled"),
    sportType: recentActivity.sportType,
    subSportType: recentActivity.subSportType ?? null,
    time: recentActivity.startTime
      ? formatLocalMonthDayClock(recentActivity.startTime, timeFormat)
      : baseHomeData.recentActivity.time,
    summary: `${((recentActivity.distance ?? 0) / 1000).toFixed(1)} km · ${Math.round(
      (recentActivity.duration ?? 0) / 60,
    )} min`,
    status:
      recentActivity.status === "PROCESSING"
        ? t("dynamic.activityStatus.processing")
        : recentActivity.status === "PARTIAL_FAILED"
          ? t("dynamic.activityStatus.partialFailed")
          : recentActivity.status === "FAILED"
            ? t("dynamic.activityStatus.failed")
            : "",
    href: `/activities/${recentActivity.hashId}`,
    mapThumbnailDarkUrl: recentActivity.mapThumbnailDarkUrl ?? null,
    mapThumbnailUrl: recentActivity.mapThumbnailUrl ?? null,
  };
}

type HomeData = ReturnType<typeof buildHomeData>;

function buildAiTodaySuggestionFromServer({
  baseHomeData,
  advice,
  fallbackTitle,
}: {
  baseHomeData: HomeData;
  advice: V2HomeTodayAdvice | AiTodaySuggestionResponse | null | undefined;
  fallbackTitle: string;
}) {
  const summary = advice?.summary?.trim();
  const tags = advice?.tags?.filter(Boolean) ?? [];

  return {
    ...baseHomeData.aiTodaySuggestion,
    title:
      advice?.source === "fallback"
        ? fallbackTitle
        : baseHomeData.aiTodaySuggestion.title,
    summary: summary || baseHomeData.aiTodaySuggestion.summary,
    tags: tags.slice(0, 5),
    weatherAttribution: advice?.weatherAttribution ?? null,
    details:
      advice && "version" in advice && advice.version === 2 ? advice : null,
  };
}

export default function V2HomePageClient({
  initialData,
}: {
  initialData: V2HomeResponse;
}) {
  const t = useTranslations("V2HomePage");
  const tAiConsent = useTranslations("AiDataConsent");
  const queryClient = useQueryClient();
  const locale = useLocale();
  const tSidebar = useTranslations("sidebar");
  const { dashboardFilters, timeFormat } = useStore();
  const deviceTimezone = useDeviceTimezone();
  const publicDemo = usePublicDemo();
  const aiConsent = useAiDataConsent({ enabled: !publicDemo.active });
  const hasAiDataConsent = aiConsent.data?.granted === true;
  const canUseAiSuggestion = publicDemo.active || hasAiDataConsent;
  useSetPageTitle(tSidebar("home"));
  useMobileNavigation({
    title: <ThemeLogo width={120} height={24} />,
  });
  const baseHomeData = useMemo(() => buildHomeData(t), [t]);
  const selectedSportType = dashboardFilters.selectedSportType;
  const { data: weeklySummaryPair } =
    useDashboardWeeklySummaryPair(selectedSportType);
  const shouldVerifyEmptyInitialData =
    !initialData.activePlan &&
    !initialData.recentActivity &&
    !initialData.fitnessStatus &&
    !initialData.profile;
  const { data: latestHomeData } = useQuery({
    queryKey: [...queryKeys.home.v2(), locale] as const,
    queryFn: () => getV2Home(locale),
    initialData,
    refetchOnMount: shouldVerifyEmptyInitialData ? "always" : true,
    refetchOnWindowFocus: true,
  });
  const sourceData = latestHomeData ?? initialData;
  const activePlan = sourceData.activePlan;
  const { data: todayAdvice, isPending: isTodayAdvicePending } = useQuery({
    queryKey: [
      "v2-home-today-advice",
      locale,
      deviceTimezone,
      publicDemo.active
        ? "public-demo"
        : (aiConsent.data?.decidedAt ?? "consented"),
    ] as const,
    queryFn: async () =>
      getAiTodaySuggestion(
        locale,
        deviceTimezone ?? undefined,
        hasAiDataConsent ? await readAuthorizedWeatherLocation() : null,
      ),
    enabled: deviceTimezone !== null && canUseAiSuggestion,
    meta: { errorSurface: "silent" },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const resolvedTodayAdvice = todayAdvice ?? sourceData.aiTodaySuggestion;
  const currentWeekLoad = Math.round(
    weeklySummaryPair?.weekPressure?.current ?? 0,
  );
  const previousWeekLoad = Math.round(
    weeklySummaryPair?.weekPressure?.previous ?? 0,
  );
  const homeData = useMemo(() => {
    if (!activePlan) {
      return {
        ...baseHomeData,
        aiTodaySuggestion: buildAiTodaySuggestionFromServer({
          baseHomeData,
          advice: resolvedTodayAdvice,
          fallbackTitle: t("aiTodaySuggestion.fallbackTitle"),
        }),
        loadComparison: {
          ...baseHomeData.loadComparison,
          currentWeekLoad,
          previousWeekLoad,
        },
        summaryMetrics: buildSummaryMetrics(baseHomeData, sourceData, t),
        recentActivity: buildRecentActivity(
          baseHomeData,
          sourceData,
          t,
          timeFormat,
        ),
      };
    }

    const currentWeekIndex = activePlan.currentWeekIndex ?? 1;
    const currentDayWorkouts = activePlan.todayWorkouts;
    const dateKey =
      currentDayWorkouts[0]?.scheduledDate ?? dayjs().format("YYYY-MM-DD");
    const currentWeekWorkouts = activePlan.currentWeekWorkouts;
    const plannedWorkouts =
      currentDayWorkouts.length > 0
        ? currentDayWorkouts.map((item) => ({
            id: item.id,
            planId: item.planId,
            title: item.title?.trim() || t("dynamic.plannedWorkoutFallback"),
            sport:
              item.sportType === "RUN"
                ? t("dynamic.sport.run")
                : item.sportType === "CYCLING"
                  ? t("dynamic.sport.cycle")
                  : item.sportType === "SWIM"
                    ? t("dynamic.sport.swim")
                    : t("dynamic.sport.other"),
            duration: formatWorkoutDuration(
              estimateWorkoutDurationSeconds(item.text),
            ),
            sessionCount: 1,
            description: item.description?.trim() || "",
            status:
              item.status === "DONE"
                ? t("dynamic.status.done")
                : item.status === "IN_PROGRESS"
                  ? t("dynamic.status.inProgress")
                  : item.status === "SKIPPED"
                    ? t("dynamic.status.skipped")
                    : item.status === "MOVED"
                      ? t("dynamic.status.moved")
                      : t("dynamic.status.planned"),
            linkedActivity: item.linkedActivityTitle,
            estimatedLoad: item.estimatedLoad,
            dayOffset: item.dayOffset,
            sessionIndex: item.sessionIndex,
            rawText: item.text,
            rawNotes: item.notes,
            rawName: item.name ?? null,
            rawStatus: item.status as
              | "PLANNED"
              | "IN_PROGRESS"
              | "DONE"
              | "SKIPPED"
              | "MOVED",
            rawSportType: item.sportType as
              | "RUN"
              | "CYCLING"
              | "SWIM"
              | "STRETCHING"
              | "UNKNOWN",
          }))
        : [];

    return {
      ...baseHomeData,
      currentPlan: {
        ...baseHomeData.currentPlan,
        cycle: activePlan.title,
        weekLabel: t("dynamic.weekLabel", {
          current: currentWeekIndex,
          total: activePlan.periodWeeks,
        }),
        todayFocus:
          currentDayWorkouts[0]?.title?.trim() ||
          currentDayWorkouts[0]?.notes?.trim() ||
          baseHomeData.currentPlan.todayFocus,
        weekTargetLoad: currentWeekWorkouts.filter(
          (workout) => workout.status !== "MOVED",
        ).length,
      },
      aiTodaySuggestion: buildAiTodaySuggestionFromServer({
        baseHomeData,
        advice: resolvedTodayAdvice,
        fallbackTitle: t("aiTodaySuggestion.fallbackTitle"),
      }),
      today: {
        ...baseHomeData.today,
        isoDate: dateKey,
        date: formatHomeMonthDay(locale, dateKey),
        weekday: formatHomeWeekday(locale, dateKey),
        plannedWorkouts,
      },
      loadComparison: {
        ...baseHomeData.loadComparison,
        currentWeekLoad,
        previousWeekLoad,
      },
      summaryMetrics: buildSummaryMetrics(baseHomeData, sourceData, t),
      recentActivity: buildRecentActivity(
        baseHomeData,
        sourceData,
        t,
        timeFormat,
      ),
    };
  }, [
    activePlan,
    baseHomeData,
    currentWeekLoad,
    locale,
    previousWeekLoad,
    resolvedTodayAdvice,
    sourceData,
    t,
    timeFormat,
  ]);
  const isTodayAdviceLoading =
    !publicDemo.active &&
    (!aiConsent.isFetchedAfterMount ||
      (hasAiDataConsent && isTodayAdvicePending));
  const displayedHomeData = useMemo(() => {
    if (isTodayAdviceLoading) {
      return {
        ...homeData,
        aiTodaySuggestion: {
          ...homeData.aiTodaySuggestion,
          summary: t("aiTodaySuggestion.loading"),
          tags: homeData.aiTodaySuggestion.tags.slice(0, 3),
        },
      };
    }
    if (!publicDemo.active && !hasAiDataConsent) {
      return {
        ...homeData,
        aiTodaySuggestion: {
          ...homeData.aiTodaySuggestion,
          title: tAiConsent("title"),
          summary: tAiConsent("summary"),
          tags: [tAiConsent("reviewAction")],
        },
      };
    }
    return homeData;
  }, [
    hasAiDataConsent,
    homeData,
    isTodayAdviceLoading,
    publicDemo.active,
    t,
    tAiConsent,
  ]);
  const hasActivePlan = Boolean(activePlan);
  const refreshHome = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.home.recentActivities(),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() }),
        queryClient.invalidateQueries({
          queryKey: ["v2-home-today-advice"],
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.ai.pendingDecisions(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.pmc.fitnessStatus(),
        }),
      ]),
    [queryClient],
  );

  if (!hasActivePlan) {
    return (
      <MobilePullToRefresh onRefresh={refreshHome}>
        <V2HomeDialogs />
        <div className="mx-auto w-full max-w-6xl px-1 pb-2">
          <AiDataConsentReminder />
        </div>
        <EmptyHomePage
          t={t}
          homeData={displayedHomeData}
          timeFormat={timeFormat}
        />
      </MobilePullToRefresh>
    );
  }

  return (
    <MobilePullToRefresh onRefresh={refreshHome}>
      <V2HomeDialogs />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 pc:gap-3">
        <AiDataConsentReminder />
        <header className="px-1 py-1">
          <div className="grid gap-2 pc:grid-cols-[3fr_2fr] pc:gap-2">
            <section className="relative">
              <HomeSuggestionCardStack
                suggestion={{
                  title: displayedHomeData.aiTodaySuggestion.title,
                  date: displayedHomeData.today.date,
                  weekday: displayedHomeData.today.weekday,
                  summary: displayedHomeData.aiTodaySuggestion.summary,
                  tags: displayedHomeData.aiTodaySuggestion.tags,
                  weatherAttribution:
                    displayedHomeData.aiTodaySuggestion.weatherAttribution,
                  details: displayedHomeData.aiTodaySuggestion.details,
                }}
                suggestionPreviewLeading={<MobilePmcStatusPreview />}
              />
            </section>

            <div className="hidden min-w-0 space-y-3 pc:block">
              <div className="flex items-center gap-2 text-mobile-caption text-muted-foreground pc:min-h-8 pc:text-xs">
                <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{homeData.currentPlan.title}</span>
              </div>

              <Link
                href="/plan"
                className="group flex min-h-[150px] min-w-0 flex-col rounded-surface bg-neutral-100 p-3 text-foreground transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/45 dark:hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <h1 className="min-w-0 truncate text-base font-semibold leading-6 tracking-normal">
                    {displayedHomeData.currentPlan.cycle}
                  </h1>
                  <div className="inline-flex shrink-0 rounded-md bg-white/92 px-2 py-1 text-mobile-caption text-muted-foreground dark:bg-black/30 pc:text-[11px]">
                    {t("header.weekTarget")}
                    <span className="ml-1 font-semibold text-foreground">
                      {displayedHomeData.currentPlan.weekTargetLoad}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex min-w-0 items-start gap-2.5">
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-white/88 px-2 py-1 text-mobile-caption text-muted-foreground dark:bg-black/28 pc:text-[11px]">
                    {displayedHomeData.currentPlan.weekLabel}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-mobile-caption text-muted-foreground pc:text-[11px]">
                      {t("currentPlan.todayFocus")}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium leading-5">
                      {displayedHomeData.currentPlan.todayFocus}
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-foreground/8 pt-2.5 text-mobile-caption font-medium text-muted-foreground transition-colors group-hover:text-foreground pc:text-xs dark:border-white/8">
                  <span>{t("header.viewCurrentPlan")}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </div>
          </div>
          {/* <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <PlanCreateLauncher className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90">
              <Plus className="h-4 w-4" />
              {t("empty.createPlan")}
            </PlanCreateLauncher>
          </div> */}
        </header>

        <HomeTwoColumnSection
          homeData={displayedHomeData}
          t={t}
          timeFormat={timeFormat}
          plannedWorkouts={sourceData.activePlan?.currentWeekWorkouts}
        />
        {/* <VipPricingPlansSection /> */}
      </div>
    </MobilePullToRefresh>
  );
}
