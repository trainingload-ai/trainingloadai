"use client";

import { useTranslations } from "next-intl";

import type { MetricId } from "@/api/useActivityMetric";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import CardLoader from "@/components/ui/CardLoader";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityDataChart } from "../ActivityDataChart";
import { ActivityMetricGrid } from "../activity-metric-grid";
import PowerStat from "../power/components/power-stat";
import RunningDynamicsMetricChart from "./RunningDynamicsMetricChart";

interface RunningDynamicsPageProps {
  activityId: string;
  availableMetrics: ReadonlySet<MetricId>;
}

function positiveMetadata(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const formatMetric = (
  value: number | null,
  digits = 0,
  transform: (value: number) => number = (raw) => raw,
) => (value === null ? "--" : transform(value).toFixed(digits));

/** 跑步动态使用一级页签：八项摘要与可用曲线按其他专项分析页的同一结构展示。 */
export default function RunningDynamicsPage({
  activityId,
  availableMetrics,
}: RunningDynamicsPageProps) {
  const t = useTranslations("RunningDynamicsPage");
  const cadence = useActivityMetricSeries(
    activityId,
    "cadence",
    availableMetrics.has("cadence"),
  );
  const stepLength = useActivityMetricSeries(
    activityId,
    "stepLength",
    availableMetrics.has("stepLength"),
  );
  const verticalOscillation = useActivityMetricSeries(
    activityId,
    "verticalOscillation",
    availableMetrics.has("verticalOscillation"),
  );
  const verticalRatio = useActivityMetricSeries(
    activityId,
    "verticalRatio",
    availableMetrics.has("verticalRatio"),
  );
  const stanceTime = useActivityMetricSeries(
    activityId,
    "stanceTime",
    availableMetrics.has("stanceTime"),
  );
  const flightTime = useActivityMetricSeries(
    activityId,
    "flightTime",
    availableMetrics.has("flightTime"),
  );
  const flightRatio = useActivityMetricSeries(
    activityId,
    "flightRatio",
    availableMetrics.has("flightRatio"),
  );
  const totalSteps = useActivityMetricSeries(
    activityId,
    "totalSteps",
    availableMetrics.has("totalSteps"),
  );

  const queries = [
    cadence,
    stepLength,
    verticalOscillation,
    verticalRatio,
    stanceTime,
    flightTime,
    flightRatio,
    totalSteps,
  ];
  const isLoading = queries.some((query) => query.isLoading);

  const stats = [
    {
      id: "cadence",
      title: t("metrics.cadence"),
      value: formatMetric(
        positiveMetadata(cadence.data?.metadata.avg),
        0,
        (v) => v * 2,
      ),
      unit: "spm",
    },
    {
      id: "stepLength",
      title: t("metrics.stepLength"),
      value: formatMetric(
        positiveMetadata(stepLength.data?.metadata.avg),
        2,
        (v) => v / 1000,
      ),
      unit: "m",
    },
    {
      id: "verticalOscillation",
      title: t("metrics.verticalOscillation"),
      value: formatMetric(
        positiveMetadata(verticalOscillation.data?.metadata.avg),
        1,
        (v) => v / 10,
      ),
      unit: "cm",
    },
    {
      id: "verticalRatio",
      title: t("metrics.verticalRatio"),
      value: formatMetric(
        positiveMetadata(verticalRatio.data?.metadata.avg),
        1,
      ),
      unit: "%",
    },
    {
      id: "stanceTime",
      title: t("metrics.stanceTime"),
      value: formatMetric(positiveMetadata(stanceTime.data?.metadata.avg)),
      unit: "ms",
    },
    {
      id: "flightTime",
      title: t("metrics.flightTime"),
      value: formatMetric(positiveMetadata(flightTime.data?.metadata.avg)),
      unit: "ms",
    },
    {
      id: "flightRatio",
      title: t("metrics.flightRatio"),
      value: formatMetric(positiveMetadata(flightRatio.data?.metadata.avg), 1),
      unit: "%",
    },
    {
      id: "totalSteps",
      title: t("metrics.totalSteps"),
      value: formatMetric(positiveMetadata(totalSteps.data?.metadata.sum)),
      unit: t("units.steps"),
    },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="w-full p-0 lg:p-0">
          {isLoading && <CardLoader />}
          <ActivityMetricGrid desktopColumns={4}>
            {stats.map((stat) => (
              <PowerStat key={stat.id} {...stat} />
            ))}
          </ActivityMetricGrid>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3">
        {availableMetrics.has("cadence") && (
          <ActivityDataChart activityId={activityId} chartId="cadence" />
        )}
        {availableMetrics.has("stepLength") && (
          <ActivityDataChart activityId={activityId} chartId="stride" />
        )}
        {availableMetrics.has("verticalOscillation") && (
          <RunningDynamicsMetricChart
            activityId={activityId}
            metric="verticalOscillation"
            unit="cm"
            divisor={10}
            digits={1}
          />
        )}
        {availableMetrics.has("verticalRatio") && (
          <RunningDynamicsMetricChart
            activityId={activityId}
            metric="verticalRatio"
            unit="%"
            digits={1}
          />
        )}
        {availableMetrics.has("stanceTime") && (
          <ActivityDataChart activityId={activityId} chartId="stanceTime" />
        )}
        {availableMetrics.has("flightTime") && (
          <RunningDynamicsMetricChart
            activityId={activityId}
            metric="flightTime"
            unit="ms"
          />
        )}
      </div>
    </div>
  );
}
