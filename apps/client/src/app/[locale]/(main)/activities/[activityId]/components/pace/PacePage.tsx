"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { useActivityId } from "@/hooks/useActivityId";
import CardLoader from "@/components/ui/CardLoader";
import { usePaceBase } from "@/api/use-pace-analysis";
import { useResolvedPaceZones } from "@/api/use-pace";
import PaceStat from "./components/PaceStat";
import { PaceZonesChart } from "./components/PaceZonesChart";
import OverviewPaceChart from "../charts/pace-chart";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { useStore } from "@/lib/store";
import { round } from "lodash";
import { ActivityMetricGrid } from "../activity-metric-grid";

const PacePage = React.memo(() => {
  const t = useTranslations("PacePage");
  const activityId = useActivityId();
  const systemUnit = useStore((state) => state.systemUnit);

  const { data: paceBase, isLoading } = usePaceBase(activityId);
  const { data: paceZoneStats, isLoading: isPaceZonesLoading } =
    useResolvedPaceZones(activityId);
  const paceZones = paceZoneStats?.zones ?? [];
  const paceDistanceMeters = systemUnit === "imperial" ? 1609.344 : 1000;
  const paceUnit = systemUnit === "imperial" ? "/mi" : "/km";

  const avgSpeedMs = paceBase?.avgSpeed;
  const avgSpeed =
    typeof avgSpeedMs === "number"
      ? systemUnit === "imperial"
        ? round(avgSpeedMs * 2.2369362920544, 2)
        : round(avgSpeedMs * 3.6, 2)
      : undefined;
  const speedUnit = systemUnit === "imperial" ? "mph" : "km/h";

  const avgPaceSeconds =
    typeof avgSpeedMs === "number" && avgSpeedMs > 0
      ? round((1 / avgSpeedMs) * paceDistanceMeters)
      : 0;

  const avgGapSeconds = paceBase?.avgGap
    ? round(paceBase.avgGap * paceDistanceMeters)
    : 0;

  return (
    <div className="space-y-3">
      {/* 基础配速统计 */}
      <Card>
        <CardContent className="p-0 lg:p-0 w-full">
          {isLoading && <CardLoader />}
          <ActivityMetricGrid desktopColumns={5}>
            <PaceStat
              title={t("stats.avgPace")}
              value={formatSecondsToTime(avgPaceSeconds)}
              unit={paceUnit}
            />
            <PaceStat
              title={t("stats.avgSpeed")}
              value={avgSpeed?.toFixed(1) ?? "--"}
              unit={speedUnit}
            />
            <PaceStat
              title={t("stats.avgGap")}
              value={formatSecondsToTime(avgGapSeconds)}
              unit={paceUnit}
            />
            <PaceStat
              title={t("stats.vo2max")}
              value={paceBase?.vo2max?.toFixed(1) ?? "--"}
              unit="ml/kg/min"
            />
            <PaceStat
              title={t("stats.aerobicEfficiency")}
              value={paceBase?.avgAerobicEfficiency?.toFixed(2) ?? "--"}
            />

            {/* <PaceStat
              title={t("stats.xPace")}
              value={formatSecondsToTime((paceAnalysis?.xPace || 0) * 60)}
              unit="min/km"
            />
            <PaceStat
              title={t("stats.xGap")}
              value={formatSecondsToTime((paceAnalysis?.xGap || 0) * 60)}
              unit="min/km"
            /> */}
            {/* <div className="col-span-2 md:col-span-5 h-[1px] bg-neutral-200 dark:bg-neutral-800 w-full my-2 md:my-0" /> */}
            {/* <PaceStat
              title={t("stats.viPace")}
              value={paceAnalysis?.viPace?.toFixed(2) ?? "--"}
              unit=""
            />
            <PaceStat
              title={t("stats.viGap")}
              value={paceAnalysis?.viGap?.toFixed(2) ?? "--"}
              unit=""
            />
             */}
          </ActivityMetricGrid>
        </CardContent>
      </Card>

      {/* 配速区间图表 */}
      <PaceZonesChart
        zones={paceZones}
        isLoading={isPaceZonesLoading}
        paceDistanceMeters={paceDistanceMeters}
        paceUnit={paceUnit}
      />

      {/* 配速趋势图 */}
      <OverviewPaceChart activityId={activityId || ""} />
    </div>
  );
});

PacePage.displayName = "PacePage";

export default PacePage;
