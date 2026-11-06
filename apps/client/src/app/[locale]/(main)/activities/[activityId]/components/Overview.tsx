"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useStore } from "@/lib/store";
import { useActivityId } from "@/hooks/useActivityId";
import { useGetActivity } from "@/hooks/useActivities";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { getActivityDetailPolicy } from "@/lib/activity-detail-policy";
import { ActivityMetricGrid } from "./activity-metric-grid";
import { useSportCatalog } from "@/api/sports";
import { getOtherActivitySummaryCapabilities } from "@/lib/activity-presentation";

type SummaryMetric = {
  label: string;
  value: string;
  unit?: string;
};

function valueOrDash(
  value: number | null | undefined,
  metric: string,
  unitSystem: "metric" | "imperial",
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatValue(value, metric, unitSystem);
}

function SummaryMetricCell({ label, unit, value }: SummaryMetric) {
  return (
    <div
      data-testid="activity-summary-metric"
      className="flex min-h-[76px] min-w-0 flex-col justify-center bg-transparent px-4 py-3"
    >
      <div className="truncate text-mobile-caption font-medium text-muted-foreground pc:text-xs">
        {label}
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-1 tabular-nums">
        <span className="truncate text-xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {unit ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** 与 Mobile 活动详情保持同一组固定摘要指标，不参与图表切换。 */
const Overview = React.memo(function Overview() {
  const t = useTranslations();
  const tOverview = useTranslations("Overview.stats");
  const activityId = useActivityId();
  const { data: activity } = useGetActivity(activityId || "");
  const { systemUnit } = useStore();
  const { data: sportCatalog = [] } = useSportCatalog();

  if (!activity) return null;

  const isOther = getActivityDetailPolicy(activity).group === "OTHER";
  const otherCapabilities = getOtherActivitySummaryCapabilities(
    sportCatalog,
    activity,
  );
  const isCycling = activity.sportType === "CYCLING";
  const paceOrSpeedMetric = isCycling ? "speed" : "pace";
  const durationMetric: SummaryMetric = {
    label: t("activities.duration"),
    value: valueOrDash(
      activity.movingTime ?? activity.elapsedTime ?? activity.duration,
      "duration",
      systemUnit,
    ),
  };
  const heartRateMetrics: SummaryMetric[] = [
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
  ];
  const metrics: SummaryMetric[] = isOther
    ? [
        durationMetric,
        ...(otherCapabilities.showDistance
          ? [
              {
                label: t("activities.distance"),
                value: valueOrDash(activity.distance, "distance", systemUnit),
                unit: getUnit("distance", systemUnit),
              },
            ]
          : []),
        ...(otherCapabilities.showSpeed
          ? [
              {
                label: t("activityDetails.avgSpeed"),
                value: valueOrDash(activity.averageSpeed, "speed", systemUnit),
                unit: getUnit("speed", systemUnit),
              },
            ]
          : []),
        ...heartRateMetrics,
        {
          label: t("HeartRatePage.tooltip.minHeartRate"),
          value: valueOrDash(activity.minHeartRate, "heartRate", systemUnit),
          unit: getUnit("heartRate", systemUnit),
        },
        {
          label: t("dashboard.calories"),
          value: valueOrDash(activity.calories, "count", systemUnit),
          unit: "kcal",
        },
        {
          label: t("V2ActivitiesPage.common.load"),
          value: valueOrDash(activity.load, "count", systemUnit),
        },
      ]
    : [
        {
          label: t("activities.distance"),
          value: valueOrDash(activity.distance, "distance", systemUnit),
          unit: getUnit("distance", systemUnit),
        },
        durationMetric,
        {
          label: isCycling
            ? t("activityDetails.avgSpeed")
            : tOverview("avgPace"),
          value: valueOrDash(
            activity.averageSpeed,
            paceOrSpeedMetric,
            systemUnit,
          ),
          unit: getUnit(paceOrSpeedMetric, systemUnit),
        },
        ...heartRateMetrics,
        {
          label: tOverview("avgPower"),
          value: valueOrDash(
            activity.avgPower ?? activity.averageWatts,
            "power",
            systemUnit,
          ),
          unit: getUnit("power", systemUnit),
        },
      ];

  return (
    <section>
      <ActivityMetricGrid desktopColumns={6} variant="cards">
        {metrics.map((metric) => (
          <SummaryMetricCell key={metric.label} {...metric} />
        ))}
      </ActivityMetricGrid>
    </section>
  );
});

Overview.displayName = "Overview";

export default Overview;
