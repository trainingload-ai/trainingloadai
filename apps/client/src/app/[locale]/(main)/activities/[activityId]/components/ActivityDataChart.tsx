"use client";

import type { ActivityDataChartId } from "@/lib/activity-data-charts";
import OverviewCadenceChart from "./charts/cadence-chart";
import { OverviewElevationChart } from "./charts/elevation-chart";
import OverviewHeartRateChart from "./charts/heart-rate-chart";
import OverviewPaceChart from "./charts/pace-chart";
import OverviewPowerChart from "./charts/power-chart";
import OverviewStanceTimeChart from "./charts/stance-time-chart";
import OverviewStrideChart from "./charts/stride-chart";

export function ActivityDataChart({
  activityId,
  chartId,
}: {
  activityId: string;
  chartId: ActivityDataChartId;
}) {
  switch (chartId) {
    case "elevation":
      return <OverviewElevationChart activityId={activityId} />;
    case "pace":
      return <OverviewPaceChart activityId={activityId} />;
    case "cadence":
      return <OverviewCadenceChart activityId={activityId} />;
    case "stride":
      return <OverviewStrideChart activityId={activityId} />;
    case "heartRate":
      return <OverviewHeartRateChart activityId={activityId} />;
    case "power":
      return <OverviewPowerChart activityId={activityId} />;
    case "stanceTime":
      return <OverviewStanceTimeChart activityId={activityId} />;
  }
}
