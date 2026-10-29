"use client";

import React from "react";
import { useActivityId } from "@/hooks/useActivityId";
import { useActivityMetricSeries } from "@/api/useActivityMetric";
import { PowerZoneValue } from "@/api/use-power";
import PowerPointChart from "./power-point-chart";
import { useStore } from "@/lib/store";
import ChartContainer from "@/components/ChartContainer";

interface PowerChartProps {
  zones: PowerZoneValue[];
}

/**
 * 功率图表组件
 */
const PowerPointChartWrapper: React.FC<PowerChartProps> = ({ zones }) => {
  // const t = useTranslations("ActivityPowerPage");
  const activityId = useActivityId();
  const { chartXaxis } = useStore();
  const { data, isLoading } = useActivityMetricSeries(
    activityId || "",
    "power",
    true, // enabled
  );
  return (
    <ChartContainer isLoading={isLoading}>
      <PowerPointChart zones={zones} data={data} xAxisType={chartXaxis} />
    </ChartContainer>
  );
};

export default PowerPointChartWrapper;
