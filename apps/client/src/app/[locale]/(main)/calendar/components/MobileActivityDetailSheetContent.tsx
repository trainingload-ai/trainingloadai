"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, ExternalLink, Loader2, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Activity } from "@/api/activities";
import { updateActivitySessionRpe } from "@/api/activity";
import { getActivityPlanLink } from "@/api/activity-plan-link";
import { useActivityMetricAvailability } from "@/api/useActivityMetric";
import { ActivityDataChart } from "@/app/[locale]/(main)/activities/[activityId]/components/ActivityDataChart";
import { Button } from "@/components/ui/button";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useGetActivity } from "@/hooks/useActivities";
import { Link } from "@/i18n/navigation";
import { getActivityDataChartsForSport } from "@/lib/activity-data-charts";
import { getActivityDetailPolicy } from "@/lib/activity-detail-policy";
import { invalidateActivityDerivedCaches } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { useStore } from "@/lib/store";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { MobileActivityMapHero } from "./MobileActivityMapHero";

const SPLIT_PAGE_SIZE = 20;
const RPE_STARS = [2, 4, 6, 8, 10] as const;
function StatCell({
  label,
  unit,
  value,
  index,
}: {
  label: string;
  unit?: string;
  value: string;
  index: number;
}) {
  return (
    <div
      className={`flex h-[68px] min-w-0 flex-col items-center justify-center px-1 text-center ${
        index % 3 !== 2 ? "border-r border-border/70" : ""
      } ${index < 6 ? "border-b border-border/70" : ""}`}
    >
      <div className="w-full truncate text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        {unit ? (
          <span className="text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function valueOrDash(
  value: number | null | undefined,
  metric: string,
  unitSystem: "metric" | "imperial",
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatValue(value, metric, unitSystem);
}

function percentOf(actual?: number | null, planned?: number | null) {
  if (
    typeof actual !== "number" ||
    !Number.isFinite(actual) ||
    typeof planned !== "number" ||
    !Number.isFinite(planned) ||
    planned <= 0
  ) {
    return null;
  }
  return Math.max(0, Math.round((actual / planned) * 100));
}

function MobileActivityWorkoutSummary({
  activity,
  activityId,
}: {
  activity: Activity;
  activityId: string;
}) {
  const t = useTranslations();
  const tCalendar = useTranslations("CalendarExperience");
  const tTimeline = useTranslations("MobileCalendarTimeline");
  const { systemUnit } = useStore();
  const link = useQuery({
    queryKey: queryKeys.activity.planLink(activityId),
    queryFn: () => getActivityPlanLink(activityId),
    enabled: Boolean(activityId),
  });
  const detailedWorkout = link.data?.linkedPlanWorkout ?? null;
  const workout = detailedWorkout ?? activity.linkedPlanWorkout;

  if (link.isLoading && !workout) {
    return (
      <section className="flex items-center justify-center rounded-surface bg-background py-6">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </section>
    );
  }
  if (!workout) return null;

  const actualDuration =
    activity.movingTime ?? activity.elapsedTime ?? activity.duration;
  const plannedDuration = detailedWorkout?.expectedDurationSec ?? null;
  const actualLoad =
    typeof detailedWorkout?.actualLoad === "number"
      ? detailedWorkout.actualLoad
      : activity.load;
  const plannedLoad = detailedWorkout?.plannedLoad ?? null;
  const durationPercent = percentOf(actualDuration, plannedDuration);
  const loadPercent = percentOf(actualLoad, plannedLoad);
  const completionPercent = durationPercent ?? loadPercent;
  const completed =
    detailedWorkout?.status === "DONE" || Boolean(detailedWorkout?.completedAt);
  const planTitle = detailedWorkout?.planTitle ?? null;
  const notes = detailedWorkout?.notes ?? null;

  return (
    <section className="space-y-4 rounded-surface bg-background p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-[rgba(0,150,137,0.1)] text-[#009689] dark:bg-[rgba(0,188,125,0.1)] dark:text-[#00bc7d]">
          <CalendarCheck2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold">
              {workout.name || tCalendar("plannedTraining")}
            </h3>
            <span className="shrink-0 rounded-full bg-[rgba(220,252,231,0.9)] px-2.5 py-1 text-mobile-caption pc:text-[11px] font-semibold text-[#15803d] dark:bg-[rgba(5,46,22,0.4)] dark:text-[#86efac]">
              {completed ? tTimeline("completed") : tTimeline("planned")}
            </span>
          </div>
          <p className="mt-1 truncate text-mobile-caption pc:text-xs text-muted-foreground">
            {[planTitle, workout.sportType].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {completionPercent !== null ? (
        <div>
          <div className="mb-2 flex items-center justify-between text-mobile-caption pc:text-xs">
            <span className="font-medium text-muted-foreground">
              {tTimeline("completed")}
            </span>
            <span className="font-semibold tabular-nums">
              {completionPercent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#009689] dark:bg-[#00bc7d]"
              style={{ width: `${Math.min(completionPercent, 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/55 px-3 py-3">
          <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
            {t("activities.duration")}
          </div>
          <div className="mt-1 text-base font-semibold tabular-nums">
            {durationPercent === null ? "—" : `${durationPercent}%`}
          </div>
        </div>
        <div className="rounded-lg bg-muted/55 px-3 py-3">
          <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
            {tCalendar("loadLabel")}
          </div>
          <div className="mt-1 text-base font-semibold tabular-nums">
            {loadPercent === null ? "—" : `${loadPercent}%`}
          </div>
        </div>
        <div className="rounded-lg bg-muted/55 px-3 py-3">
          <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
            {t("V2DayPage.overview.plannedDuration")}
          </div>
          <div className="mt-1 text-base font-semibold tabular-nums">
            {plannedDuration
              ? valueOrDash(plannedDuration, "duration", systemUnit)
              : "—"}
          </div>
        </div>
      </div>

      {notes?.trim() ? (
        <p className="text-sm leading-5 text-foreground/75">{notes.trim()}</p>
      ) : null}
    </section>
  );
}

function MobileActivityRpeSection({ activity }: { activity: Activity }) {
  const t = useTranslations("ActivityDetail.sessionRpe");
  const queryClient = useQueryClient();
  const activityId = activity.hashId ?? "";
  const currentRpe =
    typeof activity.sessionRpe === "number" ? activity.sessionRpe : null;
  const selectedStars = currentRpe === null ? 0 : Math.ceil(currentRpe / 2);
  const mutation = useMutation({
    mutationFn: (sessionRpe: number | null) =>
      updateActivitySessionRpe(activityId, sessionRpe),
    onSuccess: (result) => {
      toast.success(result?.sessionRpe == null ? t("cleared") : t("saved"));
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.activity.detail(activityId),
        }),
        invalidateActivityDerivedCaches(queryClient),
      ]);
    },
    onError: (error: Error) => {
      toast.error(error.message?.trim() || t("failed"));
    },
  });

  if (!activityId) return null;

  return (
    <section className="space-y-3">
      <div className="px-1 text-[13px] font-medium text-muted-foreground">
        {t("label")}
      </div>
      <div className="space-y-4 rounded-surface bg-background px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">
              {currentRpe === null ? t("notSet") : `${currentRpe}/10`}
            </div>
            <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
              {t("hint")}
            </p>
          </div>
          {mutation.isPending ? (
            <Loader2
              className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="grid grid-cols-5 gap-1">
          {RPE_STARS.map((value, index) => {
            const selected = selectedStars > index;
            return (
              <button
                key={value}
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(value)}
                aria-label={`${t("label")} ${value}`}
                className="grid min-h-12 place-items-center rounded-lg transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className="size-7"
                  fill={selected ? "#f59e0b" : "transparent"}
                  color={selected ? "#f59e0b" : "#d4d4d8"}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {currentRpe !== null ? (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(null)}
            className="min-h-10 w-full rounded-lg bg-muted px-4 text-sm font-semibold text-foreground/75 transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {t("clear")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActivitySplits({ activity }: { activity: Activity }) {
  const t = useTranslations();
  const tDetail = useTranslations("ActivityDetail");
  const tOverview = useTranslations("Overview.stats");
  const { systemUnit } = useStore();
  const [visibleCount, setVisibleCount] = React.useState(SPLIT_PAGE_SIZE);
  const meaningfulLaps = React.useMemo(
    () =>
      (activity.laps ?? []).filter((lap) =>
        [lap.distance, lap.timerTime, lap.elapsedTime, lap.avgSpeed].some(
          (value) => typeof value === "number" && value > 0,
        ),
      ),
    [activity.laps],
  );
  const laps = meaningfulLaps.slice(0, visibleCount);
  const hiddenCount = meaningfulLaps.length - laps.length;
  if (!meaningfulLaps.length) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-mobile-caption pc:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tDetail("tabs.lap")}
      </h3>
      <div className="overflow-hidden rounded-surface bg-muted/55 px-3">
        <div className="grid grid-cols-[40px_minmax(0,1fr)_72px_64px] items-center gap-2 border-b border-border/70 px-1 py-2 text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
          <span>#</span>
          <span>{t("activities.distance")}</span>
          <span className="text-right">{tOverview("avgPace")}</span>
          <span className="text-right">{t("activities.duration")}</span>
        </div>
        {laps.map((lap, index) => (
          <div
            key={lap.id ?? index}
            className="grid grid-cols-[40px_minmax(0,1fr)_72px_64px] items-center gap-2 border-b border-border/60 px-1 py-3 text-sm last:border-b-0"
          >
            <span className="font-medium text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 truncate font-semibold tabular-nums">
              {valueOrDash(lap.distance, "distance", systemUnit)}{" "}
              {getUnit("distance", systemUnit)}
            </span>
            <span className="text-right tabular-nums text-foreground/80">
              {lap.avgSpeed
                ? formatValue(lap.avgSpeed, "pace", systemUnit)
                : "—"}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {valueOrDash(
                lap.timerTime ?? lap.elapsedTime,
                "duration",
                systemUnit,
              )}
            </span>
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleCount(meaningfulLaps.length)}
          className="min-h-10 w-full text-sm font-medium text-[#009689] dark:text-[#00bc7d]"
        >
          {t("Activities.filters.all")} ({meaningfulLaps.length})
        </button>
      ) : null}
    </section>
  );
}

export function MobileActivityDetailSheetContent({
  previewActivity,
}: {
  previewActivity: Activity;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const tCalendar = useTranslations("CalendarExperience");
  const tTimeline = useTranslations("MobileCalendarTimeline");
  const tDetail = useTranslations("ActivityDetail");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tOverview = useTranslations("Overview.stats");
  const { systemUnit } = useStore();
  const activityId = previewActivity.hashId ?? String(previewActivity.id ?? "");
  const detailQuery = useGetActivity(activityId);
  const activity = detailQuery.data ?? previewActivity;
  const title = getLocalizedActivityTitle(
    activity,
    tActivityTitle,
    tDetail("untitledActivity"),
  );
  const startLabel = activity.startTime
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(activity.startTime))
    : null;
  const sportType = String(activity.sportType ?? "").toUpperCase();
  const primaryStats =
    sportType === "CYCLING"
      ? [
          {
            label: t("activities.distance"),
            value: valueOrDash(activity.distance, "distance", systemUnit),
            unit: getUnit("distance", systemUnit),
          },
          {
            label: t("activities.duration"),
            value: valueOrDash(
              activity.movingTime ?? activity.elapsedTime ?? activity.duration,
              "duration",
              systemUnit,
            ),
          },
          {
            label: t("activityDetails.avgSpeed"),
            value: valueOrDash(activity.averageSpeed, "speed", systemUnit),
            unit: getUnit("speed", systemUnit),
          },
        ]
      : sportType === "SWIM"
        ? [
            {
              label: t("activities.distance"),
              value: valueOrDash(activity.distance, "distance", systemUnit),
              unit: getUnit("distance", systemUnit),
            },
            {
              label: t("activities.duration"),
              value: valueOrDash(
                activity.movingTime ??
                  activity.elapsedTime ??
                  activity.duration,
                "duration",
                systemUnit,
              ),
            },
            {
              label: tOverview("avgHeartRate"),
              value: valueOrDash(
                activity.avgHeartRate,
                "heartRate",
                systemUnit,
              ),
              unit: getUnit("heartRate", systemUnit),
            },
          ]
        : [
            {
              label: t("activities.distance"),
              value: valueOrDash(activity.distance, "distance", systemUnit),
              unit: getUnit("distance", systemUnit),
            },
            {
              label: t("activities.duration"),
              value: valueOrDash(
                activity.movingTime ??
                  activity.elapsedTime ??
                  activity.duration,
                "duration",
                systemUnit,
              ),
            },
            {
              label: tOverview("avgPace"),
              value: valueOrDash(activity.averageSpeed, "pace", systemUnit),
              unit: getUnit("pace", systemUnit),
            },
          ];
  const stats = [
    ...primaryStats,
    {
      label: tOverview("avgHeartRate"),
      value: valueOrDash(activity.avgHeartRate, "heartRate", systemUnit),
      unit: getUnit("heartRate", systemUnit),
    },
    {
      label: t("HeartRatePage.tooltip.maxHeartRate"),
      value: valueOrDash(activity.maxHeartRate, "heartRate", systemUnit),
      unit: getUnit("heartRate", systemUnit),
    },
    {
      label: tOverview("avgPower"),
      value: valueOrDash(
        activity.avgPower ?? activity.averageWatts,
        "power",
        systemUnit,
      ),
      unit: getUnit("power", systemUnit),
    },
    {
      label: t("ActivityPowerPage.basicStats.maxPower"),
      value: valueOrDash(
        activity.maxPower ?? activity.maxWatts,
        "power",
        systemUnit,
      ),
      unit: getUnit("power", systemUnit),
    },
    {
      label: t("ActivitySharePoster.metrics.elevationGain"),
      value: valueOrDash(
        activity.elevationGain ?? activity.ascent,
        "elevation",
        systemUnit,
      ),
      unit: getUnit("elevation", systemUnit),
    },
    {
      label: tCalendar("loadLabel"),
      value: valueOrDash(activity.load, "count", systemUnit),
      unit: "TSS",
    },
  ];
  const dataChartIds = getActivityDetailPolicy(activity).dataChartIds;
  const chartCandidates = React.useMemo(
    () =>
      getActivityDataChartsForSport(activity.sportType).filter((chart) =>
        dataChartIds.has(chart.id),
      ),
    [activity.sportType, dataChartIds],
  );
  const { availableMetrics, isLoading: chartsLoading } =
    useActivityMetricAvailability(
      activityId,
      chartCandidates.map((chart) => chart.metric),
    );
  const visibleCharts = chartCandidates.filter((chart) =>
    availableMetrics.has(chart.metric),
  );
  const heroMeta = [activity.sportType, startLabel].filter(Boolean).join(" · ");

  return (
    <div className="min-h-full bg-muted/20 pb-safe-or-8">
      <MobileActivityMapHero
        activity={activity}
        activityId={activityId}
        meta={heroMeta}
        title={title}
      />

      <div className="relative z-10 -mt-2 overflow-hidden rounded-t-overlay border-b border-border/70 bg-background">
        <div className="grid grid-cols-3">
          {stats.map((stat, index) => (
            <StatCell key={`${stat.label}-${index}`} index={index} {...stat} />
          ))}
        </div>
      </div>

      <div className="space-y-4 px-3 pt-3">
        <MobileActivityWorkoutSummary
          activity={activity}
          activityId={activityId}
        />

        {activityId && (chartsLoading || visibleCharts.length > 0) ? (
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-base font-semibold text-foreground">
                {tDetail("dataCharts")}
              </h2>
              <p className="mt-0.5 text-mobile-caption leading-5 text-muted-foreground">
                {tDetail("dataChartsHint")}
              </p>
            </div>
            {chartsLoading ? (
              <div
                role="status"
                aria-label={tDetail("loading")}
                className="h-[280px] animate-pulse rounded-surface bg-background motion-reduce:animate-none"
              />
            ) : (
              <div className="space-y-3">
                {visibleCharts.map((chart) => (
                  <ActivityDataChart
                    key={chart.id}
                    activityId={activityId}
                    chartId={chart.id}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        <ActivitySplits activity={activity} />

        {activity.thirdPartyProvider || activity.description ? (
          <section className="space-y-2 border-t border-border/70 pt-5">
            {activity.thirdPartyProvider ? (
              <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                {activity.thirdPartyProvider}
                {activity.timezone ? ` · ${activity.timezone}` : ""}
              </div>
            ) : null}
            {activity.description ? (
              <p className="text-sm leading-6 text-foreground/80">
                {activity.description}
              </p>
            ) : null}
          </section>
        ) : null}

        <MobileActivityRpeSection activity={activity} />
      </div>
    </div>
  );
}
