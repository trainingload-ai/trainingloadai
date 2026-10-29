"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { useActivityId } from "@/hooks/useActivityId";
import CardLoader from "@/components/ui/CardLoader";
import { formatValue } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import { useHeartRateBase } from "@/api/use-heart-rate";
import { HeartRateZonesChart } from "./components/heart-rate-zones-chart";
import HeartRateStat from "./components/HeartRateStat";
import { HeartRatePowerRatioChart } from "./components/HeartRatePowerRatioChart";
import HeartRateTimeSeriesChart from "./components/HeartRateTimeSeriesChart";
import { EpocChart } from "./components/EpocChartModal";
import TrimpChart from "./components/TrimpChart";
import { TrimpInfo } from "./components/TrimpInfo";
import { DecouplingInfo } from "./components/DecouplingInfo";
import { EpocInfo } from "./components/EpocInfo";
import HeartRateDurationCurve from "./components/heart-rate-duration-curve";
import { useGetActivity } from "@/hooks/useActivities";
import { ActivityMetricGrid } from "../activity-metric-grid";
import {
  activityHasMetricData,
  getActivityDetailSportGroup,
} from "@/lib/activity-detail-policy";
import ChartContainer from "@/components/ChartContainer";
const HeartRatePage = React.memo(() => {
  const t = useTranslations("HeartRatePage");
  const activityId = useActivityId();
  const { systemUnit } = useStore();
  const { data: activity } = useGetActivity(activityId || "");
  const hasPower = activityHasMetricData(activity, "power");
  const hasRunPace =
    getActivityDetailSportGroup(activity) === "RUN" &&
    activityHasMetricData(activity, "pace");

  // 调用后端API获取心率基础统计
  const { data: heartRateBase, isLoading: isBaseLoading } =
    useHeartRateBase(activityId);
  const isLoading = isBaseLoading;

  // 调用接口获取最大心率

  return (
    <div className="space-y-3">
      {/* 基础心率统计 */}
      <Card>
        <CardContent className="p-0 lg:p-0 w-full">
          {isLoading && <CardLoader />}
          <ActivityMetricGrid desktopColumns={5}>
            <HeartRateStat
              title={t("baseStats.avg")}
              value={heartRateBase?.avg ?? "--"}
              unit="bpm"
            />
            <HeartRateStat
              title={t("baseStats.avgPct")}
              value={heartRateBase?.avgPctMax ?? "--"}
              unit="%"
            />
            <HeartRateStat
              title={t("baseStats.max")}
              value={formatValue(
                heartRateBase?.max || 0,
                "heartRate",
                systemUnit,
              )}
              unit="bpm"
            />
            <HeartRateStat
              title={t("baseStats.maxPct")}
              value={heartRateBase?.maxPctMax ?? "--"}
              unit="%"
            />
            <HeartRateStat
              title={t("baseStats.energy")}
              value={heartRateBase?.calories ?? "--"}
              unit="kcal"
            />
            <HeartRateStat
              title={t("baseStats.trimp")}
              value={heartRateBase?.trimp ?? "--"}
              unit=""
              extraRight={<TrimpInfo />}
              extraRightPlain
            />
            {hasPower ? (
              <HeartRateStat
                title={t("baseStats.powerDecoupling")}
                value={
                  heartRateBase?.pwHr
                    ? heartRateBase.pwHr > 0
                      ? `+${heartRateBase.pwHr}`
                      : heartRateBase.pwHr
                    : "--"
                }
                unit="%"
                extraRight={
                  <div onClick={(e) => e.stopPropagation()}>
                    <DecouplingInfo />
                  </div>
                }
                extraRightPlain
              />
            ) : null}
            {hasRunPace ? (
              <HeartRateStat
                title={t("baseStats.paceDecoupling")}
                value={
                  heartRateBase?.paHr
                    ? heartRateBase.paHr > 0
                      ? `+${heartRateBase.paHr}`
                      : heartRateBase.paHr
                    : "--"
                }
                unit="%"
                extraRight={
                  <div onClick={(e) => e.stopPropagation()}>
                    <DecouplingInfo />
                  </div>
                }
                extraRightPlain
              />
            ) : null}
            <HeartRateStat
              title={t("baseStats.peakEpoc")}
              value={heartRateBase?.peakEpoc ?? "--"}
              unit="ml/kg"
              extraRight={<EpocInfo />}
              extraRightPlain
            />
            <HeartRateStat
              title={t("baseStats.maxHeartRateRecovery")}
              value={heartRateBase?.maxHrDrop ?? "--"}
              unit="bpm"
            />
          </ActivityMetricGrid>
        </CardContent>
      </Card>
      {/* 心率区间占比分布 */}
      <HeartRateZonesChart />
      {/* 心率时间序列 */}
      <HeartRateTimeSeriesChart
        title={t("charts.timeSeries.title")}
        description={t("charts.timeSeries.description")}
      />

      {/* 功率效率因子 */}
      {hasPower ? <HeartRatePowerRatioChart activityId={activityId} /> : null}
      {/* 心率持续时间曲线 */}
      <HeartRateDurationCurve />
      {/* TRIMP 与 EPOC 详细曲线固定放在心率页末尾。 */}
      <ChartContainer
        title={t("baseStats.trimp")}
        appearance="activity-detail"
        infoContent={<TrimpInfo />}
      >
        <TrimpChart compact />
      </ChartContainer>
      <ChartContainer
        title={t("baseStats.peakEpoc")}
        appearance="activity-detail"
        infoContent={<EpocInfo />}
      >
        <EpocChart compact />
      </ChartContainer>
    </div>
  );
});

HeartRatePage.displayName = "HeartRatePage";

export default HeartRatePage;
