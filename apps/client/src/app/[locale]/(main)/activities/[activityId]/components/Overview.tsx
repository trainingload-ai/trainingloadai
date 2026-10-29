"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useStore } from "@/lib/store";
import { useActivityId } from "@/hooks/useActivityId";
import { useGetActivity } from "@/hooks/useActivities";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { ActivityMetricGrid } from "./activity-metric-grid";

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

  if (!activity) return null;

  const isCycling = activity.sportType === "CYCLING";
  const paceOrSpeedMetric = isCycling ? "speed" : "pace";
  const metrics: SummaryMetric[] = [
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
      label: isCycling ? t("activityDetails.avgSpeed") : tOverview("avgPace"),
      value: valueOrDash(activity.averageSpeed, paceOrSpeedMetric, systemUnit),
      unit: getUnit(paceOrSpeedMetric, systemUnit),
    },
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
